define(['/common/nf_webchannel_api.js'], function (WebChannel) {
  var module = { exports: {} };
  var userName;
  var ws;
  var wc;
  var initializing = true;
  var passwd = 'y';
  var textValue;
  var channel, config;
  var allMessages = [];
  var debug = function (x) { console.log(x); },
        warn = function (x) { console.error(x); },
        verbose = function (x) { /*console.log(x);*/ };
  var PARANOIA = true;
  var onRemote;
  var recoverableErrorCount = 0;
  
    /**
     * If an error is encountered but it is recoverable, do not immediately fail
     * but if it keeps firing errors over and over, do fail.
     */
    var MAX_RECOVERABLE_ERRORS = 15;

    /** Maximum number of milliseconds of lag before we fail the connection. */
    var MAX_LAG_BEFORE_DISCONNECT = 20000;
    
    var isSocketDisconnected = function () {
        var sock = ws._socket;
        return sock.readyState === sock.CLOSING
            || sock.readyState === sock.CLOSED
            || (ws.realtime.getLag().waiting && ws.realtime.getLag().lag > MAX_LAG_BEFORE_DISCONNECT);
    };

    // this differs from other functions with similar names in that
    // you are expected to pass a socket into it.
    var checkSocket = function () {
        if (isSocketDisconnected() && !ws.intentionallyClosing) {
            return true;
        } else {
            return false;
        }
    };
	

  var onOpening = module.exports.onOpening = function(onEvent, bindEvents, manageIncomingPatches, onBeforeIncoming, onBeforeSending) { //TODO onJoining?
    
    ws.onOpen.push(function() {
        if (!WebChannel.initializing && typeof ws.realtime !== "undefined") {
            console.log("Starting");
            // realtime is passed around as an attribute of the socket
            // FIXME??
            ws.realtime.start();
            return;
        }
        join(channel)
        .then(function(chan) {
            if (config.onInit) {
                config.onInit({
                    realtime: ws.realtime
                });
            }
            
            onEvent = function () {
                if (initializing) { return; }
            };
            
            chan.onJoining(function (userList) {
                if (!initializing || userList.indexOf(userName) === -1) {
                    return;
                }
                // if we spot ourselves being added to the document, we'll switch
                // 'initializing' off because it means we're fully synced.
                initializing = false;

                // execute an onReady callback if one was supplied
                // pass an object so we can extend this later
                if (config.onReady) {
                    config.onReady({
                        userList: userList
                    });
                }
            });
            
            var whoami = new RegExp(userName.replace(/\/\+/g, function (c) {
                return '\\' +c;
            }));
            
            // when you receive a message...
            chan.onMessage(function (evt) {
                verbose(evt.data);
                var message = evt.data;

                // Transform operation on incoming message
                if(typeof onBeforeIncoming !== "undefined") {
                    message = onBeforeIncoming(message);
                }
                
                verbose(message);
                allMessages.push(message);
                if (!initializing) {
                    if (PARANOIA) {
                        onEvent();
                    }
                }
                chan.realtime.message(message);
                if (/\[5,/.test(message)) { verbose("pong"); }

                if (!initializing) {
                    if (/\[2,/.test(message)) {
                        //verbose("Got a patch");
                        if (whoami.test(message)) {
                            //verbose("Received own message");
                        } else {
                            //verbose("Received remote message");
                            // obviously this is only going to get called if
                            if (onRemote) { onRemote(chan.realtime.getUserDoc()); }
                        }
                    }
                }
            });
            
            // when a message is ready to send
            ws.realtime.onMessage(function (message) {
                if(typeof onBeforeSending !== "undefined") {
                    message = onBeforeSending(message);
                }
                chan.send(message);
            });
            
            ws.onerror = warn;
            
            var socketChecker = setInterval(function () {
                if (checkSocket()) {
                    warn("Socket disconnected!");

                    recoverableErrorCount += 1;

                    if (recoverableErrorCount >= MAX_RECOVERABLE_ERRORS) {
                        warn("Giving up!");
                        chan.leave();
                        if (socketChecker) { clearInterval(socketChecker); }
                    }
                } else {
                    // TODO
                }
            },200);
            
            bindEvents();

            if(chan) {
                manageIncomingPatches(chan.realtime);
                chan.realtime.start();
                debug('started');
            }
            
        }, function(error) {
            console.log(error);
        })
    });
  }

  var join = module.exports.join = function(channel) {
    return new Promise(function(resolve, reject) {
      var rt = ChainPad.create(userName,
                      passwd,
                      channel,
                      textValue,
                      {
                          transformFunction: config.transformFunction
                      });
      ws.realtime = rt;
      WebChannel.create(rt, ws, userName, warn);
      if (rt) {
          resolve(WebChannel);
      }
      else {
          reject(Error("Unable to create a ChainPad realtime session!"));
      }
    });
  }

  var create = module.exports.create = function(socket, user, textareaVal, chan, configuration) {
    ws = module.exports.socket = socket;
    userName = user;
    textValue = textareaVal;
    channel = chan;
    config = configuration;
    // trying to deprecate onRemote, prefer loading it via the conf
    onRemote = config.onRemote || null;
  }

  return module.exports;

});