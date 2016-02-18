define(['/common/nf_webchannel_api.js'], function (WebChannel) {
    var module = { exports: {} };
    var ws;
    var recoverableErrorCount;

    /**
     * If an error is encountered but it is recoverable, do not immediately fail
     * but if it keeps firing errors over and over, do fail.
     */
    var MAX_RECOVERABLE_ERRORS = 15;

    /** Maximum number of milliseconds of lag before we fail the connection. */
    var MAX_LAG_BEFORE_DISCONNECT = 20000;

    var isSocketDisconnected = function (realtime) {
        var sock = ws._socket;
        return sock.readyState === sock.CLOSING
            || sock.readyState === sock.CLOSED
            || (realtime.getLag().waiting && realtime.getLag().lag > MAX_LAG_BEFORE_DISCONNECT);
    };

    var checkSocket = module.exports.checkSocket = function (realtime) {
        if (isSocketDisconnected(realtime) && !ws.intentionallyClosing) {
            return true;
        } else {
            return false;
        }
    };
    
    var join = module.exports.join = function(channel) {
        return new Promise(function(resolve, reject) {
            WebChannel.create(ws);
            if (WebChannel) {
                resolve(WebChannel);
            }
            else {
                reject(Error("Unable to create a ChainPad realtime session!"));
            }
       });
    }

    var create = module.exports.create = function(socket) {
        ws = module.exports.socket = socket;
        recoverableErrorCount = 0;
    }

  return module.exports;

});