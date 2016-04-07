define([
    '/api/config?cb=' + Math.random().toString(16).substring(2),
    '/common/messages.js',
    '/common/crypto.js',
    '/padrtc/realtime-input.js',
    '/common/hyperjson.js',
    '/common/hyperscript.js',
    '/common/toolbar.js',
    '/common/cursor.js',
    '/common/json-ot.js',
    '/bower_components/diff-dom/diffDOM.js',
    '/bower_components/jquery/dist/jquery.min.js',
    '/customize/pad.js'
], function (Config, Messages, Crypto, realtimeInput, Hyperjson, Hyperscript, Toolbar, Cursor, JsonOT) {
    var $ = window.jQuery;
    var ifrw = $('#pad-iframe')[0].contentWindow;
    var Ckeditor; // to be initialized later...
    var DiffDom = window.diffDOM;

    window.Toolbar = Toolbar;
    window.Hyperjson = Hyperjson;

    var hjsonToDom = function (H) {
        return Hyperjson.callOn(H, Hyperscript);
    };

    var module = window.REALTIME_MODULE = {
        localChangeInProgress: 0
    };

    var userName = Crypto.rand64(8),
        toolbar;

    var isNotMagicLine = function (el) {
        // factor as:
        // return !(el.tagName === 'SPAN' && el.contentEditable === 'false');
        var filter = (el.tagName === 'SPAN' && el.contentEditable === 'false');
        if (filter) {
            console.log("[hyperjson.serializer] prevented an element" +
                "from being serialized:", el);
            return false;
        }
        return true;
    };

    var andThen = function (Ckeditor) {
        // $(window).on('hashchange', function() {
            // window.location.reload();
        // });
        var key;
        var channel = '';
        if (window.location.href.indexOf('#') === -1) {
            key = Crypto.genKey();
            // window.location.href = window.location.href + '#' + Crypto.genKey();
            // return;
        }
        else {
            var hash = window.location.hash.substring(1);
            var sep = hash.indexOf('|');
            channel = hash.substr(0,sep);
            key = hash.substr(sep+1);
        }

        var fixThings = false;
        // var key = Crypto.parseKey(window.location.hash.substring(1));
        var editor = window.editor = Ckeditor.replace('editor1', {
            // https://dev.ckeditor.com/ticket/10907
            needsBrFiller: fixThings,
            needsNbspFiller: fixThings,
            removeButtons: 'Source,Maximize',
            // magicline plugin inserts html crap into the document which is not part of the
            // document itself and causes problems when it's sent across the wire and reflected back
            removePlugins: 'resize'
        });

        editor.on('instanceReady', function (Ckeditor) {
            editor.execCommand('maximize');
            var documentBody = ifrw.$('iframe')[0].contentDocument.body;

            documentBody.innerHTML = Messages.initialState;

            var inner = window.inner = documentBody;
            var cursor = window.cursor = Cursor(inner);

            var setEditable = function (bool) {
                inner.setAttribute('contenteditable',
                    (typeof (bool) !== 'undefined'? bool : true));
            };

            // don't let the user edit until the pad is ready
            setEditable(false);

            var diffOptions = {
                preDiffApply: function (info) {
                    /*  Don't remove local instances of the magicline plugin */
                    if (info.node && info.node.tagName === 'SPAN' &&
                        info.node.getAttribute('contentEditable') === 'false') {
                        return true;
                    }

                    if (!cursor.exists()) { return; }
                    var frame = info.frame = cursor.inNode(info.node);
                    if (!frame) { return; }
                    if (typeof info.diff.oldValue === 'string' &&
                        typeof info.diff.newValue === 'string') {
                        var pushes = cursor.pushDelta(info.diff.oldValue,
                            info.diff.newValue);
                        if (frame & 1) {
                            if (pushes.commonStart < cursor.Range.start.offset) {
                                cursor.Range.start.offset += pushes.delta;
                            }
                        }
                        if (frame & 2) {
                            if (pushes.commonStart < cursor.Range.end.offset) {
                                cursor.Range.end.offset += pushes.delta;
                            }
                        }
                    }
                },
                postDiffApply: function (info) {
                    if (info.frame) {
                        if (info.node) {
                            if (info.frame & 1) { cursor.fixStart(info.node); }
                            if (info.frame & 2) { cursor.fixEnd(info.node); }
                        } else { console.log("info.node did not exist"); }

                        var sel = cursor.makeSelection();
                        var range = cursor.makeRange();

                        cursor.fixSelection(sel, range);
                    }
                }
            };

            var now = function () { return new Date().getTime(); };

            var initializing = true;
            var userList = {}; // List of pretty name of all users (mapped with their server ID)
            var toolbarList; // List of users still connected to the channel (server IDs)
            var addToUserList = function(data) {
                for (var attrname in data) { userList[attrname] = data[attrname]; }
                if(toolbarList && typeof toolbarList.onChange === "function") {
                    toolbarList.onChange(userList);
                }
            };

            var myData = {};
            var myUserName = ''; // My "pretty name"
            var myID; // My server ID

            var setMyID = function(info) {
              myID = info.myID || null;
              myUserName = myID;
            };

            var createChangeName = function(id, $container) {
                var buttonElmt = $container.find('#'+id)[0];
                buttonElmt.addEventListener("click", function() {
                   var newName = prompt("Change your name :", myUserName)
                   if (newName && newName.trim()) {
                       var myUserNameTemp = newName.trim();
                       if(newName.trim().length > 32) {
                         myUserNameTemp = myUserNameTemp.substr(0, 32);
                       }
                       myUserName = myUserNameTemp;
                       myData[myID] = {
                          name: myUserName
                       };
                       addToUserList(myData);
                       editor.fire( 'change' );
                   }
                });
            };

            var DD = new DiffDom(diffOptions);

            // apply patches, and try not to lose the cursor in the process!
            var applyHjson = function (shjson) {
                // var hjson = JSON.parse(shjson);
                // var peerUserList = hjson[hjson.length-1];
                // if(peerUserList.metadata) {
                  // var userData = peerUserList.metadata;
                  // addToUserList(userData);
                  // delete hjson[hjson.length-1];
                // }
                var userDocStateDom = hjsonToDom(JSON.parse(shjson));
                userDocStateDom.setAttribute("contenteditable", "true"); // lol wtf
                var patch = (DD).diff(inner, userDocStateDom);
                (DD).apply(inner, patch);
            };

            var realtimeOptions = {
                // provide initialstate...
                initialState: JSON.stringify(Hyperjson.fromDOM(inner, isNotMagicLine)),

                // the websocket URL (deprecated?)
                websocketURL: Config.websocketURL,
                webrtcURL: Config.webrtcURL,

                // our username
                userName: userName,

                // the channel we will communicate over
                channel: channel,

                // our encryption key
                cryptKey: key,

                // configuration :D
                doc: inner,

                setMyID: setMyID,

                // really basic operational transform
                transformFunction : JsonOT.validate
                // pass in websocket/netflux object TODO
            };

            var onRemote = realtimeOptions.onRemote = function (info) {
                if (initializing) { return; }

                var shjson = info.realtime.getUserDoc();

                // remember where the cursor is
                cursor.update();

                // Extract the user list (metadata) from the hyperjson
                var hjson = JSON.parse(shjson);
                var peerUserList = hjson[hjson.length-1];
                if(peerUserList.metadata) {
                  var userData = peerUserList.metadata;
                  // Update the local user data
                  userList = userData;
                  // Send the new data to the toolbar
                  if(toolbarList && typeof toolbarList.onChange === "function") {
                    toolbarList.onChange(userList);
                  }
                  hjson.pop();
                }

                // build a dom from HJSON, diff, and patch the editor
                applyHjson(shjson);

                // Build a new stringified Chainpad hyperjson without metadata to compare with the one build from the dom
                shjson = JSON.stringify(hjson);

                var hjson2 = Hyperjson.fromDOM(inner);
                var shjson2 = JSON.stringify(hjson2);
                if (shjson2 !== shjson) {
                    console.error("shjson2 !== shjson");
                    module.realtimeInput.patchText(shjson2);
                }
            };

            var onInit = realtimeOptions.onInit = function (info) {
                var $bar = $('#pad-iframe')[0].contentWindow.$('#cke_1_toolbox');
                toolbarList = info.userList;
                var config = {
                    userData: userList,
                    changeNameID: 'cryptpad-changeName'
                };
                toolbar = info.realtime.toolbar = Toolbar.create($bar, info.myID, info.realtime, info.webChannel, info.userList, config);
                createChangeName('cryptpad-changeName', $bar);
                /* TODO handle disconnects and such*/
            };

            var onReady = realtimeOptions.onReady = function (info) {
                console.log("Unlocking editor");
                initializing = false;
                setEditable(true);
                var shjson = info.realtime.getUserDoc();
                applyHjson(shjson);
            };

            var onAbort = realtimeOptions.onAbort = function (info) {
                console.log("Aborting the session!");
                // stop the user from continuing to edit
                setEditable(false);
                // TODO inform them that the session was torn down
                toolbar.failed();
            };





            var rti = module.realtimeInput = realtimeInput.start(realtimeOptions);

            /* catch `type="_moz"` before it goes over the wire */
            var brFilter = function (hj) {
                if (hj[1].type === '_moz') { hj[1].type = undefined; }
                return hj;
            };

            // $textarea.val(JSON.stringify(Convert.dom.to.hjson(inner)));

            /*  It's incredibly important that you assign 'rti.onLocal'
                It's used inside of realtimeInput to make sure that all changes
                make it into chainpad.

                It's being assigned this way because it can't be passed in, and
                and can't be easily returned from realtime input without making
                the code less extensible.
            */
            var propogate = rti.onLocal = function () {
                /*  if the problem were a matter of external patches being
                    applied while a local patch were in progress, then we would
                    expect to be able to check and find
                    'module.localChangeInProgress' with a non-zero value while
                    we were applying a remote change.
                */
                var hjson = Hyperjson.fromDOM(inner, isNotMagicLine, brFilter);
                if(Object.keys(myData).length > 0) {
                    hjson[hjson.length] = {metadata: userList};
                }
                var shjson = JSON.stringify(hjson);
                if (!rti.patchText(shjson)) {
                    return;
                }
                rti.onEvent(shjson);
            };

            /* hitting enter makes a new line, but places the cursor inside
                of the <br> instead of the <p>. This makes it such that you
                cannot type until you click, which is rather unnacceptable.
                If the cursor is ever inside such a <br>, you probably want
                to push it out to the parent element, which ought to be a
                paragraph tag. This needs to be done on keydown, otherwise
                the first such keypress will not be inserted into the P. */
            inner.addEventListener('keydown', cursor.brFix);

            editor.on('change', propogate);
            // editor.on('change', function () {
                // var hjson = Convert.core.hyperjson.fromDOM(inner);
                // if(myData !== {}) {
                    // hjson[hjson.length] = {metadata: userList};
                // }
                // $textarea.val(JSON.stringify(hjson));
                // rti.bumpSharejs();
            // });
        });
    };

    var interval = 100;
    var first = function () {
        Ckeditor = ifrw.CKEDITOR;
        if (Ckeditor) {
            andThen(Ckeditor);
        } else {
            console.log("Ckeditor was not defined. Trying again in %sms",interval);
            setTimeout(first, interval);
        }
    };

    $(first);
});
