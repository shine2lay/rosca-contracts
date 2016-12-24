"use strict";

let assert = require('chai').assert;

module.exports = {
  increaseTime: function(bySeconds) {
    web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [bySeconds],
      id: new Date().getTime()
    });
  },

  mineOneBlock: function () {
    web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_mine",
      id: new Date().getTime()
    });
  },

  createROSCA: function(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, START_TIME_DELAY,
                        MEMBER_LIST, SERVICE_FEE_IN_THOUSANDTHS) {
    this.mineOneBlock(); // mine an empty block to ensure latest's block timestamp is the current Time

    let latestBlock = web3.eth.getBlock("latest");
    let blockTime = latestBlock.timestamp;
    return ROSCATest.new(
        ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, blockTime + START_TIME_DELAY, MEMBER_LIST,
        SERVICE_FEE_IN_THOUSANDTHS);
  },

  assertThrows: function(promise, err) {
    return promise.then(function() {
      assert.isNotOk(true, err);
    }).catch(function (e) {
      assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
    });
  },
};