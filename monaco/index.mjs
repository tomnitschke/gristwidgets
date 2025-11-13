'use strict';

import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { GristDBAdapter } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/dbadapter.mjs';
import MonacoLoader from 'https://esm.sh/@monaco-editor/loader@1.6.1';



/*****************************************************************************************************/
const Config = {
  enableAutosave: true,
  enableAutosaveForFormulas: false,
  autosaveDelayMs: 500,
  autosaveDelayMsForFormulas: 500,
  defaultCodeLang: 'javascript',
  tabSize: 3,
  enableCodeFolding: true,
  fontSize: 13,
  enableCodeFolding: true,
  enableWordWrap: true,
  enableMinimap: false,
  additionalMonacoConfig: {},
  enableAutoIndent: true,
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
        { name: 'isReadonly', title: 'Readonly', type: 'Bool', optional: true, description: `Boolean to indicate whether the editor should act as a readonly viewer for the currently loaded content.` },
        { name: 'additionMonacoConfigForRecord', title: 'Additional Monaco Config', type: 'Text', optional: true, description: `Optional config options for Monaco editor, as a JSON string. Options given here override those given in the widget config, if any. For available options, see https://microsoft.github.io/monaco-editor/docs.html#interfaces/editor.IStandaloneEditorConstructionOptions.html` },
      ],
    }, true);
    this.debug = this.widget.logger.debug.bind(this.widget.logger); this.err = this.widget.logger.err.bind(this.widget.logger);
    this.isColumnMode = false; this.columnToWorkOn = null;
    this.db = new GristDBAdapter();
    this.eContainer = document.querySelector('#monaco'); this.eConfigPanel = document.querySelector('#config'); this.eConfigResetBtn = document.querySelector('#configResetBtn');
    this.eLoadingOverlay = document.querySelector('#loadingOverlay'); this.eSaveBtn = document.querySelector('#saveBtn');
    for (const eConfigItem of document.querySelectorAll('.configItem')) {
      eConfigItem.addEventListener('sl-input', async (evt) => await this.#onConfigItemChanged(evt.target));
    }
    this.eConfigResetBtn.addEventListener('click', async () => { await grist.setOptions({}); this.openConfigPanel() });
    this.eLoadingOverlay.addEventListener('sl-initial-focus', (evt) => evt.preventDefault());
    this.eSaveBtn.addEventListener('click', () => this.save());
    this.widget.addEventListener('ready', async (evt) => { this.applyConfig(evt.options); await this.init(); await this.load(); });
    this.widget.addEventListener('cursorMoved', async (evt) => await this.load());
    this.widget.addEventListener('optionsEditorOpened', async () => await this.openConfigPanel());
    this.widget.addEventListener('optionsChanged', (evt) => this.applyConfig(evt.options));
  }
  async init () {
    this.api = await MonacoLoader.init();
    this.api.languages.typescript.javascriptDefaults.addExtraLib(window.definition, 'plugin.d.ts');
    this.api.languages.typescript.javascriptDefaults.addExtraLib(
      `
      import * as Grist from "grist"
      declare global {
        interface Window {
          var grist: typeof Grist;
        }
      }
      export {}
      `,
      'main.d.ts');
    this.editor = this.api.editor.create(this.eContainer, {
      model: this.editorModel,
      automaticLayout: true,
      fontSize: `${this.config.fontSize}px`,
      wordWrap: this.config.enableWordWrap ? 'on' : 'off',
      lineNumbers: 'on',
      folding: this.config.enableCodeFolding,
      minimap: { enabled: this.config.enableMinimap },
      autoIndent: this.config.enableAutoIndent ? 'advanced' : 'none',
      ...this.config.additionalMonacoConfig,
      ...(this.widget.cursor.current[this.widget.colMappings.current.additionMonacoConfigForRecord] || null),
    });
    this.editor.onDidChangeModelContent(this.#onDidChangeModelContent.bind(this));
    //this.debug("monaco loaded:",this.editor,this.api.languages.getLanguages());
  }
  async load () {
    this.eLoadingOverlay.show();
    try {
      this.isColumnMode = this.widget.isColMapped('columnRecord');
      if (this.isColumnMode) {
        this.#setEditorContent(undefined, undefined, null, {readOnly: true});
        const content = this.widget.cursor.current[this.widget.colMappings.current.columnRecord];
        await this.db.init();
        try {
          this.columnToWorkOn = this.db.getColumnById(content.rowId || content);
        } catch (error) { this.err(`Cannot find column with meta record id '${content.rowId || content}'. Editor is now in readonly mode.`); }
        this.debug("load: formula from column",this.columnToWorkOn,":",this.columnToWorkOn.colRec.formula);
        this.#setEditorContent(this.columnToWorkOn.colRec.formula, 'python');
      } else {
        const content = this.widget.cursor.current[this.widget.colMappings.current.content];
        this.debug("load",content);
        this.#setEditorContent(content);
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
  #onDidChangeModelContent (evt) {
    if (this.isColumnMode) {
      if (!this.config.enableAutosaveForFormulas) { this.#toggleSaveBtn(true); }
      else { this.save(); }
    } else {
      if (!this.config.enableAutosave) { this.#toggleSaveBtn(true); }
      else { this.save(); }
    }
  }
  save () {
    if (this.isColumnMode) {
      this.widget.scheduleRecordOperation(async () => {
        await this.columnToWorkOn.write({ formula: this.editorModel.getValue() });
      }, this.config.autosaveDelayMsForFormulas);
    } else {
      this.widget.scheduleWriteRecord({
        [this.widget.colMappings.current.content]: this.editorModel.getValue(),
      }, this.config.autosaveDelayMs);
    }
    this.#toggleSaveBtn(false);
  }
  #toggleSaveBtn (shouldShow) {
    this.eSaveBtn.style.display = shouldShow ? 'block' : 'none';
  }
  #setEditorContent (content=undefined, codeLang=undefined, modelOptions=null, editorOptions=null) {
    codeLang = codeLang || this.widget.cursor.current?.[this.widget.colMappings.current.codeLang] || this.config.defaultCodeLang;
    const isReadonly = Boolean(this.widget.cursor.current?.[this.widget.colMappings.current.isReadonly]);
    this.editorModel = this.api.editor.createModel(content || '', codeLang);
    this.editor.setModel(this.editorModel);
    this.editorModel.updateOptions({ tabSize: this.config.tabSize, readOnly: isReadonly, ...modelOptions });
    this.editor.updateOptions({ readOnly: isReadonly, ...editorOptions });
  }
}


/*****************************************************************************************************/
Util.onDOMReady(() => {
  const gristMonaco = new GristMonaco();
});
