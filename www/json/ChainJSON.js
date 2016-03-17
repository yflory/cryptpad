define(['/api/config?cb=' + Math.random().toString(16).substring(2),
        '/common/netflux.js',
        '/common/json-ot.js',
        '/common/sharejs_textarea.js',
        'chainpad.js',
        'jquery.min.js'], function(Config, Netflux, JsonOT, sharejs) {
  var ChainPad = window.ChainPad;
  var $ = window.$;
  
  var applyChange = function(ctx, oldval, newval) {
    // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
    if (oldval === newval) {
        return;
    }

    var commonStart = 0;
    while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
        commonStart++;
    }

    var commonEnd = 0;
    while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
        commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
        commonEnd++;
    }

    var bugz = {
        commonStart:commonStart,
        commonEnd:commonEnd,
        oldvalLength: oldval.length,
        newvalLength: newval.length
    };
    if (oldval.length !== commonStart + commonEnd) {
        if (ctx.localChange) { ctx.localChange(true); }
        ctx.remove(commonStart, oldval.length - commonStart - commonEnd);
    }
    if (newval.length !== commonStart + commonEnd) {
        if (ctx.localChange) { ctx.localChange(true); }
        ctx.insert(commonStart, newval.slice(commonStart, newval.length - commonEnd));
    }
  };



  var register = function(obj) {
    return new Promise(function(resolve, reject) {
          var $textarea = $('#synced');
          var stringJSON = JSON.stringify(obj);
          var channel = 'testjson';
          var options = {
            key: channel
          };
          options.signaling = 'ws://localhost:3001/cryptpad_websocket';
          options.topology = 'StarTopologyService';
          options.protocol = 'WebSocketProtocolService';
          options.connector = 'WebSocketService';
          options.openWebChannel = true;
          
          var realtime;

          var onJoining = () => {};
          var onLeaving = () => {};
          var onMessage = (peer, msg, p) => {
            console.log(msg);
            var passLen = msg.substring(0,msg.indexOf(':'));
            var message = msg.substring(passLen.length+1 + Number(passLen));
            realtime.message(message);
            console.log('onMessage');
            console.log(realtime.getUserDoc());
            obj = JSON.parse(realtime.getUserDoc());
            stringJSON = JSON.stringify(obj);
            for (var attrname in obj) { if(p[attrname] != obj[attrname]) p[attrname] = obj[attrname]; }
            console.log(realtime.getUserDoc());
            $textarea.val(stringJSON);
          };
          var onPeerMessage = () => {};
          
          var createRealtime = function() {
              return ChainPad.create('Yann'+Math.floor((Math.random() * 100) + 1),
                                    'y',
                                    channel,
                                    stringJSON,
                                    {
                                    transformFunction: JsonOT.validate
                                    });
          };
          console.log(options);
          // Connect to the WebSocket/WebRTC channel
          Netflux.join(channel, options).then(function(wc) {
            
              // bindAllEvents(textarea, doc, onEvent, false);
              var p = new Proxy(obj, {
                  set: function(target, prop, value, receiver) {
                    target[prop] = value;
                    obj = target;
                    if(JSON.stringify(target) !== JSON.parse(realtime.getUserDoc())) {
                      var newValue = JSON.stringify(target);
                      console.log(target);
                      console.log(receiver);
                      console.log(obj);
                      applyChange(realtime, stringJSON, newValue);
                      console.log("called: " + prop + " = " + value);
                    }
                    else {
                      console.log('synced');
                    }
                    return true;
                  }
              });
              console.log(p);
              wc.onmessage = function(peer, msg) { // On receiving message
                  console.log('onmessage');
                  console.log(p);
                  onMessage(peer, msg, p);
              };
              wc.onLeaving = onLeaving;
              wc.onJoining = onJoining;
              wc.onPeerMessage = onPeerMessage;
              console.log('jined');

              // Open a Chainpad session
              realtime = createRealtime();

              // On sending message
              realtime.onMessage(function(message) {
                  // Prevent Chainpad from sending authentication messages since it is handled by Netflux
                  // message = chainpadAdapter.msgOut(message, wc);
                  if(message) {
                    wc.send(message).then(function() {});
                  }
              });
              

              realtime.start();
              resolve(p);
          }, function(error) {
              reject(error);
          });
    });

  }

  return {
    register: register,
    onChange: function(handler) {
      handler();
    }
  };
});