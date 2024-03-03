function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const SOURCE_COL_NAME = "source";
const FILENAME_COL_NAME = "filename";
let currentData = { data: "", filename: "", };

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
    console.error("documentize: FATAL: ", err);
    document.body.innerHTML = String(err);
    return;
  }
  console.error("documentize: ", err);
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  console.log("documentize: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
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
    if (!(SOURCE_COL_NAME in mappedRecord) || !(FILENAME_COL_NAME in mappedRecord)) {
      let msg = "<b>Please map all columns first.</b>";
      console.error(`documentize: ${msg}`);
      throw new Error(msg);
    }
    currentData.data = mappedRecord[SOURCE_COL_NAME];
    currentData.filename = mappedRecord[FILENAME_COL_NAME];
    setStatus("Ready.");
  } catch(err) {
    return handleError(err);
  }

  function processData() {
    console.log("documentize: processData()...");
    try {
    let docElem = document.querySelector("#document");
    docElem.innerHTML = currentData.data;
    $(document).googoose({
      filename: currentData.filename,
      area: "div#document",
      headerarea: ".header",
      footerarea: ".footer",
      toc: ".toc",
      pagebreak: ".pagebreak",
      currentpage: ".page",
      totalpage: ".numpages",
    });
    console.log("documentize: Processing done. Offering up the file for download!");
    } catch (err) {
      setStatus(`Processing error: ${err.message}`);
      console.error("documentize: Processing error:", err);
    }
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
    // We require "full" mode in order to be allowed access to attachments.
    requiredAccess: "full",
    columns: [
      { name: SOURCE_COL_NAME, type: "Text,Choice", title: "Source", description: "Text to be converted into Word document. Currently, only plain text or HTML is supported." },
      { name: FILENAME_COL_NAME, type: "Text,Choice", title: "Filename", description: "Name of the generated file. Should include '.docx' extension." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  document.querySelector("#button_process").addEventListener("click", function(evt) {
    processData();
  });
  console.log("documentize: Ready.");
});
