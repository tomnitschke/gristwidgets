/***
Tom's Grist Library (Togl)
***/

const Togl = {
  init: function(options) {},
  onDOMReady: function(callback) {},
  setStatus: function(message) {},
  handleError: function(error) {},
  onRecordSelected: function(record, isFirstTime) {},
};

Togl.init = function(options) {
  //TODO
}

Togl.onDOMReady = function(callback) {
  if (document.readyState !== 'loading') return callback();
  document.addEventListener('DOMContentLoaded', callback);
}

Togl.setStatus = function(message) {
  //TODO
}

Togl.handleError = function(error) {
  //TODO
}

Togl.onRecordSelected = function(record, isFirstTime) {
  //TODO
}

export default Togl
