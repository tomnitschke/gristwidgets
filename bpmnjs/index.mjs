/***
  This widget uses the excellent BPMN-JS library by Camunda (https://bpmn.io/).
  See LICENCE.md in this repo for the respective licence terms.
***/
import { GristWidget, Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import BpmnJsColorPicker from 'https://cdn.jsdelivr.net/npm/bpmn-js-color-picker@0.7.2/+esm';

const AUTOSAVE_INTERVAL = 10000;
const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="" xsi:schemaLocation="http://www.omg.org/spec/BPMN/20100524/MODEL http://www.omg.org/spec/BPMN/2.0/20100501/BPMN20.xsd"><collaboration id="sid-c0e745ff-361e-4afb-8c8d-2a1fc32b1424"><participant id="Participant_06sghq5" name="" processRef="Process_02mawc8" /></collaboration><process id="Process_02mawc8" /><bpmndi:BPMNDiagram id="sid-74620812-92c4-44e5-949c-aa47393d3830"><bpmndi:BPMNPlane id="sid-cdcae759-2af7-4a6d-bd02-53f3352a731d" bpmnElement="sid-c0e745ff-361e-4afb-8c8d-2a1fc32b1424"><bpmndi:BPMNShape id="Participant_06sghq5_di" bpmnElement="Participant_06sghq5" isHorizontal="true"><omgdc:Bounds x="270" y="70" width="600" height="250" /><bpmndi:BPMNLabel /></bpmndi:BPMNShape></bpmndi:BPMNPlane><bpmndi:BPMNLabelStyle id="sid-e0502d32-f8d1-41cf-9c4a-cbb49fecf581"><omgdc:Font name="Arial" size="11" isBold="false" isItalic="false" isUnderline="false" isStrikeThrough="false" /></bpmndi:BPMNLabelStyle><bpmndi:BPMNLabelStyle id="sid-84cb49fd-2f7c-44fb-8950-83c3fa153d3b"><omgdc:Font name="Arial" size="12" isBold="false" isItalic="false" isUnderline="false" isStrikeThrough="false" /></bpmndi:BPMNLabelStyle></bpmndi:BPMNDiagram></definitions>`;


/********************************************************************************************************************************************/
class GristBPMN {
  constructor (config) {
    this.config = {
      autosaveInterval: AUTOSAVE_INTERVAL,
      defaultXML: DEFAULT_XML,
      ...config,
    };
    this.widget = new GristWidget('GristBPMN', {
      requiredAccess: 'full',
      columns: [
        { name: 'xml', title: 'XML data', type: 'Text', strictType: true },
        { name: 'svg', title: 'SVG data', type: 'Text', strictType: true, optional: true, description: "Optional field for exported SVG data. Note that diagrams cannot be loaded from, only saved to, SVG." },
      ],
    }, true);
    this.msg = this.widget.logger.msg.bind(this.widget.logger);
    this.err = this.widget.logger.err.bind(this.widget.logger);
    this.bpmn = null;
    this.autosaveIntervalHandler = null;
    this.eContainer = document.querySelector('#bpmnjs');
    this.eTopBar = document.querySelector('#topBar');
    this.eSaveBtn = document.querySelector('#saveBtn');
    this.eExportBtn = document.querySelector('#exportBtn');
    this.eZoomFitBtn = document.querySelector('#zoomFitBtn');
    this.eAutosaveCheck = document.querySelector('#autosaveCheck');
    this.eAutoexportCheck = document.querySelector('#autoexportCheck');
    this.eStatusMsg = document.querySelector('#statusMsg');
    this.widget.addEventListener('ready', async (readyEvent) => { await this.#init(); await this.load(readyEvent.cursor[readyEvent.colMappings.xml]); });
    this.widget.addEventListener('cursorMoved', async (cursorMovedEvent) => { await this.load(cursorMovedEvent.cursor[cursorMovedEvent.colMappings]); });
    this.widget.addEventListener('cursorMovedToNew', (cursorMovedToNewEvent) => { this.clear(); });
  }
  async #init() {
    this.bpmn = new BpmnJS({
      container: this.eContainer,
      additionalModules: [
        BpmnJsColorPicker,
        BpmnJSPropertiesPanel.BpmnPropertiesPanelModule,
        BpmnJSPropertiesPanel.BpmnPropertiesProviderModule,
      ],
      propertiesPanel: {
        parent: '#bpmnjsPropertiesPanel'
      },
    });
    this.eSaveBtn.addEventListener('click', async (evt) => { await this.save(); this.eAutosaveCheck.disabled = false; });
    this.eExportBtn.addEventListener('click', async (evt) => { await this.export(); });
    this.eZoomFitBtn.addEventListener('click', () => { this.bpmn.get('canvas').zoom('fit-viewport'); });
    clearInterval(this.autosaveIntervalHandler); this.autosaveIntervalHandler = setInterval(async () => { await this.save(true); }, this.config.autosaveInterval);
  }
  #hideStatusMsg () { this.eStatusMsg.style.display = 'none'; }
  #setStatusMsg (statusMsg) { this.eStatusMsg.style.display = 'block'; this.eStatusMsg.innerHTML = statusMsg; }
  #setTopBarEnabled (isEnabled) { for (const elem of this.eTopBar.querySelectorAll('sl-button,sl-checkbox')) { elem.disabled = !isEnabled; } }
  clear (statusMsg=null) {
    this.bpmn.clear();
    this.#setTopBarEnabled(false);
    this.eAutosaveCheck.disabled = true;
    if (statusMsg) { this.#setStatusMsg(statusMsg); }
  }
  async load (xml) {
    this.#hideStatusMsg();
    try{
      await this.bpmn.importXML(xml || this.config.defaultXML);
      this.#setTopBarEnabled(true);
      this.eAutosaveCheck.disabled = true;
    } catch (error) { this.err(error); this.clear(`Error loading diagram: ${error}`); }
  }
  async save (invokedByAutosave=false) {
    if (this.cursor && (!invokedByAutosave || (!this.eAutosaveCheck.disabled && this.eAutosaveCheck.checked))) {
      try {
        const xml = await this.bpmn.saveXML({ format: false });
        await grist.getTable().update({id: this.cursor, fields: {[this.widget.colMappings.current.xml]: xml.xml}}); //NB using tableOps.update() does *not* seem to cause Grist to trigger an 'onRecord' event *if* no actual data change resulted from the operation.
        this.msg(`Saved XML to '${grist.getSelectedTableIdSync()}[${this.cursor}].${this.widget.colMappings.current.xml}':`, xml);
        if (this.eAutoexportCheck.checked) { await this.export(); }
      } catch (error) { this.err(error); this.#setStatusMsg(`Error saving diagram: ${error}`); }
    }
  }
  async export () {
    if (!this.cursor || !this.widget.colMappings.current.svg) { return; }
    try {
      const svg = await this.bpmn.saveSVG();
      await grist.getTable().update({id: this.cursor, fields: {[this.widget.colMappings.current.svg]: svg.svg}});
      this.msg(`Exported SVG to '${grist.getSelectedTableIdSync()}[${this.cursor}].${this.widget.colMappings.current.svg}':`, svg);
    } catch (error) { this.err(error); this.#setStatusMsg(`Error exporting diagram: ${error}`); }
  }
}

Util.onDOMReady(() => {
  const gristBPMN = new GristBPMN();
});
/*
class GristWidget {
  constructor () {
    this.eventControl = { onRecords: { ignore: 0, args: {} }, onRecord: { ignore: 0, args: {} } };
    this.wasInitStarted = false;
    this.isInitDone = false;
    this.cursor = 0;
    this.bpmn = null;
    this.autosaveIntervalHandler = null;
    this.colMapping = null;
    this.eContainer = document.querySelector('#bpmnjs');
    this.eTopBar = document.querySelector('#topBar');
    this.eSaveBtn = document.querySelector('#saveBtn');
    this.eExportBtn = document.querySelector('#exportBtn');
    this.eZoomFitBtn = document.querySelector('#zoomFitBtn');
    this.eAutosaveCheck = document.querySelector('#autosaveCheck');
    this.eAutoexportCheck = document.querySelector('#autoexportCheck');
    this.eStatusMsg = document.querySelector('#statusMsg');
    grist.ready({ requiredAccess: 'full', columns: [
      { name: 'xml', title: 'XML data', type: 'Text', strictType: true },
      { name: 'svg', title: 'SVG data', type: 'Text', strictType: true, optional: true, description: "Optional field for exported SVG data. Note that diagrams cannot be loaded from, only saved to, SVG." },
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
      if (record.id !== this.cursor) {
        this.cursor = record.id;
        this.colMapping = colMapping;
        await this.load(record[this.colMapping.xml]);
      }
    }
    else { this.eventControl.onRecord.ignore--; }
  }
  async onNewRecord () {
    if (!this.isInitDone) { return; }
    this.cursor = null;
    this.clear();
  }
  async init(tableName, sampleRecord, colMapping) {
    this.bpmn = new BpmnJS({ container: this.eContainer, additionalModules: [
      BpmnJsColorPicker, BpmnJSPropertiesPanel.BpmnPropertiesPanelModule, BpmnJSPropertiesPanel.BpmnPropertiesProviderModule,
    ], propertiesPanel: { parent: '#bpmnjsPropertiesPanel' }, });
    this.colMapping = colMapping;
    this.eSaveBtn.addEventListener('click', async (evt) => { await this.save(); this.eAutosaveCheck.disabled = false; });
    this.eExportBtn.addEventListener('click', async (evt) => { await this.export(); });
    this.eZoomFitBtn.addEventListener('click', () => { this.bpmn.get('canvas').zoom('fit-viewport'); });
    clearInterval(this.autosaveIntervalHandler); this.autosaveIntervalHandler = setInterval(async () => { await this.save(true); }, AUTOSAVE_INTERVAL);
    this.isInitDone = true;
  }
  #hideStatusMsg () { this.eStatusMsg.style.display = 'none'; }
  #setStatusMsg (statusMsg) { this.eStatusMsg.style.display = 'block'; this.eStatusMsg.innerHTML = statusMsg; }
  clear (statusMsg=null) {
    this.bpmn.clear();
    this.#setTopBarEnabled(false);
    this.eAutosaveCheck.disabled = true;
    if (statusMsg) { this.#setStatusMsg(statusMsg); }
  }
  async load (xml) {
    this.#hideStatusMsg();
    try{
      await this.bpmn.importXML(xml || DEFAULT_XML);
      this.#setTopBarEnabled(true);
      this.eAutosaveCheck.disabled = true;
    } catch (error) { this.err(error); this.clear(`Error loading diagram: ${error}`); }
  }
  async save (invokedByAutosave=false) {
    if (this.cursor && (!invokedByAutosave || (!this.eAutosaveCheck.disabled && this.eAutosaveCheck.checked))) {
      try {
        const xml = await this.bpmn.saveXML({ format: false });
        await grist.getTable().update({id: this.cursor, fields: {[this.colMapping.xml]: xml.xml}}); //NB using tableOps.update() does *not* seem to cause Grist to trigger an 'onRecord' event *if* no actual data change resulted from the operation.
        this.msg(`Saved XML to '${grist.getSelectedTableIdSync()}[${this.cursor}].${this.colMapping.xml}':`, xml);
        if (this.eAutoexportCheck.checked) { await this.export(); }
      } catch (error) { this.err(error); this.#setStatusMsg(`Error saving diagram: ${error}`); }
    }
  }
  async export () {
    if (!this.cursor || !this.colMapping.svg) { return; }
    try {
      const svg = await this.bpmn.saveSVG();
      await grist.getTable().update({id: this.cursor, fields: {[this.colMapping.svg]: svg.svg}});
      this.msg(`Exported SVG to '${grist.getSelectedTableIdSync()}[${this.cursor}].${this.colMapping.svg}':`, svg);
    } catch (error) { this.err(error); this.#setStatusMsg(`Error exporting diagram: ${error}`); }
  }
  #setTopBarEnabled (isEnabled) { for (const elem of this.eTopBar.querySelectorAll('sl-button,sl-checkbox')) { elem.disabled = !isEnabled; } }
};
let Widget = null;
Util.onDOMReady(() => { Widget = new GristWidget() });
*/
