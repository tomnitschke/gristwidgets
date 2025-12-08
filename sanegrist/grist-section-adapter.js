import { Util } from './util.mjs';
import { RecordUtil } from './recordutil.mjs';


class InitEvent extends Event {
  constructor() {
    super('init');
  }
}
class CursorMovedEvent extends Event {
  constructor() {
    super('cursorMoved');
  }
}
class CursorMovedToNewEvent extends Event {
  constructor() {
    super('cursorMovedToNew');
  }
}
class MappingsUpdatedEvent extends Event {
  constructor() {
    super('mappingsUpdated');
  }
}
class RecordsModifiedEvent extends Event {
  constructor(delta) {
    super('recordsModified');
    this.delta = delta;
  }
}
class OptionsUpdatedEvent extends Event {
  constructor() {
    super('optionsUpdated');
  }
}
class InteractionOptionsUpdatedEvent extends Event {
  constructor() {
    super('interactionOptionsUpdated');
  }
}
class OptionsEditorRequestedEvent extends Event {
  constructor() {
    super('optionsEditorRequested');
  }
}

class RecordOp {
  constructor(recId, fn, timeoutMs, timeoutHandle) {
    this.recId = recId;
    this.fn = fn;
    this.timeoutMs = timeoutMs;
    this.timeoutHandle = timeoutHandle;
  }
}

const Config = {
  doSendReadyMessage: true,
  disableInitEvent: false,
};

export class GristSectionAdapter extends EventTarget {
  #_wasInitEventDispatched;
  #initEventTimeoutHandle;
  #isFetchingTableName;
  #skipMessages;
  constructor(readyPayload=undefined, config=undefined) {
    super();
    this.config = {...Config, ...config};
    this.readyPayload = readyPayload;
    this.tableName = null;
    this.tableOps = null;
    this.mappings = null;
    this.mappingsPrev = null;
    this.cursor = null;
    this.cursorPrev = null;
    this.records = null;
    this.recordsPrev = null;
    this.options = null;
    this.optionsPrev = null;
    this.interactionOptions = null;
    this.interactionOptionsPrev = null;
    this.recordOps = {};
    this.#_wasInitEventDispatched = false;
    this.#initEventTimeoutHandle = null;
    this.#isFetchingTableName = false;
    this.#skipMessages = {
      onRecord: 0,
      onRecords: 0,
      onNewRecord: 0,
      onOptions: 0,
    };
    grist.onRecord((record, mappings) => {
      if (this.#skipMessages.onRecord) {
        this.#skipMessages.onRecord--;
        return;
      }
      this.#onUpdateCursor(record);
      this.#onUpdateMappings(mappings);
      this.#tryDispatchInitEvent();
    });
    grist.onRecords((records, mappings) => {
      if (this.#skipMessages.onRecords) {
        this.#skipMessages.onRecords--;
        return;
      }
      this.#onUpdateRecords(records);
      this.#onUpdateMappings(mappings);
      this.#tryDispatchInitEvent();
    });
    grist.onNewRecord((mappings) => {
      if (this.#skipMessages.onNewRecord) {
        this.#skipMessages.onNewRecord--;
        return;
      }
      this.#onUpdateMappings();
      this.cursor = { id: -1 };
      this.#tryDispatchInitEvent();
      if (this.#wasInitEventDispatched) {
        this.dispatchEvent(new CursorMovedToNewEvent());
      }
    });
    grist.onOptions((options, interactionOptions) => {
      if (this.#skipMessages.onOptions) {
        this.#skipMessages.onOptions--;
        return;
      }
      this.#onUpdateOptions(options);
      this.#onUpdateInteractionOptions(interactionOptions);
      this.#tryDispatchInitEvent();
    });
    if (this.config.doSendReadyMessage) {
      grist.ready({
        onEditOptions: () => {
          this.#tryDispatchInitEvent();
          this.dispatchEvent(new OptionsEditorRequestedEvent());
        },
        ...this.readyPayload
      });
    }
    this.#tryDispatchInitEvent();
  }
  get #mayDispatchInitEvent() {
    return Boolean(this.tableName && this.tableOps && this.mappings && this.cursor && this.records);
  }
  get #wasInitEventDispatched() {
    return this.#_wasInitEventDispatched || this.config.disableInitEvent;
  }
  set #wasInitEventDispatched(value) {
    this.#_wasInitEventDispatched = value;
  }
  #tryDispatchInitEvent(doForce=false) {
    if (this.#wasInitEventDispatched) {
      return;
    }
    clearTimeout(this.#initEventTimeoutHandle);
    if (!this.tableName && !this.#isFetchingTableName) {
      this.#isFetchingTableName = true;
      grist.getSelectedTableId().then((tableName) => {
        this.#isFetchingTableName = false;
        this.tableName = tableName;
        this.tableOps = grist.getTable();
      });
    }
    if (doForce || this.#mayDispatchInitEvent) {
      this.#wasInitEventDispatched = true;
      this.dispatchEvent(new InitEvent());
    } else {
      this.#initEventTimeoutHandle = setTimeout(() => { this.#tryDispatchInitEvent(); }, 500);
    }
  }
  _forceDispatchInitEvent() {
    this.#tryDispatchInitEvent(true);
  }
  #onUpdateCursor(record) {
      if (record) {
        this.cursorPrev = this.cursor ?? record;
        this.cursor = record;
        if (this.#wasInitEventDispatched && this.cursor.id !== this.cursorPrev.id) {
          this.dispatchEvent(new CursorMovedEvent());
        }
      }
  }
  #onUpdateMappings(mappings) {
      if (mappings) {
        this.mappingsPrev = this.mappings ?? mappings;
        this.mappings = mappings;
        if (this.#wasInitEventDispatched && !Util.areDictsEqual(this.mappingsPrev, this.mappings)) {
          this.dispatchEvent(new MappingsUpdatedEvent());
        }
      }
  }
  #onUpdateRecords(records) {
      if (records) {
        this.recordsPrev = this.records ?? records;
        this.records = records;
        const delta = RecordUtil.compareRecordLists(this.recordsPrev, this.records);
        if (this.#wasInitEventDispatched && delta.hasAnyChanges) {
          if (this.cursor) {
            this.cursor = this.records.find((rec) => rec.id === this.cursor.id);
          }
          this.dispatchEvent(new RecordsModifiedEvent(delta));
        }
      }
  }
  #onUpdateOptions(options) {
    if (options) {
      this.optionsPrev = this.options ?? options;
      this.options = options;
      if (this.#wasInitEventDispatched && !Util.areDictsEqual(this.optionsPrev, this.options)) {
        this.dispatchEvent(new OptionsUpdatedEvent());
      }
    }
  }
  #onUpdateInteractionOptions(interactionOptions) {
    if (interactionOptions) {
      this.interactionOptionsPrev = this.interactionOptions ?? interactionOptions;
      this.interactionOptions = interactionOptions;
      if (this.#wasInitEventDispatched && !Util.areDictsEqual(this.interactionOptionsPrev, this.interactionOptions)) {
        this.dispatchEvent(new InteractionOptionsUpdatedEvent());
      }
    }
  }
  #assertInitEventDispatched() {
    if (!this.#wasInitEventDispatched) {
      throw new Error(`Not yet inited. Wait for 'init' event do be dispatched first!`);
    }
  }
  #assertMappingExists(mappedColName) {
    if (!(mappedColName in this.mappings)) {
      throw new Error(`There is no mapped column called '${mappedColName}'. The current mappings are: ${Util.jsonEncode(this.mappings)}`);
    }
  }
  /****************************************************************************************************/
  get isInited() { return this.#wasInitEventDispatched; }
  on(eventName, callbackFn) { this.addEventListener(eventName, callbackFn); }
  onInit(callbackFn) { this.addEventListener('init', callbackFn); }
  onInitOrCursorMoved(callbackFn) { this.addEventListener('init', callbackFn); this.addEventListener('cursorMoved', callbackFn); }
  onMappingsUpdated(callbackFn) { this.addEventListener('mappingsUpdated', callbackFn); }
  onCursorMoved(callbackFn) { this.addEventListener('cursorMoved', callbackFn); }
  onCursorMovedToNew(callbackFn) { this.addEventListener('cursorMovedToNew', callbackFn); }
  onRecordsModified(callbackFn) { this.addEventListener('recordsModified', callbackFn); }
  onOptionsUpdated(callbackFn) { this.addEventListener('optionsUpdated', callbackFn); }
  onInteractionOptionsUpdated(callbackFn) { this.addEventListener('interactionOptionsUpdated', callbackFn); }
  onOptionsEditorRequested(callbackFn) { this.addEventListener('optionsEditorRequested', callbackFn); }
  hasMapping(mappedColName) {
    this.#assertInitEventDispatched();
    return mappedColName in this.mappings;
  }
  skipMessage(messageName, amountToSkip=1) {
    if (!(messageName in this.#skipMessages)) {
      throw new Error(`Unknown message '${messageName}'.`);
    }
    this.#skipMessages[messageName] += amountToSkip;
  }
  getRecordField(record, mappedColName) {
    this.#assertInitEventDispatched();
    this.#assertMappingExists(mappedColName);
    return record[this.mappings[mappedColName]];
  }
  getCursorField(mappedColName) {
    this.#assertInitEventDispatched();
    this.#assertMappingExists(mappedColName);
    return this.cursor[this.mappings[mappedColName]];
  }
  async writeRecord(recId, fieldsAndValues, opOptions=undefined) {
    this.#assertInitEventDispatched();
    if (recId === 'new') {
      return await this.tableOps.create({ fields: fieldsAndValues }, opOptions);
    } else {
      return await this.tableOps.update({ id: recId, fields: fieldsAndValues }, opOptions);
    }
  }
  async writeCursor(fieldsAndValues, opOptions=undefined) {
    this.#assertInitEventDispatched();
    return await this.writeRecord(this.cursor.id, fieldsAndValues, opOptions);
  }
  async writeCursorField(mappedColName, value, opOptions=undefined) {
    this.#assertInitEventDispatched();
    this.#assertMappingExists(mappedColName);
    return await this.writeCursor({ [this.mappings[mappedColName]]: value }, opOptions);
  }
  scheduleRecordOperation(recId, fn, timeoutMs=500) {
    if (!recId || (recId < 1 && recId !== 'new')) {
      throw new Error(`Invalid recId '${recId}' provided. It must be a valid record id (i.e. a number >= 1) or the string 'new'.`);
    }
    this.removeRecordOperation(recId);
    this.recordOps[recId] = new RecordOp(recId, fn, timeoutMs, setTimeout(async () => {
      await fn(recId);  // 'await' works for sync functions, too; see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#conversion_to_promise
      this.removeRecordOperation(recId);
    }, timeoutMs));
  }
  removeRecordOperation(recId) {
    const op = this.recordOps[recId];
    if (op) {
      clearTimeout(op.timeoutHandle);
      delete this.recordOps[recId];
    }
  }
  async runRecordOperations(recIds=undefined) {
    for (const [recId, op] of Object.entries(this.recordOps)) {
      if (!recIds || (recIds.includes && recIds.includes(recId))) {
        await op.fn(recId);  // See scheduleRecordOperation()
        this.removeRecordOperation(recId);
      }
    }
  }
  async scheduleWriteRecord(recId, fieldsAndValues, timeoutMs, opOptions=undefined) {
    this.scheduleRecordOperation(recId, async (recordId) => {
      await this.writeRecord(recordId, fieldsAndValues, opOptions);
    }, timeoutMs);
  }
  async scheduleWriteCursor(fieldsAndValues, timeoutMs, opOptions=undefined) {
    this.scheduleRecordOperation(this.cursor.id, async (recordId) => {
      await this.writeRecord(recordId, fieldsAndValues, opOptions);
    }, timeoutMs);
  }
  async scheduleWriteCursorField(mappedColName, value, timeoutMs, opOptions=undefined)  {
    this.scheduleRecordOperation(this.cursor.id, async (recordId) => {
      this.#assertMappingExists(mappedColName);
      await this.writeRecord(recordId, { [this.mappings[mappedColName]]: value }, opOptions);
    }, timeoutMs);
  }
}
