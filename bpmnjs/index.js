const Util = { logPrefix: 'GristBPMNJS', log: function (...messages) { console.log(Util.logPrefix, ...messages); }, warn: function (...messages) { console.warn(Util.logPrefix, ...messages); }, err: function (...messages) { console.error(Util.logPrefix, ...messages); }, onDOMReady: function (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }, jsonParse(object, defaultVal) { try { return JSON.parse(object); } catch { return defaultVal; } }, };

const AUTOSAVE_INTERVAL = 10000;
const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="" xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL http://www.omg.org/spec/BPMN/2.0/20100501/BPMN20.xsd"><collaboration id="sid-c0e745ff-361e-4afb-8c8d-2a1fc32b1424"><participant id="Participant_06sghq5" name="" processRef="Process_02mawc8" /></collaboration><process id="Process_02mawc8" /><bpmndi:BPMNDiagram id="sid-74620812-92c4-44e5-949c-aa47393d3830"><bpmndi:BPMNPlane id="sid-cdcae759-2af7-4a6d-bd02-53f3352a731d" bpmnElement="sid-c0e745ff-361e-4afb-8c8d-2a1fc32b1424"><bpmndi:BPMNShape id="Participant_06sghq5_di" bpmnElement="Participant_06sghq5" isHorizontal="true"><omgdc:Bounds x="270" y="70" width="600" height="250" /><bpmndi:BPMNLabel /></bpmndi:BPMNShape></bpmndi:BPMNPlane><bpmndi:BPMNLabelStyle id="sid-e0502d32-f8d1-41cf-9c4a-cbb49fecf581"><omgdc:Font name="Arial" size="11" isBold="false" isItalic="false" isUnderline="false" isStrikeThrough="false" /></bpmndi:BPMNLabelStyle><bpmndi:BPMNLabelStyle id="sid-84cb49fd-2f7c-44fb-8950-83c3fa153d3b"><omgdc:Font name="Arial" size="12" isBold="false" isItalic="false" isUnderline="false" isStrikeThrough="false" /></bpmndi:BPMNLabelStyle></bpmndi:BPMNDiagram></definitions>`;


/********************************************************************************************************************************************/
class GristWidget {
  constructor () {
    this.eventControl = { onRecords: { ignore: 0, args: {} }, onRecord: { ignore: 0, args: {} } };
    this.wasInitStarted = false;
    this.isInitDone = false;
    this.cursor = 0;
    this.bpmn = null;
    this.autosaveIntervalHandler = null;
    this.eTopBar = document.querySelector('#topBar');
    this.eSaveBtn = document.querySelector('#saveBtn');
    this.eZoomFitBtn = document.querySelector('#zoomFitBtn');
    this.eAutosaveCheck = document.querySelector('#autosaveCheck');
    grist.ready({ requiredAccess: 'full', allowSelectBy: true, columns: [
      { name: 'xml', title: 'XML data', type: 'Text', strictType: true },
    ] });
    grist.onRecords(this.onRecords.bind(this)); grist.onRecord(this.onRecord.bind(this)); grist.onNewRecord(this.onNewRecord.bind(this));
  }
  async onRecords (records, colMapping) {
    if (!this.wasInitStarted && !this.isInitDone) { this.wasInitStarted = true; await this.init(grist.getSelectedTableIdSync(), records[0], colMapping); } if (!this.isInitDone) { return; }
    if (!this.eventControl.onRecords.ignore) {
      ///
    }
    else { this.eventControl.onRecords.ignore--; }
  }
  async onRecord (record, colMapping) {
    if (!this.wasInitStarted && !this.isInitDone) { this.wasInitStarted = true; await this.init(grist.getSelectedTableIdSync(), record); } if (!this.isInitDone) { return; }
    if (!this.eventControl.onRecord.ignore) {
      Util.log("onRecord",record);
      if (record.id !== this.cursor) {
        this.cursor = record.id;
        await this.load(record[colMapping.xml]);
        this.setTopBarEnabled(true);
        this.eAutosaveCheck.disabled = true;
      }
    }
    else { this.eventControl.onRecord.ignore--; }
  }
  async onNewRecord () {
    if (!this.isInitDone) { return; }
    this.cursor = null;
    this.bpmn.clear();
    this.setTopBarEnabled(false);
    this.eAutosaveCheck.disabled = true;
  }
  async init(tableName, sampleRecord, colMapping) {
    this.bpmn = new BpmnJS({ container: document.querySelector('#bpmnjs') });
    this.colMapping = colMapping;
    this.eSaveBtn.addEventListener('click', async (evt) => { await this.save(); this.eAutosaveCheck.disabled = false; });
    this.eZoomFitBtn.addEventListener('click', () => { this.bpmn.get('canvas').zoom('fit-viewport'); });
    clearInterval(this.autosaveIntervalHandler); this.autosaveIntervalHandler = setInterval(async () => { await this.save(true); }, AUTOSAVE_INTERVAL);
    this.isInitDone = true;
  }
  async load (xml) {
    await this.bpmn.importXML(xml || DEFAULT_XML);
  }
  async save (invokedByAutosave=false) {
    if (this.cursor && (!invokedByAutosave || (!this.eAutosaveCheck.disabled && this.eAutosaveCheck.checked))) {
      const xml = await this.bpmn.saveXML({ format: false });
      await grist.getTable().update({id: this.cursor, fields: {[this.colMapping.xml]: xml.xml}}); //NB using tableOps.update() does *not* seem to cause Grist to trigger an 'onRecord' event *if* no actual data change resulted from the operation.
      Util.log(`Saved XML to '${grist.getSelectedTableIdSync()}[${this.cursor}].${this.colMapping.xml}'.`);
    }
  }
  setTopBarEnabled (isEnabled) { for (const elem of this.eTopBar.querySelectorAll('sl-button,sl-checkbox')) { elem.disabled = !isEnabled; } }
};
let Widget = null;
Util.onDOMReady(() => { Widget = new GristWidget() });
