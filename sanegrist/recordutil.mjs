'use strict';


class Delta {
  constructor (added=undefined, changed=undefined, removed=undefined) { Object.assign(this, { added: added || {}, changed: changed || {}, removed: removed || {} }); }
  get hasAnyChanges () { return Boolean(Object.keys(this.added).length || Object.keys(this.changed).length || Object.keys(this.removed).length); }
}


export const RecordUtil = {
  compareRecords (recordA, recordB) {
    recordA = recordA || {}; recordB = recordB || {};
    const delta = new Delta();
    for (const [key, value] of Object.entries(recordA)) {
      if (!(key in recordB)) { delta.removed.push({[key]: value}); continue; }
      if (Array.isArray(value)) {
        if (!Array.isArray(recordB[key])) { delta.changed.push({[key]: value}); continue; }
        if (value.length !== recordB[key].length) { delta.changed.push({[key]: value}); continue; }
        if (value.some((val, idx) => val !== recordB[key][idx])) { delta.changed.push({[key]: value}); continue; }
      }
      if (recordB[key] !== value) { delta.changed.push({[key]: value}); continue; }
    }
    for (const [key, value] of Object.entries(recordB)) {
      if (!(key in recordA)) { delta.added.push({[key]: value}); continue; }
    }
    return delta;
  }
  compareRecordLists (recordsListA, recordsListB) {
    const delta = new Delta();
    for (const recordFromB of recordsListB) {
      const recordFromA = recordsListA.find((rec) => rec.id === recordFromB.id);
      if (!recordFromA) { delta.added[recordFromB.id] = { added: {...recordFromB}, changed: {}, removed: {} }; continue; }
      const fieldsDelta = RecordUtil.compareRecords(recordFromA, recordFromB);
      if (fieldsDelta.hasAnyChanges) { delta.changed[recordFromB.id] = fieldsDelta; continue; }
    }
    for (const recordFromA of recordsListA) {
      const recordFromB = recordsListB.find((rec) => rec.id === recordFromA.id);
      if (!recordFromB) { delta.removed[recordFromA.id] = { added: {}, changed: {}, removed: {...recordFromA} }; continue; }
    }
    return delta;
  }
}
