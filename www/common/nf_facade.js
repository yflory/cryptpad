define(['/bower_components/reconnectingWebsocket/reconnecting-websocket.js',
        '/common/netflux_api.js'], function (ReconnectingWebSocket, Netflux) {
	var module = { exports: {} };
  
  var userName, cryptKey;
  var warn;
  var textVal, transformFunction;
	
	var create = module.exports.create = function(url, user, textareaVal, channel, config) {
        return new Promise(function(resolve, reject) {
            var socket = new ReconnectingWebSocket(url);
            
            if (socket) {
                var out = {
                    onOpen: [],
                    onClose: [],
                    onError: [],
                    onMessage: [],
                    send: function (msg) { socket.send(msg); },
                    close: function () { socket.close(); },
                    _socket: socket
                };
                var mkHandler = function (name) {
                    return function (evt) {
                        for (var i = 0; i < out[name].length; i++) {
                            if (out[name][i](evt) === false) {
                                console.log(name +"Handler");
                                return;
                            }
                        }
                    };
                };
                socket.onopen = mkHandler('onOpen');
                socket.onclose = mkHandler('onClose');
                socket.onerror = mkHandler('onError');
                socket.onmessage = mkHandler('onMessage');
                Netflux.create(out, user, textareaVal, channel, config);
                resolve(Netflux);
            }
            else {
                reject(Error("Unable to connect to the WebSocket service."));
            }
        });
    }

  return module.exports;

});