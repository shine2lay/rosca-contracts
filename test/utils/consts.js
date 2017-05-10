"use strict";
let memberList;
module.exports = {

  MAX_GAS_COST_PER_TX: 1e5 /* gas used per tx */ * 2e10, /* gas price */  // keep in sync with truffle.js
  ROUND_PERIOD_IN_SECS: 100,
  CONTRIBUTION_SIZE: 1e18,
  memberList: function() {
    if(!memberList) {
      throw new Error('Member list needs to be set first before calling MEMBER_COUNT');
    }
    return memberList;
  },
  setMemberList: function(accounts, sliceIndex) {
    sliceIndex = sliceIndex || 4 // by default, we want 3 additional members (excluding foreperson)
    memberList = accounts.slice(1, sliceIndex);
  },
  memberCount: function() {
    if(!memberList) {
      throw new Error('Member list needs to be set first before calling MEMBER_COUNT');
    }

    return memberList.length + 1;
  },
  defaultPot: function() {
    return (this.CONTRIBUTION_SIZE * this.memberCount());
  },
  SERVICE_FEE_IN_THOUSANDTHS: 2,
  START_TIME_DELAY: 10,
};
