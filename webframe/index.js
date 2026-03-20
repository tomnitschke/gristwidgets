import { Util } from '../sanegrist/util.mjs';
import { GristSectionAdapter } from '../sanegrist/grist-section-adapter.js';


const Config = {
  url: undefined,
  html: undefined,
};


class GristWebframe {
  constructor (config=null) {
    this.config = {
      ...Config,
      ...config,
    };
    this.eContentFrame = document.querySelector('#content');
    this.eConfigPanel = document.querySelector('#config');
      this.eConfigPanel.addEventListener('sl-hide', () => {
        window.location.reload();
      });
    this.eConfigResetBtn = document.querySelector('#configResetBtn');
    this.eConfigResetBtn.addEventListener('click', async () => {
        await grist.setOptions({});
        await this.openConfigPanel();
    });
    for (const eConfigItem of document.querySelectorAll('.configItem')) {
      eConfigItem.addEventListener('sl-input', async (evt) => await this.#onConfigItemChanged(evt.target));
    }
    this.currentURL = undefined;
    this.adapter = new GristSectionAdapter({
      requiredAccess: 'read table',
      columns: [
        { name: 'url', title: 'URL', type: 'Text', optional: true },
        { name: 'html', title: 'Static HTML', type: 'Text', optional: true },
      ],
    });
    this.adapter.onInit(() => {
      this.applyConfig(this.adapter.options);
      this.load();
    });
    this.adapter.onCursorMoved(() => {
      this.load();
    });
    this.adapter.onRecordsModified(() => {
      this.load();
    });
    this.adapter.onCursorMovedToNew(() => {
      this.clear();
    });
    this.adapter.onOptionsEditorRequested(async () => {
        await this.openConfigPanel();
    });
    this.adapter.onOptionsUpdated(async () => {
        this.applyConfig(this.adapter.options);
    });
    this.load();
  }
  
  async load () {
    if (this.config.url) {
      if (this.config.url !== this.currentURL) {
        this.currentURL = this.config.url;
        this.eContentFrame.src = this.config.url;
      }
    } else if (this.adapter.hasMapping("url")) {
      const url = this.adapter.getCursorField("url");
      if (url !== this.currentURL) {
        this.currentURL = url;
        this.eContentFrame.src = url;
      }
    } else if (this.config.html) {
      this.eContentFrame.srcdoc = this.config.html;
    }
  }
  
  async clear () {
    if (!this.config.url && !this.config.html) {
      this.currentURL = undefined;
      this.eContentFrame.src = "about:blank";
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
  
  applyConfig(configToApply) {
    this.config = {
        ...this.config,
        ...configToApply,
    };
  }
}

Util.onDOMReady(() => {
  const gristWebframe = new GristWebframe();
});
