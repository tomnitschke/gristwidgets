'use strict';

import { GristWidget, Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
import MonacoLoader from 'https://esm.sh/@monaco-editor/loader@1.6.1';



/*****************************************************************************************************/
Config = {
  autosaveTimeoutMs: 500,
  defaultCodeLang: 'javascript',
}


/*****************************************************************************************************/
class GristMonaco {
  constructor (config=null) {
    this.widget = new GristWidget('GristMonaco', {
      requiredAccess: 'full',
      columns: [
        { name: 'content', title: 'Content', type: 'Text', strictType: true },
        { name: 'codeLang', optional: true, title: 'Code Language', type: 'Text', description: `Used for syntax highlighting and autocomplete. For available languages, see  Defaults to '${this.config.defaultCodeLang}'` },
      ],
    }, true);
    this.debug = this.widget.logger.debug.bind(this.widget.logger);
    this.config = {
      ...Config,
      ...config,
    };
    this.api = null;
    this.editor = null;
    this.editorModel = null;
    this.eContainer = document.querySelector('#monaco');
    this.widget.addEventListener('ready', async (evt) => { await this.init(); await this.load(evt.cursor?.[evt.colMappings.content]); });
    this.widget.addEventListener('cursorMoved', async (evt) => await this.load(evt.cursor?.[evt.colMappings.content]));
    this.widget.addEventListener('widgetHidden', async (evt) => await this.widget.runScheduledRecordOperationsNow());
  }
  async init () {
    this.debug("init");
    this.api = await MonacoLoader.init();
    this.editor = this.api.editor.create(this.eContainer, {
      model: this.editorModel,
      automaticLayout: true,
      fontSize: '13px',
      wordWrap: 'off',
      lineNumbers: 'on',
      folding: true,
    });
    this.editor.onDidChangeModelContent(this.onDidChangeModelContent.bind(this));
    this.debug("monaco loaded:",this.editor,this.api.languages.getLanguages());
    this.#setEditorContent();
  }
  async load (content) {
    this.debug("load",content);
    this.#setEditorContent(content);
  }
  #onDidChangeModelContent (evt) {
    this.widget.scheduleWriteRecord({
      [this.widget.colMappings.current.content]: this.editorModel.getValue(),
    }, this.config.autosaveTimeoutMs);
  }
  #setEditorContent (content=undefined, codeLang=undefined, modelOptions=null) {
    this.editorModel = this.api.editor.createModel(content || '', codeLang || this.config.defaultCodeLang);
    this.editor.setModel(this.editorModel);
    this.editorModel.updateOptions({ tabSize: 3, ...modelOptions });
  }
}


/*****************************************************************************************************/
Util.onDOMReady(() => {
  const gristMonaco = new GristMonaco();
});
