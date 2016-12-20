var Promise = require("bluebird");
var co = require("co").wrap;

contract('ROSCA contribute Unit Test', function(accounts) {
    const ROUND_PERIOD_DELAY = 86400 * 3;
    const CONTRIBUTION_SIZE = 1e16;

    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 20;

    it("Throws when calling contribute from a non-member", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        return rosca.contribute({from: accounts[4], value: CONTRIBUTION_SIZE}).then(function() {
            assert.isNotOk(true, "calling contribute from a non-member success");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    }));

    it("Testing for event LogContributionMade()", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        var contributionMadeEvent = rosca.LogContributionMade();
        contributionMadeEvent.watch(function(error,log){
            contributionMadeEvent.stopWatching();
            assert.equal(log.args.user, accounts[1], "LogContributionMade doesn't display proper user value");
            assert.equal(log.args.amount, CONTRIBUTION_SIZE * 0.1, "LogContributionMade doesn't display proper amount value");
        });

        yield rosca.contribute({from: accounts[1], value: CONTRIBUTION_SIZE * 0.1});

        yield Promise.delay(300);
    }));

    it("Checks whether the contributed value gets registered properly", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);

        yield rosca.contribute({from: accounts[2], value: CONTRIBUTION_SIZE});
        var credit_after = yield rosca.members.call(accounts[2]);
        assert.equal(credit_after[0], CONTRIBUTION_SIZE, "contribution's credit value didn't get registered properly");
    }));

});