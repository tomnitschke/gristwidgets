import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';


class GristHTMLFrame {
  constructor () {
    this.widget = new GristWidget('GristHTMLFrame', {
      requiredAccess: 'read table',
      columns: [
        { name: 'html', title: 'HTML', type: 'Text', optional: true },
        { name: 'js', title: 'JS', type: 'Text', optional: true },
      ],
    }, true);
    this.debug = this.widget.logger.debug.bind(this.widget.logger); this.err = this.widget.logger.err.bind(this.widget.logger);
    this.widget.addEventListener('ready', () => this.load(this.widget.cursor.current));
    this.widget.addEventListener('cursorMoved', () => this.load(this.widget.cursor.current));
    this.widget.addEventListener('recordsModified', () => { this.load(this.widget.cursor.current) });
    window.onerror = (event, source, lineno, colno, error) => {
      error.message = error.message.replace(/Failed to execute 'appendChild'.+?:\s*/, '');
      this.err("Error in js fetched from Grist record:", error);
      return true;
    }
    this.eContentFrame = document.querySelector('#content');
    this.eContentDocument = this.eContentFrame.contentWindow.document;
    grist.rpc.sendReadyMessage();
    grist.rpc.registerFunc('editOptions', () => {});
    window.addEventListener('message', (msg) => {
      if (msg.source === this.eContentFrame.contentWindow && msg.data?.iface === 'CustomSectionAPI' && msg.data?.meth === 'configure') {
        this.debug("MSG:",msg);
        msg.data.args ??= [{}];
        msg.data.args[0].hasCustomOptions = true;
      }
      window.parent.postMessage(e.data, '*');
    });
  }
  load (record) {
    if (this.widget.isColMapped('html')) {
      this.eContentDocument.body.innerHTML = record[this.widget.colMappings.current.html];
    }
    if (this.widget.isColMapped('js')) {
      this.eContentFrame.contentWindow.grist = grist;
      /*const eScript = this.eContentDocument.createElement('script');
      eScript.src = 'https://docs.getgrist.com/grist-plugin-api.js';
      eScript.defer = false;
      eScript.async = false;
      this.eContentDocument.body.appendChild(eScript);*/
      const eScript2 = this.eContentDocument.createElement('script');
      eScript2.type = 'module';
      eScript2.innerHTML = record[this.widget.colMappings.current.js];
      this.eContentDocument.body.appendChild(eScript2);
    }
  }
}
Util.onDOMReady(() => {
  const gristHtmlFrame = new GristHTMLFrame();
});
