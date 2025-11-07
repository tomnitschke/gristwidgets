import { Logger } from './util.mjs';
import { DBUtil } from './dbutil.mjs';

class GristDBAdapter {
  static TableInfo = class TableInfo{constructor(tableId,tableRec,cols=null){ Object.assign(this,{tableId,tableRec}); this.cols = cols || {}; }}
  static ColInfo = class ColInfo{constructor(colId,label,colRec,tableId,tableRec,type,isInternal,isRef,refInfo=undefined,widgetOptions=null){ Object.assign(this,{colId,label,colRec,tableId,tableRec,type,isInternal,isRef});
    this.widgetOptions = widgetOptions || {}; if (refInfo) { this.refInfo = refInfo; } }}
  static RefInfo = class RefInfo{constructor(refType,reffedTableName,reffedCol=null){ Object.assign(this,{refType,reffedTableName,reffedCol}); } }
  static DataRecord = class DataRecord{constructor(rawRecord,id,idAsStr,tableRec,fields=null){ Object.assign(this,{rawRecord,id,idAsStr,tableRec}); this.fields = fields || {}; }}
  static FieldInfo = class FieldInfo{constructor(colInfo,rawValue,saneValue,isAltText=false,isBlankRef=false,isMarkdown=false){ Object.assign(this,{colInfo,rawValue,saneValue,isAltText,isBlankRef,isMarkdown}); }}
  static GristTransaction = class GristTransaction{constructor(tableName,wasSchemaUpdated,addedRecords=null,updatedRecords=null,removedRecords=null){ Object.assign(this,{tableName,wasSchemaUpdated});
    this.addedRecords = addedRecords?.length ? addedRecords : []; this.updatedRecords = updatedRecords?.length ? updatedRecords : []; this.removedRecords = removedRecords?.length ? removedRecords : []; }}
  static UpdateSpec = class UpdateSpec{constructor(tableName,recId,fieldsAndValues){ Object.assign(this,{tableName,recId,fieldsAndValues});
    if (!tableName || !recId || !fieldsAndValues || !Object.keys(fieldsAndValues)?.length) { throw new Error("GristDBAdapter.UpdateSpec malformed, check parameters!"); }}}
  static MassUpdateSpec = class MassUpdateSpec{constructor(tableName,colName,recIds,values){ Object.assign(this,{tableName,colName}); this.recIds = recIds || []; this.values = values || []; }}
  constructor (config, isDebugMode=false) {
    this.logger = new Logger('GristDBAdapter', isDebugMode); this.debug = this.logger.debug.bind(this.logger); this.err = this.logger.err.bind(this.logger);
    this.config = {
      ...config
    };
    this.isInitialLoadDone = false;
    this.docInfo = null;    //doc info gathered from '_grist_DocInfo'
    this.metaRecords = {};  //raw Grist table records (from '_grist_Tables') and column records (from '_grist_Tables_column')
    this.schema = null;     //'rich' schema (tableInfos and colInfos), built from metaRecords
    this.rawData = {};      //raw Grist records, by table
    this.data = {};         //DataRecord objects, by table, built from rawData
  }
  async reloadAll () {
    this.isInitialLoadDone = true;
    this.debug("DB.reloadAll!");
    const wasSchemaRefetched = await this.loadSchema();
    const wasAnyDataRefetched = await this.loadData();
    return [wasSchemaRefetched, wasAnyDataRefetched];
  }
  async loadSchema (tableName=null, forceRefetch=false) {
    this.debug("DB.loadSchema!",tableName,forceRefetch);
    const [docInfo, wasSchemaRefetched] = await Promise.all([DBUtil.fetchDocInfo(), DBUtil.fetchMetaRecords(this.metaRecords, forceRefetch)]);
    this.debug("   loaded docInfo:", this.docInfo, "loaded metaRecords:", this.metaRecords);
    if (wasSchemaRefetched) { const newSchema = this._buildSchema(this.metaRecords.tableRecs, this.metaRecords.colRecs, tableName); this.schema = tableName ? {...this.schema, ...newSchema} : newSchema; }
    return wasSchemaRefetched;
  }
  async loadData (tableNames=null, forceRefetch=false) {
    this.debug("DB.loadData!",tableNames,forceRefetch);
    tableNames = tableNames?.length ? tableNames : await grist.docApi.listTables(); const tableNamesToReload = forceRefetch ? tableNames : tableNames.filter((tableName) => !Object.keys(this.rawData).includes(tableName));
    let wasAnyDataRefetched = false;
    if (tableNamesToReload) { wasAnyDataRefetched = true; const rawRecords = await Promise.all(tableNamesToReload.map((tableName) => DBUtil.fetchRecords(tableName)));
      for (const [idx, rawRecordsForTable] of Object.entries(rawRecords)) { this.rawData[tableNamesToReload[idx]] = rawRecordsForTable; } }
    //this.debug("   done fetching rawData:", this.rawData);
    if (wasAnyDataRefetched) { if (forceRefetch) { this.data = this._buildData(this.rawData, this.schema); } else { this.data = {...this.data, ...this._buildData(this.rawData, this.schema, tableNamesToReload) }; } }
    this.debug("   done building data:", this.data);
    return wasAnyDataRefetched;
  }
  async refresh (tableName, considerSpecialCols=null, returnOnlyAddTransaction=false, forceReloadAll=false) {
    considerSpecialCols = considerSpecialCols || [];
    if (forceReloadAll || !this.isInitialLoadDone) { const [wasSchemaRefetched, wasAnyDataRefetched] = await this.reloadAll(); return new GristDBAdapter.GristTransaction(tableName, wasSchemaRefetched, this.data[tableName]); }
    const oldData = this.data[tableName]; await this.loadData([tableName], true); const newData = this.data[tableName];
    let gristTransaction = new GristDBAdapter.GristTransaction(tableName, false);
    //this.debug("DB.refresh! old data:",oldData,"new data:",newData);
    if (oldData.length && newData.length) { if (Object.keys(oldData[0].rawRecord).length !== Object.keys(newData[0].rawRecord).length) { gristTransaction.wasSchemaUpdated = true; await this.loadSchema(tableName, true); } }
    if (returnOnlyAddTransaction) { gristTransaction.added = this.data[tableName]; return gristTransaction; }
    for (const [tableName, newDataRecord] of Object.entries(newData)) {
      const oldDataRecord = oldData.find((rec) => rec.id === newDataRecord.id);
      if (!oldDataRecord) { this.debug("   ADDED record",newDataRecord); gristTransaction.addedRecords.push(newDataRecord); }
      else { for (const [colName, newValue] of Object.entries(newDataRecord.rawRecord)) {
        const oldValue = oldDataRecord.rawRecord[colName];
        // Array values need special handling because [1,2,3] != [1,2,3] in JS. Yeah, JS is for clowns.
        if ((Array.isArray(newValue) && (!Array.isArray(oldValue) || newValue.length !== oldValue.length || newValue.some((val, idx) => val !== oldValue[idx])))
        || (!Array.isArray(newValue) && oldValue != newValue)) { this.debug("    UPDATED record",oldDataRecord,"at col",colName,":",oldDataRecord.rawRecord[colName],"===>",newValue);
          gristTransaction.updatedRecords.push(newDataRecord);
          break;
        }
      }}
    }
    for (const [tableName, oldDataRecord] of Object.entries(oldData)) { const newDataRecord = newData.find((rec) => rec.id === oldDataRecord.id); if (!newDataRecord) {
      this.debug("    REMOVED record",oldDataRecord); gristTransaction.removedRecords.push(oldDataRecord); }}
    return gristTransaction;
  }
  _buildSchema (tableRecs, colRecs) {
    this.debug("DB._buildSchema!",tableRecs,colRecs);
    const schema = {};
    for (const tableRec of tableRecs) {
      const tableId = tableRec.tableId; schema[tableId] = new GristDBAdapter.TableInfo(tableId, tableRec); const tableInfo = schema[tableId];
      tableInfo.cols['id'] = new GristDBAdapter.ColInfo('id', 'id', null, tableId, tableRec, 'id', true, false);
      for (const colRec of colRecs) { if (colRec.colId !== 'id' && colRec.parentId === tableRec.id) {
        const [isRef, refType, reffedTableName] = DBUtil.getRefInfo(colRec);
        const colInfo = new GristDBAdapter.ColInfo(colRec.colId, colRec.label, colRec, tableId, tableRec, colRec.type, DBUtil.isInternalColName(colRec.colId), isRef);
        try { colInfo.widgetOptions = JSON.parse(colRec.widgetOptions); } catch {}
        if (isRef) { colInfo.refInfo = new GristDBAdapter.RefInfo(refType, reffedTableName); }
        tableInfo.cols[colRec.colId] = colInfo;
      }}
    }
    for (const tableInfo of Object.values(schema)) { for (const colInfo of Object.values(tableInfo.cols)) { if (colInfo.isRef) {
      if (colInfo.colRec.visibleCol) { colInfo.refInfo.reffedCol = Object.values(schema[colInfo.refInfo.reffedTableName].cols).find(
        (otherColInfo) => otherColInfo.colId !== 'id' && otherColInfo.colRec.id === colInfo.colRec.visibleCol) || null;
      } else {
        colInfo.refInfo.reffedCol = schema[colInfo.refInfo.reffedTableName].cols['id'];
      }
    }}}
    this.debug("_buildSchema done, result:", schema);
    return schema;
  }
  _buildData (rawData, schema, workOnlyOnTablesNames=null) {
    const data = [];
    workOnlyOnTablesNames = workOnlyOnTablesNames?.length ? workOnlyOnTablesNames : false;
    this.debug("DB._buildData!",rawData,schema,workOnlyOnTablesNames);
    for (const [tableName, rawRecords] of Object.entries(rawData)) { if(!workOnlyOnTablesNames || workOnlyOnTablesNames.includes(tableName)) {
      data[tableName] = [];
      const tableInfo = schema[tableName];
      for (const rawRecord of rawRecords) {
        const dataRecord = new GristDBAdapter.DataRecord(rawRecord, rawRecord.id, DBUtil.idAsStr(rawRecord.id), tableInfo);
        for (const [colName, rawValue] of Object.entries(rawRecord)) {
          const colInfo = tableInfo.cols[colName];
          const fieldInfo = new GristDBAdapter.FieldInfo(colInfo, rawValue, rawValue);
          if (colInfo.isRef) { fieldInfo.isAltText = DBUtil.isAltTextInsteadOfId(rawValue); }
          if (colInfo.type == 'Text' && colInfo.widgetOptions?.widget == 'Markdown') { fieldInfo.isMarkdown = true; }
          dataRecord.fields[colName] = fieldInfo;
        }
        data[tableName].push(dataRecord);
      }
    }}
    for (const [tableName, dataRecords] of Object.entries(data)) {
      for (const dataRecord of dataRecords) {
        for (const [colName, fieldInfo] of Object.entries(dataRecord.fields)) {
          const colInfo = fieldInfo.colInfo;
          if (colInfo.isRef) {
            fieldInfo.saneValue = this._getRefDisplayValue(data, colInfo, fieldInfo.rawValue);
            fieldInfo.isBlankRef = fieldInfo.rawValue && !fieldInfo.saneValue;
          }
        }
      }
    }
    return data;
  }
  _getRefDisplayValue (records, colInfo, recId) {
    if (!colInfo.isRef || !DBUtil.isValidId(recId)) { return recId; } // If the recId is not in fact an ID, it's probably a Grist 'AltText' object. In that case, that's what we want to display.
    if (!recId) { return 'FALSY RECID'; } const reffedRecord = records[colInfo.refInfo.reffedTableName]?.find((rec) => rec.id === recId); if (!reffedRecord) { return 'FALSY REFFEDREC'; }
    const reffedCol = colInfo.refInfo.reffedCol; const reffedField = reffedRecord.fields[reffedCol.colId]; if (!reffedCol) { return 'MISSING REFFED COL'; }
    return reffedCol.colId === 'id' || !reffedField ? `${colInfo.refInfo.reffedTableName}[${recId}]` : (reffedField.saneValue || '');
  }
  async massUpdate (massUpdateSpecs, dontUpdateInternalDataState=false) {
    if (!massUpdateSpecs?.length) { return false; }
    const actions = []; let wasAnyModified = false;
    for (const massUpdateSpec of massUpdateSpecs) { actions.push(['BulkUpdateRecord', massUpdateSpec.tableName, massUpdateSpec.recIds, {[massUpdateSpec.colName]: massUpdateSpec.values}]); }
    try {
      const result = await grist.docApi.applyUserActions(actions); wasAnyModified = result && result.isModification;
      this.debug("DB.massUpdate!",massUpdateSpecs,"==",actions,"---->",result);
    } catch (error) { this.err("Error during GristDBAdapter.massUpdate() with massUpdateSpecs", massUpdateSpecs, ":",error); throw error; }
    if (!dontUpdateInternalDataState) { // We need to update our internal 'rawRecord' so that, should an external update from Grist arrive, we can reliably diff the then freshly updated records vs the currently loaded ones.
      const internalUpdates = {};
      for (const massUpdateSpec of massUpdateSpecs) { if (!(massUpdateSpec.tableName in internalUpdates)) { internalUpdates[massUpdateSpec.tableName] = {}; }
        for (const [idx, recId] of Object.entries(massUpdateSpec.recIds)) { if (!(recId in internalUpdates[massUpdateSpec.tableName])) { internalUpdates[massUpdateSpec.tableName][recId] = {}; }
          internalUpdates[massUpdateSpec.tableName][recId][massUpdateSpec.colName] = massUpdateSpec.values[idx]; }
      }
      for (const [tableName, details] of Object.entries(internalUpdates)) { for (const [recId, fieldsAndValues] of Object.entries(details)) {
        //this.debug("      updating fields internally:",tableName,recId,fieldsAndValues);
        this._updateRawRecord(tableName, recId, fieldsAndValues); }}
    }
    return wasAnyModified;
  }
  async update (updateSpecs, dontUpdateInternalDataState=false) {
    if (!updateSpecs?.length) { return false; }
    const actions = []; let wasAnyModified = false;
    for (const updateSpec of updateSpecs) { actions.push(['UpdateRecord', updateSpec.tableName, updateSpec.recId, updateSpec.fieldsAndValues]); }
    try {
      const result = await grist.docApi.applyUserActions(actions); wasAnyModified = result && result.isModification;
      this.debug("DB.update!",updateSpecs,"==",actions,"---->",result);
    } catch (error) { this.err("Error during GristDBAdapter.update() with updateSpecs", updateSpecs, ":",error); throw error; }
    if (!dontUpdateInternalDataState) { // We need to update our internal 'rawRecord' so that, should an external update from Grist arrive, we can reliably diff the then freshly updated records vs the currently loaded ones.
      for (const updateSpec of updateSpecs) { //this.debug("      updating fields internally:",updateSpec.tableName,updateSpec.recId,updateSpec.fieldsAndValues);
        this._updateRawRecord(updateSpec.tableName, updateSpec.recId, updateSpec.fieldsAndValues); }
    }
    return wasAnyModified;
  }
  _updateRawRecord (tableName, recId, fieldsAndValues) { const dataRecord = this.data[tableName].find((rec) => rec.id == recId); //this.debug("_updateRawRecord",tableName,recId,"FROM:",dataRecord?.rawRecord,"TO:",fieldsAndValues);
    if (dataRecord) { dataRecord.rawRecord = {...dataRecord.rawRecord, ...fieldsAndValues}; }}
}
