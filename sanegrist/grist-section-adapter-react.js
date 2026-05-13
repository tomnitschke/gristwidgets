/* Usage:
In your HTML head, use an importmap like this:

<script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.3.1",        //GristSectionAdapterReact is currently tested with React 18.3.1 but any more recent version should work. Older ones, too, probably.
        "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",    //This is not strictly needed. But if you do need it (for your own component or whatever), make sure the version is in sync with React's!
        "grist-section-adapter": "https://tomnitschke.github.io/gristwidgets/sanegrist/grist-section-adapter-react.js",
      }
    }
</script>

Then for your react component, do this:

import { GristSectionAdapterReact } from "grist-section-adapter";
function MyReactComponent() {
    const gristSectionState = useGristSection({    // This makes you component re-render whenever an event (e.g. "onCursorMoved") is fired by the section adapter.
        requiredAccess: "read table",    //or "full"
        columns: []    //your Grist column mappings, see the Grist docs: https://support.getgrist.com/code/modules/grist_plugin_api/#columnstomap
    });
    console.log(gristSectionState);
    //gristSectionState now holds the current state of the GristSectionAdapter. You can
    //query gristSectionState.tableName, gristSection.cursor, and so on (see https://github.com/tomnitschke/gristwidgets/blob/main/sanegrist/grist-section-adapter.js),
    //and additionally gristSectionState.isInited (becomes true once the section adapter's "onInit" event has fired)
    //as well as gristSectionState.latestEvent (which holds the event that was last emitted from the section adapter, causing the most recent state update).

    //Finally, render your component (we're using htm[*] here instead of JSX because we don't want any stupid build steps!):
    return html`
        <pre>${JSON.stringify(gristSectionState, undefined, 2)}</pre>
    `;

    //[*] Here's how to set up htm, quick and dirty:
    //import htm from 'https://esm.sh/htm?deps=react@18.3.1,react-dom@18.3.1';    //You could import this using the importmap, too, of course. But either way, make sure to keep these version numbers in sync with React's, above!
    //const html = htm.bind(React.createElement);
}
*/

import React from "react";

import { GristSectionAdapter } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/grist-section-adapter.js';

class GristSectionAdapterReactBridge {
    constructor(...args) {
        this.sectionAdapter = new GristSectionAdapter(...args);
        this.listeners = new Set();
        this.state = this._makeState({
            "isInited": false,
            "latestEvent": null,
        });
        this.sectionAdapter.onInit((evt) => this._onStateChange({ latestEvent: evt, isInited: true }));
        this.sectionAdapter.onMappingsUpdated((evt) => this._onStateChange({ latestEvent: evt}));
        this.sectionAdapter.onCursorMoved((evt) => this._onStateChange({ latestEvent: evt}));
        this.sectionAdapter.onCursorMovedToNew((evt) => this._onStateChange({ latestEvent: evt}));
        this.sectionAdapter.onRecordsModified((evt) => this._onStateChange({ latestEvent: evt}));
        this.sectionAdapter.onOptionsUpdated((evt) => this._onStateChange({ latestEvent: evt}));
        this.sectionAdapter.onInteractionOptionsUpdated((evt) => this._onStateChange({ latestEvent: evt}));
        this.sectionAdapter.onOptionsEditorRequested((evt) => this._onStateChange({ latestEvent: evt}));
        this.subscribe = this._subscribe.bind(this);
        this.getSnapshot = this._getSnapshot.bind(this);
    }
    _makeState(overrides) {
        return {
            tableName: this.sectionAdapter.tableName,
            cursor: this.sectionAdapter.cursor,
            ...overrides,
        }
    }
    _onStateChange(overrides) {
        this.state = this._makeState(overrides);
        for (const reactListener of this.listeners) {
            reactListener();
        }
    }
    _subscribe(reactListener) {
        this.listeners.add(reactListener);
        return () => this.listeners.delete(reactListener);
    }
    _getSnapshot() {
        return this.state;
    }
}

export function useGristSection(config = {}) {
    const [gristSectionAdapterReactBridge] = React.useState(() => new GristSectionAdapterReactBridge({  //NB we're using useState() merely to ensure react runs this stuff exactly once and then keeps it. The result is not really a "state".
        requiredAccess: config.requiredAccess ?? undefined,
        columns: config.columns ?? undefined,
    }));
    const xGristSectionState = React.useSyncExternalStore(gristSectionAdapterReactBridge.subscribe, gristSectionAdapterReactBridge.getSnapshot);
    return xGristSectionState;
}
