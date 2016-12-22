"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA withdraw Unit Test', function(accounts) {
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

    it("Throws when calling withdraw from a non-member", co(function *() {
        let rosca = yield createROSCA();

        yield Promise.all([
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
            rosca.withdraw({from: accounts[0]}),
            rosca.withdraw({from: accounts[1]}),
            rosca.withdraw({from: accounts[2]}),
            rosca.withdraw({from: accounts[3]})
        ]);

        yield utils.assertThrows(rosca.withdraw({from: accounts[4]}), "expected calling withdraw from a non-member to throw");
    }));

    it("Watches for event LogFundsWithdrawal()", co(function *() {
        let rosca = yield createROSCA();

        const ACTUAL_CONTRIBUTION = CONTRIBUTION_SIZE * 0.8;

        yield rosca.contribute({from: accounts[0], value: ACTUAL_CONTRIBUTION});

        let eventFired = false;
        let fundsWithdrawalEvent = rosca.LogFundsWithdrawal();
        fundsWithdrawalEvent.watch(function(error, log) {
            fundsWithdrawalEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.user, accounts[0], "LogContributionMade doesn't display proper user value");
            assert.equal(log.args.amount, ACTUAL_CONTRIBUTION, "LogContributionMade doesn't display proper amount value");
        });

        yield rosca.withdraw({from: accounts[0]});

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogContributionMade didn't fire");
    }));

    it("Throws when calling withdraw when totalDebit > totalCredit", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(ROSCA_START_TIME_DELAY);

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE * 0.8})
        ]);

        yield utils.assertThrows(rosca.withdraw({from: accounts[2]}), "expected calling withdraw when totalDebit is greater than totalCredit to throw");
    }));

    it("generates a LogCannotWithdrawFully when the contract balance is less than what the user is entitled to", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(ROSCA_START_TIME_DELAY);

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}), // contract's balance = CONTRIBUTION_SIZE
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        rosca.startRound(); // 2nd Member will be entitled to DEFAULT_POT which is greater than CONTRIBUTION_SIZE

        let withdrewAmount = 0;
        let credit_before = yield rosca.members.call(accounts[2]);
        let withdrawalEvent = rosca.LogCannotWithdrawFully();
        withdrawalEvent.watch(function(error,log){
            withdrewAmount = log.args.contractBalance;
            withdrawalEvent.stopWatching();
        });

        yield rosca.withdraw({from: accounts[2]});
        let credit_after = yield rosca.members.call(accounts[2]);
        assert.equal(credit_after[0], credit_before[0] - withdrewAmount, "partial withdraw didn't work properly");
    }));

    it("checks withdraw when the contract balance is more than what the user is entitled to", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(ROSCA_START_TIME_DELAY);

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 3}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);
        rosca.startRound();

        yield rosca.withdraw({from: accounts[2]});
        let credit_after = yield rosca.members.call(accounts[2]);
        let currentRound = yield rosca.currentRound.call();

        assert.equal(credit_after[0], currentRound * CONTRIBUTION_SIZE, "withdraw doesn't send the right amount");
    }));

    it("checks withdraw when the contract balance is less than what the user is entitled to while totalDiscount != 0", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(ROSCA_START_TIME_DELAY);

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 0.3}), // to make sure contract's balance is less than winning bid
            rosca.bid(DEFAULT_POT * 0.80, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);

        yield rosca.startRound();

        let withdrewAmount;
        let credit_before = yield rosca.members.call(accounts[2]);
        let withdrawalEvent = rosca.LogCannotWithdrawFully();
        withdrawalEvent.watch(function(error,log){
            withdrewAmount = log.args.contractBalance;
            withdrawalEvent.stopWatching();
        });

        yield rosca.withdraw({from: accounts[2]});
        let credit_after = yield rosca.members.call(accounts[2]);

        yield Promise.delay(300);
        assert.equal(credit_after[0], credit_before[0] - withdrewAmount, "partial withdraw didn't work properly");

    }));

    it("checks withdraw when the contract balance is more than what the user is entitled to while totalDiscount != 0", co(function *() {
        let rosca = yield createROSCA();

        const BID_TO_PLACE = DEFAULT_POT * 0.80;
        utils.increaseTime(ROSCA_START_TIME_DELAY);

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[2]})
        ]);

        utils.increaseTime(ROUND_PERIOD_DELAY);

        yield rosca.startRound();

        yield rosca.withdraw({from: accounts[2]});
        let creditAfter = yield rosca.members.call(accounts[2])[0];
        let currentRound = yield rosca.currentRound.call();
        let totalDiscount = DEFAULT_POT - BID_TO_PLACE;
        let expectedCredit = (currentRound * CONTRIBUTION_SIZE) - (totalDiscount / MEMBER_COUNT);

        assert.equal(creditAfter, expectedCredit , "withdraw doesn't send the right amount");
    }));
});