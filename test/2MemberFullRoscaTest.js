"use strict";

let Promise = require("bluebird");
let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");

let rosca;
let accounts;

// Shortcut functions
function contribute(from, value) {
    return rosca.contribute({from: accounts[from], value: value});
}

function startRound() {
    return rosca.startRound();
}

function bid(from, bidInWei) {
    return rosca.bid(bidInWei, {from: accounts[from]});
}

function withdraw(from) {
    return rosca.withdraw({from: accounts[from]});
}

function participantInfo(member) {
    return rosca.members.call(accounts[member]);
}

function contractBalance() {
    return web3.eth.getBalance(rosca.address).toNumber();
}

function assertWeiCloseTo(actualTotalDiscounts, expectedTotalDiscounts) {
    // deal with rounding errors by allowing some minimal difference.
    assert.closeTo(actualTotalDiscounts, expectedTotalDiscounts, 5);
}

function* getContractStatus() {
    let results = yield Promise.all([
        participantInfo(0),
        participantInfo(1),
        rosca.totalDiscounts.call(),
        rosca.currentRound.call()
    ]);
    return {
        credits: [
            results[0][0].toNumber(), results[1][0].toNumber()],
        totalDiscounts: results[2].toNumber(),
        currentRound: results[3].toNumber(),
        balance: contractBalance()
    };
}


contract('Full 2 Member ROSCA Test', function(accounts_) {
    const MIN_START_DELAY = 86400 + 10;
    const ROUND_PERIOD_IN_DAYS = 3;
    const ROUND_PERIOD = ROUND_PERIOD_IN_DAYS * 86400;
    const MEMBER_COUNT = 2;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const SERVICE_FEE_IN_THOUSANDTHS = 10;
    const NET_REWARDS = (1 - SERVICE_FEE_IN_THOUSANDTHS / 1000);

    before(function(done) {
        accounts = accounts_;
        utils.mineOneBlock();  // reset the blockchain

        let latestBlock = web3.eth.getBlock("latest");
        let blockTime = latestBlock.timestamp;
        ROSCATest.new(
            ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + MIN_START_DELAY, accounts.slice(1, 2),
            SERVICE_FEE_IN_THOUSANDTHS).then(function(aRosca) {
            rosca = aRosca;
            done();
        });
    });

    it("pre-ROSCA: checks rosca status is valid", co(function*() {
        let contract = yield getContractStatus();

        for (let i = 0; i < 2; ++i) {
            assert.equal(contract.credits[i], 0); // credit of each participant
        }
        assert.equal(contract.totalDiscounts, 0); // totalDiscount value
        assert.equal(contract.currentRound, 0); // currentRound value
        assert.equal(contract.balance, 0);
    }));

    // In the different tests' comments:
    // C is the CONTRIBUTION_SIZE
    // P is the DEFAULT_POT
    // MC is MEMBER_COUNT == 4
    // NR is NET_REWARDS
    it("1st round: p1 wins 0.90 of the pot", co(function*() {
        yield Promise.all([
            contribute(0, CONTRIBUTION_SIZE),  // p0's credit == 1C
        ]);
        utils.increaseTime(ROUND_PERIOD);

        yield Promise.all([
            startRound(),
            contribute(1, CONTRIBUTION_SIZE), // p1's credit = C
            bid(0, DEFAULT_POT), // lowestBid = pot, winner = 0
            bid(1, DEFAULT_POT * 0.90), // lowestBid = Pot * 0.90, winner = 1
        ]);

        utils.increaseTime(ROUND_PERIOD);

        yield startRound();

        let contract = yield getContractStatus();

        // Note that all credits are actually CONTRIBUTION_SIZE more than participants can
        // draw (neglecting totalDiscounts).
        assert.equal(contract.credits[0], CONTRIBUTION_SIZE);
        assert.equal(contract.credits[1], (1 + 2 * 0.9 * NET_REWARDS) * CONTRIBUTION_SIZE);
        // totalDiscounts = 0.10P = 0.1 * 2 C == 0.2C.
        assertWeiCloseTo(contract.totalDiscounts, 0.2 * CONTRIBUTION_SIZE);

        // This round contract started with 0.
        // Participants contributed C + C == 2C.
        // Expected balance is thus 2C.
        assert.equal(contract.balance, 2 * CONTRIBUTION_SIZE);

        assert.equal(contract.currentRound, 2); // currentRound value
        assert.isNotOk(yield rosca.endOfROSCA.call());
    }));

    it("2nd round: p0 wins by default", co(function*() {
        // In this round, 1's credit is
        // C + P * 0.90 * NR == C + 2C * 0.90 * 0.99  == 2.782C.
        // This is the 2nd round, so they need the following to hold:
        // newCredit + TD / MC == 2C. So newCredit == 2C - TD / MC == 2C - 0.1C == 1.9C .
        // They can thus withdraw 2.782C - 1.9C = 0.882C .
        let contractBalanceBefore = contractBalance();
        yield withdraw(1);

        let contract = yield getContractStatus();
        assert.equal(contractBalanceBefore - contract.balance, 0.882 * CONTRIBUTION_SIZE);
        assert.equal((yield getContractStatus()).credits[1], 1.9 * CONTRIBUTION_SIZE);

        yield contribute(0, CONTRIBUTION_SIZE * 0.9); // p0's credit = 1.90C
        utils.increaseTime(ROUND_PERIOD);

        yield startRound();

        contract = yield getContractStatus();

        // Note that all credits are actually 2C more than participants can draw (neglecting totalDiscounts).
        // Total discounts by now is 0.10P.

        // winner of this round is p0. They win 1.0 * DEFAULT_POT * NR = 1.0 * 2C * 0.99 == 1.98C. Adding to that
        // their existing credit of 1.9 C, they have 3.88C.
        assert.equal(contract.credits[0], 3.88 * CONTRIBUTION_SIZE);
        assert.equal(contract.credits[1], 1.9 * CONTRIBUTION_SIZE);
        // TD == OLD_TD = 0.2 C
        assertWeiCloseTo(contract.totalDiscounts, 0.2 * CONTRIBUTION_SIZE);

        // This round started with 2C .
        // Contribution is 0.8C.
        // p1 withdrew 0.873C .
        // Thus we expect credit to be (2 + 0.9 - 0.882) == 2.018.
        assertWeiCloseTo(contract.balance, 2.018 * CONTRIBUTION_SIZE);

        assert.equal(contract.currentRound, 2); // currentRound value
        assert.isOk(yield rosca.endOfROSCA.call());
    }));

    it("post-ROSCA", co(function*() {
        // totalDebit for everyone after 2 rounds is 2C.
        // totalDiscounts would be 0.2C.
        // Therefore everyone's credit should be 1.8C to be in good standing.
        // Amounts withdrawable:
        // p0: 3.88C - 1.9C == 1.98C
        // p1: 1.8C - 1.9C == 0C

        // Let p0 withdraw.
        let contractBalanceBefore = contractBalance();

        yield withdraw(0);
        assert.equal(contractBalanceBefore - contractBalance(), 1.98 * CONTRIBUTION_SIZE);
        assert.equal((yield getContractStatus()).credits[0], 1.9 * CONTRIBUTION_SIZE);

        // Contract would be left with 2.018 C (last balance) - (1.98)C == 0.038 C
        assertWeiCloseTo(contractBalance(), 0.038 * CONTRIBUTION_SIZE);
    }));

    it("post-ROSCA collection period", co(function*() {
        utils.increaseTime(ROUND_PERIOD);
        // Now only the foreperson can collect the entire remaining funds.
        yield utils.assertThrows(rosca.endROSCARetrieveFunds({from: accounts[1]}));
        yield rosca.endROSCARetrieveFunds({from: accounts[0]});

        // since, the leftover balance is too low, check if the contract balance is empty instead
        assert.equal(contractBalance(), 0);
        //assert.isAbove(p0balanceAfter - p0balanceBefore, 0.1 * CONTRIBUTION_SIZE);
    }));
});