import { Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/util.mjs';
import { GristSectionAdapter } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/grist-section-adapter.js';

import mermaid from "https://esm.sh/mermaid@11.15.0";
mermaid.initialize({ startOnLoad: false });

class GristMermaid {
    constructor() {
        this.eGraphStagingArea = document.querySelector("#graphStagingArea");
        this.eGraphOutput = document.querySelector("#graph")
        this.currentDiagram = undefined;
        this.section = new GristSectionAdapter({
            requiredAccess: "read table",
            columns: [
                { name: "graphDefinition", type: "Text", strictType: true, title: "Graph Definition" },
            ]
        });
        this.section.onInit(async () => await this.load());
        this.section.onCursorMoved(async () => await this.load());
    }
    async load() {
        this.currentDiagram = await mermaid.render("graphStagingArea", this.section.getCursorField("graphDefinition"));
        this.eGraphOutput.innerHTML = this.currentDiagram.svg;
    }
}

Util.onDOMReady(async () => {
    const gristMermaid = new GristMermaid();
});
