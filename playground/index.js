import { Util } from '../sanegrist/util.mjs';
//import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import { GristSectionAdapter } from '../sanegrist/grist-section-adapter.js';


const Config = {
  enableAutoreload: true,
  importGristThemeCSSVars: true,
  jsPrelude: '',
  htmlPrelude: '',
  showConfigButton: true,
}


/*
  First-load process:
  1. Call grist.rpcs.sendReadyMessage(), indicating 'ready to receive messages' to Grist *without* also calling grist.sectionApi.configure(), which is what the normal grist.ready() call would do.
  2. We start receiving 'onRecord'/'onRecords' messages from Grist *but without any valid column mapping*, because grist.sectionApi.configure() hasn't been called yet.
  3. load() checks whether we've got valid mappings or not, then:
    a) If we don't, it calls grist.sectionApi.configure() manually. This causes Grist to reload the entire widget, so we're starting out at 1. again but once we get to 3., we'll branch off to b), below.
    b) If we do, it proceeds to load user code. This may or may not include a grist.ready() call that will invoke grist.sectionApi.configure(). But since we don't know whether or not, we'll set a timeout
       to call grist.sectionApi.configure() manually *if any loaded user code hasn't done so by itself* inside of 3 seconds.
  4. For user code that does include a grist.ready() call, we've already set up a message middleware in our constructor. This will pick up the 'configure' message coming from the iframe holding the user code,
     add this widget's own column mappings to it and then forward it to Grist. It will also clear the timeout mentioned in 3. b).
*/

class GristPlayground {
  #contentGristReadyDeclaration;
  #config;
  #wasLoadStarted;
  #isContentFrameReady;
  constructor (config=null) {
    this.defaultConfig = {
      ...Config,
      ...config,
    };
    this.userConfig = {};
    this.eStatus = document.querySelector('#status');
    this.eContentFrame = document.querySelector('#content');
    this.eContentFrame.addEventListener('load', this.#onContentFrameLoaded.bind(this));
    this.eConfigPanel = document.querySelector('#config');
    this.eReloadBtn = document.querySelector('#reloadBtn');
    this.eConfigOpenBtn = document.querySelector('#configOpenBtn');
    this.eConfigResetBtn = document.querySelector('#configResetBtn');
    this.eConfigOpenBtn.addEventListener('click', async () => { this.openConfigPanel() });
    this.eConfigResetBtn.addEventListener('click', async () => { await this.clearConfig(); this.openConfigPanel() });
    for (const eConfigItem of document.querySelectorAll('.configItem')) {
      eConfigItem.addEventListener('sl-input', async (evt) => await this.#onConfigItemChanged(evt.target));
    }
    this.adapter = new GristSectionAdapter({
      requiredAccess: 'full',
      columns: [
        { name: 'playground_html', title: '+++ Playground: HTML +++', type: 'Text', optional: true },
        { name: 'playground_js', title: '+++ Playground: JS +++', type: 'Text', optional: true },
        { name: 'playground_config', title: '+++ Playground: Config JSON +++', type: 'Text', strictType: true, optional: true },
      ],
    }, {
      doSendReadyMessage: false,
      disableInitEvent: true
    });
    this.#contentGristReadyDeclaration = {};
    this.#config = null;
    this.#wasLoadStarted = false;
    this.#isContentFrameReady = false;
    this.initRPCMiddleware();
    this.adapter.onCursorMoved(() => {
      console.error("onCursorMoved",this);
      this.#wasLoadStarted = true;
      this.load();
    });
    this.adapter.onRecordsModified(() => {
      console.error("onRecordsModified",this);
      this.#wasLoadStarted = true;
      if (this.config.enableAutoreload) {
        this.load();
      }
    });
    grist.onRecord(async (record) => {
      if (!this.#wasLoadStarted) {
        this.#wasLoadStarted = true;
        await this.load();
      }
    });
    grist.on('message', (msg) => {
      // GristSectionAdapter won't know its tableName and tableOps because we're not sending grist.ready(). So we have to gather these manually.
      if (!this.adapter.tableName && msg.tableId) {
        this.adapter.tableName = msg.tableId;
        this.adapter.tableOps = grist.getTable(msg.tableId);
      }
    });
  }
  get #areMappingsReady() {
    return Boolean(this.adapter.mappings);
  }
  get eContentWindow() { return this.eContentFrame.contentWindow; }
  get eContentDocument() { return this.eContentFrame.contentWindow.document; }
  get config() {
    if (!this.#config) {
      this.#config = { ...this.defaultConfig, ...this.userConfig };
    }
    return this.#config;
  };
  async initRPCMiddleware () {
    await grist.rpc.sendReadyMessage();
    grist.rpc.registerFunc('editOptions', () => {});
    /*await this.init();*/
    window.addEventListener('message', (msg) => {
      //if (!this.eContentFrame) { return; }
      if (msg.source === this.eContentWindow) {
        if (msg.data?.iface === 'CustomSectionAPI' && msg.data?.meth === 'configure') {
          msg.data.args ??= [{}];
          this.#contentGristReadyDeclaration = structuredClone(msg.data.args[0]);
          msg.data.args[0].requiredAccess ??= this.adapter.readyPayload.requiredAccess;
          msg.data.args[0].columns = [ ...(msg.data.args[0].columns || []), ...this.adapter.readyPayload.columns ];
        }
        window.parent.postMessage(msg.data, '*');
      } else if (msg.source === window.parent) {
        this.eContentWindow.postMessage(msg.data, '*');
      }
    });
  }
  #onContentFrameLoaded() {
    if (!this.#isContentFrameReady) { return; }  // Ignore the 'onload' event from the initial 'about:blank' iframe.
    console.error("onContentFrameLoaded",this);
    const jsContent = this.adapter.getCursorField('playground_js');
    if (this.config.importGristThemeCSSVars) {
      this.eContentDocument.head.appendChild(
        this.eContentDocument.importNode(document.querySelector('style#grist-theme'), true)
      );
    }
    if (this.config.jsPrelude) {
      const eJsPrelude = this.eContentDocument.createElement('script');
      eJsPrelude.type = 'module';
      eJsPrelude.async = false;
      eJsPrelude.defer = false;
      eJsPrelude.appendChild(this.eContentDocument.createTextNode(this.config.jsPrelude));
      this.eContentDocument.head.appendChild(eJsPrelude);
    }
    if (this.config.htmlPrelude) {
      this.eContentDocument.body.insertAdjacentHTML('afterbegin', this.config.htmlPrelude);
    }
    if (jsContent) {
      const eGristPluginApiScript = this.eContentDocument.createElement('script');
      eGristPluginApiScript.src = 'https://docs.getgrist.com/grist-plugin-api.js';
      eGristPluginApiScript.async = false;
      eGristPluginApiScript.defer = false;
      this.eContentDocument.head.appendChild(eGristPluginApiScript);
      const eCustomScript = this.eContentDocument.createElement('script');
      eCustomScript.type = 'module';
      eCustomScript.async = false;
      eCustomScript.defer = false;
      eCustomScript.appendChild(this.eContentDocument.createTextNode(jsContent));
      this.eContentDocument.head.appendChild(eCustomScript);
    }
  }
  async load () {
    this.eStatus.innerText = 'Loading...';
    if (!this.#wasLoadStarted) { return; }
    if (!this.#areMappingsReady) {
      /*
        The behaviour of sectionApi.configure() differs depending on whether any columns are already mapped.
        a) If there aren't (i.e. if we're on a clean slate), Grist will simply stop sending messages until the user has created a mapping; then proceed to send an 'onRecords' with mappingsChanged = true.
        b) If there are, but not all required columns are mapped, Grist will show the "Please map columns" page; then once the user has created all necessary mappings, the widget will reload completely.
      */
      await grist.sectionApi.configure(this.adapter.readyPayload);
      return;
    }
    this.eStatus.style.display = 'none';
    console.error("load!");
    await this.applyConfig();
    this.eConfigOpenBtn.style.display = this.adapter.hasMapping('playground_config') ? 'block' : 'none';
    this.eReloadBtn.style.display = this.config.enableAutoreload ? 'none' : 'block';
    this.#isContentFrameReady = true;
    const htmlContent = this.adapter.getCursorField('playground_html');
    if (htmlContent) {
      this.eContentFrame.srcdoc = htmlContent;
    } else {
      this.eContentFrame.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>';
    }
  }
  async clearConfig() {
    if (!this.adapter.tableName) { return; }
    if (this.adapter.hasMapping('playground_config')) {
                                                                                    this.adapter.skipMessage('onRecord');
                                                                                    this.adapter.skipMessage('onRecords');
                                                                                    await this.adapter.writeCursorField('playground_config', '{}');
    }
  }
  async #onConfigItemChanged (eConfigItem) {
    const configKey = eConfigItem.id.slice(7);
    let value = eConfigItem.value;
    if (eConfigItem.tagName.toLowerCase() === 'sl-checkbox') {
      value = eConfigItem.checked;
    } else if (eConfigItem.type === 'number') {
      value = isNaN(eConfigItem.valueAsNumber) ? 0 : eConfigItem.valueAsNumber;
    }
    if (eConfigItem.classList.contains('configParseAsJSON')) {
      value = Util.jsonDecode(value, null) || undefined;
    }
    if (this.adapter.hasMapping('playground_config') && this.adapter.tableName) {
      this.userConfig[configKey] = value;
      this.#config = null;
                                                                                    this.adapter.skipMessage('onRecord');
                                                                                    this.adapter.skipMessage('onRecords');
                                                                                    await this.adapter.writeCursorField('playground_config', Util.jsonEncode(this.userConfig, '{}'));
    }
    ///await grist.setOption(configKey, value);
  }
  async #getConfigElements () {
    const elems = [];
    for (const [configKey, configValue] of Object.entries(this.config)) {
      ///const storedValue = await grist.getOption(configKey);
      const storedValue = configKey in this.userConfig ? this.userConfig[configKey] : this.defaultConfig[configKey];
      const eInput = this.eConfigPanel.querySelector(`sl-input#config_${configKey}`);
      const eCheckbox = this.eConfigPanel.querySelector(`sl-checkbox#config_${configKey}`);
      const eTextarea = this.eConfigPanel.querySelector(`sl-textarea#config_${configKey}`);
      if (!eInput && !eCheckbox && !eTextarea) { continue; }
      elems.push({
        elem: eInput || eCheckbox || eTextarea,
        elemType: eInput ? 'input' : eCheckbox ? 'checkbox' : eTextarea ? 'textarea' : 'unknown',
        elemValue: (eInput || eCheckbox || eTextarea).value,
        storedValue: storedValue,
        configKey: configKey,
        configValue: configValue,
      });
    }
    return elems;
  }
  async openConfigPanel () {
    this.eConfigPanel.show();
    for (const {elem, elemType, elemValue, storedValue, configKey, configValue} of await this.#getConfigElements()) {
      if (elemType == 'input' || elemType == 'textarea') {
        if (elem.classList.contains('configParseAsJSON')) {
          const emptyJson = ['""', 'undefined', 'null', '{}'];
          elem.placeholder = Util.jsonEncode(configValue);
          elem.placeholder = !elem.placeholder || emptyJson.includes(elem.placeholder) ? '' : elem.placeholder;
          elem.value = Util.jsonEncode(storedValue);
          elem.value = !elem.value || emptyJson.includes(elem.value) ? '' : elem.value;
        } else {
          elem.placeholder = configValue;
          elem.value = storedValue || '';
        }
      } else if (elemType == 'checkbox') {
        elem.value = configValue;
        elem.checked = typeof storedValue === 'undefined' ? configValue : storedValue;
      }
    }
  }
  async applyConfig () {
    if (this.adapter.hasMapping('playground_config')) {
      this.userConfig = Util.jsonDecode(this.adapter.getCursorField('playground_config'), {});
      this.#config = null;
    }
  }
}

Util.onDOMReady(() => {
  const gristPlayground = new GristPlayground();
});
