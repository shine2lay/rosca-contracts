var co = require("co").wrap;
contract('ROSCA addMember Unit test', function(accounts) {

    const CONTRIBUTION_SIZE = 1e16;
    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 2;

    it("throws when adding an existing member", function () {
        var rosca = ROSCATest.deployed();

        return rosca.addMember(accounts[1]).then(function() {
            assert.isNotOk(true, "adding existing member succeed when it should have thrown");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("checks member gets added properly", co(function *() {
        var latestBlock = web3.eth.getBlock("latest");
        var simulatedTimeNow = latestBlock.timestamp;
        var DayFromNow = simulatedTimeNow + 86400 + 10;

        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, DayFromNow, MEMBER_LIST, SERVICE_FEE);
        const CONTRIBUTION = 1e17;

        yield rosca.contribute({from: accounts[4], value: CONTRIBUTION}).then(function() {
            assert.isNotOk(true, "expected calling contribute from non-member to throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
        yield rosca.addMember(accounts[4]);
        yield rosca.contribute({from: accounts[4], value: CONTRIBUTION});

        var user = yield rosca.members.call(accounts[4]);

        assert.equal(user[0], CONTRIBUTION, "newly added member couldn't contribute");

    }));
});