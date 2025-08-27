window.monacoLoaded = false;
window.colMapping = null;
window.currentRecord = null;
window.lastWriteBack = new Date();

grist.ready({
  requiredAccess: 'full',
  columns: [
    {name: 'code', title: 'Code', type: 'Text', strictType: true},
  ]
});
grist.onNewRecord(async (colMapping) => {
  if (!editor || !colMapping) return;
  editor.updateOptions({ readOnly: true });
  editor.setModel(monaco.editor.createModel('', 'python'));
  window.currentRecord = null;
});
grist.onRecord(async (record, colMapping) => {
    if (!colMapping) return;
    if (!window.monacoLoaded) {
        await loadMonaco();
        buildEditor();
        window.monacoLoaded = true;
    }
    editor?.updateOptions({ readOnly: false })
    window.colMapping = colMapping;
    //console.log('editor:', window.editor);
    //console.log('currentRecord:', record, 'VS CURRENT:', window.currentRecord);
    if (record.id == window.currentRecord?.id) {
      //console.log('IS CURRENT');
      return;
    }
    window.currentRecord = record;
    model = monaco.editor.createModel(record[window.colMapping.code], 'python');
    model.onDidChangeContent(async () => { await commitChanges(false); });
    editor.setModel(model);
});

async function commitChanges(doItImmediately) {
  if (!window.currentRecord) return;
  let now = new Date();
  //console.log('now:', now, 'last:', window.lastWriteBack, 'timediff:', now - window.lastWriteBack);
  if (doItImmediately || (now - window.lastWriteBack > 3000)) {
    await grist.getTable().update({ id: window.currentRecord.id, fields: {[window.colMapping.code]: window.editor.getModel().getValue()} });
    window.lastWriteBack = now;
  }
}

async function loadMonaco() {
  // Load all those scripts above.
  async function loadJs(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  async function loadCss(url) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  await loadCss(
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs/editor/editor.main.min.css'
  );
  await loadJs(
    'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs/loader.min.js'
  );

  window.require.config({
    paths: {
      vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs',
    },
  });

  await new Promise((resolve, reject) => {
    window.require(
      ['vs/editor/editor.main.nls', 'vs/editor/editor.main'],
      resolve,
      reject
    );
  });
}

function buildEditor() {
  if (window.editor) {
    return;
  }
  let model = monaco.editor.createModel('', 'python');
  // Replace script tag with a div that will be used as a container for monaco editor.
  const container = document.getElementById('container');
  // Create JS monaco model - like a tab in the IDE.
  // Create IDE. Options here are only for styling and making editor look like a
  // code snippet.
  const editor = monaco.editor.create(container, {
    model: model,
    automaticLayout: true,
    fontSize: '13px',
    wordWrap: 'on',
    minimap: {
      enabled: false,
    },
    lineNumbers: 'off',
    glyphMargin: false,
    folding: false,
  });
  // Set tabSize - this can be done only after editor is created.
  editor.getModel().updateOptions({ tabSize: 2 });
  // Disable scrolling past the last line - we will expand editor if necessary.
  editor.updateOptions({ scrollBeyondLastLine: false });
  editor.onDidBlurEditorText(async () => await commitChanges(true));
  window.editor = editor;
}
