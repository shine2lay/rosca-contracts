"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

contract('ROSCA cleanUpPreviousRound Unit Test', function(accounts) {
    const ROSCA_START_TIME_DELAY = 86400 + 20;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const FEE = (1 - 0.002);

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

    it("checks if totalDiscount is added when lowestBid < DEFAULT_POT", co(function *() {
        let rosca = yield createROSCA();

        const BID_PERCENT = 0.75;

        utils.increaseTime(ROSCA_START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(), // needed to set lowestBid value + winnerAddress to 0
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[0]}),
            rosca.cleanUpPreviousRound()
        ]);

        let discount = yield rosca.totalDiscounts.call();

        assert.equal(discount, DEFAULT_POT * (1 - BID_PERCENT), "toalDiscount value didn't get added properly");
    }));

    it("watches for LogRoundFundsReleased event and check if winner gets proper values", co(function *() {
        let rosca = yield createROSCA();

        const BID_TO_PLACE = DEFAULT_POT * 0.68;

        utils.increaseTime(ROSCA_START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.bid(BID_TO_PLACE, {from: accounts[1]})
        ]);

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();

        fundsReleasedEvent.watch(co(function *(error,log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;

            let user = yield rosca.members.call(log.args.winnerAddress);
            assert.equal(accounts[1], log.args.winnerAddress);
            assert.isOk(user[2], "chosen address is not a member"); // user.alive
            assert.isOk(user[1], "Paid member was chosen"); // user.paid
            assert.equal(user[0].toString(), CONTRIBUTION_SIZE + BID_TO_PLACE * FEE, "winningBid is not Default_POT"); // user.credit
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(100);
        assert.isOk(eventFired);
    }));

    it("checks if random unpaid member in good Standing is picked when no bid was placed", co(function *() {
        let rosca = yield createROSCA();

        utils.increaseTime(ROSCA_START_TIME_DELAY);
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}), // member 0 will be eligible to win the pot if no bid was placed
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}), // member 2 will be eligible to win the pot if no bid was placed
        ]);

        let winner;
        let possibleWinner = [accounts[0], accounts[2]];
        let winnerAddress = 0;

        let eventFired = false;
        let fundsReleasedEvent = rosca.LogRoundFundsReleased();
        fundsReleasedEvent.watch(co(function *(error,log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;
            winnerAddress = log.args.winnerAddress;
            winner = yield rosca.members.call(log.args.winnerAddress);
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(300);

        assert.isOk(eventFired, "LogRoundFundReleased didn't occur");
        assert.include(possibleWinner, winnerAddress, "Non eligible member won the pot");
        assert.equal(winner[0], CONTRIBUTION_SIZE + DEFAULT_POT * FEE, "lowestBid is not deposited into winner's credit"); // winner.credit
        assert.isOk(winner[2], "a non member was chosen when there were no bids");
    }));
});