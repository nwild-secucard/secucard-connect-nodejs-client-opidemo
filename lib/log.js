function Log(debugEnabled) {
  this.debugEnabled = debugEnabled;
};

Log.prototype.debug = function(message, body) {
  if (this.debugEnabled) {
    console.log("DEBUG :: " + message, body || '');
  }
};

Log.prototype.info = function(message, body) {
    console.log("INFO :: " + message, body || '');
};

Log.prototype.warn = function(message, body) {
  console.log("WARN :: " + message, body || '');
};

Log.prototype.error = function(message, body, die) {
  console.log("ERROR :: " + message, body || '');
  if (die) {
    process.exit(1);
  }
};

Log.prototype.die = function(message) {
  this.error(message, true);
};

module.exports = Log;
