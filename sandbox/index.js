import { Util } from '../sanegrist/util.mjs';
//import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import { GristSectionAdapter } from '../sanegrist/grist-section-adapter.js';


const Config = {
  enableAutoreload: true,
  importGristThemeCSSVars: true,
  jsPrelude: '',    ///TODO
  htmlPrelude: '',  ///TODO
}


class GristSandbox {
  #readyMessageTimeoutHandle;
  #contentGristReadyDeclaration;
  #config;
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
        { name: 'sandbox_html', title: 'HTML', type: 'Text', optional: true },
        { name: 'sandbox_js', title: 'JS', type: 'Text', optional: true },
        { name: 'sandbox_config', title: 'Config JSON', type: 'Text', strictType: true, optional: true },
      ],
    }, false);
    this.adapter.onInitOrCursorMoved(() => { this.load(); });
    this.adapter.onRecordsModified(() => {
      if (this.config.enableAutoreload) {
        this.load();
      }
    });
    this.#readyMessageTimeoutHandle = undefined;
    this.#contentGristReadyDeclaration = {};
    this.#config = null;
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
    await grist.rpc.sendReadyMessage();
    grist.rpc.registerFunc('editOptions', () => {});
    this.#readyMessageTimeoutHandle = setTimeout(async () => {
      await grist.sectionApi.configure(this.adapter.readyPayload);
      this.adapter.mappings = await grist.sectionApi.mappings();
      await this.init();
      this.load();
    }, 30000);
  }
  async init () {
    this.adapter._forceDispatchInitEvent();
    await this.applyConfig();
    if (this.adapter.hasMapping('sandbox_config')) {
      this.eConfigOpenBtn.style.display =  'initial';
    } else {
      this.eConfigOpenBtn.style.display =  'none';
    }
  }
  #onContentFrameLoaded() {
    /*const htmlContent = this.adapter.getRecordField(record, 'sandbox_html');
    if (htmlContent) {
      this.eContentDocument.documentElement.innerHTML = htmlContent;
    }*/
    if (!this.adapter.isInited) { return; }
    const jsContent = this.adapter.getCursorField('sandbox_js');
    if (this.config.importGristThemeCSSVars && jsContent) {
      this.eContentDocument.body.appendChild(
        this.eContentDocument.importNode(document.querySelector('style#grist-theme'), true)
      );
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
  load () {
    const htmlContent = this.adapter.getCursorField('sandbox_html');
    if (htmlContent) {
      this.eContentFrame.srcdoc = htmlContent;
    } else {
      this.eContentFrame.srcdoc = '<!DOCTYPE html><html><head></head><body></body></html>';
    }
    //this.eContentFrame.remove();
    //if (record) {
      //this.eContentFrame = document.createElement('iframe');
      //this.eContentFrame.id = 'content';
      /*this.eContentFrame.addEventListener('load', () => {
        const htmlContent = this.adapter.getRecordField(record, 'sandbox_html');
        const jsContent = this.adapter.getRecordField(record, 'sandbox_js');
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
        if (htmlContent) {
          this.eContentDocument.documentElement.innerHTML = htmlContent;
        }
        if (this.config.importGristThemeCSSVars && (jsContent || htmlContent)) {
          this.eContentDocument.body.appendChild(
            this.eContentDocument.importNode(document.querySelector('style#grist-theme'), true)
          );
        }
      });*/
      //document.body.appendChild(this.eContentFrame);
    //}
  }
  async clearConfig() {
    if(this.adapter.hasMapping('sandbox_config')) {
                                                                                    this.adapter.skipMessage('onRecord');
                                                                                    this.adapter.skipMessage('onRecords');
                                                                                    await this.adapter.writeCursorField('sandbox_config', '{}');
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
                                                                                    await this.adapter.writeCursorField('sandbox_config', Util.jsonEncode(this.userConfig, '{}'));
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
    if (this.adapter.hasMapping('sandbox_config')) {
      this.userConfig = Util.jsonDecode(this.adapter.getCursorField('sandbox_config'), {});
      this.#config = null;
    }
  }
}

Util.onDOMReady(() => {
  const gristSandbox = new GristSandbox();
});
