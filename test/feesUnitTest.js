'use strict';

let Promise = require('bluebird');
let assert = require('chai').assert;
let co = require('co').wrap;
let utils = require('./utils/utils.js');
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/rosca')

let rosca;
let erc20Rosca;

contract('fees unit test', function(accounts) {
  before(function() {
    consts.setMemberList(accounts, 2);
  });

  beforeEach(co(function* () {
    rosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA()))
    erc20Rosca = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)))
  }));

  // Note accounts[0] is the foreperson, deploying the contract.
  const MEMBER_LIST = accounts.slice(1, 2);  // a
  // ccounts[0] is also participant, as a foreperson

  function* getFeesInContractAfterLastRound(rosca) {
    // Wait another round.
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);

    yield rosca.endOfROSCARetrieveSurplus(0); // Let foreperson retrieve their own fees.

    // Whatever is left in the contract are the fees
    return rosca.getBalance(rosca.address());
  }

  function expectedFeesFrom(amount) {
    return amount * consts.SERVICE_FEE_IN_THOUSANDTHS / 1000;
  }

  it('charges the right fees when there is no delinquency', co(function* () {
    const BID_TO_PLACE = 0.9 * consts.defaultPot()
    const INDIVIDUAL_DISCOUNT = (consts.defaultPot() - BID_TO_PLACE) / consts.memberCount()

    utils.increaseTime(consts.START_TIME_DELAY + 200);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);
    yield rosca.bid(0, BID_TO_PLACE);
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);
    // Finish the ROSCA
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(0)

    // rosca.withdrawal would be (0.9 * 2C) * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    let expectedWithrewAmount = utils.afterFee(BID_TO_PLACE)  +
      utils.afterFee(INDIVIDUAL_DISCOUNT)
    assert.equal(withdrewAmount, expectedWithrewAmount, "fees taken out doesn't match theoretical calculations");

    withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(1)
    // rosca.withdrawal would be 2C * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    expectedWithrewAmount = utils.afterFee(consts.defaultPot()) +
      utils.afterFee(INDIVIDUAL_DISCOUNT)
    assert.equal(withdrewAmount, expectedWithrewAmount, "fees taken out doesn't match theoretical calculations");

    let fees = yield getFeesInContractAfterLastRound(rosca);
    assert.equal(fees, expectedFeesFrom(consts.defaultPot() * consts.memberCount()));  // 2 rounds, 2 participants.

  }));

  it('charges overcontributions that get used in the ROSCA', co(function* () {
    const BID_TO_PLACE = 0.9 * consts.defaultPot()
    const INDIVIDUAL_DISCOUNT = (consts.defaultPot() - BID_TO_PLACE) / consts.memberCount()
    // In this test, accounts[0] rosca.contributes 2C in round 1, then nothing in round 2.
    utils.increaseTime(consts.START_TIME_DELAY + 200);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, 2 * consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);

    yield rosca.bid(0, BID_TO_PLACE)
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);
    // Finish the ROSCA
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(0)
    // rosca.withdrawal would be (0.9 * 2C) * 0.99(fee) + (0.1 * 0.2 / 2)(totalDiscounts) * 0.99(fee)
    let expectedWithdrewAmount = utils.afterFee(BID_TO_PLACE) +
      utils.afterFee(INDIVIDUAL_DISCOUNT)
    
    assert.equal(withdrewAmount, expectedWithdrewAmount, "fees taken out doesn't match theoretical calculations");

    withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(1);
    // rosca.withdrawal would be 2C * 0.99(fee) + (0.1 * 0.2 / 2)(totalDiscounts) * 0.99(fee)
    expectedWithdrewAmount = utils.afterFee(consts.defaultPot()) +
      utils.afterFee(INDIVIDUAL_DISCOUNT)
    assert.equal(withdrewAmount, expectedWithdrewAmount, "fees taken out doesn't match theoretical calculations");

    let fees = yield getFeesInContractAfterLastRound(rosca);
    assert.equal(fees, expectedFeesFrom(consts.defaultPot() * consts.memberCount()));  // 2 rounds, 2 participants.
  }));

  it('does not charge overcontributions that do not get used in the ROSCA and do not get rosca.withdrawn', co(function* () {
    const BID_TO_PLACE = 0.9 * consts.defaultPot()
    const INDIVIDUAL_DISCOUNT = (consts.defaultPot() - BID_TO_PLACE) / consts.memberCount()
    // In this test, accounts[0] rosca.contributes 1.5C in round 1, and another 1C in round 2.
    utils.increaseTime(consts.START_TIME_DELAY + 200);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, 1.5 * consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);

    yield rosca.bid(0, BID_TO_PLACE);
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);

    // Finish the ROSCA
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(0)
    // rosca.withdrawal would be 0.5C(over rosca.contributed) + (0.9 * 2C) * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    let expectedWithdrewAmount = 0.5 * consts.CONTRIBUTION_SIZE +
      utils.afterFee(BID_TO_PLACE) + utils.afterFee(INDIVIDUAL_DISCOUNT)
    assert.equal(withdrewAmount, expectedWithdrewAmount,
        "fees got taken out of over contribution");
    let fees = yield getFeesInContractAfterLastRound(rosca);
    assert.equal(fees, expectedFeesFrom(consts.defaultPot() * consts.memberCount()));  // 2 rounds, 2 participants.
  }));

  it('does not charge overcontributions that do not get used in the ROSCA and do get rosca.withdrawn', co(function* () {
    const BID_TO_PLACE = 0.9 * consts.defaultPot()
    const INDIVIDUAL_DISCOUNT = (consts.defaultPot() - BID_TO_PLACE) / consts.memberCount()
    // In this test, accounts[0] rosca.contributes 1.5C in round 1, then rosca.withdraws, then rosca.contributes another 1C in round 2 .
    utils.increaseTime(consts.START_TIME_DELAY + 200);
    yield Promise.all([
          rosca.startRound(),
          rosca.contribute(0, 1.5 * consts.CONTRIBUTION_SIZE),
    ]);

    let withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(0)
    // rosca.withdrawal would be 0.5(over contribtuion) ** note, no fees should be taken out of over contribution
    assert.equal(withdrewAmount, 0.5 * consts.CONTRIBUTION_SIZE,
        "fees taken out doesn't match theoretical calculations");

    yield Promise.all([
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);

    yield rosca.bid(0, BID_TO_PLACE);

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);

    // Finish the ROSCA
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    withdrewAmount = yield rosca.withdrawAndGetWithdrewAmount(0)
    // rosca.withdrawal would be (0.9 * 2C) * 0.99(fee) + (0.1 * 2 / 2)(totalDiscounts) * 0.99(fee)
    let expectedWithdrawalBalance = utils.afterFee(BID_TO_PLACE) +
        utils.afterFee(INDIVIDUAL_DISCOUNT);
    assert.equal(withdrewAmount, expectedWithdrawalBalance);

    let fees = yield getFeesInContractAfterLastRound(rosca);
    assert.equal(fees, expectedFeesFrom(consts.defaultPot() * consts.memberCount()));  // 2 rounds, 2 participants.
  }));

  it('does not charge fees from contributions not covered because of delinquencies', co(function* () {
    const BID_TO_PLACE = 0.9 * consts.defaultPot()
    const INDIVIDUAL_DISCOUNT = (consts.defaultPot() - BID_TO_PLACE) / consts.memberCount()
    // In this test, accounts[0] rosca.contributes 0.5C in round 1, and another 1C in round 2.
    utils.increaseTime(consts.START_TIME_DELAY + 200);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, 0.5 * consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);
    yield rosca.bid(1, BID_TO_PLACE);

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, consts.CONTRIBUTION_SIZE),
      rosca.contribute(1, consts.CONTRIBUTION_SIZE),
    ]);

    // Finish the ROSCA
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();

    let fees = yield getFeesInContractAfterLastRound(rosca);
    let expectedDiscount = INDIVIDUAL_DISCOUNT / MEMBER_LIST.length;
    // console.log(expectedDiscount);
    let expectedFees = expectedFeesFrom(consts.CONTRIBUTION_SIZE * (2 + 1.5) + expectedDiscount);
    assert.closeTo(Math.abs(1 - fees / expectedFees), 0, 0.01, "actual: " + fees + ",expected: " + expectedFees);
  }));

  it('checks if fees are applied to rolled over credits', co(function* () {
    // In this test, accounts[0] rosca.contributes 0.5C in round 1, and another 1C in round 2.
    utils.increaseTime(consts.START_TIME_DELAY + 200);
    yield Promise.all([
      rosca.startRound(),
      rosca.contribute(0, consts.CONTRIBUTION_SIZE),
    ]);

    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield Promise.all([
      rosca.startRound(),
    ]);

    // Finish the ROSCA
    utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    yield rosca.startRound();
    let fees = yield getFeesInContractAfterLastRound(rosca);
    assert.equal(fees, expectedFeesFrom(consts.defaultPot()));  // 2 rounds, only one in goodStanding
  }));
});
