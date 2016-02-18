define(['/bower_components/reconnectingWebsocket/reconnecting-websocket.js',
        '/common/netflux_api.js'], function (ReconnectingWebSocket, Netflux) {
	var module = { exports: {} };
  	
	var create = module.exports.create = function(url) {
        return new Promise(function(resolve, reject) {
            var socket = new ReconnectingWebSocket(url);
            
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
                socket.onerror = function (x) { console.error(x); };
                socket.onmessage = mkHandler('onMessage');
                Netflux.create(out);

                out.onOpen.push(function() {
                    resolve(Netflux);
                });
                out.onError.push(function(){
                    reject(Error("Unable to connect to the WebSocket service."));
                });
                
        });
    }

  return module.exports;

});