define([
    'jquery',
    '/bower_components/chainpad-listmap/chainpad-listmap.js',
    '/bower_components/chainpad-crypto/crypto.js?v=0.1.5',
    '/bower_components/textpatcher/TextPatcher.amd.js',
    '/common/userObject.js',
], function ($, Listmap, Crypto, TextPatcher, FO) {
    /*
        This module uses localStorage, which is synchronous, but exposes an
        asyncronous API. This is so that we can substitute other storage
        methods.

        To override these methods, create another file at:
        /customize/storage.js
    */

    var Store = {};
    var store;

    var initStore = function (filesOp, storeObj, exp) {
        var ret = {};

        var safeSet = function (key, val) {
            storeObj[key] = val;
        };

        // Store uses nodebacks...
        ret.set = function (key, val, cb) {
            safeSet(key, val);
            cb();
        };

        // implement in alternative store
        ret.setBatch = function (map, cb) {
            Object.keys(map).forEach(function (key) {
                safeSet(key, map[key]);
            });
            cb(void 0, map);
        };

        ret.setDrive = function (key, val, cb) {
            storeObj.drive[key] = val;
            cb();
        };

        var safeGet = function (key) {
            return storeObj[key];
        };

        ret.get = function (key, cb) {
            cb(void 0, safeGet(key));
        };

        // implement in alternative store
        ret.getBatch = function (keys, cb) {
            var res = {};
            keys.forEach(function (key) {
                res[key] = safeGet(key);
            });
            cb(void 0, res);
        };

        ret.getDrive = function (key, cb) {
            cb(void 0, storeObj.drive[key]);
        };

        var safeRemove = function (key) {
            delete storeObj[key];
        };

        ret.remove = function (key, cb) {
            safeRemove(key);
            cb();
        };

        // implement in alternative store
        ret.removeBatch = function (keys, cb) {
            keys.forEach(function (key) {
                safeRemove(key);
            });
            cb();
        };

        ret.keys = function (cb) {
            cb(void 0, Object.keys(storeObj));
        };

        ret.removeData = filesOp.removeData;
        ret.pushData = filesOp.pushData;
        ret.addPad = filesOp.add;

        ret.forgetPad = function (href, cb) {
            filesOp.forget(href);
            cb();
        };

        ret.listTemplates = function () {
            var templateFiles = filesOp.getFiles(['template']);
            var res = [];
            templateFiles.forEach(function (f) {
                var data = filesOp.getFileData(f);
                res.push(JSON.parse(JSON.stringify(data)));
            });
            return res;
        };

        ret.getProxy = function () {
            return exp;
        };

        ret.getLoginName = function () {
            return storeObj.login_name;
        };

        ret.repairDrive = function () {
            filesOp.fixFiles();
        };

        ret.getEmptyObject = function () {
            return filesOp.getStructure();
        };

        ret.replaceHref = function (o, n) {
            return filesOp.replace(o, n);
        };

        ret.changeHandlers = [];

        ret.change = function () {};

        return ret;
    };

    var tryParsing = function (x) {
        try { return JSON.parse(x); }
        catch (e) {
            console.error(e);
            return null;
        }
    };

    var onReady = function (f, proxy, Cryptpad, exp) {
        var fo = exp.fo = FO.init(proxy.drive, {
            Cryptpad: Cryptpad
        });

        //storeObj = proxy;
        store = initStore(fo, proxy, exp);
        if (typeof(f) === 'function') {
            f(void 0, store);
        }

        var requestLogin = function () {
            // log out so that you don't go into an endless loop...
            Cryptpad.logout();

            // redirect them to log in, and come back when they're done.
            sessionStorage.redirectTo = window.location.href;
            window.location.href = '/login/';
        };

        var tokenKey = 'loginToken';
        if (Cryptpad.isLoggedIn()) {
/*  This isn't truly secure, since anyone who can read the user's object can
    set their local loginToken to match that in the object. However, it exposes
    a UI that will work most of the time. */

            // every user object should have a persistent, random number
            if (typeof(proxy.loginToken) !== 'number') {
                proxy[tokenKey] = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
            }

            var localToken = tryParsing(localStorage.getItem(tokenKey));
            if (localToken === null) {
                // if that number hasn't been set to localStorage, do so.
                localStorage.setItem(tokenKey, proxy.loginToken);
            } else if (localToken !== proxy[tokenKey]) {
                // if it has been, and the local number doesn't match that in
                // the user object, request that they reauthenticate.
                return void requestLogin();
            }
        }

        if (typeof(proxy.allowUserFeedback) !== 'boolean') {
            proxy.allowUserFeedback = true;
        }

        if (typeof(proxy.uid) !== 'string' || proxy.uid.length !== 32) {
            // even anonymous users should have a persistent, unique-ish id
            console.log('generating a persistent identifier');
            proxy.uid = Cryptpad.createChannelId();
        }

        // if the user is logged in, but does not have signing keys...
        if (Cryptpad.isLoggedIn() && !Cryptpad.hasSigningKeys(proxy)) {
            return void requestLogin();
        }

        proxy.on('change', [Cryptpad.displayNameKey], function (o, n) {
            if (typeof(n) !== "string") { return; }
            Cryptpad.changeDisplayName(n);
        });
        proxy.on('change', [tokenKey], function () {
            console.log('wut');
            var localToken = tryParsing(localStorage.getItem(tokenKey));
            if (localToken !== proxy[tokenKey]) {
                return void requestLogin();
            }
        });
    };

    var initialized = false;

    var init = function (f, Cryptpad) {
        if (!Cryptpad || initialized) { return; }
        initialized = true;

        var hash = Cryptpad.getUserHash() || localStorage.FS_hash || Cryptpad.createRandomHash();
        if (!hash) {
            throw new Error('[Store.init] Unable to find or create a drive hash. Aborting...');
        }
        var secret = Cryptpad.getSecrets('drive', hash);
        var listmapConfig = {
            data: {},
            websocketURL: Cryptpad.getWebsocketURL(),
            channel: secret.channel,
            readOnly: false,
            validateKey: secret.keys.validateKey || undefined,
            crypto: Crypto.createEncryptor(secret.keys),
            userName: 'fs',
            logLevel: 1,
        };

        var exp = {};

        window.addEventListener('storage', function (e) {
            if (e.key !== Cryptpad.userHashKey) { return; }
            var o = e.oldValue;
            var n = e.newValue;
            if (!o && n) {
                window.location.reload();
            } else if (o && !n) {
                $(window).on('keyup', function (e) {
                    if (e.keyCode === 27) {
                        Cryptpad.removeLoadingScreen();
                    }
                });
                Cryptpad.logout();
                Cryptpad.addLoadingScreen(undefined, true);
                Cryptpad.errorLoadingScreen(Cryptpad.Messages.onLogout, true);
                if (exp.info) {
                    exp.info.network.disconnect();
                }
            }
        });

        var rt = window.rt = Listmap.create(listmapConfig);

        exp.proxy = rt.proxy;
        rt.proxy.on('create', function (info) {
            exp.info = info;
            if (!Cryptpad.getUserHash()) {
                localStorage.FS_hash = Cryptpad.getEditHashFromKeys(info.channel, secret.keys);
            }
        }).on('ready', function () {
            if (store) { return; } // the store is already ready, it is a reconnection
            if (!rt.proxy.drive || typeof(rt.proxy.drive) !== 'object') { rt.proxy.drive = {}; }
            var drive = rt.proxy.drive;
            // Creating a new anon drive: import anon pads from localStorage
            if ((!drive[Cryptpad.storageKey] || !Cryptpad.isArray(drive[Cryptpad.storageKey])) &&
                !drive['filesData']) {
                Cryptpad.getLegacyPads(function (err, data) {
                    drive[Cryptpad.storageKey] = data;
                    onReady(f, rt.proxy, Cryptpad, exp);
                });
                return;
            }
            // Drive already exist: return the existing drive, don't load data from legacy store
            onReady(f, rt.proxy, Cryptpad, exp);
        })
        .on('disconnect', function (info) {
            // We only manage errors during the loading screen here. Other websocket errors are handled by the apps
            if (info.error) {
                if (typeof Cryptpad.storeError === "function") {
                    Cryptpad.storeError();
                }
                return;
            }
        });

    };

    Store.ready = function (f, Cryptpad) {
        if (store) { // Store.ready probably called twice, store already ready
            if (typeof(f) === 'function') {
                f(void 0, store);
            }
        } else {
            init(f, Cryptpad);
        }
    };

    return Store;
});
