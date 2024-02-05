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
const USEANGULAR_COL_NAME = "use_angular_parser";
const DELIMITERSTART_COL_NAME = "delimiter_start";
const DELIMITEREND_COL_NAME = "delimiter_end";
const currentData = { url: null, data: null, outputFileName: null, useAngular: true, delimiterStart: '{', delimiterEnd: '}' };

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
  if (contentElem) {
    contentElem.style.display = "block";
  }
  let statusResetButtonElem = document.querySelector("#button_status_reset");
  if (statusResetButtonElem) {
    statusResetButtonElem.style.display = "none";
  }
  let processButtonElem = document.querySelector("#button_process");
  if (processButtonElem) {
    processButtonElem.style.display = "inline-block";
  }
}

function handleError(err) {
  if (!setStatusMessage(err)) {
    document.body.innerHTML = String(err);
    return;
  }
  let statusResetButtonElem = document.querySelector("#button_status_reset");
  if (statusResetButtonElem) {
    statusResetButtonElem.style.display = "inline-block";
    document.querySelector("#content").style.display = "none";
  }
  let processButtonElem = document.querySelector("#button_process");
  if (processButtonElem) {
    processButtonElem.style.display = "none";
  }
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  //const mappedRecord = grist.mapColumnNames(record);
  const mappedRecord = {}
  if (mappedColNamesToRealColNames) {
    for (const[mappedColName, realColName] of Object.entries(mappedColNamesToRealColNames)) {
      if (realColName in record && record[realColName]) {
        mappedRecord[mappedColName] = record[realColName];
      }
    }
  }
  try {
    if (ATTACHMENTID_COL_NAME in mappedRecord && DATA_COL_NAME in mappedRecord && FILENAME_COL_NAME in mappedRecord) {
        const attachmentId = mappedRecord[ATTACHMENTID_COL_NAME];
        const tokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
        currentData.url = `${tokenInfo.baseUrl}/attachments/${attachmentId}/download?auth=${tokenInfo.token}`;
        currentData.data = mappedRecord[DATA_COL_NAME];
        if (!("constructor" in currentData.data) || currentData.data.constructor != Object) {
          throw new Error(`Supplied data is not a dictionary: '${currentData.data}'`);
        }
        if (USEANGULAR_COL_NAME in mappedRecord) {
          currentData.useAngular = mappedRecord[USEANGULAR_COL_NAME];
        }
        if (DELIMITERSTART_COL_NAME in mappedRecord && mappedRecord[DELIMITERSTART_COL_NAME]) {
          currentData.delimiterStart = mappedRecord[DELIMITERSTART_COL_NAME];
        }
        if (DELIMITEREND_COL_NAME in mappedRecord && mappedRecord[DELIMITEREND_COL_NAME]) {
          currentData.delimiterEnd = mappedRecord[DELIMITEREND_COL_NAME];
        }
        currentData.outputFileName = mappedRecord[FILENAME_COL_NAME];
        setStatusMessage("Ready. Click 'Process' to generate the document.");
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
        const docxtemplaterOptions = {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: currentData.delimiterStart, end: currentData.delimiterEnd },
          parser: AngularExpressionsParser,
        };
        if (!currentData.useAngular) {
          docxtemplaterOptions.parser = null;
        }
        const templater = new window.docxtemplater(new PizZip(content), docxtemplaterOptions);
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
      { name: ATTACHMENTID_COL_NAME, type: "Int", title: "Attachment ID", description: "ID number of a Grist attachment." },
      { name: DATA_COL_NAME, type: "Any", title: "Placeholder Data", description: "Must be a dictionary of the form {placeholder_name: value_to_replace_by}" },
      { name: FILENAME_COL_NAME, type: "Text", title: "Output File Name", description: "Name of the resulting file that will be offered for download. Should include the '.docx' extension." },
      { name: USEANGULAR_COL_NAME, type: "Bool", optional: true, title: "Use Angular Parser?", description: "Whether to use the Angular expressions parser or not. The default is 'true'." },
      { name: DELIMITERSTART_COL_NAME, type: "Text", optional: true, title: "Custom Delimiter: Start", description: "Custom delimiter to use for the start of placeholders. The default is '{'." },
      { name: DELIMITEREND_COL_NAME, type: "Text", optional: true, title: "Custom Delimiter: End", description: "Custom delimiter to use for the end of placeholders. The default is '}'." },
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
