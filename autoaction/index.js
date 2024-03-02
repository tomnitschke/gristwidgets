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
  console.log("autoaction: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
  if (isDoneForRecord.includes(record.id)) {
    console.log(`autoaction: Already executed actions for this record (ID ${record.id}. Exiting.`);
    return;
  }
  try {
    const mappedRecord = grist.mapColumnNames(record);
    if (!mappedRecord) {
      throw new Error("Please map all required columns first.");
    }
    if (!mappedRecord[ISENABLED_COL_NAME]) {
      // If the 'enabled' switch is off, don't do anything.
      setStatus(`'Enabled' switch (column '${mappedColNamesToRealColNames[ISENABLED_COL_NAME]}') is turned off, won't run actions.`);
      return;
    }
    // Apply the user actions.
    // Set 'isDone' for this record *first*, so we're safe even if the applyUserActions() call somehow screws up.
    isDoneForRecord.push(record.id);
    setStatus("Applying actions...");
    let actions = mappedRecord[ACTIONS_COL_NAME];
    console.log("autoaction: Applying actions:", actions);
    await grist.docApi.applyUserActions(actions);
    setStatus("Done.");
    console.log("autoaction: Done.");
  } catch(err) {
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
