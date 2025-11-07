'use strict';


export const Util = {
  onDOMReady: function (fn) { if (document.readyState !== "loading") { fn(); } else { document.addEventListener("DOMContentLoaded", fn); } },
  jsonDecode: function (str, defaultVal=undefined) { try { return JSON.parse(str); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } },
  jsonEncode: function(obj, defaultVal=undefined) { try{ return JSON.stringify(obj); } catch (error) { if (typeof defaultVal === 'undefined') { throw error; } else { return defaultVal; } } },
  dictsDelta: function (dictA, dictB) {
    dictA = dictA || {}; dictB = dictB || {};
    const delta = { get hasAnyChanges () { return Boolean(Object.keys(this.added).length || Object.keys(this.changed).length || Object.keys(this.removed).length); }, added: [], changed: [], removed: [] };
    for (const [key, value] of Object.entries(dictA)) {
      if (!(key in dictB)) { delta.removed.push({[key]: value}); continue; }
      if (Array.isArray(value)) {
        if (!Array.isArray(dictB[key])) { delta.changed.push({[key]: value}); continue; }
        if (value.length !== dictB[key].length) { delta.changed.push({[key]: value}); continue; }
        if (value.some((val, idx) => val !== dictB[key][idx])) { delta.changed.push({[key]: value}); continue; }
      }
      if (dictB[key] !== value) { delta.changed.push({[key]: value}); continue; }
    }
    for (const [key, value] of Object.entries(dictB)) {
      if (!(key in dictA)) { delta.added.push({[key]: value}); continue; }
    }
    return delta;
  },
  areDictsEqual: function (dictA, dictB) {
    dictA = dictA || {}; dictB = dictB || {};
    for (const [key, value] of Object.entries(dictA)) {
      if (!(key in dictB)) { return false; }
      if (Array.isArray(value)) {
        if (!Array.isArray(dictB[key])) { return false; }
        if (value.length !== dictB[key].length) { return false; }
        if (value.some((val, idx) => val !== dictB[key][idx])) { return false; }
      }
      if (dictB[key] !== value) { return false; }
    }
    for (const [key, value] of Object.entries(dictB)) {
      if (!(key in dictA)) { return false; }
    }
    return true;
  }
};


/********************************************************************************************************************************************/
export class Logger {
  constructor (prefix, isDebugMode=false) { this.prefix = prefix; this.isDebugMode = isDebugMode; }
  debug (...messages) { if (this.isDebugMode) { console.debug(this.prefix, ...messages); } }
  msg (...messages) { console.log(this.prefix, ...messages); }
  warn (...messages) { console.warn(this.prefix, ...messages); }
  err (...messages) { console.error(this.prefix, ...messages); }
}
