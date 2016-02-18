/*
 * Copyright 2014 XWiki SAS
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define([
    '/common/messages.js',
    '/common/nf_facade.js',
    '/common/crypto.js',
    '/common/toolbar.js',
    '/common/sharejs_textarea.js',
    '/common/chainpad.js',
    '/bower_components/jquery/dist/jquery.min.js',
], function (Messages, WebSocketNetflux, Crypto, Toolbar, sharejs) {
    var $ = window.jQuery;
    var ChainPad = window.ChainPad;
    var PARANOIA = true;
    var module = { exports: {} };

    var debug = function (x) { console.log(x); },
        warn = function (x) { console.error(x); },
        verbose = function (x) { /*console.log(x);*/ };

    // ------------------ Trapping Keyboard Events ---------------------- //

    var bindEvents = function (element, events, callback, unbind) {
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (element.addEventListener) {
                if (unbind) {
                    element.removeEventListener(e, callback, false);
                } else {
                    element.addEventListener(e, callback, false);
                }
            } else {
                if (unbind) {
                    element.detachEvent('on' + e, callback);
                } else {
                    element.attachEvent('on' + e, callback);
                }
            }
        }
    };

    var bindAllEvents = function (textarea, docBody, onEvent, unbind)
    {
        /*
            we use docBody for the purposes of CKEditor.
            because otherwise special keybindings like ctrl-b and ctrl-i
            would open bookmarks and info instead of applying bold/italic styles
        */
        if (docBody) {
            bindEvents(docBody,
               ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste'],
               onEvent,
               unbind);
        }
        bindEvents(textarea,
                   ['mousedown','mouseup','click','change'],
                   onEvent,
                   unbind);
    };

    var start = module.exports.start =
        function (textarea, websocketUrl, userName, channel, cryptKey, config)
    {

        var passwd = 'y';

        // make sure configuration is defined
        config = config || {};

        var doc = config.doc || null;
        
        // trying to deprecate onRemote, prefer loading it via the conf
        onRemote = config.onRemote || null;

        transformFunction = config.transformFunction || null;

        // define this in case it gets called before the rest of our stuff is ready.
        var onEvent = function () { };

        var allMessages = [];
        var initializing = true;

        var bump = function () {};

        WebSocketNetflux.create(websocketUrl)
        .then(function(netflux) {
            
            if (initializing && typeof realtime !== "undefined") {
                console.log("Starting");
                realtime.start();
                return;
            }
            
            var realtime = ChainPad.create(userName,
                                        passwd,
                                        channel,
                                        $(textarea).val(),
                                        {
                                        transformFunction: config.transformFunction
                                        });
            netflux.join(channel).then(function(webChannel) {
                if (config.onInit) {
                    config.onInit({
                        realtime: realtime
                    });
                }

                onEvent = function () {
                    if (initializing) { return; }
                };
                
                realtime.onUserListChange(function (userList) {
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
                
                // When you receive a message...
                webChannel.onMessage(function (evt) {
                    verbose(evt.data);
                    var message = evt.data;

                    message = Crypto.decrypt(message, cryptKey);
                    
                    verbose(message);
                    allMessages.push(message);
                    if (!initializing) {
                        if (PARANOIA) {
                            onEvent();
                        }
                    }
                    realtime.message(message);
                    if (/\[5,/.test(message)) { verbose("pong"); }

                    if (!initializing) {
                        if (/\[2,/.test(message)) {
                            //verbose("Got a patch");
                            if (whoami.test(message)) {
                                //verbose("Received own message");
                            } else {
                                //verbose("Received remote message");
                                // obviously this is only going to get called if
                                if (onRemote) { onRemote(realtime.getUserDoc()); }
                            }
                        }
                    }
                });
                
                // When a message is ready to send
                realtime.onMessage(function (message) {
                    message = Crypto.encrypt(message, cryptKey);
                    webChannel.send(message);
                });
                
                var socketChecker = setInterval(function () {
                    if (netflux.checkSocket(realtime)) {
                        warn("Socket disconnected!");

                        recoverableErrorCount += 1;

                        if (recoverableErrorCount >= MAX_RECOVERABLE_ERRORS) {
                            warn("Giving up!");
                            realtime.abort();
                            webChannel.leave()
                                .then(null, function(err) {
                                    warn(err);
                                });
                            if (socketChecker) { clearInterval(socketChecker); }
                        }
                    } else {
                        // TODO
                    }
                },200);

                bindAllEvents(textarea, doc, onEvent, false);

                // Attach textarea to the realtime session
                // NOTE: should be able to remove the websocket without damaging this
                sharejs.attach(textarea, realtime);
                bump = realtime.bumpSharejs;

                realtime.start();
                debug('started');
            }, function(error) {
                warn(error);
            });
        }, function(error) {
            warn(error);
        });
        return {
            onEvent: function () {
                onEvent();
            },
            bumpSharejs: function () { bump(); }
        };
    };
    return module.exports;
});
