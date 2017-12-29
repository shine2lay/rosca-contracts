pragma solidity ^0.4.0;

import '../ROSCATest.sol';

contract ROSCATestHelper is ROSCATest {
  /**
   * Use modifier style to initialize the base contract's arguments
   * see http://solidity.readthedocs.io/en/develop/contracts.html#arguments-for-base-constructors
   * for more information
   */
  function ROSCATestHelper(ERC20TokenInterface erc20tokenContract,  // pass 0 to use ETH
    typesOfROSCA roscaType_,
    uint256 roundPeriodInSecs_,
    uint128 contributionSize_,
    uint256 startTime_,
    address[] members_,
    uint16 serviceFeeInThousandths_) ROSCATest(erc20tokenContract,
    roscaType_, roundPeriodInSecs_, contributionSize_,
    startTime_, members_, serviceFeeInThousandths_){
  }

  function setUserCredit(address memberAddress, uint256 value) external {
    members[memberAddress].credit = value;
  }

  function setUserDebt(address memberAddress, bool value) external {
    members[memberAddress].debt = value;
  }

  function setUserPaid(address memberAddress, bool value) external {
    members[memberAddress].paid = value;
  }

  function setUserAlive(address memberAddress, bool value) external {
    members[memberAddress].alive = value;
  }

  function setEndOfROSCA(bool value) external {
    endOfROSCA = value;
  }

  function setForepersonSurplusCollected(bool value) external {
    forepersonSurplusCollected = value;
  }

  function setTotalDiscount(uint256 value) external {
    totalDiscounts = value;
  }

  function setTotalFees(uint256 value) external {
    totalFees = value;
  }
}
