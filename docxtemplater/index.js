function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const ATTACHMENTID_COL_NAME = "attachment_id";
const DATA_COL_NAME = "data";
const FILENAME_COL_NAME = "filename";
const currentData = { url: null, data: null, outputFileName: null, };

function setStatusMessage(msg) {
  let contentElem = document.querySelector("#content");
  let statusMessageElem = document.querySelector("#status_message");
  if (!contentElem || !statusMessageElem) return false;
  statusMessageElem.innerHTML = msg;
  contentElem.style.display = "block";
  return true;
}

function resetStatusMessage() {
  let contentElem = document.querySelector("#content");
  let statusResetButtonElem = document.querySelector("#button_status_reset");
  if (!contentElem || !statusResetButtonElem) return;
  contentElem.style.display = "block";
  statusResetButtonElem.style.display = "none";
}

function handleError(err) {
  if (!setStatusMessage(err)) {
    document.body.innerHTML = String(err);
    return;
  }
  let contentElem = document.querySelector("#content");
  if (contentElem) {
    let statusResetButtonElem = document.querySelector("#button_status_reset");
    if (statusResetButtonElem) {
      statusResetButtonElem.style.display = "block";
      contentElem.style.display = "none";
    }
  }
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  const mappedRecord = grist.mapColumnNames(record);
  try {
    if (mappedRecord) {
        const attachmentId = mappedRecord[ATTACHMENTID_COL_NAME];
        const tokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
        currentData.url = `${tokenInfo.baseUrl}/attachments/${attachmentId}/download?auth=${tokenInfo.token}`;
        currentData.data = mappedRecord[DATA_COL_NAME];
        if (currentData.data.constructor != Object) {
          throw new Error(`Supplied data is not a dictionary: '${currentData.data}'`);
        }
        currentData.outputFileName = mappedRecord[FILENAME_COL_NAME];
        setStatusMessage("Ready. Click OK to process document.");
    } else {
      throw new Error("<b>Please map all columns first.</b>");
    }
  } catch (err) {
    handleError(err);
  }
}

function processFile(url, data, outputFileName) {
  try {
    if (!url || !data || !outputFileName) {
      throw new Error("Any of the arguments 'url', 'data', 'outputFileName' seems to be missing/falsy.");
    }
    return PizZipUtils.getBinaryContent(url, function(err, content) {
      if (err) {
        throw err;
      }
      try
      {
        const templater = new window.docxtemplater(new PizZip(content), {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: "((", end: "))" },
          parser: AngularExpressionsParser,
        });
        templater.render(data);
        saveAs(templater.getZip().generate({
          type: "blob",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          compression: "DEFLATE",
        }), outputFileName);
      } catch (e) {
        if (e instanceof docxtemplater.Errors.XTTemplateError) {
          e = e.properties.errors;
        }
        if (0 in e && "name" in e[0] && "message" in e[0]) {
          if ("properties" in e[0] && "explanation" in e[0].properties) {
            handleError(new Error(`${e[0].name}: ${e[0].properties.explanation}`));
          } else {
            handleError(new Error(`${e[0].name}: ${e[0].message}`));
          }
        } else {
          handleError(e);
        }
      }
    });
  } catch (err) {
    handleError(err);
  }
}





ready(function(){
  grist.ready({
    requiredAccess: "full",
    columns: [
      { name: ATTACHMENTID_COL_NAME, title: "Attachment ID", description: "ID number of a Grist attachment." },
      { name: DATA_COL_NAME, title: "Placeholder Data", description: "Must be a dictionary of the form {placeholder_name: value_to_replace_by}" },
      { name: FILENAME_COL_NAME, title: "Output File Name", description: "Name of the resulting file that will be offered for download. Should include the '.docx' extension." },
    ],
  });
  grist.onRecord(gristRecordSelected);
  document.querySelector("#button_process").addEventListener("click", function(){
    setStatusMessage("Working...");
    processFile(currentData.url, currentData.data, currentData.outputFileName);
    setStatusMessage("Document ready for download.");
  });
  document.querySelector("#button_status_reset").addEventListener("click", function(){
    resetStatusMessage();
  });
});
