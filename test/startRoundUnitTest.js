"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");


contract('ROSCA startRound Unit Test', function(accounts) {
    const ROSCA_START_TIME_DELAY = 86400 + 60;
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const MEMBER_COUNT = MEMBER_LIST.length + 1;
    const SERVICE_FEE = 2;

    function createROSCA() {
        utils.mine();

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;
        return ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + ROSCA_START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE);
    }

    it("watches for LogstartOfRound event", co(function *() {
        let rosca = yield createROSCA();

        let eventFired = false;
        let startOfRoundEvent = rosca.LogStartOfRound();
        startOfRoundEvent.watch(function(error,log){
            startOfRoundEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.currentRound, 1, "Log didnt show currentRound properly");
        });

        utils.increaseTime(ROSCA_START_TIME_DELAY);
        yield rosca.startRound();

        yield Promise.delay(300);

        assert.isOk(eventFired, "startOfRound event didn't fire");
    }));

    it("Throws when calling startRound before roundStartTime (including round = 0)", co(function *() {
        let rosca = yield createROSCA();

        for (let i = 0 ; i < MEMBER_COUNT + 1; i++) {
            yield utils.assertThrows(rosca.startRound(), "expected calling startRound before roundStartTime to throw");

            yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});

            utils.increaseTime(ROSCA_START_TIME_DELAY);
            yield rosca.startRound();
        }

        // checks if endOfROSCA has been set to true by calling contribute which should throw
        yield utils.assertThrows(rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}), "Calling contribute after ROSCA ended was expected to throw");
    }));
});