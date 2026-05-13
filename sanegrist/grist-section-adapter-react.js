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
