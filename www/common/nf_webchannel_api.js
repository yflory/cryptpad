define(function () {
	var module = { exports: {} };
  var rt;
  var ws;
  var userName;
  var warn;
  var initializing = true;
	
	var onLeaving = module.exports.onLeaving = function() {
		
	}
  
  var onJoining = module.exports.onJoining = function(callback) {
    rt.onUserListChange(callback);
  }
  
  var leave = module.exports.leave = function() {
    rt.abort();
    try { ws._socket.close(); } catch (e) { warn(e); }
  }
  
  var onMessage = module.exports.onMessage = function(callback) {
    ws.onMessage.push(callback);
	}
  
  
  var send = module.exports.send = function(message) {
        try {
            ws.send(message);
        } catch (e) {
            warn(e);
        }
  }

  var create = module.exports.create = function(realtime, socket, user, warnFct) {
    rt = module.exports.realtime = realtime;
    ws = socket;
    userName = user;
    warn = warnFct;
  }

  return module.exports;
});