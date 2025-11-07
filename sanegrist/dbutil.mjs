'use strict';


export const DBUtil = {
  PATTERN_RECID: new RegExp(/^\d+$/),
  PATTERN_COLTYPE_BOOL: new RegExp(/^Bool$/),
  PATTERN_COLTYPE_REF_OR_REFLIST: new RegExp(/^(Ref|RefList):(.*)$/),
  PATTERN_COLTYPE_REF: new RegExp(/^(Ref):(.*)$/),
  PATTERN_COLTYPE_CHOICE: new RegExp(/^Choice$/),
  PATTERN_COLTYPE_CHOICELIST: new RegExp(/^ChoiceList$/),
  PATTERN_COLTYPE_TEXT: new RegExp(/^Text$/),
  PATTERN_COLTYPE_ANY: new RegExp(/^Any$/),
  PATTERN_COLNAME_INTERNAL: new RegExp(/(^manual)|(^id$)|(^gristHelper_)|(^_)|(^#)/),
  idAsStr: function (recId) { try { const idAsStr = recId.toString(); return !idAsStr.match(DBUtil.PATTERN_RECID) ? null : idAsStr; } catch { } return null; },
  isValidId: function (value) { try { return Boolean(value.toString().match(/^\d+$/)); } catch { } return false; },
  isAltTextInsteadOfId: function (value) { return !DBUtil.isValidId(value) && value; },
  isInternalColName: function (colName) { return colName.match(DBUtil.PATTERN_COLNAME_INTERNAL); },
  getRefInfo: function (colRec) {
    try { const match = colRec.type.match(DBUtil.PATTERN_COLTYPE_REF_OR_REFLIST); if (colRec?.type && match) { const [_, refType, reffedTableName] = match; return [true, refType, reffedTableName] } }
    catch { } return [false, null, null];
  },
  convertColumnarDataToRecords: function (columnarData) { return columnarData.id.map((id, rowIdx) => Object.fromEntries(Object.keys(columnarData).map((colName) => [colName, columnarData[colName][rowIdx]]))); },
  fetchDocInfo: async function (defaultLocale, defaultCurrency) {
    const docInfo = DBUtil.convertColumnarDataToRecords(await grist.docApi.fetchTable('_grist_DocInfo'));
    return { timezone: docInfo[0].timezone, locale: docInfo[0].documentSettings?.locale || (defaultLocale || 'en-US'), currency: docInfo[0].documentSettings?.currency || (defaultCurrency || 'USD') };
  },
  fetchRecords: async function (tableName, sortFunc) {
    const columnarData = await grist.docApi.fetchTable(tableName);
    return DBUtil.convertColumnarDataToRecords(columnarData).sort(sortFunc || ((recA, recB) => recA.manualSort - recB.manualSort));
  },
  fetchMetaRecords: async function (metaCache, forceRefetch) {
    let wasAnythingFetched = false;
    if (forceRefetch || !metaCache?.tableRecs?.length) {
      wasAnythingFetched = true;
      if (forceRefetch || !metaCache?.colRecs?.length) {
        [metaCache.tableRecs, metaCache.colRecs] = await Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]);
        [metaCache.tableRecs, metaCache.colRecs] = [DBUtil.convertColumnarDataToRecords(metaCache.tableRecs), DBUtil.convertColumnarDataToRecords(metaCache.colRecs)];
      } else { metaCache.tableRecs = DBUtil.convertColumnarDataToRecords(await grist.docApi.fetchTable('_grist_Tables')); }
    }
    if (!metaCache?.colRecs?.length) { wasAnythingFetched = true; metaCache.colRecs = DBUtil.convertColumnarDataToRecords(await grist.docApi.fetchTable('_grist_Tables_column')); }
    return wasAnythingFetched;
  },
};
