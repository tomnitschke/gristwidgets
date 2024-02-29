function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const ATTACHMENTID_COL_NAME = "attachment_id";
let gristAccessToken = null;
let previousUrl = null;

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
  previousUrl = null;
  if (!setStatusMessage(err)) {
    console.error("viewerjs: FATAL: ", err);
    document.body.innerHTML = String(err);
    return;
  }
  console.error("viewerjs: ", err);
}

async function gristGetAttachmentURL(attachmentId) {
  if (!(/^\d+$/.test(attachmentId))) {
    let msg = `Invalid Grist attachment id '${attachmentId}'. It should be a number but is of type '${typeof attachmentId}'.`;
    console.error(`viewerjs: ${msg}`);
    throw new Error(msg);
  }
  attachmentId = Number(attachmentId);
  // Get a Grist access token if we don't already have one.
  if (!gristAccessToken) {
    console.log(`viewerjs: Getting new Grist access token.`);
    gristAccessToken = await grist.docApi.getAccessToken({ readOnly: true });
  }
  // Use the token to get a URL to the attachment.
  let url = `${gristAccessToken.baseUrl}/attachments/${attachmentId}/download?auth=${gristAccessToken.token}`;
  console.log(`viewerjs: Obtained Grist attachment URL: '${url}'`);
  return url;
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  console.log("viewerjs: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
  setStatus("Loading...");
  setVisible("#viewer", false);
  try {
    const mappedRecord = grist.mapColumnNames(record);
    if (!mappedRecord) {
      throw new Error("Please map all required columns first.");
    }
    // Get the URL we want to view.
    let documentUrl = await gristGetAttachmentURL(mappedRecord[ATTACHMENTID_COL_NAME]);
    let fullUrl = `${window.location.origin + window.location.pathname.slice(0, window.location.pathname.lastIndexOf('/'))}/ViewerJS/#${documentUrl}`;
    if (fullUrl != previousUrl) {
      previousUrl = fullUrl;
      console.log(`viewerjs: Setting viewer URL to '${fullUrl}'.`);
      let viewerElem = document.querySelector("#viewer");
      // Wipe the content element clean.
      viewerElem.innerHTML = "";
      // Build a new iframe with the URL computed above.
      let iframeElem = document.createElement("iframe");
      iframeElem.src = fullUrl;
      viewerElem.appendChild(iframeElem);
      iframeElem.className = "viewer-frame";
    } else {
      console.log(`viewerjs: Not reloading the viewer as its URL hasn't changed.`);
    }
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
      { name: ATTACHMENTID_COL_NAME, type: "Int", title: "Attachment ID", description: "ID number of a Grist attachment." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  console.log("viewerjs: Ready.");
});
