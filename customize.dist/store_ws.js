define([
    '/api/config?cb=' + Math.random().toString(16).substring(2),
    '/customize/messages.js?app=directory',
    '/bower_components/textpatcher/TextPatcher.js',
    '/bower_components/chainpad-listmap/chainpad-listmap.js',
    '/bower_components/chainpad-crypto/crypto.js',
    '/bower_components/file-saver/FileSaver.min.js',
    '/bower_components/jquery/dist/jquery.min.js',
    '/customize/pad.js'
], function (Config, Messages, TextPatcher, Listmap, Crypto) {    /*
        This module uses localStorage, which is synchronous, but exposes an
        asyncronous API. This is so that we can substitute other storage
        methods.

        To override these methods, create another file at:
        /customize/storage.js
    */

    var Store = {};
    var module = {};

    // Store uses nodebacks...
    Store.set = function (key, val, cb) {
        module.rt.proxy.hashes[key] = JSON.stringify(val);
        cb();
    };

    // implement in alternative store
    Store.setBatch = function (map, cb) {
        Object.keys(map).forEach(function (key) {
            module.rt.proxy.hashes[key] = JSON.stringify(map[key]);
        });
        cb(void 0, map);
    };

    var safeGet = window.safeGet = function (key) {
        var val = module.rt.proxy.hashes[key];
        try {
            return JSON.parse(val);
        } catch (err) {
            console.log(val);
            console.error(err);
            return val;
        }
    };

    Store.get = function (key, cb) {
        cb(void 0, safeGet(key));
    };

    // implement in alternative store
    Store.getBatch = function (keys, cb) {
        var res = {};
        keys.forEach(function (key) {
            res[key] = safeGet(key);
        });
        cb(void 0, res);
    };

    Store.remove = function (key, cb) {
        localStorage.removeItem(key);
        cb();
    };

    // implement in alternative store
    Store.removeBatch = function (keys, cb) {
        keys.forEach(function (key) {
            localStorage.removeItem(key);
        });
        cb();
    };

    Store.keys = function (cb) {
        cb(void 0, Object.keys(localStorage));
    };

    Store.ready = function (f) {
        if (typeof(f) === 'function') {
            f(void 0, Store);
        }
    };

    var changeHandlers = Store.changeHandlers = [];

    Store.change = function (f) {
        if (typeof(f) !== 'function') {
            throw new Error('[Store.change] callback must be a function');
        }
        changeHandlers.push(f);

        if (changeHandlers.length === 1) {
            // start listening for changes
            window.addEventListener('storage', function (e) {
                changeHandlers.forEach(function (f) {
                    f({
                        key: e.key,
                        oldValue: e.oldValue,
                        newValue: e.newValue,
                    });
                });
            });
        }
    };

    var ready = function (resolve) {
        console.log("Store loaded");
        module.ready = true;
        var proxy = module.rt.proxy;
        if (typeof proxy.version === "undefined") {
            proxy.version = 0;
        }
        if (typeof proxy.root === "undefined") {
            proxy.root = {};
        }
        if (typeof proxy.hashes === "undefined") {
            proxy.hashes = {}
        }
        resolve(Store);
    };

    var StoreWS = {};
    var init = StoreWS.init = function () {
        var secret = JSON.parse('{"channel":"98d0977cb15963902d1c8b7dba2791b3","keys":{"editKeyStr":"avhb2rKAGsrYyDFkfLLzu/Ei","signKey":"20faKiSBMT2PydzrICzDtnZmRxVdzD2cbD41zoPeIaVaociKVqRqJimUfHIwt7khrCfvpOHDKbn5oTdoSRwH8Q==","validateKey":"WqHIilakaiYplHxyMLe5Iawn76Thwym5+aE3aEkcB/E=","cryptKey":{"0":41,"1":92,"2":185,"3":130,"4":63,"5":197,"6":226,"7":120,"8":171,"9":54,"10":108,"11":243,"12":79,"13":237,"14":223,"15":227,"16":211,"17":94,"18":37,"19":95,"20":60,"21":146,"22":53,"23":132,"24":241,"25":138,"26":93,"27":118,"28":14,"29":184,"30":209,"31":17},"viewKeyStr":"KVy5gj-F4nirNmzzT+3f49NeJV88kjWE8Ypddg640RE"},"key":"avhb2rKAGsrYyDFkfLLzu/Ei"}');
        var config = {
            websocketURL: Cryptpad.getWebsocketURL(),
            channel: secret.channel,
            data: {},
            // our public key
            validateKey: secret.keys.validateKey || undefined,
            crypto: Crypto.createEncryptor(secret.keys),
        };

        return new Promise(function (resolve, reject) {
            var rt = window.rt = module.rt = Listmap.create(config);
            rt.proxy.on('create', function (info) {
                var realtime = module.realtime = info.realtime;
            }).on('ready', function() {
              ready(resolve);
            });
        });
    };

    return StoreWS;
});
