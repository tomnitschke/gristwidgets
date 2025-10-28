'use strict';

const Util = { logPrefix: 'GristWidget', log: function (...messages) { console.log(Util.logPrefix, ...messages); }, warn: function (...messages) { console.warn(Util.logPrefix, ...messages); }, err: function (...messages) { console.error(Util.logPrefix, ...messages); }, onDOMReady: function (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }, jsonDecode: function (str, defaultVal=undefined) { try { return JSON.parse(str); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } }, jsonEncode: function(obj, defaultVal=null) { try{ return JSON.stringify(obj); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } }, areDictsEqual: function (dictA, dictB) { dictA = dictA || {}; dictB = dictB || {}; for (const [key, val] of Object.entries(dictA)) { if (!(key in dictB)) { return false; } if (dictB[key] !== val) { return false; } } for (const [key, val] of Object.entries(dictB)) { if (!(key in dictA)) { return false; } /*///TODO: include array comparison (see GristAGG), if dictA or dictB are arrays.*/ if (dictA[key] !== val) { return false; } } return true; }};


/********************************************************************************************************************************************/
class GristWidget extends EventTarget {
  static ReadyEvent = class ReadyEvent extends Event {constructor(records,cursor,colMapping){super('ready');Object.assign(this,{records,cursor,colMapping});}}
  static RecordsModifiedEvent = class RecordsModifiedEvent extends Event {constructor(prevRecords,records,wereRecordsModified){super('recordsModified');
    Object.assign({prevRecords,records,wereRecordsModified});}}
  static CursorMovedEvent = class CursorMovedEvent extends Event {constructor (prevCursor,cursor){super('cursorMoved');Object.assign(this,{prevCursor,cursor});}}
  static CursorMovedToNewEvent = class CursorMovedToNewEvent extends Event {constructor (prevCursor){super('cursorMovedToNew');Object.assign(this,{prevCursor});}}
  static ColMappingChangedEvent = class ColMappingChangedEvent extends Event {constructor (prevColMapping, colMapping){super('colMappingChanged');Object.assign(this,{prevColMapping,colMapping});}}
  constructor (widgetName, gristOptions=undefined) { super();
    this.name = widgetName; Util.logPrefix = widgetName;
    this.hasOnRecordsEverFired = false; this.wasReadyEventDispatched = false; this.cursor = { prev: null, current: null }; this.colMapping = { prev: {}, current: {} }; this.records = { prev: [], current: [] };
    this.eventControl = { onRecords: { skip: 0, args: {} }, onRecord: { skip: 0, args: {} } };
    grist.ready(gristOptions); grist.onRecords(this.#onRecords.bind(this)); grist.onRecord(this.#onRecord.bind(this)); grist.onNewRecord(this.#onNewRecord.bind(this));
  }
  #onRecords (records, colMapping) {
    //Util.log("onRecords!",records,colMapping);
    if (!this.hasOnRecordsEverFired) {
      this.#updateColMapping(colMapping, true); this.#updateRecords(records, true);
      this.hasOnRecordsEverFired = true;
      if (this.cursor.current?.id) { //Util.log("dispatching ready-event from onRecords"); 
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMapping.current)); return; }
      return;
    }
    if (this.eventControl.onRecords.skip) { this.eventControl.onRecords.skip--; return; }
    this.#updateColMapping(colMapping); const wereRecordsModified = this.#updateRecords(records);
  }
  #onRecord (record, colMapping) {
    //Util.log("onRecord!",record,colMapping);
    if (!this.hasOnRecordsEverFired || !this.wasReadyEventDispatched) { this.#updateColMapping(colMapping, true); this.#updateCursor(record, true);
      if (!this.wasReadyEventDispatched) { //Util.log("dispatched ready-event from onRecord");
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMapping.current)); return; }}
    if (this.eventControl.onRecord.skip) { this.eventControl.onRecord.skip--; return; }
    this.#updateColMapping(colMapping); this.#updateCursor(record);
  }
  #onNewRecord (colMapping) {
    //Util.log("onNewRecord!",colMapping);
    if (!this.hasOnRecordsEverFired || !this.wasReadyEventDispatched) { this.#updateColMapping(colMapping, true); this.#updateCursor(undefined, true);
      if (!this.wasReadyEventDispatched) { //Util.log("dispatched ready-event from onNewRecord");
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMapping.current)); }}
    this.#updateCursor(undefined);
  }
  #updateRecords (records, disableEventDispatch=false) {
    this.records.prev = this.records.current; this.records.current = records || []; const wereRecordsModified = Util.areDictsEqual(this.records.current, this.records.prev); ///TODO proper change detection, see GristAGG
    if (!disableEventDispatch && wereRecordsModified) { this.dispatchEvent(new GristWidget.RecordsModifiedEvent(this.records.current, this.records.prev, wereRecordsModified)); }
  }
  #updateCursor (record, disableEventDispatch=false) { this.cursor.prev = this.cursor.current; this.cursor.current = record || null; const wasCursorChanged = Boolean(this.cursor.current?.id !== this.cursor.prev?.id);
    if (!disableEventDispatch && wasCursorChanged) { this.dispatchEvent(typeof record === 'undefined' ?
      new GristWidget.CursorMovedToNewEvent(this.cursor.prev) : new GristWidget.CursorMovedEvent(this.cursor.prev, this.cursor.current)); }
    return wasCursorChanged; }
  #updateColMapping (colMapping, disableEventDispatch=false) { this.colMapping.prev = this.colMapping.current; this.colMapping.current = colMapping || {};
    const wasColMappingChanged = !Util.areDictsEqual(this.colMapping.prev, this.colMapping.current);
    if (!disableEventDispatch && wasColMappingChanged) {
      this.dispatchEvent(new GristWidget.ColMappingChangedEvent(this.colMapping.prev, this.colMapping.current)); }
    return wasColMappingChanged; }
  scheduleSkipGristEvent (eventName, numEventsToSkip=1, eventArgs=undefined) {
    const validEventNames = Object.keys(this.eventControl); if (!validEventNames.includes(eventName)) { throw new Error(`eventName must be one of '${validEventNames.join("', '")}', not '${eventName}'.`); }
    this.eventControl[eventName].skip += numEventsToSkip || 0; this.eventControl[eventName].args = eventArgs || {};
  }
  async writeRecord (fields, recId=-1, gristOpOptions=undefined) { recId = recId === -1 ? this.cursor.current?.id : recId; const tableOps = grist.getTable();
    if (!recId) { return await tableOps.create({fields: fields}, gristOpOptions); }
    await tableOps.update({id: recId, fields: fields}); return recId;
  }
  get currentRecId () { return this.cursor.current?.id; }
  get prevRecId () { return this.cursor.prev?.id; }
};


/********************************************************************************************************************************************/
Util.onDOMReady(() => {
  const widget = new GristWidget('MyAwesomeWidget', { requiredAccess: 'full', columns: [
    { name: 'name', title: 'Name', type: 'Text', strictType: false },
  ]});
  widget.addEventListener('ready', (records, cursor, colMapping) => {}); // Do something useful with the events exposed by GristWidget...
});
