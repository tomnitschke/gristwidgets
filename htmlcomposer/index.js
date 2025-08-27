function onDOMready(fn) {
  if (document.readyState !== "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

State = {
  currentRecord: null,
  currentRecordMapped: null,
  colMapping: null,
}

onDOMready(() => {
  grist.ready({
    requiredAccess: 'read table',
    columns: [
      {name: 'html', title: 'HTML', type: 'Text', strictType: true},
      {name: 'js', title: 'JS', type: 'Text', strictType: true, optional: true},
      {name: 'css', title: 'CSS', type: 'Text', strictType: true, optional: true},
    ],
  });
  
  grist.onRecord(async (record, colMapping) => {
    //console.log(record, colMapping);
    if (!record || !record.id || !colMapping) {
      State.currentRecord = null;
      State.currentRecordMapped = null;
      State.colMapping = null;
      return;
    }
    if (record.id == State.currentRecord?.id) {
      return;
    }
    State.currentRecord = record;
    State.currentRecordMapped = grist.mapColumnNames(record);
    State.colMapping = colMapping;
    try {
      let body = document.body;
      body.innerHTML = '';
      if (State.currentRecordMapped?.css) {
        document.getElementById('customcss').appendChild(document.createRange().createContextualFragment(State.currentRecordMapped.css));
      }
      body.appendChild(document.createRange().createContextualFragment(State.currentRecordMapped.html));
      if (State.currentRecordMapped?.js) {
        const scriptElem = document.createElement('script');
        scriptElem.async = false;
        scriptElem.innerHTML = State.currentRecordMapped.js;
        body.appendChild(scriptElem);
      }
    } catch (error) {
      console.error(error);
      body.innerHTML = error;
    }
  });
});
