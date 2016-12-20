var Promise = require("bluebird");
var co = require("co").wrap;
contract('ROSCA withdraw Unit Test', function(accounts) {
    const MIN_START_DELAY = 86400 + 60;
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 20;

    it("Throws when calling withdraw from a non-member", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        return rosca.withdraw({from: accounts[4]}).then(function() {
            assert.isNotOk(true, "calling withdraw from a non-member succeed, didn't throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Watches for event LogFundsWithdrawal()", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);
        const CONTRIBUTE_PERCENT = 0.8;

        yield rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE * CONTRIBUTE_PERCENT});

        var eventFired = false;
        var fundsWithdrawalEvent = rosca.LogFundsWithdrawal();
        fundsWithdrawalEvent.watch(function(error, log) {
            fundsWithdrawalEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.user, accounts[0], "LogContributionMade doesn't display proper user value");
            assert.equal(log.args.amount, CONTRIBUTION_SIZE * CONTRIBUTE_PERCENT, "LogContributionMade doesn't display proper amount value");
        });

        yield rosca.withdraw({from: accounts[0]});

        yield Promise.delay(300);
        assert.isOk(eventFired, "LogContributionMade didn't fire");
    }));

    it("Throws when calling withdraw when totalDebit > totalCredit", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE * 0.8})
        ]);

        return rosca.withdraw({from: accounts[2]}).then(function() {
            assert.isNotOk(true, "calling withdraw when totalDebit > totalCredit success");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });

    }));

    it("Watch for LogCannotWithdrawFully when calling withdraw with amountToWithdraw > contract's balance", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });
        rosca.startRound();

        var withdrewAmount = 0;
        var credit_before = yield rosca.members.call(accounts[2]);
        var withdrawalEvent = rosca.LogCannotWithdrawFully();
        withdrawalEvent.watch(function(error,log){
            withdrewAmount = log.args.contractBalance;
            withdrawalEvent.stopWatching();
        });

        yield rosca.withdraw({from: accounts[2]});
        var credit_after = yield rosca.members.call(accounts[2]);
        return assert.equal(credit_after[0],credit_before[0] - withdrewAmount, "partial withdraw didn't work properly");
    }));

    it("calling withdraw when amountToWithdraw < contract.balance", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[0], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 3}),
            rosca.bid(DEFAULT_POT, {from: accounts[2]})
        ]);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });
        rosca.startRound();

        yield rosca.withdraw({from: accounts[2]});
        var credit_after = yield rosca.members.call(accounts[2]);
        var currentRound = yield rosca.currentRound.call();

        return assert.equal(credit_after[0], currentRound * CONTRIBUTION_SIZE, "withdraw doesn't send the right amount");
    }));

    it("calling withdraw with amountToWithdraw > contract balance and totalDiscount != 0", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 0.3}), // to make sure contract's balance is less than winning bid
            rosca.bid(DEFAULT_POT * 0.80, {from: accounts[2]})
        ]);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });

        yield rosca.startRound();

        var withdrewAmount;
        var credit_before = yield rosca.members.call(accounts[2]);
        var withdrawalEvent = rosca.LogCannotWithdrawFully();
        withdrawalEvent.watch(function(error,log){
            withdrewAmount = log.args.contractBalance;
            withdrawalEvent.stopWatching();
        });

        yield rosca.withdraw({from: accounts[2]});
        var credit_after = yield rosca.members.call(accounts[2]);

        yield Promise.delay(300);
        return assert.equal(credit_after[0], credit_before[0] - withdrewAmount, "partial withdraw didn't work properly");

    }));

    it("Calling withdraw amountToWithdraw < contract balance and totalDiscount != 0", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield Promise.all([
            rosca.startRound(),
            rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE}),
            rosca.contribute({from: accounts[3], value: CONTRIBUTION_SIZE * 3}), // to make sure contract's balance is less than winning bid
            rosca.bid(DEFAULT_POT * 0.80, {from: accounts[2]})
        ]);

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });

        yield rosca.startRound();

        yield rosca.withdraw({from: accounts[2]});
        var credit_after = yield rosca.members.call(accounts[2]);
        var currentRound = yield rosca.currentRound.call();
        var totalDiscount = yield rosca.totalDiscounts.call();

        return assert.equal(credit_after[0], (currentRound * CONTRIBUTION_SIZE) - (totalDiscount / MEMBER_COUNT), "withdraw doesn't send the right amount");
    }));
});