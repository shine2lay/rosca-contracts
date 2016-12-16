var co = require("co").wrap;
var should = require("chai").should();
contract('ROSCA startRound Unit test', function(accounts) {
    const MIN_START_DELAY = 86400 + 60;
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const MEMBER_COUNT = 4;
    const CONTRIBUTION_SIZE = 1e16;
    const DEFAULT_POT = CONTRIBUTION_SIZE * MEMBER_COUNT;

    var roundPeriodInDays = 3;
    var memberList = [accounts[1],accounts[2],accounts[3]];
    var serviceFee = 2;

    it("watches for LogstartOfRound event", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(roundPeriodInDays, CONTRIBUTION_SIZE, DayFromNow, memberList, serviceFee);

        var eventFired = false;
        var startOfRoundEvent = rosca.LogStartOfRound();

        startOfRoundEvent.watch(function(error,log){
            startOfRoundEvent.stopWatching();
            eventFired = true;
            assert.equal(log.args.currentRound, 2, "Log didnt show currentRound properly");
        });
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });

        yield rosca.startRound();

        assert.isOk(eventFired, "startOfRound event didn't fire");
    }));

    it("Throws when calling startRound before roundStartTime (including round = 0)", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(roundPeriodInDays, CONTRIBUTION_SIZE, DayFromNow, memberList, serviceFee);
        while (true) {
            yield rosca.startRound().then(function () {
                assert.isNotOk(true, "calling startRound before roundStartTime succeed when it should throw");
            }).catch(function (e) {
                assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
            });

            var endOfROSCA = yield rosca.endOfROSCA.call();
            if (endOfROSCA) break;
            web3.currentProvider.send({
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [ROUND_PERIOD_DELAY],
                id: new Date().getTime()
            });
            yield rosca.startRound();

        }

        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE}).then(function () {
            assert.isNotOk(true, "Calling contribute after ROSCA ended was expected to throw");
        }).catch(function (e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));
});