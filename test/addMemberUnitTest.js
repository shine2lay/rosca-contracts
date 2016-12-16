var co = require("co").wrap;
contract('ROSCA addMember Unit test', function(accounts) {

    it("throws when adding an existing member", function () {
        var rosca = ROSCATest.deployed();

        return rosca.addMember(accounts[1]).then(function() {
            assert.isNotOk(true, "adding existing member succeed when it should have thrown");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("checks member gets added properly", co(function *() {
        var rosca = ROSCATest.deployed();
        const CONTRIBUTION = 1e17;

        yield rosca.contribute({from: accounts[4], value: CONTRIBUTION}).then(function() {
            assert.isNotOk(true, "expected calling contribute from non-member to throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
        yield rosca.addMember(accounts[4]);
        yield rosca.contribute({from: accounts[4], value: CONTRIBUTION});

        var user = rosca.members.call(accounts[4]);

        assert.equal(user[0], CONTRIBUTION, "newly added member couldn't contribute");

    }));
});