import { Util } from './util.mjs';
import { RecordUtil } from './recordutil.mjs';


export class InitEvent extends Event {
  constructor() {
    super('init');
  }
}
export class CursorMovedEvent extends Event {
  constructor() {
    super('cursorMoved');
  }
}
export class MappingsChangedEvent extends Event {
  constructor() {
    super('mappingsChanged');
  }
}
export class RecordsModifiedEvent extends Event {
  constructor(delta) {
    super('recordsModified');
    this.delta = delta;
  }
}
export class OptionsChangedEvent extends Event {
  constructor() {
    super('optionsChanged');
  }
}
export class InteractionOptionsChangedEvent extends Event {
  constructor() {
    super('interactionOptionsChanged');
  }
}
export class OptionsEditorRequestedEvent extends Event {
  constructor() {
    super('optionsEditorRequested');
  }
}

export class GristSectionAdapter extends EventTarget {
  #wasInitEventDispatched;
  #initEventTimeoutHandle;
  constructor(readyPayload=undefined, doSendReadyMessage=true) {
    super();
    this.readyPayload = readyPayload;
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
    grist.onRecord((record, mappings) => {
      this.#onUpdateCursor(record);
      this.#onUpdateMappings(mappings);
      this.#tryDispatchInitEvent();
    });
    grist.onRecords((records, mappings) => {
      this.#onUpdateRecords(records);
      this.#onUpdateMappings(mappings);
      this.#tryDispatchInitEvent();
    });
    grist.onNewRecord((mappings) => {
      this.#onUpdateMappings();
      this.#tryDispatchInitEvent();
    });
    grist.onOptions((options, interactionOptions) => {
      this.#onUpdateOptions(options);
      this.#onUpdateInteractionOptions(interactionOptions);
      this.#tryDispatchInitEvent();
    });
    if (doSendReadyMessage) {
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
    return Boolean(this.mappings && this.cursor && this.records && this.options);
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
          this.dispatchEvent(new MappingsChangedEvent());
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
        this.dispatchEvent(new OptionsChangedEvent());
      }
    }
  }
  #onUpdateInteractionOptions(interactionOptions) {
    if (options) {
      this.interactionOptionsPrev = this.interactionOptions ?? interactionOptions;
      this.interactionOptions = interactionOptions;
      if (this.#wasInitEventDispatched && !Util.areDictsEqual(this.interactionOptionsPrev, this.interactionOptions)) {
        this.dispatchEvent(new InteractionOptionsChangedEvent());
      }
    }
  }
  #tryDispatchInitEvent() {
    if (this.#wasInitEventDispatched) {
      return;
    }
    clearTimeout(this.#initEventTimeoutHandle);
    if (this.#mayDispatchInitEvent) {
      this.#wasInitEventDispatched = true;
      this.dispatchEvent(new InitEvent());
    } else {
      this.#initEventTimeoutHandle = setTimeout(() => { this.#tryDispatchInitEvent(); }, 500);
    }
  }
}
