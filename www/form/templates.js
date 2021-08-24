define([
    '/customize/messages.js'
], function (Messages) {
    Messages.form_type_poll = "Quick poll"; // XXX update key
    var pollValues = [];
    var d8 = new Date();
    d8.setDate(d8.getDate() - d8.getDay()); // set sunday
    d8.setHours(8);
    d8.setMinutes(0);
    d8.setSeconds(0);
    d8.setMilliseconds(0);
    var d14 = new Date(d8);
    d14.setHours(14);
    [0,1,2].forEach(function () {
        d8.setDate(d8.getDate() + 1);
        d14.setDate(d14.getDate() + 1);
        pollValues.push(+d8);
        pollValues.push(+d14);
    });
    return [{
        id: 'a',
        used: 1,
        name: Messages.form_type_poll,
        content: {
            answers: {
                anonymous: true,
            },
            form: {
                "1": {
                    type: 'md'
                },
                "2": {
                    type: 'poll',
                    opts: {
                        type: 'time',
                        values: pollValues
                    }
                }
            },
            order: ["1", "2"]
        }
    }];
});
