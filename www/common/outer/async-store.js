define([
    'json.sortify',
    '/common/userObject.js',
    '/common/proxy-manager.js',
    '/common/migrate-user-object.js',
    '/common/common-hash.js',
    '/common/common-util.js',
    '/common/common-constants.js',
    '/common/common-feedback.js',
    '/common/common-realtime.js',
    '/common/common-messaging.js',
    '/common/common-messenger.js',
    '/common/outer/cursor.js',
    '/common/outer/onlyoffice.js',
    '/common/outer/chainpad-netflux-worker.js',
    '/common/outer/network-config.js',
    '/customize/application_config.js',

    '/bower_components/chainpad-crypto/crypto.js',
    '/bower_components/chainpad/chainpad.dist.js',
    '/bower_components/chainpad-listmap/chainpad-listmap.js',
    '/bower_components/nthen/index.js',
    '/bower_components/saferphore/index.js',
], function (Sortify, UserObject, ProxyManager, Migrate, Hash, Util, Constants, Feedback, Realtime, Messaging, Messenger,
             Cursor, OnlyOffice, CpNfWorker, NetConfig, AppConfig,
             Crypto, ChainPad, Listmap, nThen, Saferphore) {

    var create = function () {
        var Store = window.Cryptpad_Store = {};
        var postMessage = function () {};
        var broadcast = function () {};
        var sendDriveEvent = function () {};
        var registerProxyEvents = function () {};

        var storeHash;

        var store = window.CryptPad_AsyncStore = {};

        var onSync = function (cb) {
            nThen(function (waitFor) {
                Realtime.whenRealtimeSyncs(store.realtime, waitFor());
                if (store.sharedFolders) {
                    for (var k in store.sharedFolders) {
                        Realtime.whenRealtimeSyncs(store.sharedFolders[k].realtime, waitFor());
                    }
                }
            }).nThen(function () { cb(); });
        };

        Store.get = function (clientId, key, cb) {
            cb(Util.find(store.proxy, key));
        };
        Store.set = function (clientId, data, cb) {
            var path = data.key.slice();
            var key = path.pop();
            var obj = Util.find(store.proxy, path);
            if (!obj || typeof(obj) !== "object") { return void cb({error: 'INVALID_PATH'}); }
            if (typeof data.value === "undefined") {
                delete obj[key];
            } else {
                obj[key] = data.value;
            }
            broadcast([clientId], "UPDATE_METADATA");
            if (Array.isArray(path) && path[0] === 'profile' && store.messenger) {
                store.messenger.updateMyData();
            }
            onSync(cb);
        };

        Store.getSharedFolder = function (clientId, id, cb) {
            if (store.manager.folders[id]) {
                return void cb(store.manager.folders[id].proxy);
            } else {
                var shared = Util.find(store.proxy, ['drive', UserObject.SHARED_FOLDERS]) || {};
                if (shared[id]) {
                    return void Store.loadSharedFolder(id, shared[id], function () {
                        cb(store.manager.folders[id].proxy);
                    });
                }
            }
            cb({});
        };

        Store.hasSigningKeys = function () {
            if (!store.proxy) { return; }
            return typeof(store.proxy.edPrivate) === 'string' &&
                   typeof(store.proxy.edPublic) === 'string';
        };

        Store.hasCurveKeys = function () {
            if (!store.proxy) { return; }
            return typeof(store.proxy.curvePrivate) === 'string' &&
                   typeof(store.proxy.curvePublic) === 'string';
        };

        var getUserChannelList = function () {
            // start with your userHash...
            var userHash = storeHash;
            if (!userHash) { return null; }

            // No password for drive
            var secret = Hash.getSecrets('drive', userHash);
            var userChannel = secret.channel;
            if (!userChannel) { return null; }

            // Get the list of pads' channel ID in your drive
            // This list is filtered so that it doesn't include pad owned by other users
            // It now includes channels from shared folders
            var list = store.manager.getChannelsList('pin');

            // Get the avatar
            var profile = store.proxy.profile;
            if (profile) {
                var profileChan = profile.edit ? Hash.hrefToHexChannelId('/profile/#' + profile.edit, null) : null;
                if (profileChan) { list.push(profileChan); }
                var avatarChan = profile.avatar ? Hash.hrefToHexChannelId(profile.avatar, null) : null;
                if (avatarChan) { list.push(avatarChan); }
            }

            if (store.proxy.friends) {
                var fList = Messaging.getFriendChannelsList(store.proxy);
                list = list.concat(fList);
            }

            list.push(userChannel);
            list.sort();

            return list;
        };

        var getExpirableChannelList = function () {
            return store.manager.getChannelsList('expirable');
        };

        var getCanonicalChannelList = function (expirable) {
            var list = expirable ? getExpirableChannelList() : getUserChannelList();
            return Util.deduplicateString(list).sort();
        };

        //////////////////////////////////////////////////////////////////
        /////////////////////// RPC //////////////////////////////////////
        //////////////////////////////////////////////////////////////////

        Store.pinPads = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            if (typeof(cb) !== 'function') {
                console.error('expected a callback');
            }

            store.rpc.pin(data, function (e, hash) {
                if (e) { return void cb({error: e}); }
                cb({hash: hash});
            });
        };

        Store.unpinPads = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }

            store.rpc.unpin(data, function (e, hash) {
                if (e) { return void cb({error: e}); }
                cb({hash: hash});
            });
        };

        var account = {};

        Store.getPinnedUsage = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }

            store.rpc.getFileListSize(function (err, bytes) {
                if (typeof(bytes) === 'number') {
                    account.usage = bytes;
                }
                cb({bytes: bytes});
            });
        };

        // Update for all users from accounts and return current user limits
        Store.updatePinLimit = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            store.rpc.updatePinLimits(function (e, limit, plan, note) {
                if (e) { return void cb({error: e}); }
                account.limit = limit;
                account.plan = plan;
                account.note = note;
                cb(account);
            });
        };
        // Get current user limits
        Store.getPinLimit = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }

            var ALWAYS_REVALIDATE = true;
            if (ALWAYS_REVALIDATE || typeof(account.limit) !== 'number' ||
                typeof(account.plan) !== 'string' ||
                typeof(account.note) !== 'string') {
                return void store.rpc.getLimit(function (e, limit, plan, note) {
                    if (e) { return void cb({error: e}); }
                    account.limit = limit;
                    account.plan = plan;
                    account.note = note;
                    cb(account);
                });
            }
            cb(account);
        };

        Store.clearOwnedChannel = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            store.rpc.clearOwnedChannel(data, function (err) {
                cb({error:err});
            });
        };

        Store.removeOwnedChannel = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            store.rpc.removeOwnedChannel(data, function (err) {
                cb({error:err});
            });
        };

        var arePinsSynced = function (cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }

            var list = getCanonicalChannelList(false);
            var local = Hash.hashChannelList(list);
            store.rpc.getServerHash(function (e, hash) {
                if (e) { return void cb(e); }
                cb(null, hash === local);
            });
        };

        var resetPins = function (cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }

            var list = getCanonicalChannelList(false);
            store.rpc.reset(list, function (e, hash) {
                if (e) { return void cb(e); }
                cb(null, hash);
            });
        };

        Store.uploadComplete = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            if (data.owned) {
                // Owned file
                store.rpc.ownedUploadComplete(data.id, function (err, res) {
                    if (err) { return void cb({error:err}); }
                    cb(res);
                });
                return;
            }
            // Normal upload
            store.rpc.uploadComplete(data.id, function (err, res) {
                if (err) { return void cb({error:err}); }
                cb(res);
            });
        };

        Store.uploadStatus = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            store.rpc.uploadStatus(data.size, function (err, res) {
                if (err) { return void cb({error:err}); }
                cb(res);
            });
        };

        Store.uploadCancel = function (clientId, data, cb) {
            if (!store.rpc) { return void cb({error: 'RPC_NOT_READY'}); }
            store.rpc.uploadCancel(data.size, function (err, res) {
                if (err) { return void cb({error:err}); }
                cb(res);
            });
        };

        Store.uploadChunk = function (clientId, data, cb) {
            store.rpc.send.unauthenticated('UPLOAD', data.chunk, function (e, msg) {
                cb({
                    error: e,
                    msg: msg
                });
            });
        };

        Store.writeLoginBlock = function (clientId, data, cb) {
            store.rpc.writeLoginBlock(data, function (e, res) {
                cb({
                    error: e,
                    data: res
                });
            });
        };

        Store.removeLoginBlock = function (clientId, data, cb) {
            store.rpc.removeLoginBlock(data, function (e, res) {
                cb({
                    error: e,
                    data: res
                });
            });
        };

        Store.initRpc = function (clientId, data, cb) {
            if (store.rpc) { return void cb(account); }
            require(['/common/pinpad.js'], function (Pinpad) {
                Pinpad.create(store.network, store.proxy, function (e, call) {
                    if (e) { return void cb({error: e}); }

                    store.rpc = call;

                    Store.getPinLimit(null, null, function (obj) {
                        if (obj.error) { console.error(obj.error); }
                        account.limit = obj.limit;
                        account.plan = obj.plan;
                        account.note = obj.note;
                        cb(obj);
                    });

                    arePinsSynced(function (err, yes) {
                        if (!yes) {
                            resetPins(function (err) {
                                if (err) { return console.error(err); }
                                console.log('RESET DONE');
                            });
                        }
                    });
                });
            });
        };

        //////////////////////////////////////////////////////////////////
        ////////////////// ANON RPC //////////////////////////////////////
        //////////////////////////////////////////////////////////////////
        Store.anonRpcMsg = function (clientId, data, cb) {
            if (!store.anon_rpc) { return void cb({error: 'ANON_RPC_NOT_READY'}); }
            store.anon_rpc.send(data.msg, data.data, function (err, res) {
                if (err) { return void cb({error: err}); }
                cb(res);
            });
        };

        Store.getFileSize = function (clientId, data, cb) {
            if (!store.anon_rpc) { return void cb({error: 'ANON_RPC_NOT_READY'}); }

            var channelId = Hash.hrefToHexChannelId(data.href, data.password);
            store.anon_rpc.send("GET_FILE_SIZE", channelId, function (e, response) {
                if (e) { return void cb({error: e}); }
                if (response && response.length && typeof(response[0]) === 'number') {
                    return void cb({size: response[0]});
                } else {
                    cb({error: 'INVALID_RESPONSE'});
                }
            });
        };

        Store.isNewChannel = function (clientId, data, cb) {
            if (!store.anon_rpc) { return void cb({error: 'ANON_RPC_NOT_READY'}); }
            var channelId = Hash.hrefToHexChannelId(data.href, data.password);
            store.anon_rpc.send("IS_NEW_CHANNEL", channelId, function (e, response) {
                if (e) { return void cb({error: e}); }
                if (response && response.length && typeof(response[0]) === 'boolean') {
                    return void cb({
                        isNew: response[0]
                    });
                } else {
                    cb({error: 'INVALID_RESPONSE'});
                }
            });
        };

        Store.getMultipleFileSize = function (clientId, data, cb) {
            if (!store.anon_rpc) { return void cb({error: 'ANON_RPC_NOT_READY'}); }
            if (!Array.isArray(data.files)) {
                return void cb({error: 'INVALID_FILE_LIST'});
            }

            store.anon_rpc.send('GET_MULTIPLE_FILE_SIZE', data.files, function (e, res) {
                if (e) { return void cb({error: e}); }
                if (res && res.length && typeof(res[0]) === 'object') {
                    cb({size: res[0]});
                } else {
                    cb({error: 'UNEXPECTED_RESPONSE'});
                }
            });
        };

        Store.getDeletedPads = function (clientId, data, cb) {
            if (!store.anon_rpc) { return void cb({error: 'ANON_RPC_NOT_READY'}); }
            var list = (data && data.list) || getCanonicalChannelList(true);
            if (!Array.isArray(list)) {
                return void cb({error: 'INVALID_FILE_LIST'});
            }

            store.anon_rpc.send('GET_DELETED_PADS', list, function (e, res) {
                if (e) { return void cb({error: e}); }
                if (res && res.length && Array.isArray(res[0])) {
                    cb(res[0]);
                } else {
                    cb({error: 'UNEXPECTED_RESPONSE'});
                }
            });
        };

        Store.initAnonRpc = function (clientId, data, cb) {
            if (store.anon_rpc) { return void cb(); }
            require([
                '/common/rpc.js',
            ], function (Rpc) {
                Rpc.createAnonymous(store.network, function (e, call) {
                    if (e) { return void cb({error: e}); }
                    store.anon_rpc = call;
                    cb();
                });
            });
        };

        //////////////////////////////////////////////////////////////////
        /////////////////////// Store ////////////////////////////////////
        //////////////////////////////////////////////////////////////////

        // Get or create the user color for the cursor position
        var getRandomColor = function () {
            var getColor = function () {
                return Math.floor(Math.random() * 156) + 70;
            };
            return '#' + getColor().toString(16) +
                         getColor().toString(16) +
                         getColor().toString(16);
        };
        var getUserColor = function () {
            var color = Util.find(store.proxy, ['settings', 'general', 'cursor', 'color']);
            if (!color) {
                color = getRandomColor();
                Store.setAttribute(null, {
                    attr: ['general', 'cursor', 'color'],
                    value: color
                }, function () {});
            }
            return color;
        };

        // Get the metadata for sframe-common-outer
        Store.getMetadata = function (clientId, data, cb) {
            var disableThumbnails = Util.find(store.proxy, ['settings', 'general', 'disableThumbnails']);
            var metadata = {
                // "user" is shared with everybody via the userlist
                user: {
                    name: store.proxy[Constants.displayNameKey] || "",
                    uid: store.proxy.uid,
                    avatar: Util.find(store.proxy, ['profile', 'avatar']),
                    profile: Util.find(store.proxy, ['profile', 'view']),
                    color: getUserColor(),
                    curvePublic: store.proxy.curvePublic,
                },
                // "priv" is not shared with other users but is needed by the apps
                priv: {
                    clientId: clientId,
                    edPublic: store.proxy.edPublic,
                    friends: store.proxy.friends || {},
                    settings: store.proxy.settings,
                    thumbnails: disableThumbnails === false,
                    isDriveOwned: Boolean(Util.find(store, ['driveMetadata', 'owners']))
                }
            };
            cb(JSON.parse(JSON.stringify(metadata)));
        };

        var makePad = function (href, roHref, title) {
            var now = +new Date();
            return {
                href: href,
                roHref: roHref,
                atime: now,
                ctime: now,
                title: title || Hash.getDefaultName(Hash.parsePadUrl(href)),
            };
        };

        Store.addPad = function (clientId, data, cb) {
            if (!data.href && !data.roHref) { return void cb({error:'NO_HREF'}); }
            if (!data.roHref) {
                var parsed = Hash.parsePadUrl(data.href);
                if (parsed.hashData.type === "pad") {
                    var secret = Hash.getSecrets(parsed.type, parsed.hash, data.password);
                    data.roHref = '/' + parsed.type + '/#' + Hash.getViewHashFromKeys(secret);
                }
            }
            var pad = makePad(data.href, data.roHref, data.title);
            if (data.owners) { pad.owners = data.owners; }
            if (data.expire) { pad.expire = data.expire; }
            if (data.password) { pad.password = data.password; }
            if (data.channel) { pad.channel = data.channel; }
            store.manager.addPad(data.path, pad, function (e) {
                if (e) { return void cb({error: e}); }
                sendDriveEvent('DRIVE_CHANGE', {
                    path: ['drive', UserObject.FILES_DATA]
                }, clientId);
                onSync(cb);
            });
        };

        var getOwnedPads = function () {
            var list = store.manager.getChannelsList('owned');
            if (store.proxy.todo) {
                // No password for todo
                list.push(Hash.hrefToHexChannelId('/todo/#' + store.proxy.todo, null));
            }
            if (store.proxy.profile && store.proxy.profile.edit) {
                // No password for profile
                list.push(Hash.hrefToHexChannelId('/profile/#' + store.proxy.profile.edit, null));
            }
            return list;
        };
        var removeOwnedPads = function (waitFor) {
            // Delete owned pads
            var ownedPads = getOwnedPads();
            var sem = Saferphore.create(10);
            ownedPads.forEach(function (c) {
                var w = waitFor();
                sem.take(function (give) {
                    Store.removeOwnedChannel(null, c, give(function (obj) {
                        if (obj && obj.error) { console.error(obj.error); }
                        w();
                    }));
                });
            });
        };

        Store.deleteAccount = function (clientId, data, cb) {
            var edPublic = store.proxy.edPublic;
            // No password for drive
            var secret = Hash.getSecrets('drive', storeHash);
            Store.anonRpcMsg(clientId, {
                msg: 'GET_METADATA',
                data: secret.channel
            }, function (data) {
                var metadata = data[0];
                // Owned drive
                if (metadata && metadata.owners && metadata.owners.length === 1 &&
                    metadata.owners.indexOf(edPublic) !== -1) {
                    nThen(function (waitFor) {
                        var token = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
                        store.proxy[Constants.tokenKey] = token;
                        postMessage(clientId, "DELETE_ACCOUNT", token, waitFor());
                    }).nThen(function (waitFor) {
                        removeOwnedPads(waitFor);
                    }).nThen(function (waitFor) {
                        // Delete Pin Store
                        store.rpc.removePins(waitFor(function (err) {
                            if (err) { console.error(err); }
                        }));
                    }).nThen(function (waitFor) {
                        // Delete Drive
                        Store.removeOwnedChannel(clientId, secret.channel, waitFor());
                    }).nThen(function () {
                        store.network.disconnect();
                        cb({
                            state: true
                        });
                    });
                    return;
                }

                // Not owned drive
                var toSign = {
                    intent: 'Please delete my account.'
                };
                toSign.drive = secret.channel;
                toSign.edPublic = edPublic;
                var signKey = Crypto.Nacl.util.decodeBase64(store.proxy.edPrivate);
                var proof = Crypto.Nacl.sign.detached(Crypto.Nacl.util.decodeUTF8(Sortify(toSign)), signKey);

                var check = Crypto.Nacl.sign.detached.verify(Crypto.Nacl.util.decodeUTF8(Sortify(toSign)),
                    proof,
                    Crypto.Nacl.util.decodeBase64(edPublic));

                if (!check) { console.error('signed message failed verification'); }

                var proofTxt = Crypto.Nacl.util.encodeBase64(proof);
                cb({
                    proof: proofTxt,
                    toSign: JSON.parse(Sortify(toSign))
                });
            });
        };

        /**
         * add a "What is CryptPad?" pad in the drive
         * data
         *   - driveReadme
         *   - driveReadmeTitle
         */
        Store.createReadme = function (clientId, data, cb) {
            require(['/common/cryptget.js'], function (Crypt) {
                var hash = Hash.createRandomHash('pad');
                Crypt.put(hash, data.driveReadme, function (e) {
                    if (e) {
                        return void cb({ error: "Error while creating the default pad:"+ e});
                    }
                    var href = '/pad/#' + hash;
                    var channel = Hash.hrefToHexChannelId(href, null);
                    var fileData = {
                        href: href,
                        channel: channel,
                        title: data.driveReadmeTitle,
                    };
                    Store.addPad(clientId, fileData, cb);
                });
            });
        };


        /**
         * Merge the anonymous drive into the user drive at registration
         * data
         *   - anonHash
         */
        Store.migrateAnonDrive = function (clientId, data, cb) {
            require(['/common/mergeDrive.js'], function (Merge) {
                var hash = data.anonHash;
                Merge.anonDriveIntoUser(store, hash, cb);
            });
        };

        // Set the display name (username) in the proxy
        Store.setDisplayName = function (clientId, value, cb) {
            store.proxy[Constants.displayNameKey] = value;
            broadcast([clientId], "UPDATE_METADATA");
            if (store.messenger) { store.messenger.updateMyData(); }
            onSync(cb);
        };

        // Reset the drive part of the userObject (from settings)
        Store.resetDrive = function (clientId, data, cb) {
            nThen(function (waitFor) {
                removeOwnedPads(waitFor);
            }).nThen(function () {
                store.proxy.drive = store.fo.getStructure();
                sendDriveEvent('DRIVE_CHANGE', {
                    path: ['drive', 'filesData']
                }, clientId);
                onSync(cb);
            });
        };

        /**
         * Settings & pad attributes
         * data
         *   - href (String)
         *   - attr (Array)
         *   - value (String)
         */
        Store.setPadAttribute = function (clientId, data, cb) {
            store.manager.setPadAttribute(data, function () {
                sendDriveEvent('DRIVE_CHANGE', {
                    path: ['drive', UserObject.FILES_DATA]
                }, clientId);
                onSync(cb);
            });
        };
        Store.getPadAttribute = function (clientId, data, cb) {
            store.manager.getPadAttribute(data, function (err, val) {
                if (err) { return void cb({error: err}); }
                cb(val);
            });
        };

        var getAttributeObject = function (attr) {
            if (typeof attr === "string") {
                console.error('DEPRECATED: use setAttribute with an array, not a string');
                return {
                    path: ['settings'],
                    obj: store.proxy.settings,
                    key: attr
                };
            }
            if (!Array.isArray(attr)) { return void console.error("Attribute must be string or array"); }
            if (attr.length === 0) { return void console.error("Attribute can't be empty"); }
            var obj = store.proxy.settings;
            attr.forEach(function (el, i) {
                if (i === attr.length-1) { return; }
                if (!obj[el]) {
                    obj[el] = {};
                }
                else if (typeof obj[el] !== "object") { return void console.error("Wrong attribute"); }
                obj = obj[el];
            });
            return {
                path: ['settings'].concat(attr),
                obj: obj,
                key: attr[attr.length-1]
            };
        };
        Store.setAttribute = function (clientId, data, cb) {
            try {
                var object = getAttributeObject(data.attr);
                object.obj[object.key] = data.value;
            } catch (e) { return void cb({error: e}); }
            onSync(cb);
        };
        Store.getAttribute = function (clientId, data, cb) {
            var object;
            try {
                object = getAttributeObject(data.attr);
            } catch (e) { return void cb({error: e}); }
            cb(object.obj[object.key]);
        };

        // Tags
        Store.listAllTags = function (clientId, data, cb) {
            cb(store.manager.getTagsList());
        };

        // Templates
        Store.getTemplates = function (clientId, data, cb) {
            // No templates in shared folders: we don't need the manager here
            var templateFiles = store.userObject.getFiles(['template']);
            var res = [];
            templateFiles.forEach(function (f) {
                var data = store.userObject.getFileData(f);
                res.push(JSON.parse(JSON.stringify(data)));
            });
            cb(res);
        };
        Store.incrementTemplateUse = function (clientId, href) {
            // No templates in shared folders: we don't need the manager here
            store.userObject.getPadAttribute(href, 'used', function (err, data) {
                // This is a not critical function, abort in case of error to make sure we won't
                // create any issue with the user object or the async store
                if (err) { return; }
                var used = typeof data === "number" ? ++data : 1;
                store.userObject.setPadAttribute(href, 'used', used);
            });
        };

        // Pads
        Store.isOnlyInSharedFolder = function (clientId, channel, cb) {
            var res = store.manager.findChannel(channel);

            // A pad is only in a shared worker if:
            // 1. this pad is in at least one proxy
            // 2. no proxy containing this pad is the main drive
            return cb (res.length && !res.some(function (obj) {
                // Main drive doesn't have an fId (folder ID)
                return !obj.fId;
            }));
        };
        Store.moveToTrash = function (clientId, data, cb) {
            var href = Hash.getRelativeHref(data.href);
            store.userObject.forget(href);
            sendDriveEvent('DRIVE_CHANGE', {
                path: ['drive', UserObject.FILES_DATA]
            }, clientId);
            onSync(cb);
        };
        Store.setPadTitle = function (clientId, data, cb) {
            var title = data.title;
            var href = data.href;
            var channel = data.channel;
            var p = Hash.parsePadUrl(href);
            var h = p.hashData;

            if (AppConfig.disableAnonymousStore && !store.loggedIn) { return void cb(); }

            var channelData = Store.channels && Store.channels[channel];

            var owners;
            if (channelData && channelData.wc && channel === channelData.wc.id) {
                owners = channelData.data.owners || undefined;
            }
            if (data.owners) {
                owners = data.owners;
            }

            var expire;
            if (channelData && channelData.wc && channel === channelData.wc.id) {
                expire = +channelData.data.expire || undefined;
            }

            var datas = store.manager.findChannel(channel);
            var contains = datas.length !== 0;
            datas.forEach(function (obj) {
                var pad = obj.data;
                pad.atime = +new Date();
                pad.title = title;
                if (owners || h.type !== "file") {
                    // OWNED_FILES
                    // Never remove owner for files
                    pad.owners = owners;
                }
                pad.expire = expire;
                if (h.mode === 'view') { return; }

                // If we only have rohref, it means we have a stronger href
                if (!pad.href) {
                    // If we have a stronger url, remove the possible weaker from the trash.
                    // If all of the weaker ones were in the trash, add the stronger to ROOT
                    obj.userObject.restoreHref(href);
                }
                pad.href = href;
            });

            // Add the pad if it does not exist in our drive
            if (!contains) {
                var autoStore = Util.find(store.proxy, ['settings', 'general', 'autostore']);
                var ownedByMe = Array.isArray(owners) && owners.indexOf(store.proxy.edPublic) !== -1;
                if (autoStore !== 1 && !data.forceSave && !data.path && !ownedByMe) {
                    // send event to inner to display the corner popup
                    postMessage(clientId, "AUTOSTORE_DISPLAY_POPUP", {
                        autoStore: autoStore
                    });
                    return void cb();
                } else {
                    var roHref;
                    if (h.mode === "view") {
                        roHref = href;
                        href = undefined;
                    }
                    Store.addPad(clientId, {
                        href: href,
                        roHref: roHref,
                        channel: channel,
                        title: title,
                        owners: owners,
                        expire: expire,
                        password: data.password,
                        path: data.path
                    }, cb);
                    // Let inner know that dropped files shouldn't trigger the popup
                    postMessage(clientId, "AUTOSTORE_DISPLAY_POPUP", {
                        stored: true
                    });
                    return;
                }
            } else {
                sendDriveEvent('DRIVE_CHANGE', {
                    path: ['drive', UserObject.FILES_DATA]
                }, clientId);
                // Let inner know that dropped files shouldn't trigger the popup
                postMessage(clientId, "AUTOSTORE_DISPLAY_POPUP", {
                    stored: true
                });
            }
            onSync(cb);
        };

        // Filepicker app
        Store.getSecureFilesList = function (clientId, query, cb) {
            var list = {};
            var types = query.types;
            var where = query.where;
            var filter = query.filter || {};
            var isFiltered = function (type, data) {
                var filtered;
                var fType = filter.fileType || [];
                if (type === 'file' && fType.length) {
                    if (!data.fileType) { return true; }
                    filtered = !fType.some(function (t) {
                        return data.fileType.indexOf(t) === 0;
                    });
                }
                return filtered;
            };
            store.manager.getSecureFilesList(where).forEach(function (obj) {
                var data = obj.data;
                var id = obj.id;
                var parsed = Hash.parsePadUrl(data.href || data.roHref);
                if ((!types || types.length === 0 || types.indexOf(parsed.type) !== -1) &&
                    !isFiltered(parsed.type, data)) {
                    list[id] = data;
                }
            });
            cb(list);
        };
        Store.getPadData = function (clientId, id, cb) {
            // FIXME: this is only used for templates at the moment, so we don't need the manager
            cb(store.userObject.getFileData(id));
        };


        // Messaging (manage friends from the userlist)
        var getMessagingCfg = function (clientId) {
            return {
                proxy: store.proxy,
                realtime: store.realtime,
                network: store.network,
                updateMetadata: function () {
                    postMessage(clientId, "UPDATE_METADATA");
                },
                pinPads: function (data, cb) { Store.pinPads(null, data, cb); },
                friendComplete: function (data) {
                    if (data.friend && store.messenger && store.messenger.onFriendAdded) {
                        store.messenger.onFriendAdded(data.friend);
                    }
                    postMessage(clientId, "EV_FRIEND_COMPLETE", data);
                },
                friendRequest: function (data, cb) {
                    postMessage(clientId, "Q_FRIEND_REQUEST", data, cb);
                },
            };
        };
        Store.inviteFromUserlist = function (clientId, data, cb) {
            var messagingCfg = getMessagingCfg(clientId);
            Messaging.inviteFromUserlist(messagingCfg, data, cb);
        };
        Store.addDirectMessageHandlers = function (clientId, data) {
            var messagingCfg = getMessagingCfg(clientId);
            Messaging.addDirectMessageHandler(messagingCfg, data.href);
        };

        // Messenger

        // Get hashes for the share button
        Store.getStrongerHash = function (clientId, data, cb) {
            var allPads = Util.find(store.proxy, ['drive', 'filesData']) || {};

            // If we have a stronger version in drive, add it and add a redirect button
            var stronger = Hash.findStronger(data.href, data.channel, allPads);
            if (stronger) {
                var parsed2 = Hash.parsePadUrl(stronger.href);
                return void cb(parsed2.hash);
            }
            cb();
        };

        Store.messenger = {
            execCommand: function (clientId, data, cb) {
                if (!store.messenger) { return void cb({error: 'Messenger is disabled'}); }
                store.messenger.execCommand(data, cb);
            }
        };

        // OnlyOffice
        Store.onlyoffice = {
            execCommand: function (clientId, data, cb) {
                if (!store.onlyoffice) { return void cb({error: 'OnlyOffice is disabled'}); }
                store.onlyoffice.execCommand(clientId, data, cb);
            }
        };

        // Cursor

        Store.cursor = {
            execCommand: function (clientId, data, cb) {
                if (!store.cursor) { return void cb ({error: 'Cursor channel is disabled'}); }
                store.cursor.execCommand(clientId, data, cb);
            }
        };

        //////////////////////////////////////////////////////////////////
        /////////////////////// PAD //////////////////////////////////////
        //////////////////////////////////////////////////////////////////

        var channels = Store.channels = store.channels = {};

        Store.joinPad = function (clientId, data) {
            var isNew = typeof channels[data.channel] === "undefined";
            var channel = channels[data.channel] = channels[data.channel] || {
                queue: [],
                data: {},
                clients: [],
                bcast: function (cmd, data, notMe) {
                    channel.clients.forEach(function (cId) {
                        if (cId === notMe) { return; }
                        postMessage(cId, cmd, data);
                    });
                },
                history: [],
                pushHistory: function (msg, isCp) {
                    if (isCp) {
                        // the current message is a checkpoint.
                        // push it to your worker's history, prepending it with cp|
                        // cp| and anything else related to checkpoints has already
                        // been stripped by chainpad-netflux-worker or within async store
                        // when the message was outgoing.
                        channel.history.push('cp|' + msg);
                        // since the latest message is a checkpoint, we are able to drop
                        // some of the older history, but we can't rely on checkpoints being
                        // correct, as they might be checkpoints from different forks
                        var i;
                        for (i = channel.history.length - 101; i > 0; i--) {
                            if (/^cp\|/.test(channel.history[i])) { break; }
                        }
                        channel.history = channel.history.slice(Math.max(i, 0));
                        return;
                    }
                    channel.history.push(msg);
                }
            };
            if (channel.clients.indexOf(clientId) === -1) {
                channel.clients.push(clientId);
            }

            if (!isNew && channel.wc) {
                postMessage(clientId, "PAD_CONNECT", {
                    myID: channel.wc.myID,
                    id: channel.wc.id,
                    members: channel.wc.members
                });
                channel.wc.members.forEach(function (m) {
                    postMessage(clientId, "PAD_JOIN", m);
                });
                channel.history.forEach(function (msg) {
                    postMessage(clientId, "PAD_MESSAGE", {
                        msg: CpNfWorker.removeCp(msg),
                        user: channel.wc.myID,
                        validateKey: channel.data.validateKey
                    });
                });
                postMessage(clientId, "PAD_READY");

                return;
            }
            var conf = {
                onReady: function (padData) {
                    channel.data = padData || {};
                    if (padData && padData.validateKey && store.messenger) {
                        store.messenger.storeValidateKey(data.channel, padData.validateKey);
                    }
                    postMessage(clientId, "PAD_READY");
                },
                onMessage: function (user, m, validateKey, isCp) {
                    channel.pushHistory(m, isCp);
                    channel.bcast("PAD_MESSAGE", {
                        user: user,
                        msg: m,
                        validateKey: validateKey
                    });
                },
                onJoin: function (m) {
                    channel.bcast("PAD_JOIN", m);
                },
                onLeave: function (m) {
                    channel.bcast("PAD_LEAVE", m);
                },
                onDisconnect: function () {
                    channel.bcast("PAD_DISCONNECT");
                },
                onError: function (err) {
                    channel.bcast("PAD_ERROR", err);
                    delete channels[data.channel]; // TODO test?
                },
                channel: data.channel,
                validateKey: data.validateKey,
                owners: data.owners,
                password: data.password,
                expire: data.expire,
                network: store.network,
                //readOnly: data.readOnly,
                onConnect: function (wc, sendMessage) {
                    channel.sendMessage = function (msg, cId, cb) {
                        // Send to server
                        sendMessage(msg, cb);
                        // Broadcast to other tabs
                        channel.pushHistory(CpNfWorker.removeCp(msg), /^cp\|/.test(msg));
                        channel.bcast("PAD_MESSAGE", {
                            user: wc.myID,
                            msg: CpNfWorker.removeCp(msg),
                            validateKey: channel.data.validateKey
                        }, cId);
                    };
                    channel.wc = wc;
                    channel.queue.forEach(function (data) {
                        channel.sendMessage(data.message, clientId);
                    });
                    channel.bcast("PAD_CONNECT", {
                        myID: wc.myID,
                        id: wc.id,
                        members: wc.members
                    });
                }
            };
            channel.cpNf = CpNfWorker.start(conf);
        };
        Store.leavePad = function (clientId, data, cb) {
            var channel = channels[data.channel];
            if (!channel || !channel.cpNf) { return void cb ({error: 'EINVAL'}); }
            channel.cpNf.stop();
            delete channels[data.channel];
            cb();
        };
        Store.sendPadMsg = function (clientId, data, cb) {
            var msg = data.msg;
            var channel = channels[data.channel];
            if (!channel) {
                return; }
            if (!channel.wc) {
                channel.queue.push(msg);
                return void cb();
            }
            channel.sendMessage(msg, clientId, cb);
        };

        // GET_FULL_HISTORY from sframe-common-outer
        Store.getFullHistory = function (clientId, data, cb) {
            var network = store.network;
            var hkn = network.historyKeeper;
            //var crypto = Crypto.createEncryptor(data.keys);
            // Get the history messages and send them to the iframe
            var parse = function (msg) {
                try {
                    return JSON.parse(msg);
                } catch (e) {
                    return null;
                }
            };
            var msgs = [];
            var completed = false;
            var onMsg = function (msg) {
                if (completed) { return; }
                var parsed = parse(msg);
                if (parsed[0] === 'FULL_HISTORY_END') {
                    cb(msgs);
                    completed = true;
                    return;
                }
                if (parsed[0] !== 'FULL_HISTORY') { return; }
                if (parsed[1] && parsed[1].validateKey) { // First message
                    return;
                }
                if (parsed[1][3] !== data.channel) { return; }
                msg = parsed[1][4];
                if (msg) {
                    msg = msg.replace(/cp\|(([A-Za-z0-9+\/=]+)\|)?/, '');
                    //var decryptedMsg = crypto.decrypt(msg, true);
                    msgs.push(msg);
                }
            };
            network.on('message', onMsg);
            network.sendto(hkn, JSON.stringify(['GET_FULL_HISTORY', data.channel, data.validateKey]));
        };

        Store.getHistoryRange = function (clientId, data, cb) {
            var network = store.network;
            var hkn = network.historyKeeper;
            var parse = function (msg) {
                try {
                    return JSON.parse(msg);
                } catch (e) {
                    return null;
                }
            };
            var msgs = [];
            var first = true;
            var fullHistory = false;
            var completed = false;
            var lastKnownHash;
            var txid = Util.uid();

            var onMsg = function (msg) {
                if (completed) { return; }
                var parsed = parse(msg);
                if (parsed[1] !== txid) { console.log('bad txid'); return; }
                if (parsed[0] === 'HISTORY_RANGE_END') {
                    cb({
                        messages: msgs,
                        isFull: fullHistory,
                        lastKnownHash: lastKnownHash
                    });
                    completed = true;
                    return;
                }
                if (parsed[0] !== 'HISTORY_RANGE') { return; }
                if (parsed[2] && parsed[1].validateKey) { // Metadata
                    return;
                }
                if (parsed[2][3] !== data.channel) { return; }
                msg = parsed[2][4];
                if (msg) {
                    if (first) {
                        // If the first message if not a checkpoint, it means it is the first
                        // message of the pad, so we have the full history!
                        if (!/^cp\|/.test(msg)) { fullHistory = true; }
                        lastKnownHash = msg.slice(0,64);
                        first = false;
                    }
                    msg = msg.replace(/cp\|(([A-Za-z0-9+\/=]+)\|)?/, '');
                    msgs.push(msg);
                }
            };

            network.on('message', onMsg);
            network.sendto(hkn, JSON.stringify(['GET_HISTORY_RANGE', data.channel, {
                from: data.lastKnownHash,
                cpCount: 2,
                txid: txid
            }]));
        };

        // SHARED FOLDERS
        var loadSharedFolder = Store.loadSharedFolder = function (id, data, cb) {
            var parsed = Hash.parsePadUrl(data.href);
            var secret = Hash.getSecrets('drive', parsed.hash, data.password);
            var owners = data.owners;
            var listmapConfig = {
                data: {},
                websocketURL: NetConfig.getWebsocketURL(),
                channel: secret.channel,
                readOnly: false,
                validateKey: secret.keys.validateKey || undefined,
                crypto: Crypto.createEncryptor(secret.keys),
                userName: 'sharedFolder',
                logLevel: 1,
                ChainPad: ChainPad,
                classic: true,
                network: store.network,
                owners: owners
            };
            var rt = Listmap.create(listmapConfig);
            store.sharedFolders[id] = rt;
            rt.proxy.on('ready', function (info) {
                store.manager.addProxy(id, rt.proxy, info.leave);
                cb(rt, info.metadata);
            });
            if (store.driveEvents) {
                registerProxyEvents(rt.proxy, id);
            }
            return rt;
        };
        Store.loadSharedFolderAnon = function (clientId, data, cb) {
            loadSharedFolder(data.id, data.data, function () {
                cb();
            });
        };
        Store.addSharedFolder = function (clientId, data, cb) {
            Store.userObjectCommand(clientId, {
                cmd: 'addSharedFolder',
                data: data
            }, cb);
        };

        // Drive
        Store.userObjectCommand = function (clientId, cmdData, cb) {
            if (!cmdData || !cmdData.cmd) { return; }
            //var data = cmdData.data;
            var cb2 = function (data2) {
                //var paths = data.paths || [data.path] || [];
                //paths = paths.concat(data.newPath ? [data.newPath] : []);
                //paths.forEach(function (p) {
                    sendDriveEvent('DRIVE_CHANGE', {
                        path: ['drive', UserObject.FILES_DATA]
                        //path: ['drive'].concat(p)
                    }, clientId);
                //});
                onSync(function () {
                    cb(data2);
                });
            };
            store.manager.command(cmdData, cb2);
        };

        // Clients management
        var driveEventClients = [];
        var messengerEventClients = [];

        var dropChannel = function (chanId) {
            store.messenger.leavePad(chanId);
            store.cursor.leavePad(chanId);
            store.onlyoffice.leavePad(chanId);

            if (!Store.channels[chanId]) { return; }

            if (Store.channels[chanId].cpNf) {
                Store.channels[chanId].cpNf.stop();
            }

            delete Store.channels[chanId];
        };
        Store._removeClient = function (clientId) {
            var driveIdx = driveEventClients.indexOf(clientId);
            if (driveIdx !== -1) {
                driveEventClients.splice(driveIdx, 1);
            }
            var messengerIdx = messengerEventClients.indexOf(clientId);
            if (messengerIdx !== -1) {
                messengerEventClients.splice(messengerIdx, 1);
            }
            store.cursor.removeClient(clientId);
            store.onlyoffice.removeClient(clientId);

            Object.keys(Store.channels).forEach(function (chanId) {
                var chanIdx = Store.channels[chanId].clients.indexOf(clientId);
                if (chanIdx !== -1) {
                    Store.channels[chanId].clients.splice(chanIdx, 1);
                }
                if (Store.channels[chanId].clients.length === 0) {
                    dropChannel(chanId);
                }
            });
        };

        // Special events

        sendDriveEvent = function (q, data, sender) {
            driveEventClients.forEach(function (cId) {
                if (cId === sender) { return; }
                postMessage(cId, q, data);
            });
        };
        registerProxyEvents = function (proxy, fId) {
            proxy.on('change', [], function (o, n, p) {
                sendDriveEvent('DRIVE_CHANGE', {
                    id: fId,
                    old: o,
                    new: n,
                    path: p
                });
            });
            proxy.on('remove', [], function (o, p) {
                sendDriveEvent('DRIVE_REMOVE', {
                    id: fId,
                    old: o,
                    path: p
                });
            });
        };

        Store._subscribeToDrive = function (clientId) {
            if (driveEventClients.indexOf(clientId) === -1) {
                driveEventClients.push(clientId);
            }
            if (!store.driveEvents) {
                store.driveEvents = true;
                registerProxyEvents(store.proxy);
                Object.keys(store.manager.folders).forEach(function (fId) {
                    var proxy = store.manager.folders[fId].proxy;
                    registerProxyEvents(proxy, fId);
                });
            }
        };

        var sendMessengerEvent = function (q, data) {
            messengerEventClients.forEach(function (cId) {
                postMessage(cId, q, data);
            });
        };
        Store._subscribeToMessenger = function (clientId) {
            if (messengerEventClients.indexOf(clientId) === -1) {
                messengerEventClients.push(clientId);
            }
        };
        var loadMessenger = function () {
            if (AppConfig.availablePadTypes.indexOf('contacts') === -1) { return; }
            var messenger = store.messenger = Messenger.messenger(store);
            messenger.on('event', function (ev, data) {
                sendMessengerEvent('CHAT_EVENT', {
                    ev: ev,
                    data: data
                });
            });
        };

        var loadCursor = function () {
            store.cursor = Cursor.init(store, function (ev, data, clients) {
                clients.forEach(function (cId) {
                    postMessage(cId, 'CURSOR_EVENT', {
                        ev: ev,
                        data: data
                    });
                });
            });
        };

        var loadOnlyOffice = function () {
            store.onlyoffice = OnlyOffice.init(store, function (ev, data, clients) {
                clients.forEach(function (cId) {
                    postMessage(cId, 'OO_EVENT', {
                        ev: ev,
                        data: data
                    });
                });
            });
        };

        //////////////////////////////////////////////////////////////////
        /////////////////////// Init /////////////////////////////////////
        //////////////////////////////////////////////////////////////////

        var loadSharedFolders = function (waitFor) {
            store.sharedFolders = {};
            var shared = Util.find(store.proxy, ['drive', UserObject.SHARED_FOLDERS]) || {};
            // Check if any of our shared folder is expired or deleted by its owner.
            // If we don't check now, Listmap will create an empty proxy if it no longer exists on
            // the server.
            nThen(function (waitFor) {
                var edPublic = store.proxy.edPublic;
                var checkExpired = Object.keys(shared).filter(function (fId) {
                    var d = shared[fId];
                    return (Array.isArray(d.owners) && d.owners.length &&
                            (!edPublic || d.owners.indexOf(edPublic) === -1))
                            || (d.expire && d.expire < (+new Date()));
                }).map(function (fId) {
                    return shared[fId].channel;
                });
                Store.getDeletedPads(null, {list: checkExpired}, waitFor(function (chans) {
                    if (chans && chans.error) { return void console.error(chans.error); }
                    if (!Array.isArray(chans) || !chans.length) { return; }
                    var toDelete = [];
                    Object.keys(shared).forEach(function (fId) {
                        if (chans.indexOf(shared[fId].channel) !== -1
                            && toDelete.indexOf(fId) === -1) {
                            toDelete.push(fId);
                        }
                    });
                    toDelete.forEach(function (fId) {
                        var paths = store.userObject.findFile(Number(fId));
                        store.userObject.delete(paths, waitFor(), true);
                        delete shared[fId];
                    });
                }));
            }).nThen(function (waitFor) {
                Object.keys(shared).forEach(function (id) {
                    var sf = shared[id];
                    loadSharedFolder(id, sf, waitFor());
                });
            }).nThen(waitFor());
        };

        var onReady = function (clientId, returned, cb) {
            var proxy = store.proxy;
            var unpin = function (data, cb) {
                if (!store.loggedIn) { return void cb(); }
                Store.unpinPads(null, data, cb);
            };
            var pin = function (data, cb) {
                if (!store.loggedIn) { return void cb(); }
                Store.pinPads(null, data, cb);
            };
            var manager = store.manager = ProxyManager.create(proxy.drive, {
                edPublic: proxy.edPublic,
                pin: pin,
                unpin: unpin,
                loadSharedFolder: loadSharedFolder,
                settings: proxy.settings
            }, {
                outer: true,
                removeOwnedChannel: function (data, cb) { Store.removeOwnedChannel('', data, cb); },
                edPublic: store.proxy.edPublic,
                loggedIn: store.loggedIn,
                log: function (msg) {
                    // broadcast to all drive apps
                    sendDriveEvent("DRIVE_LOG", msg);
                }
            });
            var userObject = store.userObject = manager.user.userObject;
            nThen(function (waitFor) {
                postMessage(clientId, 'LOADING_DRIVE', {
                    state: 2
                });
                userObject.migrate(waitFor());
            }).nThen(function (waitFor) {
                Migrate(proxy, waitFor(), function (version, progress) {
                    postMessage(clientId, 'LOADING_DRIVE', {
                        state: (2 + (version / 10)),
                        progress: progress
                    });
                });
                Store.initAnonRpc(null, null, waitFor());
            }).nThen(function (waitFor) {
                postMessage(clientId, 'LOADING_DRIVE', {
                    state: 3
                });
                userObject.fixFiles();
                loadSharedFolders(waitFor);
                loadMessenger();
                loadCursor();
                loadOnlyOffice();
            }).nThen(function () {
                var requestLogin = function () {
                    broadcast([], "REQUEST_LOGIN");
                };

                if (store.loggedIn) {
                    /*  This isn't truly secure, since anyone who can read the user's object can
                        set their local loginToken to match that in the object. However, it exposes
                        a UI that will work most of the time. */

                    // every user object should have a persistent, random number
                    if (typeof(proxy.loginToken) !== 'number') {
                        proxy[Constants.tokenKey] = Math.floor(Math.random()*Number.MAX_SAFE_INTEGER);
                    }
                    returned[Constants.tokenKey] = proxy[Constants.tokenKey];

                    if (store.data.localToken && store.data.localToken !== proxy[Constants.tokenKey]) {
                        // the local number doesn't match that in
                        // the user object, request that they reauthenticate.
                        return void requestLogin();
                    }
                }

                if (!proxy.settings || !proxy.settings.general ||
                        typeof(proxy.settings.general.allowUserFeedback) !== 'boolean') {
                    proxy.settings = proxy.settings || {};
                    proxy.settings.general = proxy.settings.general || {};
                    proxy.settings.general.allowUserFeedback = true;
                }
                returned.feedback = proxy.settings.general.allowUserFeedback;

                if (typeof(cb) === 'function') { cb(returned); }

                if (typeof(proxy.uid) !== 'string' || proxy.uid.length !== 32) {
                    // even anonymous users should have a persistent, unique-ish id
                    console.log('generating a persistent identifier');
                    proxy.uid = Hash.createChannelId();
                }

                // if the user is logged in, but does not have signing keys...
                if (store.loggedIn && (!Store.hasSigningKeys() ||
                    !Store.hasCurveKeys())) {
                    return void requestLogin();
                }

                proxy.on('change', [Constants.displayNameKey], function (o, n) {
                    if (typeof(n) !== "string") { return; }
                    broadcast([], "UPDATE_METADATA");
                });
                proxy.on('change', ['profile'], function () {
                    // Trigger userlist update when the avatar has changed
                    broadcast([], "UPDATE_METADATA");
                });
                proxy.on('change', ['friends'], function () {
                    // Trigger userlist update when the friendlist has changed
                    broadcast([], "UPDATE_METADATA");
                });
                proxy.on('change', ['settings'], function () {
                    broadcast([], "UPDATE_METADATA");
                });
                proxy.on('change', [Constants.tokenKey], function () {
                    broadcast([], "UPDATE_TOKEN", { token: proxy[Constants.tokenKey] });
                });
            });
        };

        var connect = function (clientId, data, cb) {
            var hash = data.userHash || data.anonHash || Hash.createRandomHash('drive');
            storeHash = hash;
            if (!hash) {
                return void cb({error: '[Store.init] Unable to find or create a drive hash. Aborting...'});
            }
            // No password for drive
            var secret = Hash.getSecrets('drive', hash);
            var listmapConfig = {
                data: {},
                websocketURL: NetConfig.getWebsocketURL(),
                channel: secret.channel,
                readOnly: false,
                validateKey: secret.keys.validateKey || undefined,
                crypto: Crypto.createEncryptor(secret.keys),
                userName: 'fs',
                logLevel: 1,
                ChainPad: ChainPad,
                classic: true,
            };
            var rt = window.rt = Listmap.create(listmapConfig);
            store.proxy = rt.proxy;
            store.loggedIn = typeof(data.userHash) !== "undefined";

            var returned = {};
            rt.proxy.on('create', function (info) {
                store.realtime = info.realtime;
                store.network = info.network;
                if (!data.userHash) {
                    returned.anonHash = Hash.getEditHashFromKeys(secret);
                }
            }).on('ready', function (info) {
                if (store.userObject) { return; } // the store is already ready, it is a reconnection
                store.driveMetadata = info.metadata;
                if (!rt.proxy.drive || typeof(rt.proxy.drive) !== 'object') { rt.proxy.drive = {}; }
                var drive = rt.proxy.drive;
                // Creating a new anon drive: import anon pads from localStorage
                if ((!drive[Constants.oldStorageKey] || !Array.isArray(drive[Constants.oldStorageKey]))
                    && !drive['filesData']) {
                    drive[Constants.oldStorageKey] = [];
                }
                postMessage(clientId, 'LOADING_DRIVE', { state: 1 });
                // Drive already exist: return the existing drive, don't load data from legacy store
                onReady(clientId, returned, cb);
            })
            .on('change', ['drive', 'migrate'], function () {
                var path = arguments[2];
                var value = arguments[1];
                if (path[0] === 'drive' && path[1] === "migrate" && value === 1) {
                    rt.network.disconnect();
                    rt.realtime.abort();
                    broadcast([], 'NETWORK_DISCONNECT');
                }
            });

            rt.proxy.on('disconnect', function () {
                broadcast([], 'NETWORK_DISCONNECT');
            });
            rt.proxy.on('reconnect', function (info) {
                broadcast([], 'NETWORK_RECONNECT', {myId: info.myId});
            });

            // Ping clients regularly to make sure one tab was not closed without sending a removeClient()
            // command. This allow us to avoid phantom viewers in pads.
            var PING_INTERVAL = 30000;
            var MAX_PING = 1000;
            var MAX_FAILED_PING = 5;

            setInterval(function () {
                var clients = [];
                Object.keys(Store.channels).forEach(function (chanId) {
                    var c = Store.channels[chanId].clients;
                    Array.prototype.push.apply(clients, c);
                });
                clients = Util.deduplicateString(clients);
                clients.forEach(function (cId) {
                    var nb = 0;
                    var ping = function () {
                        if (nb >= MAX_FAILED_PING) {
                            Store._removeClient(cId);
                            postMessage(cId, 'TIMEOUT');
                            console.error('TIMEOUT', cId);
                            return;
                        }
                        nb++;
                        var to = setTimeout(ping, MAX_PING);
                        postMessage(cId, 'PING', null, function (err) {
                            if (err) { console.error(err); }
                            clearTimeout(to);
                        });
                    };
                    ping();
                });
            }, PING_INTERVAL);

        };

        /**
         * Data:
         *   - userHash or anonHash
         * Todo in cb
         *   - LocalStore.setFSHash if needed
         *   - sessionStorage.User_Hash
         *   - stuff with tokenKey
         * Event to outer
         *   - requestLogin
         */
        var initialized = false;

        var whenReady = function (cb) {
            if (store.returned) { return void cb(); }
            setTimeout(function() {
                whenReady(cb);
            }, 100);
        };

        Store.init = function (clientId, data, _callback) {
            var callback = Util.once(_callback);
            if (initialized) {
                return void whenReady(function () {
                    callback({
                        state: 'ALREADY_INIT',
                        returned: store.returned
                    });
                });
            }
            initialized = true;
            postMessage = function (clientId, cmd, d, cb) {
                data.query(clientId, cmd, d, cb);
            };
            broadcast = function (excludes, cmd, d, cb) {
                data.broadcast(excludes, cmd, d, cb);
            };

            store.data = data;
            connect(clientId, data, function (ret) {
                if (Object.keys(store.proxy).length === 1) {
                    Feedback.send("FIRST_APP_USE", true);
                }
                if (ret && ret.error) {
                    initialized = false;
                } else {
                    store.returned = ret;
                }

                callback(ret);
            });
        };

        Store.disconnect = function () {
            if (!store.network) { return; }
            store.network.disconnect();
        };
        return Store;
    };

    return {
        create: create
    };
});
