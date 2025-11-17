import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';


class GristHTMLFrame {
  constructor () {
    /*this.widget = new GristWidget('GristHTMLFrame', {
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
    */
    //window.onerror = (event, source, lineno, colno, error) => {
      //error.message = error.message.replace(/Failed to execute 'appendChild'.+?:\s*/, '');
      //this.err("Error in js fetched from Grist record:", error);
      //return true;
    //}
                                                  this.debug = (...args) => { console.info(...args); };
    this.eContentFrame = document.querySelector('#content');
    this.eContentDocument = this.eContentFrame.contentWindow.document;
    //this.eContentFrame.contentWindow.grist = grist;
    grist.rpc.sendReadyMessage();
    try {
      grist.rpc.registerFunc('editOptions', () => {});
    } catch {}
    window.addEventListener('message', (msg) => {
      if (msg.source === this.eContentFrame.contentWindow) {
        if (msg.data?.iface === 'CustomSectionAPI' && msg.data?.meth === 'configure') {
          this.debug("MSG:",msg);
          msg.data.args ??= [{}];
          msg.data.args[0].hasCustomOptions = true;
        }
        window.parent.postMessage(msg.data, '*');
      } else if (msg.source === window.parent) {
        this.eContentFrame.contentWindow.postMessage(msg.data, '*');
      }
    });
    setTimeout(() => {
      this.eContentDocument.body.innerHTML = `
  <html>
  <head>
    <style>
      html, body { margin:0; padding:0; }
      #datagrid { border:solid 10px red; box-sizing:border-box; }
    </style>
  </head>
  <body>
    <div id="datagrid"></div>
  </body>
  </html>
        `;
      const eScript = this.eContentDocument.createElement('script');
      eScript.src = 'https://docs.getgrist.com/grist-plugin-api.js';
      eScript.defer = false;
      eScript.async = false;
      eScript.addEventListener('load', () => { this.debug("SCHKRIPT LOHTET",this.eContentFrame.contentWindow); });
      this.eContentDocument.body.appendChild(eScript);
      const eScript2 = this.eContentDocument.createElement('script');
      eScript2.type = 'module';
      eScript2.innerHTML = `
  import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';
  import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs'
  import canvasDatagrid from 'https://esm.sh/canvas-datagrid@0.4.7/?dev';
  
  class GristCanvasGrid {
      constructor (eContainer) {
          this.eContainer = eContainer;
          this.widget = new GristWidget('GristCanvasGrid', {
              requiredAccess: 'full',
              allowSelectBy: true,
              columns: [
              ],
          }, true);
          this.debug = this.widget.logger.debug.bind(this.widget.logger);
          this.debug(window);//
          this.msg = this.widget.logger.msg.bind(this.widget.logger);
          this.err = this.widget.logger.err.bind(this.widget.logger);
          this.widget.addEventListener('cursorMoved', (evt) => console.log("cursorMoved",evt));
          this.widget.addEventListener('cursorMovedToNew', (evt) => console.log("cursorMovedToNew",evt));
          this.widget.addEventListener('ready', (readyEvent) => {
              this.debug("INIT");
              this.grid = canvasDatagrid();
              this.eContainer.innerHTML = '';
              this.eContainer.appendChild(this.grid);
              this.grid.data = [
                  { col1: 'row 1 column 1', col2: 'row 1 column 2', col3: 'row 1 column 3' },
                  { col1: 'row 2 column 1', col2: 'row 2 column 2', col3: 'row 2 column 3' },
              ];
          });
      }
  }
  
  Util.onDOMReady(() => {
      const gristCanvasGrid = new GristCanvasGrid(document.querySelector('#datagrid'));
  });
        `;
      this.eContentDocument.body.appendChild(eScript2);
    }, 2000);
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
