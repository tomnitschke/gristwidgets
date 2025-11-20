import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { GristWidget } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';


class GristSandbox {
  #readyMessageTimeoutHandler;
  #contentGristReadyDeclaration;
  constructor () {
    this.widget = new GristWidget('GristSandbox', {
      requiredAccess: 'read table',
      columns: [
        { name: 'sandbox_html', title: 'HTML', type: 'Text', optional: true },
        { name: 'sandbox_js', title: 'JS', type: 'Text', optional: true },
      ],
    }, true, false);
    this.debug = this.widget.logger.debug.bind(this.widget.logger); this.err = this.widget.logger.err.bind(this.widget.logger);
    this.widget.addEventListener('ready', () => this.load(this.widget.cursor.current));
                                grist.on('message',(msg) => { console.info("GRIST MSG",msg); });
    this.widget.addEventListener('cursorMoved', () => this.load(this.widget.cursor.current));
    this.widget.addEventListener('recordsModified', () => { this.load(this.widget.cursor.current) });
    this.eContentFrame = document.querySelector('#content');
    this.eContentDocument = this.eContentFrame.contentWindow.document;
    this.#readyMessageTimeoutHandler = undefined;
    this.#contentGristReadyDeclaration = {};
    this.init();
  }
  async init () {
    await grist.rpc.sendReadyMessage();
    grist.rpc.registerFunc('editOptions', () => {});
    window.addEventListener('message', (msg) => {
      if (msg.source === this.eContentFrame.contentWindow) {
        if (msg.data?.iface === 'CustomSectionAPI' && msg.data?.meth === 'configure') {
          msg.data.args ??= [{}];
          this.#contentGristReadyDeclaration = structuredClone(msg.data.args[0]);
          msg.data.args[0].requiredAccess ??= 'read table';
          msg.data.args[0].columns = [ ...(msg.data.args[0].columns || []), ...this.widget.gristOptions.columns ];
          clearTimeout(this.#readyMessageTimeoutHandler);
        }
        window.parent.postMessage(msg.data, '*');
      } else if (msg.source === window.parent) {
        this.eContentFrame.contentWindow.postMessage(msg.data, '*');
      }
    });
    this.#readyMessageTimeoutHandler = setTimeout(async () => {
      await grist.sectionApi.configure(this.widget.gristOptions);
      this.widget.colMappings.current = await grist.sectionApi.mappings();
      this.load(this.widget.cursor.current);
    }, 1000);
  }
  load (record) {
    this.eContentFrame.src = 'javascript:void(0);';
    this.eContentDocument.body.innerHTML = '';
    const htmlContent = record[this.widget.colMappings.current.sandbox_html];
    if (htmlContent) {
      this.eContentDocument.body.innerHTML = htmlContent;
    }
    const jsContent = record[this.widget.colMappings.current.sandbox_js];
    if (jsContent) {
      const eGristPluginApiScript = this.eContentDocument.createElement('script');
      eGristPluginApiScript.async = true;
      eGristPluginApiScript.onerror = (error) => {
        this.err("Error loading Grist plugin API:", error);
      };
      eGristPluginApiScript.onload = () => {
        const eCustomScript = this.eContentDocument.createElement('script');
        eCustomScript.type = 'module';
        eCustomScript.innerHTML = jsContent;
        this.eContentDocument.body.appendChild(eCustomScript);
      };
      eGristPluginApiScript.src = 'https://docs.getgrist.com/grist-plugin-api.js';
      //eGristPluginApiScript.defer = false;
      //eGristPluginApiScript.async = false;
      this.eContentDocument.body.appendChild(eGristPluginApiScript);
    }
  }
}

Util.onDOMReady(() => {
  const gristSandbox = new GristSandbox();
});
