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

function handleError(err) {
  let elem = document.querySelector("#status");
  if (elem) {
    elem.innerHTML = String(err);
  } else {
    document.body.innerHTML = String(err);
  }
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  const mappedRecord = grist.mapColumnNames(record);
  if (mappedRecord) {
    try {
      const attachmentId = mappedRecord[ATTACHMENTID_COL_NAME];
      const tokenInfo = await grist.docApi.getAccessToken({ readOnly: true });
      currentData.url = `${tokenInfo.baseUrl}/attachments/${attachmentId}/download?auth=${tokenInfo.token}`;
      currentData.data = mappedRecord[DATA_COL_NAME];
      if (currentData.data.constructor != Object) {
        throw new Error(`Supplied data is not a dictionary: '${currentData.data}'`);
      }
      currentData.outputFileName = mappedRecord[FILENAME_COL_NAME];
    } catch (err) {
      handleError(err);
    }
  } else {
    document.body.innerHTML = "<b>Please map all columns first.</b>";
  }
}

async function processFile(url, data, outputFileName) {
  try {
    if (!url || !data || !outputFileName) {
      throw new Error("Any of the arguments 'url', 'data', 'outputFileName' seems to be missing/falsy.");
    }
    return PizZipUtils.getBinaryContent(url, function(err, content) {
      if (err) {
        throw err;
      }
      const templater = window.docxtemplater(new PizZip(content), {
        paragraphLoop: true,
        linebreaks: true,
      });
      templater.render(data);
      saveAs(templater.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        compression: "DEFLATE",
      }), outputFileName);
    });
  } catch (err) {
    handleError(err);
  }
}





ready(async function(){
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
    processFile(currentData.url, currentData.data, currentData.outputFileName);
  });
});
