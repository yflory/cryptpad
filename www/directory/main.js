define([
    '/api/config?cb=' + Math.random().toString(16).substring(2),
    '/customize/messages.js?app=directory',
    '/bower_components/textpatcher/TextPatcher.js',
    '/bower_components/chainpad-listmap/chainpad-listmap.js',
    '/bower_components/chainpad-crypto/crypto.js',
    '/common/cryptpad-common.js',
    '/common/visible.js',
    '/common/notify.js',
    '/bower_components/file-saver/FileSaver.min.js',
    '/bower_components/jquery/dist/jquery.min.js',
    '/customize/pad.js'
], function (Config, Messages, TextPatcher, Listmap, Crypto, Cryptpad, Visible, Notify) {
    var $ = window.jQuery;
    var saveAs = window.saveAs;

    Cryptpad.styleAlerts();
    console.log("Initializing your realtime session...");

    /*  TODO
        * set range of dates/times
          * (pair of date pickers)
        * hide options within that range
        * show hidden options
        * add notes to a particular time slot

        * check or uncheck options for a particular user
        * mark preference level? (+1, 0, -1)

        * delete/hide columns/rows

        // let users choose what they want the default input to be...

        * date
          - http://foxrunsoftware.github.io/DatePicker/ ?
        * ???
    */

    var secret = Cryptpad.getSecrets();
    var readOnly = secret.keys && !secret.keys.editKeyStr;
    if (!secret.keys) {
        secret.keys = secret.key;
    }
    if (readOnly) {
        $('#mainTitle').html($('#mainTitle').html() + ' - ' + Messages.readonly);
        $('#adduser, #addoption, #howToUse').remove();
    }

    var module = window.APP = {
        Cryptpad: Cryptpad,
    };

    var $textarea = $('#content');
    var setEditable = function (bool) {
        $textarea.attr('disabled', !bool);
    };

    // notifications
    var unnotify = function () {
        if (!(module.tabNotification &&
            typeof(module.tabNotification.cancel) === 'function')) { return; }
        module.tabNotification.cancel();
    };

    var notify = function () {
        if (!(Visible.isSupported() && !Visible.currently())) { return; }
        unnotify();
        module.tabNotification = Notify.tab(1000, 10);
    };

    var updateTitle = function (newTitle) {
        if (newTitle === document.title) { return; }
        // Change the title now, and set it back to the old value if there is an error
        var oldTitle = document.title;
        document.title = newTitle;
        Cryptpad.setPadTitle(newTitle, function (err, data) {
            if (err) {
                console.log("Couldn't set pad title");
                console.error(err);
                document.title = oldTitle;
                return;
            }
        });
    };

    // don't make changes until the interface is ready
    setEditable(false);

    var ready = function (info) {
        console.log("Your realtime object is ready");
        module.ready = true;

        var proxy = module.rt.proxy;
        $textarea.val(JSON.stringify(proxy));

        if (proxy.metadata && proxy.metadata.title) {
            updateTitle(proxy.metadata.title);
        }
        
        if (typeof proxy.version === "undefined") {
            proxy.version = 0;
        }
        if (typeof proxy.root === "undefined") {
            proxy.root = {};
        }
        if (typeof proxy.hashes === "undefined") {
            proxy.hashes = {}
        }

        proxy
        .on('change', [], function () {
            notify();
            $textarea.val(JSON.stringify(proxy));
        })
        .on('remove', [], function (o, p, root) {
            notify();
            $textarea.val(JSON.stringify(proxy));
        })
        .on('disconnect', function (info) {
            setEditable(false);
        });

        setEditable(true);
    };

    console.log(secret);
    console.log(JSON.stringify(secret));
    var config = {
        websocketURL: Cryptpad.getWebsocketURL(),
        channel: secret.channel,
        data: {},
        // our public key
        validateKey: secret.keys.validateKey || undefined,
        readOnly: readOnly,
        crypto: Crypto.createEncryptor(secret.keys),
    };

    // don't initialize until the store is ready.
    Cryptpad.ready(function () {

        var rt = window.rt = module.rt = Listmap.create(config);
        rt.proxy.on('create', function (info) {
            var realtime = module.realtime = info.realtime;

            var editHash;
            var viewHash = module.viewHash = Cryptpad.getViewHashFromKeys(info.channel, secret.keys);
            if (!readOnly) {
                editHash = Cryptpad.getEditHashFromKeys(info.channel, secret.keys);
            }
            // set the hash
            if (!readOnly) {
                window.location.hash = editHash;
            }

            Cryptpad.getPadTitle(function (err, title) {
                title = document.title = title || info.channel.slice(0, 8);

                Cryptpad.setPadTitle(title, function (err, data) {
                    if (err) {
                        console.log("unable to remember pad");
                        console.log(err);
                        return;
                    }
                });
            });
        }).on('ready', ready)
        .on('disconnect', function () {
            setEditable(false);
            Cryptpad.alert(Messages.common_connectionLost);
        });
    });

});
