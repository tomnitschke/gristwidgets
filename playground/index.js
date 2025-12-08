import { Util } from '../sanegrist/util.mjs';
//import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import { GristSectionAdapter } from '../sanegrist/grist-section-adapter.js';


const Config = {
  enableAutoreload: true,
  importGristThemeCSSVars: true,
  jsPrelude: '',    ///TODO
  htmlPrelude: '',  ///TODO
}


class GristPlayground {
  #readyMessageTimeoutHandle;
  #contentGristReadyDeclaration;
  #config;
  #isInited;
  constructor (config=null) {
    this.defaultConfig = {
      ...Config,
      ...config,
    };
    this.userConfig = {};
    this.eContentFrame = document.querySelector('#content');
    this.eContentFrame.addEventListener('load', this.#onContentFrameLoaded.bind(this));
    this.eConfigPanel = document.querySelector('#config');
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
        { name: 'playground_html', title: 'HTML', type: 'Text', optional: true },
        { name: 'playground_js', title: 'JS', type: 'Text', optional: true },
        { name: 'playground_config', title: 'Config JSON', type: 'Text', strictType: true, optional: true },
      ],
    }, {
      doSendReadyMessage: false,
      disableInitEvent: true
    });
    /*this.adapter.onInitOrCursorMoved(() => {
      console.error("onInitOrCursorMoved",this);
      this.load();
    });*/
    this.adapter.onRecordsModified(() => {
      console.error("onRecordsModified",this);
      if (this.config.enableAutoreload) {
        this.load();
      }
    });
    grist.onRecord(async (record) => {
      console.error("grist.onRecord",record,"adapter state:",this.adapter);
    });
    this.#readyMessageTimeoutHandle = undefined;
    this.#contentGristReadyDeclaration = {};
    this.#config = null;
    this.#isInited = false;
    this.initRPCMiddleware();
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
          msg.data.args[0].requiredAccess ??= 'read table';
          msg.data.args[0].columns = [ ...(msg.data.args[0].columns || []), ...this.adapter.readyPayload.columns ];
          clearTimeout(this.#readyMessageTimeoutHandle);
        }
        window.parent.postMessage(msg.data, '*');
      } else if (msg.source === window.parent) {
        this.eContentWindow.postMessage(msg.data, '*');
      }
    });
    this.#readyMessageTimeoutHandle = setTimeout(async () => {
      await grist.sectionApi.configure(this.adapter.readyPayload);
      console.error("forced sectionApi.configure() invocation because user code didn't do it. Current state:",this,"Current mappings:",this.adapter.mappings,"fetching mappings:",await grist.sectionApi.mappings());
      await this.load();
    }, 10000);
    this.#isInited = true;
  }
  /*async init () {
    this.adapter.mappings = await grist.sectionApi.mappings();
    //this.adapter._forceDispatchInitEvent();
  }*/
  #onContentFrameLoaded() {
    if (!this.#isInited) { return; }
    const jsContent = this.adapter.getCursorField('playground_js');
    if (this.config.importGristThemeCSSVars && jsContent) {
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
    console.error("load!",this);
    await this.applyConfig();
    if (this.adapter.hasMapping('playground_config')) {
      this.eConfigOpenBtn.style.display =  'initial';
    } else {
      this.eConfigOpenBtn.style.display =  'none';
    }
    const htmlContent = this.adapter.getCursorField('playground_html');
    if (htmlContent) {
      this.eContentFrame.srcdoc = htmlContent;
    } else {
      this.eContentFrame.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>';
    }
  }
  async clearConfig() {
    if(this.adapter.hasMapping('playground_config')) {
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
    if (this.adapter.hasMapping('sandbox_config')) {
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
      const storedValue = this.userConfig[configKey];
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
