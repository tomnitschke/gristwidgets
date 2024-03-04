function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

//TODO
const SOURCE_COL_NAME = "source";

//TODO
let currentData = { data: "", };

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
  return true;
}

function handleError(err) {
  if (!setStatus(err)) {
    console.error("spreadsheet: FATAL: ", err);
    document.body.innerHTML = String(err);
    return;
  }
  console.error("spreadsheet: ", err);
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  console.log("spreadsheet: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
  setStatus("Loading...");
  try {
    // Unfortunately, Grist's mapColumnNames() function doesn't handle optional column mappings
    // properly, so we need to map stuff ourselves.
    const mappedRecord = {}
    if (mappedColNamesToRealColNames) {
      for (const[mappedColName, realColName] of Object.entries(mappedColNamesToRealColNames)) {
        if (realColName in record) {
          mappedRecord[mappedColName] = record[realColName];
        }
      }
    }
    // Make sure all required columns have been mapped.
    //TODO
    if (!(SOURCE_COL_NAME in mappedRecord)) {
      let msg = "<b>Please map all columns first.</b>";
      console.error(`spreadsheet: ${msg}`);
      throw new Error(msg);
    }

    //TODO
    
    setStatus("Ready.");
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
      //TODO
      { name: SOURCE_COL_NAME, type: "Text,Choice", title: "Source", description: "Source data to be converted into Word document. Currently, HTML and Markdown are supported." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  console.log("spreadsheet: Ready.");
});
