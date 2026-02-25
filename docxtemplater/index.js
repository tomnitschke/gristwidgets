/**
 * Grist Docxtemplater Widget — Batch Mode
 *
 * Generates merged .docx documents from Grist data.
 *
 * How it works:
 *   1. TEMPLATE: Reads the .docx template from the selected Document_Templating row.
 *   2. DATA: Fetches all records from the Vehicles and Vehicle_Owners tables.
 *   3. SELECTION: Shows a searchable case list where the user picks which cases to process.
 *   4. PROCESSING: For each selected case and each of its owners, generates a letter
 *      using the template, then merges ALL letters into one .docx file with page breaks.
 *      One click, one download, one file to print.
 *
 * Column mapping (in Grist widget settings):
 *   - "Template Attachment ID" (required): Map to the column holding the template attachment ID.
 *   - "Output File Name" (optional): Map to a column for the merged file's name.
 */

function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

// ============================================================
// CONFIGURATION
// ============================================================

// Columns that contain dates (Grist stores these as Unix timestamps).
// These will be formatted as MM/DD/YYYY.
// >>> If you add new Date columns to Vehicles, add them here. <<<
const DATE_COLUMNS = ['VehImpDate', 'DateFirstLetter', 'ADDDate'];

// Columns that contain dollar amounts.
// These will be formatted as $ X,XXX.XX.
// >>> If you add new currency columns to Vehicles, add them here. <<<
const CURRENCY_COLUMNS = [
  'ADDState1Cost', 'ADDState2Cost', 'ADDNatCost', 'TowingFee',
  'OwnerInfoCost', 'NonADD_StateFee', 'ProcFee', 'DailyStorage',
  'Storage', 'Totals', 'LetterFee', 'Postage'
];

// Columns to exclude from template placeholders.
const SKIP_PREFIXES = ['#', 'gristHelper_'];
const SKIP_COLUMNS = ['id', 'manualSort'];

// Maximum number of cases to render at once (for performance).
const DISPLAY_LIMIT = 300;

// Delay between rendering individual documents (ms).
// Prevents the browser from freezing during large batches.
const RENDER_DELAY_MS = 5;

// ============================================================
// STATE
// ============================================================

const state = {
  templateUrl: null,
  outputFileNameBase: null,
  vehicles: [],           // Array of vehicle row objects
  owners: [],             // Array of owner row objects
  ownersByVehicle: {},    // { vehicleId: [owner, owner, ...] }
  selectedVehicleIds: new Set(),
  gristAccessToken: null,
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Format a value for use in a template placeholder.
 */
function formatValue(colName, value) {
  if (value === null || value === undefined || value === '') return '';

  // Date columns: convert Unix timestamp to MM/DD/YYYY.
  if (DATE_COLUMNS.includes(colName) && typeof value === 'number' && value > 0) {
    const date = new Date(value * 1000);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  // Currency columns: format as $ X,XXX.XX.
  if (CURRENCY_COLUMNS.includes(colName) && typeof value === 'number') {
    const abs = Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (value < 0 ? '-' : '') + '$ ' + abs;
  }

  return String(value);
}

/**
 * Convert Grist's columnar format { col: [vals] } to an array of row objects.
 */
function columnarToRows(tableData) {
  const rows = [];
  const columns = Object.keys(tableData);
  if (columns.length === 0 || !tableData.id) return rows;
  const n = tableData.id.length;
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const col of columns) {
      row[col] = tableData[col][i];
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Build a placeholder mapping for one vehicle + one owner.
 * Returns a flat {placeholder: value} dictionary for docxtemplater.
 */
function buildPlaceholderMapping(vehicle, owner) {
  const mapping = {};

  // 1) Add all vehicle columns (includes formula columns like CustStreet, CustomerName, etc.)
  for (const [key, value] of Object.entries(vehicle)) {
    if (SKIP_COLUMNS.includes(key)) continue;
    if (SKIP_PREFIXES.some(p => key.startsWith(p))) continue;
    mapping[key] = formatValue(key, value);
  }

  // 2) Override / add owner-specific columns.
  //    Every Vehicle_Owners column is included (except Case, which is a reference ID
  //    and would overwrite the Case text from Vehicles).
  if (owner) {
    for (const [key, value] of Object.entries(owner)) {
      if (SKIP_COLUMNS.includes(key)) continue;
      if (SKIP_PREFIXES.some(p => key.startsWith(p))) continue;
      if (key === 'Case') continue;  // don't overwrite the Case # with a row ID
      mapping[key] = formatValue(key, value);
    }
  }

  return mapping;
}

/**
 * Get a Grist attachment download URL.
 */
async function getAttachmentUrl(attachmentId) {
  if (!state.gristAccessToken) {
    state.gristAccessToken = await grist.docApi.getAccessToken({ readOnly: true });
  }
  return `${state.gristAccessToken.baseUrl}/attachments/${attachmentId}/download?auth=${state.gristAccessToken.token}`;
}

/**
 * Fetch binary content from a URL (wrapper around PizZipUtils).
 */
function fetchBinary(url) {
  return new Promise((resolve, reject) => {
    PizZipUtils.getBinaryContent(url, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/**
 * Small async delay (keeps the UI responsive during long loops).
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// UI FUNCTIONS
// ============================================================

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
}

function showProgress(visible) {
  document.getElementById('progress-bar').className = visible ? 'progress-bar' : 'progress-bar hidden';
}

function setProgress(pct) {
  document.getElementById('progress-fill').style.width = pct + '%';
}

/**
 * Render the case list with checkboxes.
 */
function renderCaseList() {
  const container = document.getElementById('case-list');
  const search = (document.getElementById('search-box').value || '').toLowerCase().trim();

  if (state.vehicles.length === 0) {
    container.innerHTML = '<div class="list-message">No vehicles found.</div>';
    return;
  }

  // Filter vehicles by search term.
  const filtered = state.vehicles.filter(v => {
    if (!search) return true;
    const caseNum = String(v.Case || '').toLowerCase();
    const desc = [v.VehYear, v.VehMake, v.VehMod].filter(Boolean).join(' ').toLowerCase();
    const customer = String(v.CustomerName || '').toLowerCase();
    return caseNum.includes(search) || desc.includes(search) || customer.includes(search);
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="list-message">No matching cases.</div>';
    return;
  }

  // Only render up to DISPLAY_LIMIT for performance.
  const display = filtered.slice(0, DISPLAY_LIMIT);
  const overflow = filtered.length - display.length;

  let html = '';
  for (const v of display) {
    const caseNum = v.Case || '(no case #)';
    const desc = [v.VehYear, v.VehMake, v.VehMod].filter(Boolean).join(' ');
    const customer = v.CustomerName || '';
    const owners = state.ownersByVehicle[v.id] || [];
    const isSelected = state.selectedVehicleIds.has(v.id);

    html += `<div class="case-item ${isSelected ? 'selected' : ''}" data-vid="${v.id}">
      <input type="checkbox" ${isSelected ? 'checked' : ''}>
      <div class="case-info">
        <div class="case-number">${escHtml(String(caseNum))}</div>
        <div class="case-desc">${escHtml(desc)}${customer ? ' — ' + escHtml(customer) : ''}</div>
      </div>
      <span class="owner-badge">${owners.length} owner${owners.length !== 1 ? 's' : ''}</span>
    </div>`;
  }

  if (overflow > 0) {
    html += `<div class="list-overflow">${overflow} more case(s) match — narrow your search to see them.</div>`;
  }

  container.innerHTML = html;

  // Attach click handlers.
  container.querySelectorAll('.case-item').forEach(el => {
    el.addEventListener('click', e => {
      // Don't double-fire when clicking the checkbox itself.
      if (e.target.tagName === 'INPUT') return;
      toggleCase(Number(el.dataset.vid));
    });
    el.querySelector('input').addEventListener('change', () => {
      toggleCase(Number(el.dataset.vid));
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleCase(vehicleId) {
  if (state.selectedVehicleIds.has(vehicleId)) {
    state.selectedVehicleIds.delete(vehicleId);
  } else {
    state.selectedVehicleIds.add(vehicleId);
  }
  renderCaseList();
  updateSummary();
}

function selectAll() {
  // Select only the currently visible (search-filtered) cases.
  const search = (document.getElementById('search-box').value || '').toLowerCase().trim();
  for (const v of state.vehicles) {
    if (!search) {
      state.selectedVehicleIds.add(v.id);
      continue;
    }
    const caseNum = String(v.Case || '').toLowerCase();
    const desc = [v.VehYear, v.VehMake, v.VehMod].filter(Boolean).join(' ').toLowerCase();
    const customer = String(v.CustomerName || '').toLowerCase();
    if (caseNum.includes(search) || desc.includes(search) || customer.includes(search)) {
      state.selectedVehicleIds.add(v.id);
    }
  }
  renderCaseList();
  updateSummary();
}

function selectNone() {
  state.selectedVehicleIds.clear();
  renderCaseList();
  updateSummary();
}

function updateSummary() {
  let totalLetters = 0;
  for (const vid of state.selectedVehicleIds) {
    const owners = state.ownersByVehicle[vid] || [];
    totalLetters += Math.max(owners.length, 1); // at least 1 letter even if 0 owners
  }
  document.getElementById('selected-count').textContent = state.selectedVehicleIds.size;
  document.getElementById('letter-count').textContent = totalLetters;

  document.getElementById('process-btn').disabled =
    !state.templateUrl || state.selectedVehicleIds.size === 0;
}

// ============================================================
// GRIST INTEGRATION
// ============================================================

/**
 * Called when the user selects a row in Document_Templating.
 * We read the template attachment from that row.
 */
async function handleRecordSelected(record, mappedColNamesToRealColNames) {
  try {
    const mapped = {};
    if (mappedColNamesToRealColNames) {
      for (const [mName, rName] of Object.entries(mappedColNamesToRealColNames)) {
        if (rName in record) mapped[mName] = record[rName];
      }
    }

    const info = document.getElementById('template-info');

    if (mapped.attachment_id) {
      state.templateUrl = await getAttachmentUrl(mapped.attachment_id);
      const displayName = mapped.filename || mapped.template_name || 'Template loaded';
      state.outputFileNameBase = mapped.filename || mapped.template_name || 'merged_letters';
      info.textContent = displayName;
      info.className = 'active';
    } else {
      state.templateUrl = null;
      info.textContent = 'Select a template row to begin...';
      info.className = '';
    }

    updateSummary();
  } catch (err) {
    setStatus('Error loading template: ' + err.message, true);
  }
}

/**
 * Fetch all Vehicles and Vehicle_Owners from Grist.
 */
async function loadData() {
  try {
    setStatus('Loading data from Grist...');

    const [vehiclesRaw, ownersRaw] = await Promise.all([
      grist.docApi.fetchTable('Vehicles'),
      grist.docApi.fetchTable('Vehicle_Owners')
    ]);

    state.vehicles = columnarToRows(vehiclesRaw);
    state.owners = columnarToRows(ownersRaw);

    // Sort vehicles by Case number.
    state.vehicles.sort((a, b) => String(a.Case || '').localeCompare(String(b.Case || '')));

    // Index owners by their vehicle reference (Vehicle_Owners.Case is a reference → vehicle row ID).
    state.ownersByVehicle = {};
    for (const owner of state.owners) {
      const vid = owner.Case;
      if (!state.ownersByVehicle[vid]) state.ownersByVehicle[vid] = [];
      state.ownersByVehicle[vid].push(owner);
    }

    renderCaseList();
    updateSummary();
    setStatus(`Loaded ${state.vehicles.length} cases and ${state.owners.length} owners.`);
  } catch (err) {
    setStatus('Error loading data: ' + err.message, true);
    document.getElementById('case-list').innerHTML =
      '<div class="list-message" style="color:#e53935;">Failed to load data. Make sure the widget has full document access.</div>';
  }
}

// ============================================================
// DOCUMENT GENERATION & MERGING
// ============================================================

/**
 * Generate a single filled document. Returns a PizZip object.
 */
async function generateSingleDoc(templateContent, data) {
  const options = {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    nullGetter: function(part) {
      if (!part.module) {
        // Unknown placeholder → leave it visible so the user can spot it.
        if ("value" in part) return '{' + part.value + '}';
        return '';
      }
      return '';
    },
  };

  // Angular expressions parser (e.g. for conditionals in templates).
  if (typeof AngularExpressionsParser !== 'undefined') {
    options.parser = AngularExpressionsParser;
  }

  // Image module (for inserting Grist attachment images).
  if (typeof ImageModule !== 'undefined') {
    options.modules = [new ImageModule({
      centered: false,
      getImage: async function(tagValue) {
        const url = /^https?:\/\//.test(tagValue) ? tagValue : await getAttachmentUrl(tagValue);
        return fetchBinary(url);
      },
      getSize: async function(img, tagValue) {
        const url = /^https?:\/\//.test(tagValue) ? tagValue : await getAttachmentUrl(tagValue);
        return new Promise((resolve, reject) => {
          const i = new Image();
          i.src = url;
          i.onload = () => resolve([i.width, i.height]);
          i.onerror = reject;
        });
      },
    })];
  }

  const zip = new PizZip(templateContent);
  const doc = new window.docxtemplater(zip, options);
  await doc.renderAsync(data);
  return doc.getZip();
}

/**
 * Merge multiple PizZip documents into one, with page breaks between them.
 * All documents must be based on the same template (same styles, fonts, etc.)
 */
function mergeDocuments(zips) {
  if (zips.length === 0) return null;
  if (zips.length === 1) return zips[0];

  const baseZip = zips[0];
  let baseXml = baseZip.file('word/document.xml').asText();

  const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  for (let i = 1; i < zips.length; i++) {
    const addXml = zips[i].file('word/document.xml').asText();

    // Extract body content from the additional document.
    const bodyOpen = addXml.indexOf('<w:body');
    if (bodyOpen === -1) continue;
    const bodyOpenEnd = addXml.indexOf('>', bodyOpen) + 1;
    const bodyClose = addXml.lastIndexOf('</w:body>');
    if (bodyClose === -1) continue;
    let bodyContent = addXml.substring(bodyOpenEnd, bodyClose);

    // Strip the trailing <w:sectPr …>…</w:sectPr> from the extracted body
    // (only the base document's sectPr should remain, at the very end).
    const sectPrStart = bodyContent.lastIndexOf('<w:sectPr');
    if (sectPrStart !== -1) {
      bodyContent = bodyContent.substring(0, sectPrStart);
    }

    // Insert page break + body content into the base document,
    // just before the base's final <w:sectPr>.
    const baseSectPr = baseXml.lastIndexOf('<w:sectPr');
    if (baseSectPr !== -1) {
      baseXml = baseXml.substring(0, baseSectPr)
              + PAGE_BREAK
              + bodyContent
              + baseXml.substring(baseSectPr);
    } else {
      // Fallback: insert before </w:body>.
      baseXml = baseXml.replace('</w:body>', PAGE_BREAK + bodyContent + '</w:body>');
    }
  }

  baseZip.file('word/document.xml', baseXml);
  return baseZip;
}

/**
 * Main processing function.
 * Builds placeholder mappings → generates letters → merges → downloads.
 */
async function processAll() {
  if (!state.templateUrl || state.selectedVehicleIds.size === 0) return;

  const btn = document.getElementById('process-btn');
  btn.disabled = true;
  showProgress(true);
  setProgress(0);

  try {
    // ---- Step 1: Fetch the template binary. ----
    setStatus('Downloading template...');
    const templateContent = await fetchBinary(state.templateUrl);

    // ---- Step 2: Build placeholder mappings for every selected case + owner. ----
    const allMappings = [];
    for (const vid of state.selectedVehicleIds) {
      const vehicle = state.vehicles.find(v => v.id === vid);
      if (!vehicle) continue;

      const owners = state.ownersByVehicle[vid] || [];
      if (owners.length === 0) {
        // No owners → one letter with just the vehicle/customer data.
        allMappings.push(buildPlaceholderMapping(vehicle, null));
      } else {
        for (const owner of owners) {
          allMappings.push(buildPlaceholderMapping(vehicle, owner));
        }
      }
    }

    if (allMappings.length === 0) {
      setStatus('No letters to generate.', true);
      btn.disabled = false;
      showProgress(false);
      return;
    }

    // ---- Step 3: Generate each letter from the template. ----
    const generatedZips = [];
    for (let i = 0; i < allMappings.length; i++) {
      setStatus(`Generating letter ${i + 1} of ${allMappings.length}...`);
      setProgress(Math.round(((i + 1) / allMappings.length) * 80));

      try {
        const zip = await generateSingleDoc(templateContent, allMappings[i]);
        generatedZips.push(zip);
      } catch (docErr) {
        // Surface template errors to the user.
        let msg = docErr.message || String(docErr);
        if (docErr.properties && docErr.properties.errors) {
          const first = docErr.properties.errors[0];
          msg = first.properties && first.properties.explanation
            ? first.properties.explanation
            : first.message;
        }
        setStatus(`Error in letter ${i + 1}: ${msg}`, true);
        btn.disabled = false;
        showProgress(false);
        return;
      }

      // Yield to the browser briefly so the UI stays responsive.
      if (i % 10 === 9) await sleep(RENDER_DELAY_MS);
    }

    // ---- Step 4: Merge all letters into one file. ----
    setStatus('Merging into one document...');
    setProgress(90);
    const merged = mergeDocuments(generatedZips);
    if (!merged) {
      setStatus('Error: nothing was generated.', true);
      btn.disabled = false;
      showProgress(false);
      return;
    }

    // ---- Step 5: Download. ----
    setProgress(100);
    let filename = state.outputFileNameBase || 'merged_letters';
    if (!filename.toLowerCase().endsWith('.docx')) filename += '.docx';

    const blob = merged.generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });

    saveAs(blob, filename);
    setStatus(`Done! ${allMappings.length} letter(s) merged into "${filename}".`);
  } catch (err) {
    console.error('docxtemplater batch error:', err);
    setStatus('Error: ' + (err.message || err), true);
  } finally {
    btn.disabled = false;
    showProgress(false);
    updateSummary();
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

ready(function() {
  window.addEventListener('error', function(e) {
    setStatus('Error: ' + (e.message || e), true);
  });

  grist.ready({
    requiredAccess: 'full',
    columns: [
      {
        name: 'attachment_id',
        type: 'Int',
        title: 'Template Attachment ID',
        description: 'ID number of the .docx template attachment in Grist.',
      },
      {
        name: 'filename',
        type: 'Text,Choice',
        optional: true,
        title: 'Output File Name',
        description: 'Base filename for the merged output document.',
      },
      {
        name: 'template_name',
        type: 'Text,Choice',
        optional: true,
        title: 'Template Name',
        description: 'Display name for the selected template (shown in the widget).',
      },
    ],
  });

  // When the user selects a row in Document_Templating, load the template.
  grist.onRecord(handleRecordSelected);

  // Fetch all vehicle + owner data right away.
  loadData();

  // Wire up UI controls.
  document.getElementById('process-btn').addEventListener('click', processAll);
  document.getElementById('search-box').addEventListener('input', () => renderCaseList());
  document.getElementById('select-all').addEventListener('click', selectAll);
  document.getElementById('select-none').addEventListener('click', selectNone);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    state.selectedVehicleIds.clear();
    loadData();
  });

  console.log('docxtemplater batch mode: Ready.');
});
