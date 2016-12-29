pragma solidity ^0.4.4;

/**
 * A ROSCA (Rotating and Savings Credit Association) is an agreement between
 * trusted friends to contribute funds on a periodic basis to a "pot", and in
 * each round one of the participants receives the pot (termed "winner").
 * The winner is selected as the person who makes the lowest bit in that round
 * among those who have not won a bid before.
 * The discount (gap between bid and total round contributions) is dispersed
 * evenly between the participants.
 */
contract ROSCA {
  uint64 constant internal MIN_CONTRIBUTION_SIZE = 1 finney;  // 1e-3 ether
  uint128 constant internal MAX_CONTRIBUTION_SIZE = 10 ether;

  // Maximum fee (in 1/1000s) from dispersements that goes to project stakeholders.
  uint16 constant internal MAX_FEE_IN_THOUSANDTHS = 20;

  // startTime of the ROSCA must be at least this much time ahead of when the ROSCA is created
  uint32 constant internal MINIMUM_TIME_BEFORE_ROSCA_START = 1 days;

  uint8 constant internal MIN_ROUND_PERIOD_IN_DAYS = 1;
  uint8 constant internal MAX_ROUND_PERIOD_IN_DAYS = 30;
  uint8 constant internal MIN_DISTRIBUTION_PERCENT = 65;  // the winning bid must be at least 65% of the Pot value

  uint8 constant internal MAX_NEXT_BID_RATIO = 98;  // Means every new bid has to be at least 2% less than the one before

  // TODO: MUST change this prior to production. Currently this is accounts[9] of the testrpc config
  // used in tests.
  address constant internal FEE_ADDRESS = 0x1df62f291b2e969fb0849d99d9ce41e2f137006e;

  // TODO(ron): replace this with an actual wallet. Right now this is accounts[9] of the testrpc used
  // by tests.
  address constant internal ESCAPE_HATCH_ENABLER = 0x1df62f291b2e969fb0849d99d9ce41e2f137006e;

  event LogContributionMade(address user, uint256 amount);
  event LogStartOfRound(uint256 currentRound);
  event LogNewLowestBid(uint256 bid,address winnerAddress);
  event LogRoundFundsReleased(address winnerAddress, uint256 amountInWei);
  event LogFundsWithdrawal(address user, uint256 amount);
  event LogCannotWithdrawFully(uint256 requestedAmount,uint256 contractBalance);
  event LogUnsuccessfulBid(address bidder,uint256 bidInWei,uint256 lowestBid);

  // Escape hatch related events.
  event LogEscapeHatchEnabled();
  event LogEscapeHatchActivated();
  event LogEmergencyWithdrawalPerformed(uint256 fundsDispersed);

  // ROSCA parameters
  uint16 internal roundPeriodInDays;
  uint16 internal serviceFeeInThousandths;
  uint16 internal currentRound;  // set to 0 when ROSCA is created, becomes 1 when ROSCA starts
  address internal foreperson;
  uint128 internal contributionSize;
  uint256 internal startTime;

  // ROSCA state
  bool internal endOfROSCA = false;
  bool internal forepersonSurplusCollected = false;
  uint256 internal totalDiscounts; // a discount is the difference between a winning bid and the pot value
  uint256 internal totalFees = 0;

  // Round state
  uint256 internal lowestBid;
  address internal winnerAddress;

  mapping(address => User) internal members;
  address[] internal membersAddresses;    // for  iterating through members' addresses

  // Other state
  // An escape hatch is used in case a major vulnerability is discovered in the contract code.
  // The following procedure is then put into action:
  // 1. WeTrust sends a transaction to make escapeHatchEnabled true.
  // 2. foreperson is notified and can decide to activate the escapeHatch.
  // 3. If escape hatch is activated, no contributions and/or withdrawals are allowed. The foreperson
  //    may call withdraw() to withdraw all of the contract's funds and then disperse them offline
  //    among the participants.
  bool internal escapeHatchEnabled = false;
  bool internal escapeHatchActive = false;

  struct User {
    uint256 contributions; // amount of funds user has contributed so far
    uint256 winnings; // amount of funds user has won in auction
    bool paid; // yes if the member had won a Round
    bool alive; // needed to check if a member is indeed a member
  }

  modifier onlyFromMember {
    if (!members[msg.sender].alive) throw;
    _;
  }

  modifier onlyFromForeperson {
    if (msg.sender != foreperson) throw;
    _;
  }

  modifier onlyFromFeeAddress {
    if (msg.sender != FEE_ADDRESS) throw;
    _;
  }

  modifier roscaNotEnded {
    if (endOfROSCA) throw;
    _;
  }

  modifier roscaEnded {
    if (!endOfROSCA) throw;
    _;
  }

  modifier onlyIfEscapeHatchActive {
    if (!escapeHatchActive) throw;
    _;
  }

  modifier onlyIfEscapeHatchInactive {
    if (escapeHatchActive) throw;
    _;
  }

  modifier onlyFromEscapeHatchEnabler {
    if (msg.sender != ESCAPE_HATCH_ENABLER) throw;
    _;
  }

  /**
    * Creates a new ROSCA and initializes the necessary variables. ROSCA starts after startTime.
    * Creator of the contract becomes foreperson and a participant.
    */
  function ROSCA (
    uint16 roundPeriodInDays_,
    uint128 contributionSize_,
    uint256 startTime_,
    address[] members_,
    uint16 serviceFeeInThousandths_) {
    if (roundPeriodInDays_ < MIN_ROUND_PERIOD_IN_DAYS || roundPeriodInDays_ > MAX_ROUND_PERIOD_IN_DAYS) throw;
    roundPeriodInDays = roundPeriodInDays_;

    if (contributionSize_ < MIN_CONTRIBUTION_SIZE || contributionSize_ > MAX_CONTRIBUTION_SIZE) throw;
    contributionSize = contributionSize_;

    if (startTime_ < (now + MINIMUM_TIME_BEFORE_ROSCA_START)) throw;
    startTime = startTime_;
    if (serviceFeeInThousandths_ > MAX_FEE_IN_THOUSANDTHS) throw;
    serviceFeeInThousandths = serviceFeeInThousandths_;

    foreperson = msg.sender;
    addMember(msg.sender);

    for (uint16 i = 0; i < members_.length; i++) {
      addMember(members_[i]);
    }
  }

  function addMember(address newMember) internal {
    if (members[newMember].alive) throw;
    members[newMember] = User({paid: false , alive: true, contributions: 0, winnings: 0});
    membersAddresses.push(newMember);
  }

  /**
    * Calculates the winner of the current round's pot, and credits her.
    * If there were no bids during the round, winner is selected semi-randomly.
    */
  function startRound() roscaNotEnded external {
    uint256 roundStartTime = startTime + (uint(currentRound)  * roundPeriodInDays * 1 days);
    if (now < roundStartTime )  // too early to start a new round.
      throw;

    if (currentRound != 0) {
      cleanUpPreviousRound();
    }
    if (currentRound < membersAddresses.length) {
      lowestBid = 0;
      winnerAddress = 0;

      currentRound++;
      LogStartOfRound(currentRound);
    } else {
        endOfROSCA = true;
    }
  }

  function cleanUpPreviousRound() internal {
    if (winnerAddress == 0) {
      // There is no bid in this round. Find an unpaid address for this epoch.
      address lastUnpaid = 0x0;
      uint256 semi_random = now % membersAddresses.length;
      for (uint16 i = 0; i < membersAddresses.length; i++) {
        address candidate = membersAddresses[(semi_random + i) % membersAddresses.length];
        if (!members[candidate].paid) {
          if (members[candidate].contributions + (totalDiscounts / membersAddresses.length) >= (currentRound * contributionSize)) { // check if the member is in good standing
            winnerAddress = candidate;
            break;
          }
          lastUnpaid = candidate; // if not in good standing, save the address in case there is no one else that can be paid
        }
      }
      if (winnerAddress == 0) { //if winnerAddress is still zero, select lastUnPaid as the winner
          winnerAddress = lastUnpaid;
      }
      // Also - set lowestBid to the right value.
      lowestBid = contributionSize * membersAddresses.length;
    }
    totalDiscounts += contributionSize * membersAddresses.length - lowestBid;
    members[winnerAddress].winnings += lowestBid;
    members[winnerAddress].paid = true;
    LogRoundFundsReleased(winnerAddress, lowestBid);

    // use winnings to satisfy the contribution requirement if member didn't contribute this round
    // however, if user is delinquent (i.e. hasn't paid in previous rounds either), they cannot use their winning to cover for the contributions
    uint256 discount = totalDiscounts / membersAddresses.length;
    for (uint16 j = 0; j < membersAddresses.length; j++) {
      User member = members[membersAddresses[j]];
      if (member.winnings != 0 && member.contributions + discount < contributionSize * (currentRound + 1) &&
          member.contributions + discount >= contributionSize * currentRound) {
        if (member.winnings >= contributionSize) {
          member.winnings -= contributionSize;
          member.contributions += contributionSize;
        } else {
          member.contributions += member.winnings;
          member.winnings = 0;
        }
      }
    }
  }

  /**
   * Processes a periodic contribution. Note msg.sender must be one of the participants
   * (this will let the contract identify the contributor).
   *
   * Any excess funds are withdrawable through withdraw().
   */
  function contribute() payable onlyFromMember onlyIfEscapeHatchInactive external {
    members[msg.sender].contributions += msg.value;
    // TODO(ron): this has a bad edge case: it will take fees of any excessive contributions made.
    // Fix this once we switch to the contributions/winnings model.
    totalFees += msg.value / 1000 * serviceFeeInThousandths;

    LogContributionMade(msg.sender, msg.value);
  }

  /**
   * Registers a bid from msg.sender. Participant should call this method
   * only if all of the following holds for her:
   * + Never won a round.
   * + Is in good standing (i.e. actual contributions, including this round's,
   *   plus earned discounts are together greater than required contributions).
   * + New bid is lower than the lowest bid so far.
   */
  function bid(uint256 bidInWei) onlyIfEscapeHatchInactive external {
    if (members[msg.sender].paid  ||
        currentRound == 0 ||  // ROSCA hasn't started yet
        // participant not in good standing
        members[msg.sender].contributions + (totalDiscounts / membersAddresses.length) < (currentRound * contributionSize) ||
        // bid is less than minimum allowed
        bidInWei < ((contributionSize * membersAddresses.length) / 100) * MIN_DISTRIBUTION_PERCENT)
      throw;

    // If winnerAddress is 0, this is the first bid, hence allow full pot.
    // Otherwise, make sure bid is lower enough compared to previous bid.
    uint256 maxAllowedBid = (winnerAddress == 0 ?
        contributionSize * membersAddresses.length :
        lowestBid / 100 * MAX_NEXT_BID_RATIO);
    if (bidInWei > maxAllowedBid) {
      // We don't throw as this may be hard for the frontend to predict on the
      // one hand, and would waste the caller's gas on the other.
      LogUnsuccessfulBid(msg.sender, bidInWei, lowestBid);
      return;
    }
    lowestBid = bidInWei;
    winnerAddress = msg.sender;
    LogNewLowestBid(lowestBid, winnerAddress);
  }

  /**
   * Withdraws available funds for msg.sender. If opt_destination is nonzero,
   * sends the fund to that address, otherwise sends to msg.sender.
   */
  function withdraw() onlyFromMember onlyIfEscapeHatchInactive external returns(bool success) {
    User sender = members[msg.sender];
    uint256 memberContributions = sender.contributions + totalDiscounts / membersAddresses.length;
    uint256 totalCredit = memberContributions + sender.winnings;
    uint256 totalDebit = currentRound * contributionSize;
    // Verify member is in good standing and there are any funds to withdraw.
    if (totalDebit > memberContributions || totalDebit >= totalCredit) throw;

    uint256 contributionsToWithdraw = memberContributions - totalDebit;
    uint256 winningsToWithdraw = sender.winnings;
    uint256 contributionAfterFee = contributionsToWithdraw / 1000 * (1000 - serviceFeeInThousandths);
    uint256 winningsAfterFee = winningsToWithdraw / 1000 * (1000 - serviceFeeInThousandths);

    uint256 contractNetBalance = this.balance - totalFees;

    // check if contract's balance is less than total amount to withdraw
    if (contractNetBalance < contributionAfterFee + winningsAfterFee) {
      LogCannotWithdrawFully(contributionAfterFee + winningsAfterFee,  this.balance - totalFees);

      // contractBalance can be more than one account or less than both
      if (contractNetBalance > contributionAfterFee) {
        contractNetBalance -= contributionAfterFee;
        // if balance is greater than contributionsAfterFee so it will be less than winningsAfterFee
        winningsAfterFee = contractNetBalance;
        winningsToWithdraw = contractNetBalance * 1000 / (1000 - serviceFeeInThousandths);
      } else if (contractNetBalance > winningsAfterFee) {
        contractNetBalance -= winningsAfterFee;
        // if balance is greater than winningsAfterFee so it will be less than contributionsAfterFee
        contributionAfterFee = contractNetBalance;
        contributionsToWithdraw = contractNetBalance * 1000 / (1000 - serviceFeeInThousandths);
      } else {
        contributionAfterFee = contractNetBalance;
        contributionsToWithdraw = contractNetBalance * 1000 / (1000 - serviceFeeInThousandths);
        winningsToWithdraw = 0;
      }
    }
    sender.contributions -= contributionsToWithdraw;
    sender.winnings -= winningsToWithdraw;
    if (!msg.sender.send(contributionAfterFee + winningsAfterFee)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      sender.contributions += contributionsToWithdraw;
      sender.winnings += winningsToWithdraw;
      return false;
    }
    LogFundsWithdrawal(msg.sender, (contributionsToWithdraw + winningsToWithdraw) / 1000 * (1000 - serviceFeeInThousandths));
    return true;

  }

  /**
   * Allows the foreperson to end the ROSCA and retrieve any surplus funds, one
   * roundPeriodInDays after the end of the ROSCA.
   *
   * Note that startRound() must be called first after the last round, as it
   * does the bookeeping of that round.
   */
  function endOfROSCARetrieveSurplus() onlyFromForeperson roscaEnded external returns (bool) {
    uint256 roscaCollectionTime = startTime + ((membersAddresses.length + 1) * roundPeriodInDays * 1 days);
    if (now < roscaCollectionTime || forepersonSurplusCollected) throw;

    forepersonSurplusCollected = true;
    uint256 amountToCollect = this.balance - totalFees;
    if (!foreperson.send(amountToCollect)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      forepersonSurplusCollected = false;
      return false;
    } else {
      LogFundsWithdrawal(foreperson, amountToCollect);
    }
  }

 /**
   * Allows the foreperson to end the ROSCA and retrieve any surplus funds, one
   * roundPeriodInDays after the end of the ROSCA.
   *
   * Note that startRound() must be called first after the last round, as it
   * does the bookeeping of that round.
   */
  function endOfROSCARetrieveFees() onlyFromFeeAddress roscaEnded external returns (bool) {
    uint256 roscaCollectionTime = startTime + ((membersAddresses.length + 1) * roundPeriodInDays * 1 days);
    if (now < roscaCollectionTime || totalFees == 0) throw;

    uint256 tempTotalFees = totalFees;  // prevent re-entry.
    totalFees = 0;
    if (!FEE_ADDRESS.send(tempTotalFees)) {   // if the send() fails, put the allowance back to its original place
      // No need to call throw here, just reset the amount owing. This may happen
      // for nonmalicious reasons, e.g. the receiving contract running out of gas.
      totalFees = tempTotalFees;
      return false;
    } else {
      LogFundsWithdrawal(FEE_ADDRESS, totalFees);
    }
  }

  // Allows the Escape Hatch Enabler (controlled by WeTrust) to enable the Escape Hatch in case of
  // emergency (e.g. a major vulnerability found in the contract).
  function enableEscapeHatch() onlyFromEscapeHatchEnabler external {
    escapeHatchEnabled = true;
    LogEscapeHatchEnabled();
  }

  // Allows the foreperson to active the Escape Hatch after the Enabled enabled it. This will freeze all
  // contributions and withdrawals, and allow the foreperson to retrieve all funds into their own account,
  // to be dispersed offline to the other participants.
  function activateEscapeHatch() onlyFromForeperson external {
    if (!escapeHatchEnabled) {
      throw;
    }
    escapeHatchActive = true;
    LogEscapeHatchActivated();
  }

  function emergencyWithdrawal() onlyFromForeperson onlyIfEscapeHatchActive {
    LogEmergencyWithdrawalPerformed(this.balance);
    // Send everything, including potential fees, to foreperson to disperse offline to participants.
    selfdestruct(foreperson);
  }
}
