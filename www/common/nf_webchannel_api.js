define(['/common/crypto.js'], function (Crypto) {
	var module = { exports: {} };
  var rt;
  var ws;
  var userName;
  var warn, cryptKey;
	
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
  
  var onSendMessage = module.exports.onSendMessage = function(callback) {
		rt.onMessage(callback);
	}
  
  var send = module.exports.send = function(message) {
    message = Crypto.encrypt(message, cryptKey);
        try {
            ws.send(message);
        } catch (e) {
            warn(e);
        }
  }

  var init = module.exports.init = function(realtime, socket, user, key, warnFct) {
    rt = module.exports.realtime = realtime;
    ws = socket;
    userName = user;
    cryptKey = key;
    warn = warnFct;
  }

  return module.exports;
});