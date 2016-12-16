var Promise = require("bluebird");
var co = require("co").wrap;

contract('ROSCA cleanUpPreviousRound Unit test', function(accounts) {
    const MIN_START_DELAY = 86400 + 20;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;
    const FEE = (1 - 0.002);

    var contributionSize = 1e16;
    var roundPeriodInDays = 3;
    var memberList = [accounts[1],accounts[2],accounts[3]];
    var serviceFee = 2;

    it("checks if totalDiscount is added when lowestBid < default_pot", co(function *() {
        var rosca = ROSCATest.deployed();

        const BID_PERCENT = 0.75;

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(), // needed to set lowestBid value, + winnerAddress to 0
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[0]})
        ]);

        yield rosca.cleanUpPreviousRound();

        var discount = yield rosca.totalDiscounts.call();

        return assert.equal(discount, DEFAULT_POT * (1 - WINNING_BID_PERCENT), "toalDiscount value didn't get added properly");
    }));

    it("watches for LogRoundFundsReleased event and check if winner gets proper values", co(function *() {
        var rosca = ROSCATest.deployed();

        const BID_PERCENT = 0.68;

        yield Promise.all([
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT * BID_PERCENT, {from: accounts[1]})
        ]);
        var eventFired = false;
        var fundsReleasedEvent = rosca.LogRoundFundsReleased();

        fundsReleasedEvent.watch(co(function *(error,log) {
            fundsReleasedEvent.stopWatching();
            eventFired = true;

            var user = yield rosca.members.call(log.args.winnerAddress);
            assert.equal(accounts[1], log.args.winnerAddress);
            assert.isOk(user[2], "chosen address is not a member"); // user.alive
            assert.isOk(user[1], "Paid member was chosen"); // user.paid
            assert.equal(user[0].toString(), CONTRIBUTION_SIZE + DEFAULT_POT * BID_PERCENT * FEE,"winningBid is not Default_POT"); // user.credit
        }));

        yield rosca.cleanUpPreviousRound();

        yield Promise.delay(100);
        assert.isOk(eventFired);
    }));

    it("winnerAddress == 0, check if random unpaid member is picked", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10 ;
        var rosca = yield ROSCATest.new(roundPeriodInDays, contributionSize, DayFromNow, memberList, serviceFee);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });
        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE}),
        ]);

        var credit_before = yield rosca.members.call(accounts[3]);
        yield rosca.cleanUpPreviousRound();
        var actual_credit = yield rosca.members.call(accounts[3]);
        var lowestBid = DEFAULT_POT + 1;
        var expected_credit = credit_before[0].add(lowestBid * FEE);

        return assert.equal(actual_credit[0].toString(), expected_credit.toString(), "lowestBid is not deposited into winner's credit");
    })); 
});