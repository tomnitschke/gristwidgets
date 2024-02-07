function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const URL_COL_NAME = "url";
let previousUrl = null;

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  const mappedRecord = grist.mapColumnNames(record);
  if (!mappedRecord) return;
  let url = mappedRecord[URL_COL_NAME];
  if (url != previousUrl) {
    previousUrl = url;
    document.querySelector("#the_frame").src = url;
  }
}

// Start once the DOM is ready.
ready(function(){
  // Let Grist know we're ready to talk.
  grist.ready({
    requiredAccess: "read table",
    columns: [
      { name: URL_COL_NAME, type: "Text", title: "URL", description: "The URL of the website to load." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
});
