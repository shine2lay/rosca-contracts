"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper');

let roscaHelper;

contract('ROSCA startRound Unit Test', function(accounts) {
    before(function() {
      consts.setMemberList(accounts);
    });

    beforeEach(co(function* () {
      roscaHelper = new ROSCAHelper(accounts, (yield utils.createEthROSCA()));
    }));

    it("watches for LogstartOfRound event", co(function* () {
        utils.increaseTime(consts.START_TIME_DELAY);
        let result = yield roscaHelper.startRound();
        let log = result.logs[0];

        assert.equal(log.args.currentRound, 1, "Log didnt show currentRound properly");
    }));

    it("watches for LogEndOfROSCA event", co(function* () {
        let eventFired = false;
        let endOfRoscaEvent = roscaHelper.getCurrentRosca().LogEndOfROSCA();  // eslint-disable-line new-cap
        endOfRoscaEvent.watch(function(error, log) {
            endOfRoscaEvent.stopWatching();
            eventFired = true;
        });

        for (let i = 0; i < consts.memberCount() + 1; i++) { // +1, to startRound
            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield roscaHelper.startRound();
            assert.isNotOk(eventFired);
        }

        yield Promise.delay(1000); // 1000ms delay to allow the event to fire properly
        assert.isOk(eventFired, "endOfROSCA event didn't fire");
    }));

    it("Throws when calling startRound before roundStartTime (including round = 0)", co(function* () {
        for (let i = 0; i < consts.memberCount() + 1; i++) {
            yield utils.assertThrows(roscaHelper.startRound(),
              "expected calling startRound before roundStartTime to throw");

            yield roscaHelper.contribute(2, consts.CONTRIBUTION_SIZE);

            utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
            yield roscaHelper.startRound();
        }
        // Unfortunately, we need to check the internal var directly.
        assert.isOk(yield roscaHelper.getCurrentRosca().endOfROSCA.call());
    }));
});
