"use strict";

let co = require("co").wrap;
let assert = require('chai').assert;
let utils = require("./utils/utils.js");
let ROSCATest = artifacts.require('ROSCATest.sol');
let consts = require('./utils/consts');
let ROSCAHelper = require('./utils/roscaHelper')

let ethRosca;
let erc20Rosca;

contract('Escape Hatch unit test', function(accounts) {
  before(function() {
    consts.setMemberList(accounts);
  });

  beforeEach(co(function* () {
    ethRosca = new ROSCAHelper(accounts, (yield utils.createEthROSCA()))
    erc20Rosca = new ROSCAHelper(accounts, (yield utils.createERC20ROSCA(accounts)))
  }));

  let ESCAPE_HATCH_ENABLER;

  // Runs the ROSCA 2 rounds. Everyone contributes, no one withdraws.
  function* runRoscUpToAPoint(rosca) {
    // Get to the start of the ROSCA.
    utils.increaseTime(consts.START_TIME_DELAY);

    for (let round = 0; round < 2; round++) {
      yield rosca.startRound();

      for (let participant = 0; participant < consts.memberCount(); participant++) {
        yield rosca.contribute(participant, consts.CONTRIBUTION_SIZE);
      }
      utils.increaseTime(consts.ROUND_PERIOD_IN_SECS);
    }
  }

  it("checks that only Invoker can enable the escape hatch", co(function* () {
    // For some reason can't make the beforeXXX() functions to work, so doing it the ugly
    // way of setting this var in the first test.
    ESCAPE_HATCH_ENABLER = yield (yield ROSCATest.deployed()).ESCAPE_HATCH_ENABLER.call();

    yield* runRoscUpToAPoint(ethRosca);
    yield utils.assertThrows(ethRosca.enableEscapeHatch(0));  // foreperson
    yield utils.assertThrows(ethRosca.enableEscapeHatch(3));  // member
    // Doesn't throw.
    yield ethRosca.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // member
  }));

  it("checks that only foreperson can activate the escape hatch and that too only when enabled", co(function* () {
    yield* runRoscUpToAPoint(ethRosca);
    yield utils.assertThrows(ethRosca.activateEscapeHatch(3));  // member
    yield utils.assertThrows(ethRosca.activateEscapeHatch(ESCAPE_HATCH_ENABLER));
    // foreperson can't activate either, as escape hatch isn't enabled.
    yield utils.assertThrows(ethRosca.activateEscapeHatch(0));

    // Enable. Now only the foreperson should be able to activate.
    yield ethRosca.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // escape hatch enabler
    yield utils.assertThrows(ethRosca.activateEscapeHatch(3));  // member
    yield utils.assertThrows(ethRosca.activateEscapeHatch(ESCAPE_HATCH_ENABLER));
    yield ethRosca.activateEscapeHatch(0);  // does not throw
  }));

  it("checks that when escape hatch is enabled but not activated, contribute and withdraw still work", co(function* () {
    yield* runRoscUpToAPoint(ethRosca);
    yield ethRosca.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // escape hatch enabler

    yield ethRosca.contribute(1, consts.CONTRIBUTION_SIZE * 7);
    yield ethRosca.withdraw(1);
  }));

  it("checks that once escape hatch is activated, contribute and withdraw throw", co(function* () {
    yield* runRoscUpToAPoint(ethRosca);
    yield ethRosca.enableEscapeHatch(ESCAPE_HATCH_ENABLER);  // escape hatch enabler
    yield ethRosca.activateEscapeHatch(0);

    yield utils.assertThrows(ethRosca.contribute(1, consts.CONTRIBUTION_SIZE * 7));
    yield utils.assertThrows(ethRosca.withdraw(1));
  }));

  it("checks that emergencyWithdrawal can only be called when escape hatch is enabled and active, and that " +
     "too only by foreperson", co(function* () {
    for (let rosca of [ethRosca, erc20Rosca]) {
      let tokenContract = yield rosca.tokenContract();
      yield* runRoscUpToAPoint(rosca);
      utils.assertThrows(rosca.emergencyWithdrawal(0));  // not enabled and active
      yield rosca.enableEscapeHatch(ESCAPE_HATCH_ENABLER);
      utils.assertThrows(rosca.emergencyWithdrawal(0));  // not active
      yield rosca.activateEscapeHatch(0);
      utils.assertThrows(rosca.emergencyWithdrawal(ESCAPE_HATCH_ENABLER));  // not by foreperson
      utils.assertThrows(rosca.emergencyWithdrawal(1));  // not by foreperson

      let forepersonBalanceBefore = yield rosca.getBalance(0, tokenContract);
      yield rosca.emergencyWithdrawal(0);  // not by foreperson
      let forepersonBalanceAfter = yield rosca.getBalance(0, tokenContract);
      assert.isAbove(forepersonBalanceAfter, forepersonBalanceBefore);
    }
  }));
});
