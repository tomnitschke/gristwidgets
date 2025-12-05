import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';


const Config = {
  enableAutoreload: true,
  importGristThemeCSSVars: true,
  jsPrelude: '',    ///TODO
  htmlPrelude: '',  ///TODO
}


class GristSandbox {
  #readyMessageTimeoutHandler;
  #contentGristReadyDeclaration;
  constructor (config=null) {
    this.config = {
      ...Config,
      ...config,
    };
    this.widget = new GristWidget('GristSandbox', {
      requiredAccess: 'read table',
      columns: [
        { name: 'sandbox_html', title: 'HTML', type: 'Text', optional: true },
        { name: 'sandbox_js', title: 'JS', type: 'Text', optional: true },
      ],
    }, true, false);
    this.debug = this.widget.logger.debug.bind(this.widget.logger); this.err = this.widget.logger.err.bind(this.widget.logger);
    this.widget.addEventListener('ready', () => this.load(this.widget.cursor.current));
                                //grist.on('message',(msg) => { console.info("GRIST MSG",msg); });
    this.widget.addEventListener('cursorMoved', () => this.load(this.widget.cursor.current));
    this.widget.addEventListener('recordsModified', () => { this.load(this.widget.cursor.current) });
    this.widget.addEventListener('optionsEditorOpened', async () => await this.openConfigPanel());
    this.widget.addEventListener('optionsChanged', (evt) => this.applyConfig(evt.options));
    this.#readyMessageTimeoutHandler = undefined;
    this.#contentGristReadyDeclaration = {};
    this.eContentFrame = null;
    this.eConfigPanel = document.querySelector('#config');
    this.eConfigResetBtn = document.querySelector('#configResetBtn');
    this.init();
  }
  get eContentWindow() { return this.eContentFrame?.contentWindow ?? null; }
  get eContentDocument() { return this.eContentFrame?.contentWindow?.document ?? null; }
  async init () {
    await grist.rpc.sendReadyMessage();
    grist.rpc.registerFunc('editOptions', () => {});
    window.addEventListener('message', (msg) => {
      if (!this.eContentFrame) { return; }
      if (msg.source === this.eContentWindow) {
        if (msg.data?.iface === 'CustomSectionAPI' && msg.data?.meth === 'configure') {
          msg.data.args ??= [{}];
          this.#contentGristReadyDeclaration = structuredClone(msg.data.args[0]);
          msg.data.args[0].requiredAccess ??= 'read table';
          msg.data.args[0].columns = [ ...(msg.data.args[0].columns || []), ...this.widget.gristOptions.columns ];
          clearTimeout(this.#readyMessageTimeoutHandler);
        }
        window.parent.postMessage(msg.data, '*');
      } else if (msg.source === window.parent) {
        this.eContentWindow.postMessage(msg.data, '*');
      }
    });
    this.#readyMessageTimeoutHandler = setTimeout(async () => {
      await grist.sectionApi.configure(this.widget.gristOptions);
      this.widget.colMappings.current = await grist.sectionApi.mappings();
      this.load(this.widget.cursor.current);
    }, 1000);
  }
  load (record) {
    this.eLoadingOverlay.show();
    try {
      if (this.eContentFrame) {
        this.eContentFrame.remove();
      }
      if (record) {
        this.eContentFrame = document.createElement('iframe');
        this.eContentFrame.id = 'content';
        this.eContentFrame.addEventListener('load', () => {
          const htmlContent = record[this.widget.colMappings.current?.sandbox_html];
          const jsContent = record[this.widget.colMappings.current?.sandbox_js];
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
        });
        document.body.appendChild(this.eContentFrame);
      }
    } finally { this.eLoadingOverlay.hide(); }
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
    this.debug("save config item", configKey, eConfigItem, value);
    await grist.setOption(configKey, value);
  }
  async #getConfigElements () {
    const elems = [];
    for (const [configKey, configValue] of Object.entries(this.config)) {
      const storedValue = await grist.getOption(configKey);
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
  applyConfig (configToApply) {
    this.config = {
      ...this.config,
      ...configToApply,
    };
    this.debug("applied config",this.config);      
  }
}

Util.onDOMReady(() => {
  const gristSandbox = new GristSandbox();
});
