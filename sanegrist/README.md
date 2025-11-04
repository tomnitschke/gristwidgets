# SaneGrist - A Wrapper for the Grist Plugin API That Respects Your Sanity
Grist is an awesome tool but it's often rough around the edges. Its [plugin API](https://support.getgrist.com/code/modules/grist_plugin_api/) in particular, while loaded with features and possibilities, has become fairly chaotic and confusing to use. This wrapper intends to provide a cleaner version of it to plugin developers.

This is in its early stages and as such, isn't exactly loaded with features just yet. However, if you've ever tried to write a Grist plugin, you know how tricky it can be to handle Grist's RPC events correctly. SaneGrist can already help with that!

## Usage
You'll need to write your plugin as an [ECMA module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules), i.e. do `<script type="module" src="yourAwesomePlugin.mjs"></script>`.
Then in your JS code, simply import what you need from `https://tomnitschke.github.io/gristwidgets/sanegrist/...`. Typically, you'll probably want this:
```js
import { GristWidget, Util } from 'https://tomnitschke.github.io/gristwidgets/sanegrist/gristwidget.mjs';  // GristWidget is what makes it all happen, Util is there because it provides a nice onDOMReady function for us, see below.
```
Now you're ready to create your plugin:
```js
class MyGristPlugin {               // Name it whatever you like, obviously.
  constructor () {
    const gristOptions = {            // Object to pass to grist.ready() -- see https://support.getgrist.com/code/interfaces/grist_plugin_api.ReadyPayload/
      requiredAccess: 'read table',   // may be undefined, 'read table', or 'full'
      columns: [
        // ...                        // Grist column mappings go here, see https://support.getgrist.com/code/modules/grist_plugin_api/#columnstomap
      ],
    };
    this.gristWidget = new GristWidget('My Grist Plugin', gristOptions);  // Make an instance of SaneGrist's GristWidget class, pass a widget name and grist options object to it. Optionally pass true as a third argument to enable verbose logging.
    this.gristWidget.addEventListener('ready', (records, cursor, colMappings) => {
      // ...                        // Subscribe to GristWidget's events. See below for available events and what they do!
    });
  }
}

Util.onDOMReady(() => {
  const plugin = new MyGristPlugin();
});
```

## Available Events
### `ready`
This event fires on first load of your plugin (again any time the user refreshes/revisits the page, but only ever once per visit).  
Subscribed event handlers will receive a GristWidget.ReadyEvent with the following properties:
- `records`: All records of the linked Grist table, as an Array of record objects (records always look like: `{ columName: value, ... }`). Note that due to Grist's idiosyncrasies, records may not contain all available columns but just those that are visible in the linked view.
- `cursor`: The record object that's currently selected in the linked view.
- `colMappings`: An object mapping your column definitions to the actual column names: `{ yourColDef: actualColName }`. See https://support.getgrist.com/code/modules/grist_plugin_api/#columnstomap
### `recordsModified`
Fires whenever any record data was modified in Grist (either through user interaction or because some formula was triggered).
Note that this uses just a very basic comparison algorithm to detect modifications for now. This is subject to further improvement in the future.  
Subscribed event handlers will receive a GristWidget.RecordsModifiedEvent with the following properties:
- `prevRecords`: The list of records of the linked Grist table as they were before the modification happened.
- `records`: The current list of records, after the modification.
- `colMappings`: The current column mappings (see explanation above).
- `delta`: An object describing the differences between the current and the previous list of records. For details, see the return value of `getRecordsDelta` below.
### `cursorMoved`
The user changed the currently selected record in the linked view (i.e., mostly: They clicked on another table row).
Unlike Grist's 'onRecord' event, this is guaranteed to fire exactly once per such user interaction, and only if the interaction ended up with a different record being selected than before. It also won't fire when the plugin is first loaded, as that's what the 'ready' event (see above) is for.  
Subscribed event handlers will receive a GristWidget.CursorMovedEvent with the following properties:
- `prevCursor`: The previously selected record.
- `cursor`: The currently selected record.
- `colMappings`: The current column mappings (see explanation above).
### `cursorMovedToNew`
The user selected the special 'new record' row.
Like 'cursorMoved', above, this will only fire once per each situation where the special 'new record' row was selected subsequently to another record having been selected previously.  
Subscribed event handlers will receive a GristWidget.CursorMovedToNewEvent with the following properties:
- `prevCursor`: The previously selected record.
- `colMappings`: The current column mappings (see explanation above).
### `colMappingsChanged`
This event fires whenever any column mapping for the widget was changed.  
Subscribed event handlers will receive a GristWidget.ColMappingsChangedEvent with the following properties:
- `prevColMappings`: The previous column mappings, before the change.
- `colMappings`: The current column mappings (see explanation above).
### `optionsEditorOpened`
The user clicked on Grist's widget configuration button.  
Subscribed event handlers will receive a GristWidget.OptionsEditorOpenedEvent with the following properties:
- `prevOptions`: The widget options from before the last time they were changed. Widget options are simply key-value pairs `{ optionName: optionValue, ... }`. It will always include the key `interactionOptions` with a value of https://support.getgrist.com/code/interfaces/grist_plugin_api.InteractionOptions/.
- `options`: The current widget options.
### `optionsChanged`
Fires when the widget options get modified by `setOption()` or `setOptions()`, below.  
Subscribed event handlers will receive a GristWidget.OptionsChanged with the following properties:
- `prevOptions`: See `optionsEditorOpened` event, above.
- `options`: See `optionsEditorOpened` event, above.

## Methods of GristWidget
### `getRecordsDelta (prevRecords, currentRecords)`
Computes a delta object describing the differences between the two sets of records.  
Parameters:
- `prevRecords`: Array of record objects (`{ colName: value }`) from a previous state
- `currentRecords`: As above, but for the current state
Returns:
- `delta`: An object describing the differences: `{ added: { recordId: recordDelta, ... }, changed: { ... }, removed: { ... } }`, where each `recordDelta` is itself a delta object describing the changes made to the respective record: `{ added: { colName: value, ... }, changed: { ... }, removed: { ... } }`.
