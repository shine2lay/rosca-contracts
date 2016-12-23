"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA addMember Unit Test', function(accounts) {
    //Parameters for new ROSCA creation
    const ROUND_PERIOD_IN_DAYS = 3;
    const MIN_TIME_BEFORE_START_IN_DAYS = 1;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const CONTRIBUTION_SIZE = 1e16;
    const SERVICE_FEE = 2;

    const START_TIME_DELAY = 86400 * MIN_TIME_BEFORE_START_IN_DAYS + 10; // 10 seconds is added as a buffer to prevent failed ROSCA creation

    function createROSCA() {
        utils.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;
        return ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
            SERVICE_FEE);
    }

    it("throws when adding an existing member", function () {
        let rosca = yield createROSCA();

        yield utils.assertThrows(rosca.addMember(accounts[1]), "adding existing member succeed when it should have thrown");
    });

    it("checks member get added properly", co(function *() {
        let rosca = yield createROSCA();

        // try contributing from a non-member to make sure membership hasn't been established
        yield utils.assertThrows(rosca.contribute({from: accounts[4], value: CONTRIBUTION_SIZE}),
            "expected calling contribute from non-member to throw");

        yield rosca.addMember(accounts[4]);
        yield rosca.contribute({from: accounts[4], value: CONTRIBUTION_SIZE});

        let member = yield rosca.members.call(accounts[4]);
        let credit = member[0];

        assert.equal(credit, CONTRIBUTION_SIZE, "newly added member couldn't contribute"); // user.credit
    }));
});