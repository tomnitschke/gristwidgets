function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const SOURCE_COL_NAME = "source";

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
    console.error("pdfize: FATAL: ", err);
    document.body.innerHTML = String(err);
    return;
  }
  console.error("pdfize: ", err);
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  console.log("pdfize: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
  setStatus("Loading...");
  setVisible("#viewer", false);
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
    if (!(SOURCE_COL_NAME in mappedRecord)) {
      let msg = "<b>Please map all columns first.</b>";
      console.error(`pdfize: ${msg}`);
      throw new Error(msg);
    }
    // Get the URL we want to view.
    let viewerBaseUrl = `${window.location.origin + window.location.pathname.slice(0, window.location.pathname.lastIndexOf('/'))}/`;
    let viewerParams = [];
    let viewerFullUrl = `${viewerBaseUrl}?${viewerParams.join("&")}`;

    previousUrl = viewerFullUrl;
    console.log(`pdfize: Setting viewer URL to '${viewerFullUrl}'.`);
    let viewerElem = document.querySelector("#viewer");
    // Wipe the content element clean.
    viewerElem.innerHTML = "";
    // Build a new iframe.
    let iframeElem = document.createElement("iframe");
    // Set up the iframe and attach it to the '#viewer' container.
    iframeElem.src = viewerFullUrl;
    viewerElem.appendChild(iframeElem);
    iframeElem.className = "viewer-frame";
    iframeElem.setAttribute('allowFullScreen', '');

    setVisible("#viewer", true);
    setVisible("#status", false);
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
    // We require "full" mode in order to be allowed access to attachments.
    requiredAccess: "full",
    columns: [
      { name: SOURCE_COL_NAME, type: "Text,Choice", title: "Source", description: "Text to be pdfized." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  console.log("pdfize: Ready.");
});
