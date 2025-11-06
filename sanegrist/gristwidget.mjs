'use strict';


/********************************************************************************************************************************************/
export const Util = { onDOMReady: function (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }, jsonDecode: function (str, defaultVal=undefined) { try { return JSON.parse(str); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } }, jsonEncode: function(obj, defaultVal=undefined) { try{ return JSON.stringify(obj); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } },
  dictsDelta: function (dictA, dictB) {
    dictA = dictA || {}; dictB = dictB || {};
    const delta = { get hasAnyChanges () { return Boolean(Object.keys(this.added).length || Object.keys(this.changed).length || Object.keys(this.removed).length); }, added: [], changed: [], removed: [] };
    for (const [key, value] of Object.entries(dictA)) {
      if (!(key in dictB)) { delta.removed.push({[key]: value}); continue; }
      if (Array.isArray(value)) {
        if (!Array.isArray(dictB[key])) { delta.changed.push({[key]: value}); continue; }
        if (value.length !== dictB[key].length) { delta.changed.push({[key]: value}); continue; }
        if (value.some((val, idx) => val !== dictB[key][idx])) { delta.changed.push({[key]: value}); continue; }
      }
      if (dictB[key] !== value) { delta.changed.push({[key]: value}); continue; }
    }
    for (const [key, value] of Object.entries(dictB)) {
      if (!(key in dictA)) { delta.added.push({[key]: value}); continue; }
    }
    return delta;
  },
  areDictsEqual: function (dictA, dictB) {
    dictA = dictA || {}; dictB = dictB || {};
    for (const [key, value] of Object.entries(dictA)) {
      if (!(key in dictB)) { return false; }
      if (Array.isArray(value)) {
        if (!Array.isArray(dictB[key])) { return false; }
        if (value.length !== dictB[key].length) { return false; }
        if (value.some((val, idx) => val !== dictB[key][idx])) { return false; }
      }
      if (dictB[key] !== value) { return false; }
    }
    for (const [key, value] of Object.entries(dictB)) {
      if (!(key in dictA)) { return false; }
    }
    return true;
  }
};


/********************************************************************************************************************************************/
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
  static RecordsModifiedEvent = class RecordsModifiedEvent extends Event {constructor(prevRecords,records,colMappings,delta){super('recordsModified');
    Object.assign(this,{prevRecords,records,colMappings,delta});}}
  static CursorMovedEvent = class CursorMovedEvent extends Event {constructor (prevCursor,cursor,colMappings){super('cursorMoved');Object.assign(this,{prevCursor,cursor,colMappings});}}
  static CursorMovedToNewEvent = class CursorMovedToNewEvent extends Event {constructor (prevCursor,colMappings){super('cursorMovedToNew');Object.assign(this,{prevCursor,colMappings});}}
  static ColMappingsChangedEvent = class ColMappingsChangedEvent extends Event {constructor (prevColMappings,colMappings){super('colMappingChanged');Object.assign(this,{prevColMappings,colMappings});}}
  static OptionsEditorOpenedEvent = class OptionsEditorOpenedEvent extends Event {constructor(prevOptions,options){super('optionsEditorOpened');Object.assign(this,{prevOptions,options});}}
  static OptionsChangedEvent = class OptionsChangedEvent extends Event {constructor(prevOptions,options){super('optionsChanged');Object.assign(this,{prevOptions,options});}}
  static WidgetHiddenEvent = class WidgetHiddenEvent extends Event {constructor(){super('widgetHidden');}}
  static WidgetShownEvent = class WidgetShownEvent extends Event{constructor(){super('widgetShown');}}
  #wasReadyEventDispatched;
  #wereColMappingsInitialized;
  #wereRecordsInitialized;
  #wasCursorInitialized;
  #eventControl;
  #recordOps;
  constructor (widgetName, gristOptions=undefined, isDebugMode=false) { super();
    this.name = widgetName;
    this.logger = new Logger(widgetName, isDebugMode); this.debug = this.logger.debug.bind(this.logger);
    this.#wasReadyEventDispatched = false;
    this.#wereColMappingsInitialized = false; this.#wereRecordsInitialized = false; this.#wasCursorInitialized = false;
    this.#eventControl = { onRecords: { wasEverTriggered: false, skip: 0, args: {} }, onRecord: { wasEverTriggered: false, skip: 0, args: {} }, onNewRecord: { wasEverTriggered: false, skip: 0, args: {} } };
    this.#recordOps = {};
    this.tableName = grist.getSelectedTableIdSync();
    this.tableOps = grist.getTable();
    this.cursor = { prev: null, current: null }; this.colMappings = { prev: {}, current: {} }; this.records = { prev: [], current: [] }; this.options = { prev: {}, current: {} };
    grist.ready({ onEditOptions: this.#onEditOptions.bind(this), ...gristOptions });
      grist.onRecords(this.#onRecords.bind(this)); grist.onRecord(this.#onRecord.bind(this)); grist.onNewRecord(this.#onNewRecord.bind(this)); grist.onOptions(this.#onOptions.bind(this));
    window.addEventListener('visibilitychange', this.#onPageVisibilityChanged.bind(this));
    if (isDebugMode) {
      this.addEventListener('ready',(evt) => this.debug(evt.type, evt));
      this.addEventListener('cursorMoved',(evt) => this.debug(evt.type, evt));
      this.addEventListener('cursorMovedToNew',(evt) => this.debug(evt.type, evt));
      this.addEventListener('recordsModified',(evt) => this.debug(evt.type, evt));
      this.addEventListener('optionsEditorOpened',(evt) => this.debug(evt.type, evt));
      this.addEventListener('optionsChanged',(evt) => this.debug(evt.type, evt));
    }
  }
  async #onPageVisibilityChanged () {
    this.debug("onPageVisibilityChanged",document.visibilityState);
    if (document.visibilityState === 'hidden') {
      this.dispatchEvent(new GristWidget.WidgetHiddenEvent());
    } else if (document.visibilityState === 'visible') {
      this.dispatchEvent(new GristWidget.WidgetShownEvent());
    }
  }
  #onEditOptions () {
    this.debug('#onEditOptions');
    this.dispatchEvent(new GristWidget.OptionsEditorOpenedEvent(this.options.prev, this.options.current));
  }
  #onOptions (options, interactionOptions) {
    this.debug('#onOptions',options,interactionOptions);
    this.#updateOptions({ ...options, interactionOptions: interactionOptions });
    if (!this.#wasReadyEventDispatched) { return; }
    this.dispatchEvent(new GristWidget.OptionsChangedEvent(this.options.prev, this.options.current));
  }
  async setOption (name, value) {
    this.debug('setOption',name,value);
    return await grist.setOption(name, value);
  }
  async setOptions (options) {
    options = options || {};
    this.debug('setOptions',options);
    return await grist.setOptions(options);
  }
  get #isReadyEventInformationAssembled () { return (this.#wereColMappingsInitialized && this.#wereRecordsInitialized && this.#wasCursorInitialized); }
  #onRecords (records, colMappings) {
    this.debug("onRecords!",records,colMappings);
    if (!this.#eventControl.onRecords.wasEverTriggered) {
      this.#eventControl.onRecords.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateRecords(records, true);
      if (!this.#wasReadyEventDispatched && this.#isReadyEventInformationAssembled) { this.debug("dispatching ready-event from onRecords",this.records,this.cursor,this.colMappings); 
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current)); }
      return;
    }
    if (this.#eventControl.onRecords.skip) { this.#eventControl.onRecords.skip--; return; }
    this.#updateColMappings(colMappings); this.#updateRecords(records);
  }
  #onRecord (record, colMappings) {
    this.debug("onRecord!",record,colMappings);
    /*if (!this.hasOnRecordsEverFired || !this.#wasReadyEventDispatched) { this.#updateColMappings(colMappings, true); this.#updateCursor(record, true);
      if (!this.#wasReadyEventDispatched) { //this.debug("dispatching ready-event from onRecord");
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current)); return; }}*/
    if (!this.#eventControl.onRecord.wasEverTriggered) {
      this.#eventControl.onRecord.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateCursor(record, true);
      if (!this.#wasReadyEventDispatched && this.#isReadyEventInformationAssembled) { this.debug("dispatching ready-event from onRecord",this.records,this.cursor,this.colMappings);
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current));
      }
      return;
    }
    if (this.#eventControl.onRecord.skip) { this.#eventControl.onRecord.skip--; return; }
    this.#updateColMappings(colMappings); this.#updateCursor(record);
  }
  #onNewRecord (colMappings) {
    this.debug("onNewRecord!",colMappings);
    /*if (!this.hasOnRecordsEverFired || !this.#wasReadyEventDispatched) { this.#updateColMappings(colMappings, true); this.#updateCursor(undefined, true);
      if (!this.#wasReadyEventDispatched) { //this.debug("dispatched ready-event from onNewRecord");
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current)); }}*/
    if (!this.#eventControl.onNewRecord.wasEverTriggered) {
      this.#eventControl.onNewRecord.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateCursor(undefined, true);
      if (!this.#wasReadyEventDispatched && this.#isReadyEventInformationAssembled) { this.debug("dispatching ready-event from onNewRecord",this.records,this.cursor,this.colMappings);
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current));
      }
      return;
    }
    if (this.#eventControl.onNewRecord.skip) { this.#eventControl.onNewRecord.skip--; return; }
    this.#updateColMappings(colMappings); this.#updateCursor(undefined);
  }
  #updateRecords (records, disableEventDispatch=false) {
    this.#wereRecordsInitialized = true;
    this.records.prev = this.records.current; this.records.current = records || [];
    const delta = this.getRecordsDelta(this.records.prev, this.records.current);
    this.debug("updateRecords, prevRecords:",this.records.prev,"currentRecords:",this.records.current,"delta:",delta);
    if (!disableEventDispatch && delta.hasAnyChanges) { this.dispatchEvent(new GristWidget.RecordsModifiedEvent(this.records.current, this.records.prev, this.colMappings.current, delta)); }
  }
  #updateCursor (record, disableEventDispatch=false) {
    this.#wasCursorInitialized = true;
    this.cursor.prev = this.cursor.current; this.cursor.current = record || null; const wasCursorChanged = Boolean(this.cursor.current?.id !== this.cursor.prev?.id);
    if (!disableEventDispatch && wasCursorChanged) { this.dispatchEvent(typeof record === 'undefined' ?
      new GristWidget.CursorMovedToNewEvent(this.cursor.prev, this.colMappings.current) : new GristWidget.CursorMovedEvent(this.cursor.prev, this.cursor.current, this.colMappings.current)); }
    return wasCursorChanged; }
  #updateColMappings (colMappings, disableEventDispatch=false) {
    this.#wereColMappingsInitialized = true;
    this.colMappings.prev = this.colMappings.current; this.colMappings.current = colMappings || {};
    const wereColMappingsChanged = !Util.areDictsEqual(this.colMappings.prev, this.colMappings.current);
    if (!disableEventDispatch && wereColMappingsChanged) {
      this.dispatchEvent(new GristWidget.ColMappingsChangedEvent(this.colMappings.prev, this.colMappings.current)); }
    return wereColMappingsChanged; }
  #updateOptions (options) { this.options.prev = this.options.current; this.options.current = options; }
  getRecordsDelta (prevRecords, currentRecords) {
    const delta = { get hasAnyChanges () { return Boolean(Object.keys(this.added).length || Object.keys(this.changed).length || Object.keys(this.removed).length); }, added: {}, changed: {}, removed: {} };
    for (const currentRecord of currentRecords) {
      const prevRecord = prevRecords.find((rec) => rec.id === currentRecord.id);
      if (!prevRecord) { delta.added[currentRecord.id] = { added: {...currentRecord}, changed: {}, removed: {} }; continue; }
      const fieldsDelta = Util.dictsDelta(prevRecord, currentRecord);
      if (fieldsDelta.hasAnyChanges) { delta.changed[currentRecord.id] = fieldsDelta; continue; }
    }
    for (const prevRecord of prevRecords) {
      const currentRecord = currentRecords.find((rec) => rec.id === prevRecord.id);
      if (!currentRecord) { delta.removed[prevRecord.id] = { added: {}, changed: {}, removed: {...prevRecord} }; continue; }
    }
    return delta;
  }
  /******************* TODO: document all below *************************/
  async moveCursor (newCursor) {
    const wasCursorChanged = this.#updateCursor(newCursor);
    if (wasCursorChanged) { await grist.setCursorPos({ rowId: this.cursor.current?.id || 'new' }); }
  }
  scheduleSkipGristMessage (eventName, numEventsToSkip=1, eventArgs=undefined) {
    const validEventNames = Object.keys(this.#eventControl); if (!validEventNames.includes(eventName)) { throw new Error(`eventName must be one of '${validEventNames.join("', '")}', not '${eventName}'.`); }
    this.#eventControl[eventName].skip += numEventsToSkip || 0; this.#eventControl[eventName].args = eventArgs || {};
  }
  async writeRecord (fields, recId=-1, gristOpOptions=undefined) {
    if (recId === -1 && typeof this.cursor.current !== 'undefined') {
      recId = this.cursor.current?.id;
      if (!recId) { throw new Error(`writeRecord() called with recId = -1 but current cursor isn't set (which probably shouldn't be happening!) - can't determine which record to write to.`); }
    }
    this.debug("writeRecord",recId || 'new',fields,gristOpOptions);
    if (!recId) { return await this.tableOps.create({fields: fields}, gristOpOptions); }
    await this.tableOps.update({id: recId, fields: fields}); return recId;
  }
  scheduleWriteRecord (fields, timeoutMs, recId=-1, gristOpOptions=undefined) {
    if (recId === -1 && typeof this.cursor.current !== 'undefined') {
      recId = this.cursor.current?.id;
      if (!recId) { throw new Error(`scheduleWriteRecord() called with recId = -1 but current cursor isn't set (which probably shouldn't be happening!) - can't determine which record to write to.`); }
    }
    this.debug("schedule writeRecord",recId || 'new',fields,gristOpOptions);
    const fn = async () => await this.writeRecord(fields, recId, gristOpOptions);
    return this.scheduleRecordOperation(fn, timeoutMs, recId);
  }
  scheduleRecordOperation (fn, timeoutMs, recId=-1) {
    if (recId === -1 && typeof this.cursor.current !== 'undefined') {
      recId = this.cursor.current?.id;
      if (!recId) { throw new Error(`scheduleRecordOperation() called with recId = -1 but current cursor isn't set (which probably shouldn't be happening!) - can't determine which record to link the operation ${fn} to.`); }
    }
    const key = recId || 'new';
    const existingScheduledOp = this.#recordOps[key];
    const now = Date.now();
    if (existingScheduledOp) {
      window.clearTimeout(this.#recordOps[key].timeoutHandle);
      delete this.#recordOps[key];
    }
    this.#recordOps[key] = { fn: fn, timeScheduled: now, timeoutMs: timeoutMs, timeoutHandle: window.setTimeout(fn, timeoutMs) };
  }
  async runScheduledRecordOperationsNow (recIds=undefined) {
    this.debug("runScheduledRecordOperationsNow",recIds);
    for (const [recId, info] of Object.entries(this.#recordOps)) {
      if (!recIds || (recIds.includes && recIds.includes(recId))) {
        this.debug("--running scheduled op NOW:",recId,info);
        await info.fn(); // 'await' works for sync functions, too; see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#conversion_to_promise
        delete this.#recordOps[recId];
      }
    }
  }
  get currentRecId () { return this.cursor.current?.id; }
  get prevRecId () { return this.cursor.prev?.id; }
};
