"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA bid Unit Test', function(accounts) {
    const MIN_START_DELAY = 86400 + 60;
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const FEE = 1 - 0.002;

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

    it("Throws when calling Bid with valid parameters before ROSCA starts", co(function *() {
        let rosca = yield createROSCA();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[1]}), "expected calling bid in round 0 to throw");
    }));

    it("Throws when calling bid without being in good Standing", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(MIN_START_DELAY);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT , {from: accounts[1]}), "expected calling bid before contributing to throw");
    }));

    it("Throws Placing bid less than 65% of the Pot", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(MIN_START_DELAY);
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});

        const MIN_DISTRIBUTION_PERCENT = yield rosca.MIN_DISTRIBUTION_PERCENT.call();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT * (MIN_DISTRIBUTION_PERCENT / 100 * 0.99), {from: accounts[2]}), "expected placing bid less than MIN_DISTRIBUTION_PERCENT threshold to throw");
    }));

    it("generates a LogNewLowestBid event when placing a valid new bid", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(MIN_START_DELAY);
        yield rosca.startRound();
        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});

        const BID_TO_PLACE = DEFAULT_POT * 0.94;

        let bidEvent = rosca.LogNewLowestBid();
        let eventFired = false;
        bidEvent.watch(function(error, log) {
            bidEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.bid, BID_TO_PLACE, "Log doesn't show the proper bid value");
            assert.equal(log.args.winnerAddress, accounts[2], "Log doesn't show proper winnerAddress");
        });

        yield rosca.bid(BID_TO_PLACE , {from: accounts[2]});

        yield Promise.delay(300);
        assert.isOk(eventFired,"Bid event did not fire");

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        let credit = yield rosca.members.call(accounts[2])[0];
        let expected_credit = CONTRIBUTION_SIZE + (BID_TO_PLACE * FEE);

        assert.equal(credit, expected_credit, "bid placed didn't affect winner's credit");
    }));

    it("Throws when placing a valid bid from paid member", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(MIN_START_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        yield utils.assertThrows(rosca.bid(DEFAULT_POT, {from: accounts[2]}), "calling bid from paid member succeed, didn't throw");
    }));

    it("new Higher bid is ignored" , co(function *() {
        let rosca = yield createROSCA();

        const BID_PERCENT = 0.95;

        utils.increaseTime(MIN_START_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[3]}),
            rosca.bid(DEFAULT_POT , {from: accounts[1]})
        ]);
        utils.increaseTime(ROUND_PERIOD_DELAY);
        yield rosca.startRound();

        let credit = yield rosca.members.call(accounts[1])[0];
        let expected_credit = CONTRIBUTION_SIZE + (DEFAULT_POT * FEE);

        assert.notEqual(credit, expected_credit, "new higher bid won"); // notEqual
    }));
});