import { Canvg } from 'https://cdn.skypack.dev/canvg@^4.0.0';

const Util = { logPrefix: 'GristSVGRenderer', log: function (...messages) { console.log(Util.logPrefix, ...messages); }, warn: function (...messages) { console.warn(Util.logPrefix, ...messages); }, err: function (...messages) { console.error(Util.logPrefix, ...messages); }, onDOMReady: function (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } }, jsonParse(object, defaultVal) { try { return JSON.parse(object); } catch { return defaultVal; } }, };


class GristWidget {
  constructor () {
    this.eventControl = { onRecords: { ignore: 0, args: {} }, onRecord: { ignore: 0, args: {} } };
    this.wasInitStarted = false;
    this.isInitDone = false;
    this.cursor = 0;
    this.colMapping = null;
    this.eCanvas = document.querySelector('canvas');
    grist.ready({ requiredAccess: 'read table', columns: [
      { name: 'svg', title: 'SVG data', type: 'Text' },
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
        this.load(record[this.colMapping.svg]);
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
    this.colMapping = colMapping;
    this.isInitDone = true;
  }
  clear () {
    this.load('');
  }
  load (svgData) {
    if (!svgData) { this._clearCanvas(); return; }
    try{
      const renderer = Canvg.fromString(this.eCanvas.getContext('2d'), svgData)
      renderer.start();
    } catch (error) { Util.err(error); this._clearCanvas(); }
  }
  _clearCanvas () { this.eCanvas.getContext('2d').clearRect(0, 0, this.eCanvas.width, this.eCanvas.height); }
};
let Widget = null;
Util.onDOMReady(() => { Widget = new GristWidget() });
