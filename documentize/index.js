function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const SOURCE_COL_NAME = "source";
const SOURCETYPE_COL_NAME = "sourcetype";
const FILENAME_COL_NAME = "filename";
const PREVIEWENABLED_COL_NAME = "previewenabled";
const CONFIGDOCX_COL_NAME = "config_docx";
const CONFIGPDF_COL_NAME = "config_pdf";
const OUTFORMAT_COL_NAME = "outformat";

const SOURCETYPE_ALLOWED_VALUES = ["html", "markdown"];
const OUTFORMAT_ALLOWED_VALUES = ["docx", "pdf"];

let currentData = { data: "", filename: "", config_docx: {}, config_pdf: {}, };
let gristAccessToken = null;

function setStatus(msg) {
  let statusElem = document.querySelector("#status");
  if (!statusElem) return false;
  statusElem.innerHTML = msg;
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

async function gristGetAttachmentURL(attachmentId) {
  if (!(/^\d+$/.test(attachmentId))) {
    let msg = `Invalid Grist attachment id '${attachmentId}'. It should be an integer but is of type '${typeof attachmentId}'.`;
    console.error(`documentize: ${msg}`);
    throw new Error(msg);
  }
  attachmentId = Number(attachmentId);
  // Get a Grist access token if we don't already have one.
  if (!gristAccessToken) {
    console.log(`documentize: Getting new Grist access token.`);
    gristAccessToken = await grist.docApi.getAccessToken({ readOnly: true });
  }
  // Use the token to get a URL to the attachment.
  let url = `${gristAccessToken.baseUrl}/attachments/${attachmentId}/download?auth=${gristAccessToken.token}`;
  console.log(`documentize: Obtained Grist attachment URL: '${url}'`);
  return url;
}

async function imageGetBase64Url(url) {
  let response = await fetch(url);
  let blob = await response.blob();
  const reader = new FileReader();
  return new Promise(function(resolve, reject) {
    reader.onerror = reject;
    reader.onloadend = function() {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

/*async function imageGetBlobUrl(url) {
  let response = await fetch(url);
  let blob = await response.blob();
  return URL.createObjectURL(blob);
}*/

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  console.log("documentize: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
  setStatus("Loading...");
  let processButtonElem = document.querySelector("#button_process");
  processButtonElem.disabled = true;
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
      console.error(`documentize: ${msg}`);
      throw new Error(msg);
    }

    // Get the source data directly by default, otherwise convert to HMTL (see below).
    currentData.data = mappedRecord[SOURCE_COL_NAME];
    // Get sourcedata type. Assume HMTL by default.
    let sourceType = "html";
    if (SOURCETYPE_COL_NAME in mappedRecord) {
      sourceType = mappedRecord[SOURCETYPE_COL_NAME];
    }
    if (sourceType == "markdown") {
      // Convert from Markdown to HTML.
      let markdownConverter = new showdown.Converter();
      currentData.data = markdownConverter.makeHtml(currentData.data);
    }
    // Get output filename.
    currentData.filename = "";
    if (FILENAME_COL_NAME in mappedRecord) {
      currentData.filename = mappedRecord[FILENAME_COL_NAME];
    }
    // If output format is specified by a mapped column, lock down the format choice box.
    let outformatElem = document.querySelector("#select_outformat");
    if (OUTFORMAT_COL_NAME in mappedRecord && OUTFORMAT_ALLOWED_VALUES.includes(mappedRecord[OUTFORMAT_COL_NAME])) {
      outformatElem.disabled = true;
      outformatElem.value = mappedRecord[OUTFORMAT_COL_NAME];
    } else {
      outformatElem.disabled = false;
    }
    // Set up the config for Googoose and html2pdf. If the corresponding columns were
    // mapped, use the user-supplied configs in there, otherwise the defaults below.
    // Googoose config:
    currentData.config_docx = {
      filename: currentData.filename,
      headerarea: ".header",
      footerarea: ".footer",
      toc: ".toc",
      pagebreak: ".pagebreak",
      currentpage: ".page",
      totalpage: ".numpages",
    };
    if (CONFIGDOCX_COL_NAME in mappedRecord) {
      currentData.config_docx = mappedRecord[CONFIGDOCX_COL_NAME];
    }
    // Irrespective of any user config, always set some properties to
    // predefined values so as not to break things further down below.
    currentData.config_docx.area = "#document";
    if (!("pagebreak" in currentData.config_docx)) {
      currentData.config_docx.pagebreak = ".pagebreak";
    }
    // html2pdf config:
    currentData.config_pdf = {
      filename: currentData.filename,
      pagebreak: { after: ".pagebreak" },
      jsPDF: { compress: true },
    };
    if (CONFIGPDF_COL_NAME in mappedRecord) {
      currentData.config_pdf = mappedRecord[CONFIGPDF_COL_NAME];
    }
    // Irrespective of any user config, always set some properties to
    // predefined values so as not to break things further down below.
    if (!("pagebreak" in currentData.config_pdf)) {
      currentData.config_pdf.pagebreak = { after: ".pagebreak" };
    }
    if (!("after" in currentData.config_pdf.pagebreak)) {
      currentData.config_pdf.pagebreak.after = ".pagebreak";
    }
    // Show or hide the document preview depending on user config.
    // This is done before we actually build the document to prevent it from
    // flickering into view briefly even when preview is disabled.
    let docBoxElem = document.querySelector("#document-box");
    let docBoxHeaderElem = document.querySelector("#document-box-header");
    if (PREVIEWENABLED_COL_NAME in mappedRecord && !mappedRecord[PREVIEWENABLED_COL_NAME])
    {
      // If document preview disabled by user, hide it.
      docBoxElem.style.visibility = "hidden";
      docBoxElem.style.height = "1pt";
      docBoxElem.style.overflow = "hidden";
      docBoxHeaderElem.style.display = "none";
    } else {
      // Otherwise, show it.
      let docBoxElem = document.querySelector("#document-box");
      let docBoxHeaderElem = document.querySelector("#document-box-header");
      docBoxElem.style.visibility = "visible";
      docBoxElem.style.height = "initial";
      docBoxElem.style.overflow = "auto";
      docBoxHeaderElem.style.display = "block";
    }

    // Build the document.
    let docElem = document.querySelector("#document");
    docElem.innerHTML = currentData.data;
    // Scan for image elements that have "attachment:n" as their "src" attribute.
    // For these, get an access token and compute and actual attachment URL.
    let imgElements = docElem.getElementsByTagName("img");
    for (const imgElem of imgElements) {
      if (/^\s*attachment:\s*\d+$/.test(imgElem.src)) {
        let attachmentId = imgElem.src.replace(/[^\d]*/, "");
        let url = await gristGetAttachmentURL(attachmentId);
        imgElem.src = await imageGetBase64Url(url);
        console.log(`documentize: Processed image tag '${imgElem}' pointing to attachment ID '${attachmentId}'.`);
      }
    }

    // Regardless of whether the preview is really visible (see above),
    // we need to set the document container to "display: block" so that
    // Googoose doesn't conclude we don't actually want it rendered in
    // the final document.
    docBoxElem.style.display = "block";

    processButtonElem.disabled = false;
    setStatus("Ready.");
  } catch(err) {
    return handleError(err);
  }
}

function processData() {
  console.log("documentize: processData()...");
  // Get the output format. Depending on that, run either Googoose or html2pdf.
  let outformatElem = document.querySelector("#select_outformat");
  let format = outformatElem.value;
  try {
    if (format == "docx") {
      $(document).googoose(currentData.config_docx);
    } else {
      let docElem = document.querySelector("#document");
      let pagebreakElements = docElem.querySelectorAll(currentData.config_pdf.pagebreak.after);
      for (const pagebreakElem of pagebreakElements) {
        pagebreakElem.style.display = "none";
      }
      html2pdf(document.querySelector("#document"), currentData.config_pdf).then(function() {
        for (const pagebreakElem of pagebreakElements) {
          pagebreakElem.style.display = "revert";
        }
      }
    }
    console.log("documentize: Processing done. Offering up the file for download!");
  } catch (err) {
    setStatus(`Processing error: ${err.message}`);
    console.error("documentize: Processing error:", err);
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
      { name: SOURCE_COL_NAME, type: "Text,Choice", title: "Source", description: "Source data to be converted into Word document. Currently, HTML and Markdown are supported." },
      { name: FILENAME_COL_NAME, type: "Text,Choice", optional: true, title: "Filename", description: "Name of the generated file. Should include '.docx' extension. If not specified, a random name will be generated." },
      { name: SOURCETYPE_COL_NAME, type: "Text,Choice", optional: true, title: "Source Type", description: `Gives the type of the source data. Valid values are ${SOURCETYPE_ALLOWED_VALUES.map((x) => "'" + x + "'").join(", ")}` },
      { name: PREVIEWENABLED_COL_NAME, type: "Bool", optional: true, title: "Preview Enabled?", description: "Whether to show a document preview (which is the default if you don't map this column) or not." },
      { name: CONFIGDOCX_COL_NAME, type: "Any", strictType: true, optional: true, title: "Custom Config for Googoose", description: "Custom configuration for the Googoose library. Must be provided as a dictionary like '{ optionName: optionValue }'. Note that the 'area' setting cannot be customized." },
      { name: CONFIGPDF_COL_NAME, type: "Any", strictType: true, optional: true, title: "Custom Config for html2pdf", description: "Custom configuration for the html2pdf library. Must be provided as a dictionary like '{ optionName: optionValue }'." },
      { name: OUTFORMAT_COL_NAME, type: "Text,Choice", optional: true, title: "Output Format", description: `Determines what type of file to generate. Allowable values are ${OUTFORMAT_ALLOWED_VALUES.map((x) => "'" + x + "'").join(", ")}` },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  document.querySelector("#button_process").addEventListener("click", function(evt) {
    processData();
  });
  console.log("documentize: Ready.");
});
