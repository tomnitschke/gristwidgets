'use strict';

import { GristWidget, Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import MonacoLoader from 'https://esm.sh/@monaco-editor/loader@1.6.1';



/*****************************************************************************************************/
const Config = {
  autosaveDelayMs: 500,
  defaultCodeLang: 'javascript',
  tabSize: 3,
  enableCodeFolding: true,
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
        { name: 'columnRecord', optional: true, title: 'Column Record', type: 'Any', strictType: true, description: `Grist column record (from table '_grist_Tables_column'). If provided, the editor operates on this column's formula rather than the mapped 'Content' column.` },
        { name: 'codeLang', optional: true, title: 'Language', type: 'Text', description: `Used for syntax highlighting and autocompletions on the currently loaded content. Defaults to '${this.config.defaultCodeLang}' if not mapped.` },
      ],
    }, true);
    this.debug = this.widget.logger.debug.bind(this.widget.logger);
    this.eContainer = document.querySelector('#monaco'); this.eConfigPanel = document.querySelector('#config');
    this.widget.addEventListener('ready', async (evt) => { await this.init(); await this.load(evt.cursor?.[evt.colMappings.content]); });
    this.widget.addEventListener('cursorMoved', async (evt) => await this.load(evt.cursor?.[evt.colMappings.content]));
    this.widget.addEventListener('optionsEditorOpened', async (evt) => await this.openConfigPanel());
  }
  async init () {
    this.api = await MonacoLoader.init();
    this.editor = this.api.editor.create(this.eContainer, {
      model: this.editorModel,
      automaticLayout: true,
      fontSize: '13px',
      wordWrap: 'off',
      lineNumbers: 'on',
      folding: this.config.enableCodeFolding,
    });
    this.editor.onDidChangeModelContent(this.#onDidChangeModelContent.bind(this));
    this.debug("monaco loaded:",this.editor,this.api.languages.getLanguages());
  }
  async load (content) {
    this.debug("load",content);
    this.#setEditorContent(content);
  }
  async openConfigPanel () {
    this.eConfigPanel.show();
    for (const [configKey, configValue] of Object.entries(this.config)) {
      const eInput = this.eConfigPanel.querySelector(`sl-input#config.${configKey}`);
      const storedValue = await grist.getOption(configKey);
      this.debug("getting stored option",configKey,storedValue);
      if (eInput) {
        eInput.placeholder = configValue;
        eInput.value = storedValue || '';
      }
      const eCheckbox = this.eConfigPanel.querySelector(`sl-checkbox#config.${configKey}`);
      if (eCheckbox) {
        eCheckbox.value = configValue.toString();
        eCheckbox.checked = typeof storedValue === 'undefined' ? configValue : storedValue;
      }
    }
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
