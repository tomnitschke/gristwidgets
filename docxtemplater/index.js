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
const USEIMAGEMODULE_COL_NAME = "use_image_module";
const DELIMITERSTART_COL_NAME = "delimiter_start";
const DELIMITEREND_COL_NAME = "delimiter_end";
const currentData = { url: null, data: null, outputFileName: null, useAngular: true, useImageModule: true, delimiterStart: '{', delimiterEnd: '}' };
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
    console.error("docxtemplater: FATAL: ", err);
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
  console.error("docxtemplater: ", err);
}

function handleDocxtemplaterError(docxtemplaterError) {
  // If there is an error in the template, make sure to provide useful details to the user.
  if (docxtemplaterError instanceof docxtemplater.Errors.XTTemplateError) {
    docxtemplaterError = docxtemplaterError.properties.errors;
  }
  if (0 in docxtemplaterError && "name" in docxtemplaterError[0] && "message" in docxtemplaterError[0]) {
    if ("properties" in docxtemplaterError[0] && "explanation" in docxtemplaterError[0].properties) {
      let msg = `${docxtemplaterError[0].name}: ${docxtemplaterError[0].properties.explanation}`;
      console.warn(`docxtemplater: ${msg}`);
      return handleError(new Error(msg));
    }
    // Fallback in case there isn't an 'explanation' field.
    let msg = `${docxtemplaterError[0].name}: ${docxtemplaterError[0].message}`;
    console.warn(`docxtemplater: ${msg}`);
    return handleError(new Error(msg));
  }
  // Handle any other errors normally.
  return handleError(renderError);
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

async function getGristImageAttachmentURL(imgAttachmentIdOrUrl) {
  if (/(?:https?):\/\/(\w+:?\w*)?(\S+)(:\d+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/.test(imgAttachmentIdOrUrl))
  {
    // This looks like a URL.
    return imgAttachmentIdOrUrl;
  } else {
    // Otherwise assume it is an attachment id. Note that gristGetAttachmentURL() will throw
    // if the value can't be cast to Number.
    return await gristGetAttachmentURL(imgAttachmentIdOrUrl);
  }
}

async function gristRecordSelected(record, mappedColNamesToRealColNames) {
  console.log("docxtemplater: gristRecordSelected() with record, mappedColNamesToRealColNames:", record, mappedColNamesToRealColNames);
  try {
    //const mappedRecord = grist.mapColumnNames(record);
    // Unfortunately, Grist's mapColumnNames function doesn't handle optional column mappings
    // properly, so we need to map stuff ourselves.
    const mappedRecord = {}
    if (mappedColNamesToRealColNames) {
      for (const[mappedColName, realColName] of Object.entries(mappedColNamesToRealColNames)) {
        if (realColName in record) {
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
      let msg = "<b>Please map all columns first.</b>";
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
      console.log("docxtemplater: Will Angular expressions parser be used:", currentData.useAngular);
    }
    if (USEIMAGEMODULE_COL_NAME in mappedRecord) {
      currentData.useImageModule = mappedRecord[USEIMAGEMODULE_COL_NAME];
      console.log("docxtemplater: Will image module be used:", currentData.useImageModule);
    }
    if (DELIMITERSTART_COL_NAME in mappedRecord && mappedRecord[DELIMITERSTART_COL_NAME]) {
      currentData.delimiterStart = mappedRecord[DELIMITERSTART_COL_NAME];
      console.log(`docxtemplater: Custom starting delimiter: '${currentData.delimiterStart}'`);
    }
    if (DELIMITEREND_COL_NAME in mappedRecord && mappedRecord[DELIMITEREND_COL_NAME]) {
      currentData.delimiterEnd = mappedRecord[DELIMITEREND_COL_NAME];
      console.log(`docxtemplater: Custom ending delimiter: '${currentData.delimiterEnd}'`);
    }
    currentData.outputFileName = mappedRecord[FILENAME_COL_NAME];
    console.log(`docxtemplater: Output file name set to: '${currentData.outputFileName}'`);
    // Now we have all the data nicely validated and present in currentData,
    // all that's left to do is to display a ready message and the 'process' button.
    setStatusMessage("Ready. Click 'Process' to generate the document.");
  } catch (err) {
    return handleError(err);
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
          nullGetter: function(part, scope) {
            // Implement a default nullGetter that doesn't grace users' documents with instances of 'undefined'.
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
        if (currentData.useAngular) {
          // Enable the Angular expressions parser.
          docxtemplaterOptions.parser = AngularExpressionsParser;
        }
        //TODO
        // Enable the image module.
        if (currentData.useImageModule) {
          docxtemplaterOptions.modules = [new ImageModule({
            //TODO make this configurable?
            centered: false,
            getImage: async function(imgAttachmentIdOrUrl, tagName) {
              console.log("docxtemplater: getImage! imgAttachmentIdOrUrl, tagName:", imgAttachmentIdOrUrl, tagName);
              let url = await getGristImageAttachmentURL(imgAttachmentIdOrUrl);
              return new Promise(function(resolve, reject) {
                PizZipUtils.getBinaryContent(url, function(err, content) {
                  if (err) {
                    //throw err;
                    let msg = `${err.name} in PizZipUtils.getBinaryContent: ${err.message}`;
                    console.warn(`docxtemplater: Couldn't load image with attachment id '${imgAttachmentIdOrUrl}' (URL: '${url}') into placeholder '${tagName}': ${msg}`);
                    return reject(err);
                  }
                  return resolve(content);
                });
              });
            },
            getSize: async function(image, imgAttachmentIdOrUrl, tagName) {
              console.log("docxtemplater: getSize! imgAttachmentIdOrUrl, image, tagName:", imgAttachmentIdOrUrl, image, tagName);
              let url = await getGristImageAttachmentURL(imgAttachmentIdOrUrl);
              return new Promise(function(resolve, reject) {
                const img = new Image();
                img.src = url;
                img.onload = function() {
                  return resolve([img.width, img.height]);
                };
                img.onerror = function(e) {
                  console.warn(`docxtemplater: Couldn't fetch image from '${url}' for placeholder '${tagName}'. Maybe it's a CORS issue?`);
                  return reject(e);
                };
              });
            },
          })];
        }
        let templater = null;
        try
        {
          // Initialize docxtemplater.
          templater = new window.docxtemplater(new PizZip(content), docxtemplaterOptions);
        } catch (docxtemplaterError) {
          return handleDocxtemplaterError(docxtemplaterError);
        }
        // Render the document.
        templater.renderAsync(data).then(function() {
          // When done, offer the final document for download.
          setStatusMessage("Document ready for download.");
          saveAs(templater.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            compression: "DEFLATE",
          }), outputFileName);
        }).catch(function(docxtemplaterError) {
          return handleDocxtemplaterError(docxtemplaterError);
        });
      } catch (e) {
        return handleError(e);
      }
    });
  } catch (err) {
    // Handle any other errors apart from what docxtemplater might have thrown.
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
      { name: DATA_COL_NAME, type: "Any", strictType: true, title: "Placeholder Data", description: "Must be a dictionary of the form {placeholder_name: value_to_replace_by}" },
      { name: FILENAME_COL_NAME, type: "Text,Choice", title: "Output File Name", description: "Name of the resulting file that will be offered for download. Should include the '.docx' extension." },
      { name: USEANGULAR_COL_NAME, type: "Bool", optional: true, title: "Use Angular Parser?", description: "Whether to use the Angular expressions parser or not. The default is 'true'." },
      { name: USEIMAGEMODULE_COL_NAME, type: "Bool", optional: true, title: "Use Image Module?", description: "Whether to use the image module (allows insertion of images from Grist attachments) or not. The default is 'true'." },
      { name: DELIMITERSTART_COL_NAME, type: "Text,Choice", optional: true, title: "Custom Delimiter: Start", description: "Custom delimiter to use for the start of placeholders. The default is '{'." },
      { name: DELIMITEREND_COL_NAME, type: "Text,Choice", optional: true, title: "Custom Delimiter: End", description: "Custom delimiter to use for the end of placeholders. The default is '}'." },
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
  console.log("docxtemplater: Ready.");
});
