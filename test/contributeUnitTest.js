"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA contribute Unit Test', function(accounts) {
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const CONTRIBUTION_SIZE = 1e16;

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 2;

    function createROSCA() {
        utils.mine();

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;
        return ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + ROSCA_START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE);
    }

    it("Throws when calling contribute from a non-member", co(function *() {
        let rosca = yield createROSCA();

        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}); // check if valid contribution can be made

        yield utils.assertThrows(rosca.contribute({from: accounts[4], value: CONTRIBUTION_SIZE}), "calling contribute from a non-member success");
    }));

    it("generates a LogContributionMade event after a successful contribution", co(function *() {
        let rosca = yield createROSCA();

        const ACTUAL_CONTRIBUTION  = CONTRIBUTION_SIZE * 0.1;

        let eventFired = false;
        let contributionMadeEvent = rosca.LogContributionMade();
        contributionMadeEvent.watch(function(error,log){
            contributionMadeEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.user, accounts[1], "LogContributionMade doesn't display proper user value");
            assert.equal(log.args.amount, ACTUAL_CONTRIBUTION, "LogContributionMade doesn't display proper amount value");
        });

        yield rosca.contribute({from: accounts[1], value: ACTUAL_CONTRIBUTION});

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogContributionMade event did not fire");
    }));

    it("Checks whether the contributed value gets registered properly", co(function *() {
        let rosca = yield createROSCA();

        const CONTRIBUTION_CHECK = CONTRIBUTION_SIZE * 1.2;

        yield Promise.all([
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE * 0.2}),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE})
        ]);
        let credit_after = yield rosca.members.call(accounts[2]);

        assert.equal(credit_after[0], CONTRIBUTION_CHECK, "contribution's credit value didn't get registered properly");
    }));

});