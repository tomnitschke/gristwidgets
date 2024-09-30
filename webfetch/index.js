function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

let previousUrl = null;

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  //TODO ensure proper column mappings
  const mappedRecord = grist.mapColumnNames(record);
  if (!mappedRecord) return;
  if ("url" in mappedRecord) {
    let url = mappedRecord.url
    let shouldAlwaysRefetch = !mappedRecord.should_cache_requests;
    let targetTable = mappedRecord.target_table;
    let targetRowId = mappedRecord.target_row_id;
    let targetColumn = mappedRecord.target_column;
    let shouldWriteBackIfResponseInvalid = !mappedRecord.noop_on_invalid_response;
    if (shouldAlwaysRefetch || url != previousUrl) {
      console.log(`WebFetch loading URL ${url} from record`, record);
      previousUrl = url;
      try {
        const response = await fetch(url);
        let reponseText = "";
        if (!response.ok) {
          console.log(`WebFetch invalid response for ${url}`, response);
        }
        if (shouldWriteBackIfResponseInvalid || response.ok) {
          await grist.docApi.applyUserActions([["UpdateRecord", targetTable, targetRowId, { [targetColumn]: response.text() }]]);
        }
      } catch (error) {
        console.log(`WebFetch error`, error);
      }
    } else {
      console.log(`WebFetch not reloading previously fetched URL ${url}.`);
    }
  } else {
    document.body.innerHTML = "Please map the URL column, then reload.";
  }
}

// Start once the DOM is ready.
ready(function(){
  // Let Grist know we're ready to talk.
  grist.ready({
    requiredAccess: "read table",
    columns: [
      { name: "url", type: "Text,Choice", title: "URL", description: "The URL of the resource to fetch." },
      { name: "target_table", type: "Text", title: "Target table", description: "Name of the table that will take the response data." },
      { name: "target_column", type: "Text", title: "Target column", description: "Name of the column that will take the response data." },
      { name: "target_row_id", type: "Int", title: "Target record ID", description: "ID of the record that will take the response data, or -1 to create a new record with each fetch." },
      { name: "should_cache_requests", type: "Bool", title: "Cache last request", description: "Whether to cache the last request. If True and the current request is the same as the last one, don#t re-fetch anything. Default is False." },
      { name: "noop_on_invalid_response", type: "Bool", title: "No-op on invalid response", description: "Whether to not do anything if the fetch results in an invalid response, such as a HTTP/404. If False, the erroneous/empty response data will get written back to the target table/column/record as-is. Default is True." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
});
