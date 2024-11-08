
async function getGristApiUrl() {
  let token = await grist.docApi.getAccessToken({readOnly: true})
  let docName = await grist.docApi.getDocName();
  return token.baseUrl.replace(/(.+\/).+?$/, '$1') + docName + '/';
}

function getCurrencySymbol (locale, currency) {
  return (0).toLocaleString(
    locale,
    {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }
  ).replace(/\d/g, '').trim();
}

function convertGristDateFormat(formatStr) {
  if (!formatStr) {
    return 'yy-mm-dd';
  }
  let dict = {
    ['yyyy']: 'yy',
    ['(?<!m)mmm(?!m)']: 'M',
    ['mmmm']: 'MM',
    ['do']: 'd',
  }
  formatStr = formatStr.toLowerCase();
  for (const [pattern, replacement] of Object.entries(dict)) {
    formatStr = formatStr.replace(new RegExp(pattern), dict[pattern]);
  }
  return formatStr;
}

function log(...messages) {
  console.log('GristParamqueryGrid:', ...messages);
}

function ready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

const Settings = {
  autoUpdateSchema: false,
}
const INTERNAL_COLUMNS = [/^manual/, /^id$/, /^gristHelper_/, /^_/, /^#/];
const GRIST_TO_GRID_COLTYPES = {
  ['^ManualSortPos$']: 'float',
  ['^Text$']: 'string',
  ['^Int$']: 'integer',
  ['^Numeric$']: 'float',
  ['^Date']: 'date',  //also applies to DateTime
  ['^Bool$']: 'bool',
};
const DEFAULT_COLUMN_OPTIONS = {
  ellipsis: true,
  valign: 'top',
  resizable: true,
  width: 150,
  escapeHTML: true,
  sortable: true,
  onAfterChange: () => {},
};
const GRID_CONTAINER_SELECTOR = "#grid";
const GRID_TOOLBAR = {
  cls: 'grid-toolbar',
  items: [
      {
        type: 'button',
        label: 'getSelection',
        listener: async () => log(getSelection()),
      },
      {
          type: 'button',
          label: 'Add record',
          icon: 'ui-icon-plus',
          listener: async () => addRecord(),
      },
      {
          type: 'button',
          label: 'Delete',
          icon: 'ui-icon-minus',
          listener: async () => deleteRecord(),
      },
      /*{
          type: 'checkbox',
          label: 'Merge cells',
          value: true, //checked initially.
          listener: (event, context) => {},
      },*/
  ],
};
const GRID_OPTIONS = {
  width: '100%',
  height: '100%',
  collapsible: false,
  showBottom: false,
  showTop: true,
  virtualX: true,
  virtualY: true,
  showTitle: false,
  roundCorners: false,
  hoverMode: 'cell',
  scrollModel: {
    flexContent: true,
  },
  swipeModel: {
    on: false,
  },
  dataModel: {
    data: {},
  },
  toolbar: GRID_TOOLBAR,
};

let Grid = null;
let MountedTableOps = null;
let MountedTableName = null;
let DocInfo = null;
let isDataModifiedByGrid = false;
let isCursorTriggeredByGrid = false;
let Cursor = null;

async function fetchGristDocInfo() {
  let docInfo = await grist.docApi.fetchTable('_grist_DocInfo');
  docInfo.timezone = docInfo.timezone[0];
  try {
    docInfo.documentSettings = JSON.parse(docInfo.documentSettings[0]);
  } catch (error) {
    docInfo.documentSettings = {};
  }
  return docInfo;
}

function renderCellEditor(context) {
  if (context.column.dataType === 'bool') {
    return {type: 'checkbox'};
  }
  if (context.column._isRef) {
    return {type: 'select', options: [{[['R', context.column._refTargetTable, 1]]: `${context.column._refTargetTable}.${context.column._refTargetColumn}`}, {2: 'two'}]};
  }
  if (context.column.dataType === 'string') {
    return {type: 'textarea', style: 'height: 98%'}; //or could use Grid.getCell({rowIndx:context.rowIndx,dataIndx:context.dataIndx}).height()
  }
  return {type: 'textbox'};
}

function renderCell(context) {
  if (context.column.dataType === 'bool') {
    return `<input type="checkbox" onchange="((checkbox) => Grid.updateRow({rowIndx: ${context.rowIndx}, newRow: {${context.dataIndx}: checkbox.checked ? true : false}}))(this);" ${context.cellData ? 'checked' : ''}/>`;
  }
  return null;
}

async function fetchGristSchema() {
  if (!MountedTableName || !DocInfo) {
    throw new Error('MountedTableName and DocInfo must be made available first.');
  }
  let gristTables = await grist.docApi.fetchTable('_grist_Tables');
  let gristColumns = await grist.docApi.fetchTable('_grist_Tables_column'); //parentId = id of table
  let columns = [];
  columns.push({
    dataIndx: 'id',
    title: 'id',
    dataType: 'integer',
    hidden: true,
  });
  for (let i=0; i<gristTables.id.length; i++) {
    if (gristTables.tableId[i] != MountedTableName) continue;
    for (let j=0; j<gristColumns.id.length; j++) {
      if (gristColumns.parentId[j] != gristTables.id[i]) continue;
      let colName = gristColumns.colId[j];
      let colOptions = {};
      if (INTERNAL_COLUMNS.find((pattern) => colName.match(pattern))) {
        colOptions.hidden = false; //TODO set to false when done debugging
      }
      log("add col to schema", colName, Object.fromEntries(Object.keys(gristColumns).map((colName2) => [colName2, gristColumns[colName2][j]])));
      colOptions = {
        ...DEFAULT_COLUMN_OPTIONS,
        dataIndx: colName,
        title: gristColumns.label[j],
        editor: renderCellEditor,
        render: renderCell,
        dataType: GRIST_TO_GRID_COLTYPES[Object.keys(GRIST_TO_GRID_COLTYPES).find((pattern) => gristColumns.type[j].match(new RegExp(pattern)))] ?? 'string',
        _id: gristColumns.id[j],
        _type: gristColumns.type[j],
        _isRef: gristColumns.type[j].match(/^Ref:/) ? true : false,
        _isRefList: gristColumns.type[j].match(/^RefList:/) ? true : false,
        _refTargetTable: gristColumns.type[j].replace(/^(Ref|RefList):(.+?)$/, '$2'),
        _refTargetColumn: 'id',
        _displayCol: gristColumns.displayCol[j],
        _isFormula: gristColumns.isFormula[j],
        _formula: gristColumns.formula[j],
        _description: gristColumns.description[j],
        _currencySymbol: '$',
      };
      try {
        colOptions._widgetOptions = JSON.parse(gristColumns.widgetOptions[j]);
      } catch (error) {
        colOptions._widgetOptions = {};
      }
      if (colOptions.dataType == 'date') {
        colOptions.format = convertGristDateFormat(colOptions._widgetOptions.dateFormat);
        log("converted date format", colOptions._widgetOptions.dateFormat, colOptions.format);
      }
      if (colOptions._widgetOptions.currency) {
        colOptions._currencySymbol = getCurrencySymbol(DocInfo.documentSettings?.locale ?? 'en-EN', colOptions._widgetOptions.currency);
        colOptions.format = '#.###,00 ' + colOptions._currencySymbol;
      }
      columns.push(colOptions);
    }
  }
  for (let col of columns) {
    if (col._isRef || col._isRefList) {
      col._refTargetColumn = columns.find((otherCol) => otherCol._id === col._displayCol)?._formula.replace(/.+\.(.+?)/, '$1');
      log("adjusted displayCol for column:", col);
    }
  }
  log("updated schema:", columns);
  return columns;
}

async function fetchGristRecords() {
  return await grist.viewApi.fetchSelectedTable({format: 'rows', includeColumns: 'all', keepEncoded: false});
}

function getSelection() {
  let selectedCells = Grid.selection({method: 'getSelection', type: 'cell'});
  let selectedRows = [];
  if (!selectedCells?.length) {
    selectedRows = Grid.selection({method: 'getSelection', type: 'row'});
  }
  let selectedItems = selectedCells.length ? selectedCells : selectedRows;
  let selectedRowIndices = [...new Set(selectedItems.map((item) => item.rowIndx))];
  let selectedColIndices = [...new Set(selectedItems.map((item) => item.colIndx ?? -1))];
  let minRowIndx = Math.min(...selectedRowIndices);
  let maxRowIndx = Math.max(...selectedRowIndices);
  let minColIndx = Math.min(...selectedColIndices);
  let maxColIndx = Math.min(...selectedColIndices);
  return {
    cells: selectedCells,
    rows: selectedRows,
    rowIndices: selectedRowIndices,
    colIndices: selectedColIndices,
    minRowIndx: isFinite(minRowIndx) ? minRowIndx : undefined,
    maxRowIndx: isFinite(maxRowIndx) ? maxRowIndx : undefined,
    minColIndx: isFinite(minColIndx) ? minColIndx : undefined,
    maxColIndx: isFinite(maxColIndx) ? maxColIndx : undefined,
  }
}

async function onGristCursorMoved(gristRecord, gristColMap) {
  if (isCursorTriggeredByGrid) {
    log("cursor move was triggered by this grid, no actions needed.");
    isCursorTriggeredByGrid = false;
    return;
  }
  Cursor = Grid.getRowIndx({rowData: Grid.option('dataModel.data').find((row) => row.id == gristRecord.id)});
  log("cursor", Cursor);
  let selection = getSelection();
  //log("current selection:",selection);
  if (Cursor.rowIndx >= selection.minRowIndx && Cursor.rowIndx <= selection.maxRowIndx) {
    //log("no need to adjust selection.");
    return;
  }
  Grid.setSelection({rowIndx: Cursor.rowIndx, colIndx: selection.minColIndx, focus: false});
  Grid.refresh();
}

async function onDataModified() {
  log("onDataModified");
  if (isDataModifiedByGrid) {
    isDataModifiedByGrid = false;
    log("modification came from this grid, no refresh necessary.");
  } else {
    Grid.showLoading();
    Grid.disable();
    if (Settings.autoUpdateSchema) {
      Grid.option('colModel', await fetchGristSchema());
    }
    Grid.option('dataModel.data', await fetchGristRecords());
    Grid.refreshView();
    Grid.hideLoading();
    Grid.enable();
  }
}

async function onEdited(event, context) {
  log("onEdited", event, context);
  let gristActions = [];
  for (rowContext of context.rowList) {
    let id = rowContext.rowData.id;
    let fields = rowContext.newRow;
    gristActions.push([
      'UpdateRecord',
      MountedTableName,
      Number(id),
      fields,
    ]);
  }
  isDataModifiedByGrid = true;
  isCursorTriggeredByGrid = true;
  grist.docApi.applyUserActions(gristActions);
}

async function addRecord(atRowIndx) {
  log("ADDRECORD");
  let rowIndx = atRowIndx;
  let colIndx = 0;
  if (!atRowIndx && atRowIndx !== 0) {
    let selection = getSelection();
    rowIndx = selection.minRowIndx;
    colIndx = selection.minColIndx;
  }
  let gristManualSortPos = Number(Grid.getRowData({rowIndx: rowIndx}).manualSort);
  isCursorTriggeredByGrid = true;
  await grist.docApi.applyUserActions([
    ['AddRecord', MountedTableName, null, {manualSort: gristManualSortPos}],
  ]);
  Grid.setSelection({rowIndx: rowIndx, colIndx: colIndx});
  //Grid.scrollRow({rowIndxPage: rowIndx});
  Grid.refresh();
}

async function deleteRecord(atRowIndx) {
  let rowIndices = [];
  let gristIds = [];
  if (!atRowIndx && atRowIndx !== 0) {
    rowIndices = getSelection().rowIndices;
  } else {
    rowIndices = [atRowIndx];
  }
  //log("delete:", rowIndices);
  let actions = rowIndices.map((rowIndx) => ['RemoveRecord', MountedTableName, Number(Grid.getRowData({rowIndx: rowIndx}).id)]);
  grist.docApi.applyUserActions(actions);
}

ready(async () => {
  console.clear();
  MountedTableOps = await grist.getTable();
  MountedTableName = await MountedTableOps.getTableId();
  Grid = pq.grid(GRID_CONTAINER_SELECTOR, GRID_OPTIONS);
  Grid.disable();
  Grid.on('change', onEdited);
  DocInfo = await fetchGristDocInfo();
  log("doc info:", DocInfo);
  if (!Settings.autoUpdateSchema) {
    Grid.option('colModel', await fetchGristSchema());
  }
  grist.ready({
    requiredAccess: 'full',
    allowSelectBy: true,
  });
  grist.onRecord(onGristCursorMoved);
  grist.onRecords(async () => onDataModified());
  await onDataModified();
});
