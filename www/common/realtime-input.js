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

    /* websocket stuff */


    // TODO before removing websocket implementation
    // bind abort to onLeaving
    var abort = function (socket, realtime) {
        realtime.abort();
        try { socket._socket.close(); } catch (e) { warn(e); }
    };
    /* end websocket stuff */

    var start = module.exports.start =
        function (textarea, websocketUrl, userName, channel, cryptKey, config)
    {

        // make sure configuration is defined
        config = config || {};
        var doc = config.doc || null;

        var bump = function () {};
        
        // Operation to realize on keyboard events once the realtime is initialized
        var onEvent = function () { };
        
        // Bind events which will trigger the realtime engine to the previous method
        var bindInputEvents = function() {
            bindAllEvents(textarea, doc, onEvent, false);
        }
        
        // Operation to realize on the incoming text messages (decrypt here)
        var transformIncomingMessage = function(message) {
            return Crypto.decrypt(message, cryptKey);
        }
        
        // Operation to realize on the outgoing text messages (encrypt here)
        var transformOutgoingMessage = function(message) {
            return Crypto.encrypt(message, cryptKey);
        }

        // Attach textarea to the realtime session
        // NOTE: should be able to remove the websocket without damaging this
        var attachShareJS = function(realtimeCtx) {
            sharejs.attach(textarea, realtimeCtx);
            bump = realtimeCtx.bumpSharejs;
        }

        WebSocketNetflux.create(websocketUrl, // url of the websocket server
                                userName,
                                $(textarea).val(), // current value of the text
                                channel, // channel name
                                config) // additionnal actions (onInit, onRemote, onReady)
                        .then(function(netflux) {
                            netflux.onOpening(onEvent, bindInputEvents, attachShareJS, transformIncomingMessage, transformOutgoingMessage);
                        }, function(error) {
                            console.log(error);
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
