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

  var onReady = function() {};
  var onChange = function(oldObj, newObj) {};

  var getCollaborativeObject = function(config) {
    var p = new Proxy({}, {
        set: function(target, prop, value, receiver) {
          onChange(p[prop], value);
          target[prop] = value;
          if(JSON.stringify(target) !== JSON.parse(realtime.getUserDoc())) {
            var newValue = JSON.stringify(target);
            applyChange(realtime, stringJSON, newValue);
            console.log("called: " + prop + " = " + value);
          }
          else {
            console.log('Synced : do not create an empty patch');
          }
          return true;
        }
    });
    var $textarea = $('#synced');
    var stringJSON = '{}';
    var channel = config.channel || 'testjson2';
    var options = {
      key: channel
    };
    options.signaling = config.url || 'ws://localhost:3001/cryptpad_websocket';
    options.topology = 'StarTopologyService';
    options.protocol = 'WebSocketProtocolService';
    options.connector = 'WebSocketService';
    options.openWebChannel = true;

    var realtime;

    var onJoining = () => {};
    var onLeaving = () => {};
    var onMessage = (peer, msg, p) => {
      if(msg == "0") { // History is synced
        onReady();
        return;
      }
      // Remove the password from the patch
      var passLen = msg.substring(0,msg.indexOf(':'));
      var message = msg.substring(passLen.length+1 + Number(passLen));
      // Apply the patch in Chainpad
      realtime.message(message);
      // Get the new state of the object from Chainpad
      var obj = JSON.parse(realtime.getUserDoc());
      stringJSON = JSON.stringify(obj);
      // Update the proxy with the modified property from the patch
      // TODO : ability to remove a property
      for (var attrname in obj) { if(p[attrname] != obj[attrname]) p[attrname] = obj[attrname]; }
      // DEBUG : display the string value of the object
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

    Netflux.join(channel, options).then(function(wc) {
        wc.onmessage = function(peer, msg) {
            onMessage(peer, msg, p);
        };
        wc.onLeaving = onLeaving;
        wc.onJoining = onJoining;
        wc.onPeerMessage = onPeerMessage;

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

        var hc;
        wc.peers.forEach(function (p) { if (!hc || p.linkQuality > hc.linkQuality) { hc = p; } });
        hc.send(JSON.stringify(['GET_HISTORY', wc.id]));
    });

    return p;
  }

  return {
    getCollaborativeObject: getCollaborativeObject,
    on: function(event, handler) {
      if(event === 'ready') {
        onReady = handler;
      }
      else if(event === 'change') {
        onChange = handler;
      }
    }
  };
});