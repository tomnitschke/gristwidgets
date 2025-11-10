'use strict';


import { Util, Logger } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { DBUtil } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/dbutil.mjs';


export class GristDBAdapter {
  #isInitialized;
  #knownTableNames;
  #metaRecords;
  #docInfo;
  #rawTables;
  #tableRecIds;
  #schemata;
  #tables;
  constructor () {
    this.#isInitialized = false;
    this.#knownTableNames = [];
    this.#metaRecords = {};
    this.#docInfo = {};
    this.#rawTables = {};
    this.#tableRecIds = {};
    this.#schemata = {};
    this.#tables = {};
  }
  #assertInited () { if (!this.#isInitialized) { throw new Error(`Not initialized yet. Call init() first!`); } }
  async init () {
    if (this.#isInitialized) { return; }
    this.#isInitialized = true;
    await Promise.all([
      this.refreshKnownTableNames(),
      this.refreshMetaRecords(),
      this.refreshDocInfo(),
    ]);
  }
  async refreshMetaRecords () {
    await this.getMetaRecords(true);
  }
  async refreshDocInfo () {
    this.#docInfo = await DBUtil.fetchDocInfo();
  }
  async refreshKnownTableNames () {
    this.#knownTableNames = await grist.docApi.listTables();
  }
  async getMetaRecords (forceReload=false) {
    const wereMetaRecordsReloaded = await DBUtil.fetchMetaRecords(this.#metaRecords, forceReload);
    if (wereMetaRecordsReloaded) {
      this.#refreshTableRecIds();
      this.#rebuildSchemata();
    }
    return this.#metaRecords;
  }
  #refreshTableRecIds () {
    this.#tableRecIds = {};
    for (const tableRec of this.#metaRecords.tableRecs) {
      const tableName = tableRec.tableId;
      this.#tableRecIds[tableName] = tableRec.id;
    }
  }
  #rebuildSchemata () {
    for (const tableRec of this.#metaRecords.tableRecs) {
      const tableName = tableRec.tableId;
      const schema = new Schema(this, tableName, tableRec);
      for (const colRec of this.#metaRecords.colRecs) { if (colRec.parentId === tableRec.id && colRec.id !== 'id') {
        const colName = colRec.colId;
        const [isRef, refType, reffedTableName] = DBUtil.getRefInfo(colRec);
        const refInfo = isRef ? new RefInfo(this, refType, reffedTableName) : undefined;
        const widgetOptions = Util.jsonDecode(colRec.widgetOptions, {});
        schema.columns[colName] = new Column(this, colName, colRec.label, colRec, tableName, tableRec, colRec.type, DBUtil.isInternalColName(colName), isRef, refInfo, widgetOptions);
      }}
      this.#schemata[tableName] = schema;
    }
    for (const [tableName, schema] of Object.entries(this.#schemata)) {
      for (const [colName, column] of Object.entries(schema)) { if (column.isRef) {
        const colRecIdOfVisibleCol = column.colRec.visibleCol;
        const refInfo = column.refInfo;
        const reffedTableSchema = this.#schemata[refInfo.reffedTableName];
        refInfo.reffedTableSchema = reffedTableSchema;
        if (colRecIdOfVisibleCol) {
          refInfo.reffedColumn = Object.values(reffedTableSchema)
            .find((otherColumn) => otherColumn.colRec.id === colRecIdOfVisibleCol && otherColumn.colId !== 'id')
            || null;
        } else {
          column.refInfo.reffedColumn = reffedTableSchema.columns['id'];
        }
      }}
    }
  }
  getSchema (tableName) {
    this.#assertInited();
    const schema = this.#schemata[tableName];
    if (!schema) { throw new Error(`No schema available for unknown table '${tableName}'`); }
    return schema;
  }
  getSchemaById (tableRecId) { return this.getSchema(this.getTableName(tableRecId)); }
  getTableName (tableRecId) {
    const tableName = this.#tableRecIds[tableRecId];
    if (!tableName) { throw new Error(`Cannot find table with meta record id '${tableRecId}'.`); }
    return tableName;
  }
  async getTableById (tableRecId, forceReload=false, shouldForceReloadAffectPreloadedTables=true, preloadReffedTablesMaxDepth=1) {
    return await this.getTable(this.getTableName(tableRecId), forceReload, shouldForceReloadAffectPreloadedTables, preloadReffedTablesMaxDepth);
  }
  async getTable (tableName, forceReload=false, shouldForceReloadAffectPreloadedTables=true, preloadReffedTablesMaxDepth=1, _depth=0) {
    this.#assertInited();
    this.debug("getTable",tableName,"forceReload:",forceReload);
    if (forceReload || !(tableName in this.#rawTables)) {
      const rawRecords = await DBUtil.fetchRecords(tableName);
      const schema = this.#schemata[tableName];
      const records = {};
      for (const rawRecord of rawRecords) {
        const fields = {};
        const recordId = rawRecord.id;
        const record = new Record(this, tableName, schema, recordId, rawRecord);
        for (const [colName, rawValue] of Object.entries(rawRecord)) {
          const column = schema.columns[colName];
          let displayValue = rawValue;
          const isAltText = DBUtil.isAltTextInsteadOfId(rawValue);
          const isMarkdown = (column.type == 'Text' && column.widgetOptions?.widget === 'Markdown');
          const field = new Field(this, record, colName, column, rawValue, displayValue, isAltText, isMarkdown, column.refInfo);
          fields[colName] = field;
        }
        record.fields = fields;
        records[recordId] = record;
      }
      for (const record of Object.values(records)) {
        for (const field of Object.values(record.fields)) {
          const column = field.column;
          if (column.isRef && _depth < preloadReffedTablesMaxDepth) {
            const refInfo = column.refInfo;
            const reffedTable = await this.getTable(refInfo.reffedTableName, forceReload && shouldForceReloadAffectPreloadedTables, preloadReffedTablesMaxDepth, _depth + 1);
            refInfo.reffedTable = reffedTable;
            field.reffedRecord = undefined;
            await field.getReffedRecord();  // This will also refresh field.displayValue
          }
        }
      }
      this.#rawTables[tableName] = rawRecords;
      this.#tables[tableName] = records;
    }
  }
}

class Field {
  constructor (db, record, colName, column, rawValue, displayValue, isAltText=false, isMarkdown=false, refInfo=undefined, reffedRecord=undefined) {
    Object.assign(this, {db, record, colName, column, rawValue, displayValue, isAltText, isMarkdown, refInfo || undefined, reffedRecord || undefined});
  }
  async getReffedRecord (forceReload) {
    if (forceReload || !this.reffedRecord) {
      this.reffedRecord = (await this.refInfo.getReffedTable(forceReload))[rawValue] || null;
      if (this.reffedRecord) { this.displayValue = this.reffedRecord.fields[this.refInfo.reffedColumn.colName].displayValue; }
    }
    return this.reffedRecord;
  }
}
class Record { constructor (db, tableName, tableSchema, id, rawRecord, fields=undefined) {
    Object.assign(this, {db, tableName, tableSchema, id, rawRecord, fields: fields || {}}); }}
class RefInfo {
  constructor (db, refType, reffedTableName, reffedTable=undefined, reffedTableSchema=undefined, reffedColumn=undefined) {
    Object.assign(this, {db, refType, reffedTableName, reffedTable || undefined, reffedTableSchema || undefined, reffedColumn || undefined});
  }
  async getReffedTable (forceReload) {
    if (forceReload || !this.reffedTable) { this.reffedTable = await this.db.getTable(this.reffedTableName, forceReload); }
    return this.reffedTable;
  }
}
class Column { constructor (db, colName, label, colRec, tableName, tableRec, type, isInternal, isRef, refInfo=undefined, widgetOptions=undefined) {
    Object.assign(this, {db, colName, label, colRec, tableName, tableRec, type, isInternal, isRef, refInfo || undefined, widgetOptions: widgetOptions || {}}); }}
class Schema { constructor (db, tableName, tableRec) {
    Object.assign(this, {db, tableName, tableRec});
    this.columns = {id: new Column('id', 'id', null, tableName, tableRec, 'id', true, false)}; }}



































  static TableInfo = class TableInfo{constructor(tableId,tableRec,columns=null){ Object.assign(this,{tableId,tableRec}); this.columns = columns || {}; }}
  static Column = class Column{constructor(colId,label,colRec,tableId,tableRec,type,isInternal,isRef,refInfo=undefined,widgetOptions=null){ Object.assign(this,{colId,label,colRec,tableId,tableRec,type,isInternal,isRef});
    this.widgetOptions = widgetOptions || {}; if (refInfo) { this.refInfo = refInfo; } }}
  static RefInfo = class RefInfo{constructor(refType,reffedTableName,reffedCol=null){ Object.assign(this,{refType,reffedTableName,reffedCol}); } }
  static DataRecord = class DataRecord{constructor(rawRecord,id,idAsStr,tableRec,fields=null){ Object.assign(this,{rawRecord,id,idAsStr,tableRec}); this.fields = fields || {}; }}
  static FieldInfo = class FieldInfo{constructor(column,rawValue,saneValue,isAltText=false,isBlankRef=false,isMarkdown=false){ Object.assign(this,{column,rawValue,saneValue,isAltText,isBlankRef,isMarkdown}); }}
  static GristTransaction = class GristTransaction{constructor(tableName,wasSchemaUpdated,addedRecords=null,updatedRecords=null,removedRecords=null){ Object.assign(this,{tableName,wasSchemaUpdated});
    this.addedRecords = addedRecords?.length ? addedRecords : []; this.updatedRecords = updatedRecords?.length ? updatedRecords : []; this.removedRecords = removedRecords?.length ? removedRecords : []; }}
  static UpdateSpec = class UpdateSpec{constructor(tableName,recId,fieldsAndValues){ Object.assign(this,{tableName,recId,fieldsAndValues});
    if (!tableName || !recId || !fieldsAndValues || !Object.keys(fieldsAndValues)?.length) { throw new Error("GristDBAdapter.UpdateSpec malformed, check parameters!"); }}}
  static MassUpdateSpec = class MassUpdateSpec{constructor(tableName,colName,recIds,values){ Object.assign(this,{tableName,colName}); this.recIds = recIds || []; this.values = values || []; }}

  #docInfo;
  #loadedTables;
  constructor (config, isDebugMode=false) {
    this.logger = new Logger('GristDBAdapter', isDebugMode); this.debug = this.logger.debug.bind(this.logger); this.err = this.logger.err.bind(this.logger);
    this.config = {
      ...config
    };
    this.isInitialLoadDone = false;
    this.#docInfo = null;        //doc info gathered from '_grist_DocInfo'
    this.metaRecords = {};      //raw Grist table records (from '_grist_Tables') and column records (from '_grist_Tables_column')
    this.schema = null;         //'rich' schema (tableInfos and colInfos), built from metaRecords
    this.#loadedTables = {};    //raw Grist records, by table
    this.data = {};             //DataRecord objects, by table, built from rawData
  }
  async reloadAll () {
    this.isInitialLoadDone = true;
    this.debug("DB.reloadAll!");
    const wasSchemaRefetched = await this.loadSchema();
    const wasAnyDataRefetched = await this.loadTables();
    return [wasSchemaRefetched, wasAnyDataRefetched];
  }
  async loadSchema (tableName=null, forceRefetch=false) {
    this.debug("DB.loadSchema!",tableName,forceRefetch);
    const [docInfo, wasSchemaRefetched] = await Promise.all([DBUtil.fetchDocInfo(), DBUtil.fetchMetaRecords(this.metaRecords, forceRefetch)]);
    this.debug("   loaded docInfo:", this.#docInfo, "loaded metaRecords:", this.metaRecords);
    if (wasSchemaRefetched) { const newSchema = this._buildSchema(this.metaRecords.tableRecs, this.metaRecords.colRecs, tableName); this.schema = tableName ? {...this.schema, ...newSchema} : newSchema; }
    return wasSchemaRefetched;
  }
  async OLD_____loadTables (tableNames=null, forceRefetch=false) {
    this.debug("DB.loadTables",tableNames,forceRefetch);
    tableNames = tableNames?.length ? tableNames : await grist.docApi.listTables(); const tableNamesToReload = forceRefetch ? tableNames : tableNames.filter((tableName) => !Object.keys(this.#loadedTables).includes(tableName));
    let wasAnyDataRefetched = false;
    if (tableNamesToReload) { wasAnyDataRefetched = true; const rawRecords = await Promise.all(tableNamesToReload.map((tableName) => DBUtil.fetchRecords(tableName)));
      for (const [idx, rawRecordsForTable] of Object.entries(rawRecords)) { this.#loadedTables[tableNamesToReload[idx]] = rawRecordsForTable; } }
    if (wasAnyDataRefetched) { if (forceRefetch) { this.data = this._buildData(this.#loadedTables, this.schema); } else { this.data = {...this.data, ...this._buildData(this.#loadedTables, this.schema, tableNamesToReload) }; } }
    this.debug("   done building data:", this.data);
    return wasAnyDataRefetched;
  }
  async OLD_____refresh (tableName, considerSpecialCols=null, returnOnlyAddTransaction=false, forceReloadAll=false) {
    considerSpecialCols = considerSpecialCols || [];
    if (forceReloadAll || !this.isInitialLoadDone) {
      const [wasSchemaRefetched, wasAnyDataRefetched] = await this.reloadAll();
      return new GristDBAdapter.GristTransaction(tableName, wasSchemaRefetched, this.data[tableName]);
    }
    const oldData = this.data[tableName]; await this.loadTables([tableName], true); const newData = this.data[tableName];
    let gristTransaction = new GristDBAdapter.GristTransaction(tableName, false);
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
      tableInfo.columns['id'] = new GristDBAdapter.Column('id', 'id', null, tableId, tableRec, 'id', true, false);
      for (const colRec of colRecs) { if (colRec.colId !== 'id' && colRec.parentId === tableRec.id) {
        const [isRef, refType, reffedTableName] = DBUtil.getRefInfo(colRec);
        const column = new GristDBAdapter.Column(colRec.colId, colRec.label, colRec, tableId, tableRec, colRec.type, DBUtil.isInternalColName(colRec.colId), isRef);
        try { column.widgetOptions = JSON.parse(colRec.widgetOptions); } catch {}
        if (isRef) { column.refInfo = new GristDBAdapter.RefInfo(refType, reffedTableName); }
        tableInfo.columns[colRec.colId] = column;
      }}
    }
    for (const tableInfo of Object.values(schema)) { for (const column of Object.values(tableInfo.columns)) { if (column.isRef) {
      if (column.colRec.visibleCol) { column.refInfo.reffedCol = Object.values(schema[column.refInfo.reffedTableName].columns).find(
        (otherColInfo) => otherColInfo.colId !== 'id' && otherColInfo.colRec.id === column.colRec.visibleCol) || null;
      } else {
        column.refInfo.reffedCol = schema[column.refInfo.reffedTableName].columns['id'];
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
          const column = tableInfo.columns[colName];
          const fieldInfo = new GristDBAdapter.FieldInfo(column, rawValue, rawValue);
          if (column.isRef) { fieldInfo.isAltText = DBUtil.isAltTextInsteadOfId(rawValue); }
          if (column.type == 'Text' && column.widgetOptions?.widget == 'Markdown') { fieldInfo.isMarkdown = true; }
          dataRecord.fields[colName] = fieldInfo;
        }
        data[tableName].push(dataRecord);
      }
    }}
    for (const [tableName, dataRecords] of Object.entries(data)) {
      for (const dataRecord of dataRecords) {
        for (const [colName, fieldInfo] of Object.entries(dataRecord.fields)) {
          const column = fieldInfo.column;
          if (column.isRef) {
            fieldInfo.saneValue = this._getRefDisplayValue(data, column, fieldInfo.rawValue);
            fieldInfo.isBlankRef = fieldInfo.rawValue && !fieldInfo.saneValue;
          }
        }
      }
    }
    return data;
  }
  _getRefDisplayValue (records, column, recId) {
    if (!column.isRef || !DBUtil.isValidId(recId)) { return recId; } // If the recId is not in fact an ID, it's probably a Grist 'AltText' object. In that case, that's what we want to display.
    if (!recId) { return 'FALSY RECID'; } const reffedRecord = records[column.refInfo.reffedTableName]?.find((rec) => rec.id === recId); if (!reffedRecord) { return 'FALSY REFFEDREC'; }
    const reffedCol = column.refInfo.reffedCol; const reffedField = reffedRecord.fields[reffedCol.colId]; if (!reffedCol) { return 'MISSING REFFED COL'; }
    return reffedCol.colId === 'id' || !reffedField ? `${column.refInfo.reffedTableName}[${recId}]` : (reffedField.saneValue || '');
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
