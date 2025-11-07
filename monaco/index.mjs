'use strict';

import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import MonacoLoader from 'https://esm.sh/@monaco-editor/loader@1.6.1';



/*****************************************************************************************************/
const Config = {
  autosaveDelayMs: 500,
  defaultCodeLang: 'javascript',
  tabSize: 3,
  enableCodeFolding: true,
  fontSize: 13,
  enableCodeFolding: true,
  enableWordWrap: true,
}


/*****************************************************************************************************/
class GristMonaco {
  constructor (config=null) {
    this.config = {
      ...Config,
      ...config,
    };
    this.api = null;
    this.editor = null;
    this.editorModel = null;
    this.widget = new GristWidget('GristMonaco', {
      requiredAccess: 'full',
      columns: [
        { name: 'content', title: 'Content', type: 'Text', strictType: true },
        { name: 'columnRecord', title: 'Column Record', type: 'Any', strictType: true, optional: true, description: `Grist column record (from table '_grist_Tables_column'). If provided, the editor operates on this column's formula rather than the mapped 'Content' column.` },
        { name: 'codeLang', title: 'Language', type: 'Text', optional: true, description: `Used for syntax highlighting and autocompletions on the currently loaded content. Defaults to '${this.config.defaultCodeLang}' if not mapped.` },
        { name: 'monacoConfig', title: 'Additional Monaco Config', type: 'Text', optional: true, description: `Optional config options for Monaco editor, as a JSON string. For available options, see https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor.IStandaloneEditorConstructionOptions.html` },
      ],
    }, true);
    this.debug = this.widget.logger.debug.bind(this.widget.logger);
    this.eContainer = document.querySelector('#monaco'); this.eConfigPanel = document.querySelector('#config'); this.eConfigResetBtn = document.querySelector('#configResetBtn');
    for (const eConfigItem of document.querySelectorAll('.configItem')) {
      eConfigItem.addEventListener('sl-input', async (evt) => await this.#onConfigItemChanged(evt.target));
    }
    this.eConfigResetBtn.addEventListener('click', async () => { await grist.setOptions({}); this.openConfigPanel() });
    this.widget.addEventListener('ready', async (evt) => { await this.init(); await this.loadContent(); });
    this.widget.addEventListener('cursorMoved', async (evt) => await this.loadContent());
    this.widget.addEventListener('optionsEditorOpened', async () => await this.openConfigPanel());
    this.widget.addEventListener('optionsChanged', (evt) => this.applyConfig(evt.options));
  }
  async init () {
    this.api = await MonacoLoader.init();
    this.editor = this.api.editor.create(this.eContainer, {
      model: this.editorModel,
      automaticLayout: true,
      fontSize: `${this.config.fontSize}px`,
      wordWrap: this.config.enableWordWrap ? 'on' : 'off',
      lineNumbers: 'on',
      folding: this.config.enableCodeFolding,
      ...(this.widget.cursor.current[this.widget.colMappings.current.monacoConfig] || null),
    });
    this.editor.onDidChangeModelContent(this.#onDidChangeModelContent.bind(this));
    this.debug("monaco loaded:",this.editor,this.api.languages.getLanguages());
  }
  async loadContent () {
    const isColumnMode = Boolean(this.widget.colMappings.current.columnRecord);
    if (isColumnMode) {
      ///TODO
      return;
    }
    const content = this.widget.cursor.current[this.widget.colMappings.current.content];
    this.debug("loadContent",content);
    this.#setEditorContent(content);
  }
  async #onConfigItemChanged (eConfigItem) {
    const configKey = eConfigItem.id.slice(7);
    let value = eConfigItem.value;
    if (eConfigItem.tagName.toLowerCase() === 'sl-checkbox') { value = eConfigItem.checked; }
    else if (eConfigItem.type === 'number') { value = isNaN(eConfigItem.valueAsNumber) ? 0 : eConfigItem.valueAsNumber; }
    this.debug("save config item", configKey, eConfigItem, value);
    await grist.setOption(configKey, value);
  }
  async #getConfigElements () {
    const elems = [];
    for (const [configKey, configValue] of Object.entries(this.config)) {
      const storedValue = await grist.getOption(configKey);
      const eInput = this.eConfigPanel.querySelector(`sl-input#config_${configKey}`);
      const eCheckbox = this.eConfigPanel.querySelector(`sl-checkbox#config_${configKey}`);
      if (!eInput && !eCheckbox) { continue; }
      elems.push({
        elem: eInput || eCheckbox,
        elemType: eInput ? 'input' : eCheckbox ? 'checkbox' : 'unknown',
        elemValue: (eInput || eCheckbox).value,
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
      if (elemType == 'input') {
        elem.placeholder = configValue;
        elem.value = storedValue || '';
      }
      if (elemType == 'checkbox') {
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
  #onDidChangeModelContent (evt) {
    this.widget.scheduleWriteRecord({
      [this.widget.colMappings.current.content]: this.editorModel.getValue(),
    }, this.config.autosaveDelayMs);
  }
  #setEditorContent (content=undefined, codeLang=undefined, modelOptions=null) {
    codeLang = codeLang || this.widget.cursor.current?.[this.widget.colMappings.current.codeLang] || this.config.defaultCodeLang;
    this.editorModel = this.api.editor.createModel(content || '', codeLang);
    this.editor.setModel(this.editorModel);
    this.editorModel.updateOptions({ tabSize: this.config.tabSize, ...modelOptions });
  }
}


/*****************************************************************************************************/
Util.onDOMReady(() => {
  const gristMonaco = new GristMonaco();
});
