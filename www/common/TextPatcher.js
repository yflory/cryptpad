define(function () {

/*  diff takes two strings, the old content, and the desired content
    it returns the difference between these two strings in the form
    of an 'Operation' (as defined in chainpad.js).

    diff is purely functional.
*/
var diff = function (oldval, newval) {
    // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
    if (oldval === newval) {
        return;
    }

    var commonStart = 0;
    while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
        commonStart++;
    }

    var commonEnd = 0;
    while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
        commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
        commonEnd++;
    }

    var toRemove;
    var toInsert;

    /*  throw some assertions in here before dropping patches into the realtime */
    if (oldval.length !== commonStart + commonEnd) {
        toRemove = oldval.length - commonStart - commonEnd;
    }
    if (newval.length !== commonStart + commonEnd) {
        toInsert = newval.slice(commonStart, newval.length - commonEnd);
    }

    return {
        type: 'Operation',
        offset: commonStart,
        toInsert: toInsert,
        toRemove: toRemove
    };
}

/*  patch accepts a realtime facade and an operation (which might be falsey)
    it applies the operation to the realtime as components (remove/insert)

    patch has no return value, and operates solely through side effects on
    the realtime facade.
*/
var patch = function (ctx, op) {
    if (!op) { return; }
    if (op.toRemove) { ctx.remove(op.offset, op.toRemove); }
    if (op.toInsert) { ctx.insert(op.offset, op.toInsert); }
};

/*  log accepts a string and an operation, and prints an object to the console
    the object will display the content which is to be removed, and the content
    which will be inserted in its place.

    log is useful for debugging, but can otherwise be disabled.
*/
var log = function (text, op) {
    if (!op) { return; }
    console.log({
        insert: op.toInsert,
        remove: text.slice(op.offset, op.offset + op.toRemove)
    });
};

/* applyChange takes:
    ctx: the context (aka the realtime)
    oldval: the old value
    newval: the new value

    it performs a diff on the two values, and generates patches
    which are then passed into `ctx.remove` and `ctx.insert`.

    Due to its reliance on patch, applyChange has side effects on the supplied
    realtime facade.
*/
var applyChange = function(ctx, oldval, newval) {
    var op = diff(oldval, newval);
    // log(oldval, op)
    patch(ctx, op);
};

var create = function(config) {
    var ctx = config.realtime;

    // initial state will always fail the !== check in genop.
    // because nothing will equal this object
    var content = {};

    // *** remote -> local changes
    ctx.onPatch(function(pos, length) {
        content = ctx.getUserDoc()
    });

    // propogate()
    return function (newContent) {
        if (newContent !== content) {
            applyChange(ctx, ctx.getUserDoc(), newContent);
            if (ctx.getUserDoc() !== newContent) {
                console.log("Expected that: `ctx.getUserDoc() === newContent`!");
            }
            return true;
        }
        return false;
    };
};

return {
    create: create, // create a TextPatcher object
    diff: diff, // diff two strings
    patch: patch, // apply an operation to a chainpad's realtime facade
    log: log, // print the components of an operation
    applyChange: applyChange // a convenient wrapper around diff/log/patch
};
});