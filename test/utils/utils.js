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

  mine: function () {
    web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_mine",
      id: new Date().getTime()
    });
  },

  assertThrows: function(promise, err) {
    return promise.then(function() {
      assert.isNotOk(true, err);
    }).catch(function (e) {
      assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
    });
  },
};