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
let gristAccessToken = null;

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
    statusResetButtonElem.style.display = "block";
    document.querySelector("#content").style.display = "none";
  }
  let processButtonElem = document.querySelector("#button_process");
  if (processButtonElem) {
    processButtonElem.style.display = "none";
  }
}

async function gristGetAttachmentURL(attachmentId) {
  if (!(/^\d+$/.test(attachmentId))) {
    let msg = `Invalid Grist attachment id '${attachmentId}'. It should be a number but is of type '${typeof attachmentId}'.`;
    console.error(`docxtemplater: ${msg}`);
    throw new Error(msg);
  }
  attachmentId = Number(attachmentId);
  // Get a Grist access token if we don't already have one.
  if (!gristAccessToken) {
    console.log(`docxtemplater: Getting new Grist access token.`);
    gristAccessToken = await grist.docApi.getAccessToken({ readOnly: true });
  }
  // Use the token to get a URL to the attachment.
  let url = `${gristAccessToken.baseUrl}/attachments/${attachmentId}/download?auth=${gristAccessToken.token}`;
  console.log(`docxtemplater: Obtained Grist attachment URL: '${url}'`);
  return url;
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  try {
    //const mappedRecord = grist.mapColumnNames(record);
    // Unfortunately, Grist's mapColumnNames function doesn't handle optional column mappings
    // properly, so we need to map stuff ourselves. Since we're already at it, lets also
    // facilitate things a bit by mapping only columns that aren't empty/falsy.
    const mappedRecord = {}
    if (mappedColNamesToRealColNames) {
      for (const[mappedColName, realColName] of Object.entries(mappedColNamesToRealColNames)) {
        if (realColName in record && record[realColName]) {
          mappedRecord[mappedColName] = record[realColName];
          // If we're mapping one of the essential columns but that column is empty/its data is falsy,
          // display an error message to the user.
          if ([ATTACHMENTID_COL_NAME, DATA_COL_NAME, FILENAME_COL_NAME].includes(mappedColName) && !(mappedRecord[mappedColName])) {
            let msg = `<b>Required column '${mappedColName}' is empty. Please make sure it contains valid data.`;
            console.error(`docxtemplater: ${msg}`);
            throw new Error(msg);
          }
        }
      }
    }
    // Make sure all required columns have been mapped.
    if (!(ATTACHMENTID_COL_NAME in mappedRecord || DATA_COL_NAME in mappedRecord || FILENAME_COL_NAME in mappedRecord)) {
      let msg = "<b>Please map all columns first.</b><br />If you have already mapped them, make sure they're not empty.";
      console.error(`docxtemplater: ${msg}`);
      throw new Error(msg);
    }
    // Set up the currentData object.
    currentData.url = await gristGetAttachmentURL(mappedRecord[ATTACHMENTID_COL_NAME]);
    currentData.data = mappedRecord[DATA_COL_NAME];
    console.log(`docxtemplater: Input placeholder data is of type '${typeof currentData.data}' and looks like this:`, currentData.data);
    if (typeof currentData.data !== "object") {
      let msg = `<b>Can't read placeholder data.</b><br />The data needs to be a dictionary but seems to be a '${typeof currentData.data}'. Make sure the column holding said data is set to type 'Any'.`;
      console.error(`docxtemplater: ${msg}`);
      throw new Error(msg);
    }
    if (!("constructor" in currentData.data) || currentData.data.constructor != Object) {
      let msg = `Supplied data is not a dictionary: '${currentData.data}'`;
      console.error(`docxtemplater: ${msg}`);
      throw new Error(msg);
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
    // Now we have all the data nicely validated and present in currentData,
    // all that's left to do is to display a ready message and the 'process' button.
    setStatusMessage("Ready. Click 'Process' to generate the document.");
  } catch (err) {
    handleError(err);
  }
}

function processFile(url, data, outputFileName) {
  try {
    if (!url || !data || !outputFileName) {
      let msg = "Any of the arguments 'url', 'data', 'outputFileName' seems to be missing/falsy.";
      console.error(`docxtemplater: ${msg}`);
      throw new Error(msg);
    }
    return PizZipUtils.getBinaryContent(url, function(err, content) {
      if (err) {
        let msg = `${err.name} in PizZipUtils.getBinaryContent: ${err.message}`;
        console.error(`docxtemplater: ${msg}`);
        throw new Error(msg);
      }
      try
      {
        const docxtemplaterOptions = {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: currentData.delimiterStart, end: currentData.delimiterEnd },
          // Use the Angular expressions parser by default. Users may override this behaviour, see below.
          parser: AngularExpressionsParser,
          nullGetter: function(part, scope) {
            if (!part.module) {
              // If we've encountered an unknown placeholder, just leave it as is.
              if ("value" in part) {
                return `${currentData.delimiterStart}${part.value}${currentData.delimiterEnd}`;
              }
              return "";
            }
            if (part.module === "rawxml") {
              // Replace any '@'-prefixed placeholders with nothing. This is docxtemplater's default implementation.
              return "";
            }
            // Replace any known but empty-valued placeholders with nothing. This is docxtemplater's default implementation.
            return "";
          },
        };
        if (!currentData.useAngular) {
          // Disable the Angular expressions parse if requested by the user.
          docxtemplaterOptions.parser = null;
        }
        //TODO
        // Enable the image module unless disabled by the user.
        if (true) {
          docxtemplaterOptions.modules = [new ImageModule({
            //TODO make this configurable?
            centered: false,
            getImage: async function(imgAttachmentId, tagName) {
              console.log("docxtemplater: getImage! imgAttachmentId, tagName:", imgAttachmentId, tagName);
              let url = await gristGetAttachmentURL(imgAttachmentId);
              return new Promise(function(resolve, reject) {
                PizZipUtils.getBinaryContent(url, function(err, content) {
                  if (err) {
                    //throw err;
                    let msg = `${err.name} in PizZipUtils.getBinaryContent: ${err.message}`;
                    console.warn(`docxtemplater: Couldn't load image with attachment id '${imgAttachmentId}' (URL: '${url}') into placeholder '${tagName}': ${msg}`);
                    return reject(err);
                  }
                  return resolve(content);
                });
              });
            },
            getSize: async function(imgAttachmentId, image, tagName) {
              console.log("docxtemplater: getSize! imgAttachmentId, image, tagName:", imgAttachmentId, image, tagName);
              let url = await gristGetAttachmentURL(imgAttachmentId);
              return new Promise(function(resolve, reject) {
                const img = new Image();
                img.src = url;
                img.onload = function() {
                  return resolve([img.width, img.height]);
                };
                img.onerror = function(e) {
                  console.warn(`docxtemplater: Couldn't load image with attachment id '${imgAttachmentId}' (URL: '${url}') into placeholder '${tagName}'. Image object: `, image);
                  return reject(e);
                };
              });
            },
          })];
        }
        // Initialize docxtemplater and render the document.
        const templater = new window.docxtemplater(new PizZip(content), docxtemplaterOptions);
        //templater.render(data);
        templater.renderAsync(data).then(function() {
          // Offer the processed document for download.
          setStatusMessage("Document ready for download.");
          saveAs(templater.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            compression: "DEFLATE",
          }), outputFileName);
        }).catch(function(renderError) {
          // If there is an error in the template, make sure to provide useful details to the user.
          if (renderError instanceof docxtemplater.Errors.XTTemplateError) {
            renderError = renderError.properties.errors;
          }
          if (0 in renderError && "name" in renderError[0] && "message" in renderError[0]) {
            if ("properties" in renderError[0] && "explanation" in renderError[0].properties) {
              let msg = `${renderError[0].name}: ${renderError[0].properties.explanation}`;
              console.warn(`docxtemplater: ${msg}`);
              handleError(new Error(msg));
            } else {
              // Fallback in case there isn't an 'explanation' field.
              let msg = `${renderError[0].name}: ${renderError[0].message}`;
              console.warn(`docxtemplater: ${msg}`);
              handleError(new Error(msg));
            }
          } else {
            // Handle any other errors normally.
            handleError(renderError);
          }
        });
      } catch (e) {
        handleError(e);
        /*if (e instanceof docxtemplater.Errors.XTTemplateError) {
          // If there is an error in the template, make sure to provide useful details to the user.
          e = e.properties.errors;
        }
        if (0 in e && "name" in e[0] && "message" in e[0]) {
          if ("properties" in e[0] && "explanation" in e[0].properties) {
            // Ditto.
            let msg = `${e[0].name}: ${e[0].properties.explanation}`;
            console.warn(`docxtemplater: ${msg}`);
            handleError(new Error(msg));
          } else {
            // Fallback in case there isn't an 'explanation' field.
            let msg = `${e[0].name}: ${e[0].message}`;
            console.warn(`docxtemplater: ${msg}`);
            handleError(new Error(msg));
          }
        } else {
          // Handle any other errors normally.
          handleError(e);
        }*/
      }
    });
  } catch (err) {
    // Handle any other errors apart from what docxtemplater might have thrown.
    handleError(err);
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
      { name: DATA_COL_NAME, type: "Any", title: "Placeholder Data", description: "Must be a dictionary of the form {placeholder_name: value_to_replace_by}" },
      { name: FILENAME_COL_NAME, type: "Text", title: "Output File Name", description: "Name of the resulting file that will be offered for download. Should include the '.docx' extension." },
      { name: USEANGULAR_COL_NAME, type: "Bool", optional: true, title: "Use Angular Parser?", description: "Whether to use the Angular expressions parser or not. The default is 'true'." },
      { name: DELIMITERSTART_COL_NAME, type: "Text", optional: true, title: "Custom Delimiter: Start", description: "Custom delimiter to use for the start of placeholders. The default is '{'." },
      { name: DELIMITEREND_COL_NAME, type: "Text", optional: true, title: "Custom Delimiter: End", description: "Custom delimiter to use for the end of placeholders. The default is '}'." },
    ],
  });
  // Register callback for when the user selects a record in Grist.
  grist.onRecord(gristRecordSelected);
  // Add actions to our buttons.
  document.querySelector("#button_process").addEventListener("click", function(){
    setStatusMessage("Working...");
    processFile(currentData.url, currentData.data, currentData.outputFileName);
  });
  document.querySelector("#button_status_reset").addEventListener("click", function(){
    resetStatusMessage();
  });
});
