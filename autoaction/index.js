let currentTimeout = null;
let numRuns = {}; //record id: num
let lastRunTime = {}; //record id: time

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

async function run(mappedRecord) {
  // Reset the timeout each time Grist fires an 'on record' event, so that
  // actions will only ever run for the currently selected record.
  window.clearTimeout(currentTimeout);
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
      setStatus(`'Enabled' switch (column '${mappedColNamesToRealColNames.isEnabled}') for this record (ID ${mappedRecord.id}) is turned off, won't run actions.`);
      return;
    }
    // Set 'some defaults if no user-supplied values are available.
    mappedRecord.maxReps ??= 1;
    mappedRecord.initDelay ??= 0;
    mappedRecord.repInterval ??= 1000;
    // If there is no entry for this record yet in 'numRuns', add one.
    numRuns[mappedRecord.id] ??= 0;
    // If actions for this record have already run the configured number of times,
    // do nothing now and let the user know as much.
    // Allow unlimited runs if this value is set to < 0.
    if (mappedRecord.maxReps >= 0 && numRuns[mappedRecord.id] >= mappedRecord.maxReps) {
      let msg = `Actions for the current record (ID ${mappedRecord.id}) have already been executed ${mappedRecord.maxReps > 1 ? mappedRecord.maxReps + " times" : ""}, won't run them again until the page is reloaded.`;
      setStatus(msg);
      console.log(`autoaction: ${msg}`);
      return;
    }  
    // Schedule actions for this record for when they're next (or first) due to run.
    let timeout = numRuns[mappedRecord.id] > 0 ? mappedRecord.repInterval : mappedRecord.initDelay;
    if (lastRunTime[mappedRecord.id]) {
      // Stick to the configured interval by adjusting timeout by 'lastRunTime'.
      let lastRunMillisecondsAgo = (new Date() - lastRunTime[mappedRecord.id]);
      timeout = Math.max(0, timeout - lastRunMillisecondsAgo);
    }
    console.log("autoaction: setTimeout at ", new Date());
    currentTimeout = window.setTimeout(function() {
      // Increase the 'numRuns' counter for this record, then execute actions.
      let msg = `Applying actions for record ${mappedRecord.id}.`;
      console.log(`autoaction: ${msg}`, actions);
      setStatus(msg);
      numRuns[mappedRecord.id] += 1;
      lastRunTime[mappedRecord.id] = new Date();
      applyActions(actions);
      console.log("autoaction: Done applying actions.");
      setStatus("Done.");
    }, timeout);
    // Provide a status message as to when actions will get run next.
    let msg = `Actions for the current record (ID ${mappedRecord.id}) will run${numRuns[mappedRecord.id] > 0 ? " again" : ""} in ${timeout / 1000} seconds.`;
    setStatus(msg);
    console.log(`autoaction: ${msg}`);
  } catch (err) {
    handleError(err)
  }
}

async function applyActions(actions) {
  try {
    window.clearTimeout(currentTimeout);
    await grist.docApi.applyUserActions(actions);
  } catch(err) {
    if (err.message.startsWith("[Sandbox]")) {
      err.message += `<br />Most likely the actions list you provided isn't valid. It needs to be a list of lists, so your column formula needs to look similar to this:<br />${ACTIONS_FORMAT_EXAMPLE_FORMULA}`;
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
