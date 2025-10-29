'use strict';

export const Util = { onDOMReady: function (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }, jsonDecode: function (str, defaultVal=undefined) { try { return JSON.parse(str); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } }, jsonEncode: function(obj, defaultVal=null) { try{ return JSON.stringify(obj); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } }, areDictsEqual: function (dictA, dictB) { dictA = dictA || {}; dictB = dictB || {}; for (const [key, val] of Object.entries(dictA)) { if (!(key in dictB)) { return false; } if (dictB[key] !== val) { return false; } } for (const [key, val] of Object.entries(dictB)) { if (!(key in dictA)) { return false; } /*///TODO: include array comparison (see GristAGG), if dictA or dictB are arrays.*/ if (dictA[key] !== val) { return false; } } return true; }};

class Logger {
  constructor (prefix, isDebugMode=false) { this.prefix = prefix; this.isDebugMode = isDebugMode; }
  debug (...messages) { if (this.isDebugMode) { console.debug(this.prefix, ...messages); } }
  msg (...messages) { console.log(this.prefix, ...messages); }
  warn (...messages) { console.warn(this.prefix, ...messages); }
  err (...messages) { console.error(this.prefix, ...messages); }
}


/********************************************************************************************************************************************/
export class GristWidget extends EventTarget {
  static ReadyEvent = class ReadyEvent extends Event {constructor(records,cursor,colMappings){super('ready');Object.assign(this,{records,cursor,colMappings});}}
  static RecordsModifiedEvent = class RecordsModifiedEvent extends Event {constructor(prevRecords,records){super('recordsModified');
    Object.assign({prevRecords,records});}}
  static CursorMovedEvent = class CursorMovedEvent extends Event {constructor (prevCursor,cursor){super('cursorMoved');Object.assign(this,{prevCursor,cursor});}}
  static CursorMovedToNewEvent = class CursorMovedToNewEvent extends Event {constructor (prevCursor){super('cursorMovedToNew');Object.assign(this,{prevCursor});}}
  static ColMappingsChangedEvent = class ColMappingsChangedEvent extends Event {constructor (prevColMappings, colMappings){super('colMappingChanged');Object.assign(this,{prevColMappings,colMappings});}}
  constructor (widgetName, gristOptions=undefined, isDebugMode=false) { super();
    this.name = widgetName;
    this.logger = new Logger(widgetName, isDebugMode); this.debug = this.logger.debug.bind(this.logger);
    this.wasReadyEventDispatched = false;
    this.cursor = { prev: null, current: null }; this.colMappings = { prev: {}, current: {} }; this.records = { prev: [], current: [] };
    this.eventControl = { onRecords: { wasEverTriggered: false, skip: 0, args: {} }, onRecord: { wasEverTriggered: false, skip: 0, args: {} }, onNewRecord: { wasEverTriggered: false, skip: 0, args: {} } };
    grist.ready(gristOptions); grist.onRecords(this.#onRecords.bind(this)); grist.onRecord(this.#onRecord.bind(this)); grist.onNewRecord(this.#onNewRecord.bind(this));
  }
  #onRecords (records, colMappings) {
    this.debug("onRecords!",records,colMappings);
    if (!this.eventControl.onRecords.wasEverTriggered) {
      this.eventControl.onRecords.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateRecords(records, true);
      if (!this.wasReadyEventDispatched && this.eventControl.onRecord.wasEverTriggered /*&& this.cursor.current?.id*/) { this.debug("dispatching ready-event from onRecords",this.records,this.cursor,this.colMappings); 
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current)); }
      return;
    }
    if (this.eventControl.onRecords.skip) { this.eventControl.onRecords.skip--; return; }
    this.#updateColMappings(colMappings); const wereRecordsModified = this.#updateRecords(records);
  }
  #onRecord (record, colMappings) {
    this.debug("onRecord!",record,colMappings);
    /*if (!this.hasOnRecordsEverFired || !this.wasReadyEventDispatched) { this.#updateColMappings(colMappings, true); this.#updateCursor(record, true);
      if (!this.wasReadyEventDispatched) { //this.debug("dispatching ready-event from onRecord");
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current)); return; }}*/
    if (!this.eventControl.onRecord.wasEverTriggered) {
      this.eventControl.onRecord.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateCursor(record, true);
      if (!this.wasReadyEventDispatched && this.eventControl.onRecords.wasEverTriggered) { this.debug("dispatching ready-event from onRecord",this.records,this.cursor,this.colMappings);
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current));
      }
      return;
    }
    if (this.eventControl.onRecord.skip) { this.eventControl.onRecord.skip--; return; }
    this.#updateColMappings(colMappings); this.#updateCursor(record);
  }
  #onNewRecord (colMappings) {
    this.debug("onNewRecord!",colMappings);
    /*if (!this.hasOnRecordsEverFired || !this.wasReadyEventDispatched) { this.#updateColMappings(colMappings, true); this.#updateCursor(undefined, true);
      if (!this.wasReadyEventDispatched) { //this.debug("dispatched ready-event from onNewRecord");
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current)); }}*/
    if (!this.eventControl.onNewRecord.wasEverTriggered) {
      this.eventControl.onNewRecord.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateCursor(undefined, true);
      if (!this.wasReadyEventDispatched && this.eventControl.onRecords.wasEverTriggered) { this.debug("dispatching ready-event from onNewRecord",this.records,this.cursor,this.colMappings);
        this.wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current));
      }
      return;
    }
    if (this.eventControl.onNewRecord.skip) { this.eventControl.onNewRecord.skip--; return; }
    this.#updateCursor(undefined);
  }
  #updateRecords (records, disableEventDispatch=false) {
    this.records.prev = this.records.current; this.records.current = records || []; const wereRecordsModified = Util.areDictsEqual(this.records.current, this.records.prev); ///TODO proper change detection, see GristAGG
    if (!disableEventDispatch && wereRecordsModified) { this.dispatchEvent(new GristWidget.RecordsModifiedEvent(this.records.current, this.records.prev)); }
  }
  #updateCursor (record, disableEventDispatch=false) { this.cursor.prev = this.cursor.current; this.cursor.current = record || null; const wasCursorChanged = Boolean(this.cursor.current?.id !== this.cursor.prev?.id);
    if (!disableEventDispatch && wasCursorChanged) { this.dispatchEvent(typeof record === 'undefined' ?
      new GristWidget.CursorMovedToNewEvent(this.cursor.prev) : new GristWidget.CursorMovedEvent(this.cursor.prev, this.cursor.current)); }
    return wasCursorChanged; }
  #updateColMappings (colMappings, disableEventDispatch=false) { this.colMappings.prev = this.colMappings.current; this.colMappings.current = colMappings || {};
    const wereColMappingsChanged = !Util.areDictsEqual(this.colMappings.prev, this.colMappings.current);
    if (!disableEventDispatch && wereColMappingsChanged) {
      this.dispatchEvent(new GristWidget.ColMappingsChangedEvent(this.colMappings.prev, this.colMappings.current)); }
    return wereColMappingsChanged; }
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
// EXAMPLE USAGE:
/*Util.onDOMReady(() => {
  const widget = new GristWidget('MyAwesomeWidget', { requiredAccess: 'full', columns: [
    { name: 'name', title: 'Name', type: 'Text', strictType: false },
  ]});
  widget.addEventListener('ready', (records, cursor, colMappings) => {}); // Do something useful with the events exposed by GristWidget...
});*/
