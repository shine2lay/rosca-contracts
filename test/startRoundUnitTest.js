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

    it("Calling startRound when currentRound == 0, check if lowestBid is set and winnerAddress = 0", co(function *() {
        var rosca = ROSCATest.deployed();

        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [MIN_START_DELAY],
            id: new Date().getTime()
        });

        yield rosca.startRound();
        var bid = yield rosca.lowestBid.call();
        var winner = yield rosca.winnerAddress.call();
        var currentRound = yield rosca.currentRound.call();

        assert.equal(currentRound, 1, " ");
        assert.equal(bid, DEFAULT_POT + 1, "lowestBid hasn't be set to Default pot +1");
        assert.equal(winner, "0x0000000000000000000000000000000000000000", "winnerAddress is not empty");
    }));

    it("watches for LogstartOfRound event", co(function *() {
        var rosca = ROSCATest.deployed();

        var startOfRoundEvent = rosca.LogStartOfRound();
        startOfRoundEvent.watch(function(error,log){
            startOfRoundEvent.stopWatching();
            assert.equal(log.args.currentRound, 2, "Log didnt show currentRound properly");
        });
        web3.currentProvider.send({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [ROUND_PERIOD_DELAY],
            id: new Date().getTime()
        });

        yield rosca.startRound();
    }));

    it("Calling startRound when currentRound >= members.length", co(function *() {
        var rosca = ROSCATest.deployed();
        var currentRound = yield rosca.currentRound.call();
         do{
            web3.currentProvider.send({
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [ROUND_PERIOD_DELAY],
                id: new Date().getTime()
            });
            yield rosca.startRound();
            currentRound++;
        } while(currentRound < MEMBER_COUNT + 1);
        var ended = yield rosca.endOfROSCA.call();
        assert.isOk(ended, "Round 5 and endOfROSCA is false" );
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
    }));
});