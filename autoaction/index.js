function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const ACTIONS_COL_NAME = "actions";
const ISENABLED_COL_NAME = "isenabled";
let isDoneForRecord = [];
const ACTIONS_FORMAT_EXAMPLE_FORMULA = `<pre>return [
  # The 'UpdateRecord' action takes the parameters: 'table_name' (str), 'record_id' (int), 'data' (dict, like { 'column_name': 'value_to_update_to' })
  [ "UpdateRecord", "TableName", 1, { "my_column": "the_value_to_update_to" } ],
  # 'AddRecord' is similar, but instead of a record id we pass 'None'
  [ "AddRecord", "TableName", None, { "my_column": "the_value_to_put_into_the_new_record" } ],
  # Add more actions here as you see fit.
  # For more information, see:
  # https://github.com/gristlabs/grist-core/blob/main/documentation/overview.md#changes-to-documents
  # and
  # https://github.com/gristlabs/grist-core/blob/main/sandbox/grist/useractions.py
]</pre>`

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

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  try {
    const mappedRecord = grist.mapColumnNames(record);
    if (!mappedRecord) {
      throw new Error("Please map all required columns first.");
    }
    console.log("autoaction: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
    let actions = mappedRecord[ACTIONS_COL_NAME];
    try
    {
      // Try to show what actions we're executing by collapsing the list of lists into a readable string.
      // As a side effect, if this fails, we can certainly say that the actions list provided by the user
      // somehow doesn't have the right format, and let them know about it.
      setStatus(`Applying actions: ${actions.map((x) => x.map((y) => y.constructor === Object ? JSON.stringify(y) : y).join(":")).join(",<br />")}`);
    } catch (e) {
      setStatus(`List of actions seems invalid. It needs to be a list of lists, so your column formula needs to look similar to this:<br />${ACTIONS_FORMAT_EXAMPLE_FORMULA}`);
      return;
    }
    if (isDoneForRecord.includes(record.id)) {
      // If we've already executed actions for this record, provide a message to that extent and quit.
      let msg = `Already executed actions for this record (ID ${record.id}), won't do it again until the page gets reloaded.`;
      setStatus(msg);
      console.log(`autoaction: ${msg}`);
      return;
    }
    if (!mappedRecord[ISENABLED_COL_NAME]) {
      // If the 'enabled' switch is off, don't do anything.
      setStatus(`'Enabled' switch (column '${mappedColNamesToRealColNames[ISENABLED_COL_NAME]}') is turned off, won't run actions.`);
      return;
    }
    // Apply the user actions.
    // Set 'isDone' for this record *first*, so we're safe even if the applyUserActions() call somehow screws up.
    isDoneForRecord.push(record.id);
    console.log("autoaction: Applying actions:", actions);
    await grist.docApi.applyUserActions(actions);
    setStatus("Done.");
    console.log("autoaction: Done.");
  } catch(err) {
    if (err.message.startsWith("[Sandbox]")) {
      err.message += `<br />Most likely the actions list you provided isn't valid. It needs to be a list of lists, so your column formula needs to look similar to this:<br />${ACTIONS_FORMAT_EXAMPLE_FORMULA}`;
    }
    return handleError(err);
  }
}

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
      { name: ACTIONS_COL_NAME, type: "Any", strictType: true, title: "Actions", description: "List of user actions to execute. As each user action definition is a list, this column must hold a list of lists. See https://github.com/gristlabs/grist-core/blob/main/documentation/overview.md#changes-to-documents" },
      { name: ISENABLED_COL_NAME, type: "Bool", title: "Enabled?", description: "If this column's value is False, the widget won't do anything." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  console.log("autoaction: Ready.");
});
