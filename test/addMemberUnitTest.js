/**
    AddMember(address newMember) Internal :  *** READY FOR PR REVIEW ****
    Throw Cases :
 (done) - If newMember already exists in the members mapping
    Flow Cases :
 (done) - check if membersAddresses.length goes up by 1 after calling
 (done) - check if the address exists in members mapping
    Attack Plan :
 (done) - add 1st Member , throw (deals with #1 throw case)
 (done) - add non Member , check membersAddress.length (deals with #1 flow case)
 (done) - add non Member , check members.call().alive is true (deals with #2 flow case)

 */
var co = require("co").wrap;
contract('ROSCA addMember Unit test', function(accounts) {

    it("add Existing member, throw", function () {
        var rosca = ROSCAtest.deployed();

        return rosca.addMember(accounts[1]).then(function() {
            assert.isNotOk(true, "adding existing member succeed, didn't throw");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });
    it("check if membersAddresses.length goes up by 1 after calling", co(function *() {
        var rosca = ROSCAtest.deployed();

        yield rosca.addMember(accounts[4]);
        var member = yield rosca.membersAddresses.call(4);
        return assert.equal(member, accounts[4], "member's address didn't get registered properly");
    }));
    it("check if the address exists in members mapping", co(function *() {
        var rosca = ROSCAtest.deployed();

        yield rosca.addMember(accounts[5]);
        var member = yield rosca.members.call(accounts[5]);
        return assert.isOk(member[2], "member.alive didn't get registered properly");
    }));
});