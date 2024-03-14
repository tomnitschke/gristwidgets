let initialTimeouts = {};
let intervals = {}; //record id: interval id
let numRuns = {}; //record id: num
let currentRecordID = null;

const REQUIRED_COLUMNS = ["actions", "isEnabled"];
const ACTIONS_EXAMPLE_FORMULA = `<pre>return [
  # The 'UpdateRecord' action takes the parameters: 'table_name' (str), 'record_id' (int), 'data' (dict, like { 'column_name': 'value_to_update_to' })
  [ "UpdateRecord", "TableName", 1, { "my_column": "the_value_to_update_to" } ],

  # 'AddRecord' is similar, but instead of a record id we pass 'None'
  [ "AddRecord", "TableName", None, { "my_column": "the_value_to_put_into_the_new_record" } ],

  # Add more actions here as you see fit.

  # For more information, see:
  # https://github.com/gristlabs/grist-core/blob/main/documentation/overview.md#changes-to-documents
  # and
  # https://github.com/gristlabs/grist-core/blob/main/sandbox/grist/useractions.py
]</pre>`;



// Start once the DOM is ready.
ready(function(){
  // Set up a global error handler.
  window.addEventListener("error", function(err) {
    handleError(err);
  });
  // Let Grist know we're ready to talk.
  grist.ready({
    // We require "full" mode for obvious reasons.
    requiredAccess: "full",
    columns: [
      { name: "actions", type: "Any", strictType: true, title: "Actions", description: "List of user actions to execute. As each user action definition is a list, this column must hold a list of lists. See https://github.com/gristlabs/grist-core/blob/main/documentation/overview.md#changes-to-documents" },
      { name: "isEnabled", type: "Bool", title: "Enabled?", description: "If this column's value is False, the widget won't do anything." },
      { name: "initDelay", type: "Int", title: "Delay", optional: true, description: "Sets the number of milliseconds to wait, once a record gets selected, before executing the actions for it." },
      { name: "maxReps", type: "Int", title: "Repetitions", optional: true, description: "Sets the maximum number of times actions for the current record will be run. The default is 1. Values < 0 mean unlimited runs. Note that the execution cycle gets reset each time you reload the page." },
      { name: "repInterval", type: "Int", title: "Repetition Interval", optional: true, description: "Sets the number of milliseconds to wait between subsequent executions of actions for the currently selected record." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  console.log("autoaction: Ready.");
});

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  try {
    const mappedRecord = mapGristRecord(record, mappedColNamesToRealColNames, REQUIRED_COLUMNS);
    if (!mappedRecord) {
      throw new Error("Please map all required columns first.");
    }
    if (mappedRecord.id == currentRecordID) {
      // Guard against undesirable Grist behaviour where sometimes the
      // 'on record' event gets fired twice for the same record.
      console.log(`autoaction: Not running gristRecordSelected() twice for the same record (ID ${mappedRecord.id})`);
      return;
    }
    currentRecordID = mappedRecord.id;
    console.log("autoaction: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
    return run(mappedRecord);
  } catch (err) {
    handleError(err);
  }
}

function mapGristRecord(record, colMap, requiredTruthyCols) {
  //const mappedRecord = grist.mapColumnNames(record);
  // Unfortunately, Grist's mapColumnNames function doesn't handle optional column mappings
  // properly, so we need to map stuff ourselves.
  const mappedRecord = { id: record.id };
  if (colMap) {
    for (const[mappedColName, realColName] of Object.entries(colMap)) {
      if (realColName in record) {
        mappedRecord[mappedColName] = record[realColName];
        // If we're mapping one of the essential columns but that column is empty/its data is falsy,
        // display an error message to the user.
        if(requiredTruthyCols.includes(mappedColName) && !(mappedRecord[mappedColName])) {
          let msg = `<b>Required column '${mappedColName}' is empty/falsy. Please make sure it contains valid (truthy) data.`;
          console.error(`autoaction: ${msg}`);
          throw new Error(msg);
        }
      }
    }
  }
  return mappedRecord;
}

function run(mappedRecord) {
  console.log("autoaction: run()! at:", new Date());
  // Get the actions for the current record.
  let actions = mappedRecord.actions;
  try {
    try {
      // Try to show what actions we're executing by collapsing the list of lists into a readable string.
      // As a side effect, if this fails, we can certainly say that the actions list provided by the user
      // somehow doesn't have the right format, and let them know about it.
      setStatus(`Applying actions: ${actions.map((x) => x.map((y) => y.constructor === Object ? JSON.stringify(y) : y).join(":")).join(",<br />")}`);
    } catch (e) {
      setStatus(`List of actions seems invalid. It needs to be a list of lists, so your column formula needs to look similar to this:<br />${ACTIONS_EXAMPLE_FORMULA}`);
      return;
    }
    if (!mappedRecord.isEnabled) {
      // If the 'enabled' switch is off, don't do anything.
      setStatus(`'Enabled' switch for this record (ID ${mappedRecord.id}) is turned off, won't run actions.`);
      return;
    }
    // Set 'some defaults if no user-supplied values are available.
    mappedRecord.maxReps ??= 1;
    mappedRecord.initDelay ??= 0;
    mappedRecord.repInterval ??= 1000;
    mappedRecord.runSolo ??= true;
    // Add entries for this record to 'numRuns' if needed.
    numRuns[mappedRecord.id] ??= 0;
    if (numRuns[mappedRecord.id] == 0) {
      // If this is the first run for this record, start executing actions.
      // In order to respect the 'initDelay' setting, we do this by
      // setting a timeout rather than executing immediately.
      initialTimeouts[mappedRecord.id] = window.setTimeout(async function() {
        let msg = `Will run actions for this record (ID ${mappedRecord.id}) in ${mappedRecord.repInterval / 1000} seconds.`;
        setStatus(msg);
        console.log(`autoaction: ${msg}`);
        await applyActions(actions, mappedRecord);
        // After the first run is done, set up the interval.
        intervals[mappedRecord.id] = window.setInterval(async function() {
          await applyActions(actions, mappedRecord);
        }, mappedRecord.repInterval);
      }, mappedRecord.initDelay);
    }
    // Clear the initial timeouts and intervals for other records if configured.
    if (mappedRecord.runSolo) {
      for (const recordID in initialTimeouts) {
        if (recordID != mappedRecord.id) {
          window.clearTimeout(initialTimeouts[recordID]);
        }
      }
      for (const recordID in intervals) {
        if (recordID != mappedRecord.id) {
          window.clearTimeout(intervals[recordID]);
        }
      }
    }
  } catch (err) {
    handleError(err);
  }
}

//async function applyActions(actions) {
async function applyActions(actions, mappedRecord) {
  // If actions for this record have already run the configured number
  // of times, do nothing now and let the user know as much. Allow
  // unlimited runs if 'maxReps' is set to < 0.
  if (mappedRecord.maxReps >= 0 && numRuns[mappedRecord.id] >= mappedRecord.maxReps) {
    let msg = `Actions for the current record (ID ${mappedRecord.id}) have already been executed ${mappedRecord.maxReps > 1 ? mappedRecord.maxReps + " times" : ""}, won't run them again until the page is reloaded.`;
    setStatus(msg);
    console.log(`autoaction: ${msg}`);
    return;
  }
  try {
    await grist.docApi.applyUserActions(actions);
  } catch(err) {
    if (err.message.startsWith("[Sandbox]")) {
      err.message += `<br />Most likely the actions list you provided isn't valid. It needs to be a list of lists, so your column formula needs to look similar to this:<br />${ACTIONS_EXAMPLE_FORMULA}`;
    }
    return handleError(err);
  }
}

function setStatus(msg) {
  let statusElem = document.querySelector("#status");
  if (!statusElem) return false;
  statusElem.innerHTML = msg;
  setVisible("#status", true);
  return true;
}

function setVisible(querySelector, isVisible) {
  let elem = document.querySelector(querySelector);
  if (!elem) return false;
  elem.style.display = isVisible ? "block" : "none";
}

function handleError(err) {
  if (!setStatus(err)) {
    console.error("autoaction: FATAL: ", err);
    document.body.innerHTML = String(err);
    return;
  }
  console.error("autoaction: ", err);
}

function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}
