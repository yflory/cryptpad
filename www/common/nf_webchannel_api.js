define(function () {
	var module = { exports: {} };
    var ws;
    var userName;
    var warn;
    var initializing = true;

    // Leave the channel
    var leave = module.exports.leave = function() {
        return new Promise(function(resolve, reject) {
            try { 
                ws._socket.close(); 
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    // Receive a message
    var onMessage = module.exports.onMessage = function(callback) {
        ws.onMessage.push(callback);
	}

    // Send a message
    var send = module.exports.send = function(message) {
        try {
            ws.send(message);
        } catch (e) {
            warn(e);
        }
    }

    var create = module.exports.create = function(socket) {
        ws = socket;
    }

    return module.exports;
});