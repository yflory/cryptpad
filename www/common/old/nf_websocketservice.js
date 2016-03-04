define(['/bower_components/reconnectingWebsocket/reconnecting-websocket.js',
        '/common/nf_facade.js',
        '/common/nf_webchannel.js'], function (ReconnectingWebSocket, Facade, WebChannel) {
    
    return function WebSocketService() {
        var module = {exports: {}};
        var socket;
        
        /**
         * If an error is encountered but it is recoverable, do not immediately fail
         * but if it keeps firing errors over and over, do fail.
         */
        var recoverableErrorCount = 0;
        var MAX_RECOVERABLE_ERRORS = 15;

        // Maximum number of milliseconds of lag before we fail the connection.
        var MAX_LAG_BEFORE_DISCONNECT = 20000;
        
        // Connect to the WebSocket server
        var connect = module.exports.connect = function (url) {
            return new Promise(function(resolve, reject) {
                socket = new ReconnectingWebSocket(url);
                socket.onopen = function() {
                    resolve(Facade);
                }
                socket.onerror = reject;
            });
        }

        var disconnect = module.exports.disconnect = function () {
            socket.close();
            delete this;
        }

        // Create a WebChannel
        var join = module.exports.join = function (channel, options) {
            return new Promise(function(resolve, reject) {
                try {
                    var wc = new WebChannel(channel, options);
                    socket.onmessage = function(evt) {
                        wc.onmessage(evt.data);
                    }
                    resolve(wc);
                } catch(e) {
                    reject(e);
                }
                
            });
        }
        
        // Send a message using the socket
        var send = module.exports.send = function(message) {
            return new Promise(function(resolve, reject) {
                try {
                    socket.send(message);
                    resolve();
                } catch(e) {
                    reject(e);
                }
            });
        }

        // Check the status of the socket connection
        var isSocketDisconnected = function (realtime) {
            var sock = ws._socket;
            return sock.readyState === sock.CLOSING
                || sock.readyState === sock.CLOSED
                || (realtime.getLag().waiting && realtime.getLag().lag > MAX_LAG_BEFORE_DISCONNECT);
        };
        var checkSocket = module.exports.checkSocket = function (realtime) {
            if (isSocketDisconnected(realtime) && !socket.intentionallyClosing) {
                return true;
            } else {
                return false;
            }
        };
        
        return module.exports;
    }
    
});