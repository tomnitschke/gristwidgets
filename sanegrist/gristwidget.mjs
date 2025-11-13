'use strict';


import { Util, Logger } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { RecordUtil } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/recordutil.mjs';


/********************************************************************************************************************************************/
export class GristWidget extends EventTarget {
  static ReadyEvent = class ReadyEvent extends Event {constructor(records,cursor,colMappings,options){super('ready');Object.assign(this,{records,cursor,colMappings,options});}};
  static RecordsModifiedEvent = class RecordsModifiedEvent extends Event {constructor(prevRecords,records,colMappings,delta,cursor=null){super('recordsModified');
    Object.assign(this,{prevRecords,records,colMappings,delta,cursor});}};
  static CursorMovedEvent = class CursorMovedEvent extends Event {constructor (prevCursor,cursor,colMappings){super('cursorMoved');Object.assign(this,{prevCursor,cursor,colMappings});}};
  static CursorMovedToNewEvent = class CursorMovedToNewEvent extends Event {constructor (prevCursor,colMappings){super('cursorMovedToNew');Object.assign(this,{prevCursor,colMappings});}};
  static ColMappingsChangedEvent = class ColMappingsChangedEvent extends Event {constructor (prevColMappings,colMappings){super('colMappingChanged');Object.assign(this,{prevColMappings,colMappings});}};
  static OptionsEditorOpenedEvent = class OptionsEditorOpenedEvent extends Event {constructor(prevOptions,options){super('optionsEditorOpened');Object.assign(this,{prevOptions,options});}};
  static OptionsChangedEvent = class OptionsChangedEvent extends Event {constructor(prevOptions,options){super('optionsChanged');Object.assign(this,{prevOptions,options});}};
  static WidgetHiddenEvent = class WidgetHiddenEvent extends Event {constructor(){super('widgetHidden');}};
  static WidgetShownEvent = class WidgetShownEvent extends Event{constructor(){super('widgetShown');}};
  #wasReadyEventDispatched;
  #wereColMappingsInitialized;
  #wereRecordsInitialized;
  #wasCursorInitialized;
  #wereOptionsInitialized;
  //#pendingRecordsModifiedEvent;
  #eventControl;
  #recordOps;
  constructor (widgetName, gristOptions=undefined, isDebugMode=false) { super();
    this.name = widgetName;
    this.logger = new Logger(widgetName, isDebugMode); this.debug = this.logger.debug.bind(this.logger);
    this.#wasReadyEventDispatched = false;
    this.#wereColMappingsInitialized = false; this.#wereRecordsInitialized = false; this.#wasCursorInitialized = false; this.#wereOptionsInitialized = false;
    //this.#pendingRecordsModifiedEvent = null;
    this.#eventControl = { onRecords: { wasEverTriggered: false, skip: 0, args: {} }, onRecord: { wasEverTriggered: false, skip: 0, args: {} }, onNewRecord: { wasEverTriggered: false, skip: 0, args: {} } };
    this.#recordOps = {};
    this.tableName = grist.getSelectedTableIdSync();
    this.tableOps = grist.getTable();
    this.cursor = { prev: null, current: null }; this.colMappings = { prev: {}, current: {} }; this.records = { prev: [], current: [] }; this.options = { prev: {}, current: {} };
    grist.ready({ onEditOptions: this.#onEditOptions.bind(this), ...gristOptions });
      grist.onRecords(this.#onRecords.bind(this)); grist.onRecord(this.#onRecord.bind(this)); grist.onNewRecord(this.#onNewRecord.bind(this)); grist.onOptions(this.#onOptions.bind(this));
    window.addEventListener('visibilitychange', this.#onPageVisibilityChanged.bind(this));
    if (isDebugMode) {
      this.addEventListener('ready',(evt) => this.debug("event", evt.type, evt));
      this.addEventListener('cursorMoved',(evt) => this.debug("event", evt.type, evt));
      this.addEventListener('cursorMovedToNew',(evt) => this.debug("event", evt.type, evt));
      this.addEventListener('recordsModified',(evt) => this.debug("event", evt.type, evt));
      this.addEventListener('optionsEditorOpened',(evt) => this.debug("event", evt.type, evt));
      this.addEventListener('optionsChanged',(evt) => this.debug("event", evt.type, evt));
    }
  }
  async #onPageVisibilityChanged () {
    if (document.visibilityState === 'hidden') {
      this.dispatchEvent(new GristWidget.WidgetHiddenEvent());
    } else if (document.visibilityState === 'visible') {
      this.dispatchEvent(new GristWidget.WidgetShownEvent());
    }
  }
  #onEditOptions () {
    this.debug('Grist message onEditOptions');
    this.dispatchEvent(new GristWidget.OptionsEditorOpenedEvent(this.options.prev, this.options.current));
  }
  #onOptions (options, interactionOptions) {
    this.debug('Grist message onOptions',options,interactionOptions);
    this.#updateOptions({ ...options, interactionOptions: interactionOptions });
    if (!this.#wasReadyEventDispatched) { return; }
    this.dispatchEvent(new GristWidget.OptionsChangedEvent(this.options.prev, this.options.current));
  }
  /*async setOption (name, value) {
    this.debug('setOption',name,value);
    return await grist.setOption(name, value);
  }
  async setOptions (options) {
    options = options || {};
    this.debug('setOptions',options);
    return await grist.setOptions(options);
  }*/
  get #isReadyEventInformationAssembled () { return (this.#wereColMappingsInitialized && this.#wereRecordsInitialized && this.#wasCursorInitialized && this.#wereOptionsInitialized); }
  #onRecords (records, colMappings) {
    this.debug("Grist message onRecords",records,colMappings);
    if (!this.#eventControl.onRecords.wasEverTriggered) {
      this.#eventControl.onRecords.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateRecords(records, true);
      if (!this.#wasReadyEventDispatched && this.#isReadyEventInformationAssembled) { this.debug("dispatching ready-event from onRecords",this.records,this.cursor,this.colMappings); 
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current, this.options.current)); }
      return;
    }
    if (this.#eventControl.onRecords.skip) { this.#eventControl.onRecords.skip--; return; }
    this.#updateColMappings(colMappings); this.#updateRecords(records);
  }
  #onRecord (record, colMappings) {
    this.debug("Grist message onRecord!",record,colMappings);
    if (!this.#eventControl.onRecord.wasEverTriggered) {
      this.#eventControl.onRecord.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateCursor(record, true);
      if (!this.#wasReadyEventDispatched && this.#isReadyEventInformationAssembled) { this.debug("dispatching ready-event from onRecord",this.records,this.cursor,this.colMappings);
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current, this.options.current));
      }
      return;
    }
    /*if (this.#pendingRecordsModifiedEvent) {
      this.#updateColMappings(colMappings, true); this.#updateCursor(record, true);
      this.#pendingRecordsModifiedEvent.cursor = this.cursor.current;
      this.dispatchEvent(this.#pendingRecordsModifiedEvent);
      this.#pendingRecordsModifiedEvent = null;
      return;
    }*/
    if (this.#eventControl.onRecord.skip) { this.#eventControl.onRecord.skip--; return; }
    this.#updateColMappings(colMappings); this.#updateCursor(record);
  }
  #onNewRecord (colMappings) {
    this.debug("Grist message onNewRecord",colMappings);
    if (!this.#eventControl.onNewRecord.wasEverTriggered) {
      this.#eventControl.onNewRecord.wasEverTriggered = true;
      this.#updateColMappings(colMappings, true); this.#updateCursor(undefined, true);
      if (!this.#wasReadyEventDispatched && this.#isReadyEventInformationAssembled) { this.debug("dispatching ready-event from onNewRecord",this.records,this.cursor,this.colMappings);
        this.#wasReadyEventDispatched = true; this.dispatchEvent(new GristWidget.ReadyEvent(this.records.current, this.cursor.current, this.colMappings.current, this.options.current));
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
    if (delta.hasAnyChanges) {
      if (this.cursor.current?.id in delta.changed) {
        this.cursor.current = {...this.cursor.current, ...delta.changed[this.cursor.current.id];
      }
      if (!disableEventDispatch) {
        this.dispatchEvent(new GristWidget.RecordsModifiedEvent(this.records.current, this.records.prev, this.colMappings.current, delta));
      }
    }
    /*if (!disableEventDispatch && delta.hasAnyChanges) {
      this.#pendingRecordsModifiedEvent = new GristWidget.RecordsModifiedEvent(this.records.current, this.records.prev, this.colMappings.current, delta);
      setTimeout(() => {
        if (this.#pendingRecordsModifiedEvent) {
          this.dispatchEvent(this.#pendingRecordsModifiedEvent.cursor = this.cursor.current);
        }
      }, 500);
    }*/
  }
  #updateCursor (record, disableEventDispatch=false) {
    this.#wasCursorInitialized = true;
    this.cursor.prev = this.cursor.current; this.cursor.current = record || null; const wasCursorChanged = Boolean(this.cursor.current?.id !== this.cursor.prev?.id);
    if (!disableEventDispatch && wasCursorChanged) { this.dispatchEvent(typeof record === 'undefined' ?
      new GristWidget.CursorMovedToNewEvent(this.cursor.prev, this.colMappings.current) : new GristWidget.CursorMovedEvent(this.cursor.prev, this.cursor.current, this.colMappings.current)); }
    return wasCursorChanged; }
  #updateColMappings (colMappings, disableEventDispatch=false) {
    this.#wereColMappingsInitialized = true;
    // When a column gets unmapped that was previously mapped, of course Grist doesn't remove the corresponding key from colMappings. No, it just assigns
    // it a null value, so that we're left guessing whether the col is now unmapped or rather still mapped, just to something that happens to be null. Just awesome.
    // However, the onRecord/onRecords events seem to transmit partial record objects that contain just the keys that we actually have a mapping for.
    // So we're using those here to validate colMappings bloody manually.
    let colMappingsSanitized = colMappings;
    if ((this.#wasCursorInitialized || this.#wereRecordsInitialized) && (this.cursor.current || this.records.current?.[0])) {
      const sampleRecord = this.cursor.current || this.records.current[0];
      colMappingsSanitized = Object.fromEntries(Object.entries(colMappings).filter(([mappedColName, colName]) => Object.keys(sampleRecord).includes(colName)));
    }
    this.colMappings.prev = this.colMappings.current; this.colMappings.current = colMappingsSanitized || {};
    const wereColMappingsChanged = !Util.areDictsEqual(this.colMappings.prev, this.colMappings.current);
    if (!disableEventDispatch && wereColMappingsChanged) {
      this.dispatchEvent(new GristWidget.ColMappingsChangedEvent(this.colMappings.prev, this.colMappings.current)); }
    return wereColMappingsChanged; }
  #updateOptions (options) {
    this.#wereOptionsInitialized = true;
    this.options.prev = this.options.current;
    this.options.current = options;
  }
  getRecordsDelta (prevRecords, currentRecords) {
    return RecordUtil.compareRecordLists(prevRecords, currentRecords);
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
    this.debug("scheduleWriteRecord",recId || 'new',fields,gristOpOptions);
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
  isColMapped (mappedColName) { return Boolean(mappedColName in this.colMappings.current); }
};
