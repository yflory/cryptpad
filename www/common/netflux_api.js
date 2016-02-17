define(['/common/nf_webchannel_api.js'], function (WebChannel) {
	var module = { exports: {} };
  var userName;
  var ws;
  var wc;
  var initializing = true;
  var passwd = 'y';
  var textVal;
  var transformFunction;
  var warn, cryptKey;
	
	var onLeaving = module.exports.onLeaving = function() {

	}
  
  var onJoining = module.exports.onJoining = function() {
    
	}
  
  var onMessage = module.exports.onMessage = function() {
		
	}
  
  var onPeerMessage = module.exports.onPeerMessage = function() {
		
	}

  var onInvite = module.exports.onInvite = function() {
		
	}

  var join = module.exports.join = function(channel) {
    console.log('debut');
    console.log(userName);
    console.log(passwd);
    console.log(textVal);
    console.log(channel);
    console.log(transformFunction);
      var rt = ChainPad.create(userName,
                      passwd,
                      channel,
                      textVal,
                      transformFunction);
                      console.log('created');
    return {
      then : function(callback) {
        ws.realtime = rt;
        wc = WebChannel
        wc.init(rt, ws, userName, cryptKey, warn);
        callback(wc);
      }
    }
  }

  var init = module.exports.init = function(socket, user, key, warnFct) {
    ws = module.exports.socket = socket;
    userName = user;
    cryptKey = key;
    warn = warnFct;
  }
  
  var update = module.exports.update = function(textareaVal, transformFct) {
    textVal = textareaVal;
    transformFunction = transformFct;
  }

  return module.exports;

});