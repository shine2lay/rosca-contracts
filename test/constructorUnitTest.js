var co = require("co").wrap;

contract('ROSCA constructor Unit Test', function(accounts) {
    
    var latestBlock = web3.eth.getBlock("latest");
    var simulatedTimeNow = latestBlock.timestamp;
    var hourFromNow = simulatedTimeNow + 3600;
    var twoDayFromNow = simulatedTimeNow + 86400 * 2 ;
    const CONTRIBUTION_SIZE = 1e17;
    const ROUND_PERIOD_IN_DAYS = 3;
    const MEMBER_LIST = [accounts[1],accounts[2],accounts[3]];
    const SERVICE_FEE = 20;

    it("Throws if ROUND_PERIOD_IN_DAYS < MIN_ROUND_PERIOD_IN_DAYS", function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        return ROSCA.new(0, CONTRIBUTION_SIZE, twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if ROUND_PERIOD_IN_DAYS >= MAX_ROUND_PERIOD_IN DAYS", function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        return ROSCA.new(31, CONTRIBUTION_SIZE, twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if CONTRIBUTION_SIZE < MIN_ROUND_SUM", function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2 ;

        return ROSCA.new(ROUND_PERIOD_IN_DAYS, 1e14, twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if CONTRIBUTION_SIZE > MAX_CONTRIBUTION_SIZE", function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2;

        return ROSCA.new(ROUND_PERIOD_IN_DAYS, 1e21, twoDayFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if MINIMUM_TIME_BEFORE_ROSCA_START < 1 day", function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2;
        return ROSCA.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, hourFromNow, MEMBER_LIST, SERVICE_FEE).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if feeInThousandths < 0", function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2 ;
        return ROSCA.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, twoDayFromNow, MEMBER_LIST, -1).then(function() {
            assert.isNotOk(true, "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("Throws if feeInThousandths > MAX_FEE_IN_THOUSANTHS" , function() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2 ;
        return ROSCA.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, twoDayFromNow, MEMBER_LIST, 21).then(function() {
            assert.isNotOk(true , "contract creation successful");
        }).catch(function(e) {
            assert.include(e.message, 'invalid JUMP', "Invalid Jump error didn't occur");
        });
    });

    it("checks if ROSCA is created when valid parameters are passed", co(function *() {
        latestBlock = web3.eth.getBlock("latest");
        simulatedTimeNow = latestBlock.timestamp;
        twoDayFromNow = simulatedTimeNow + 86400 * 2 ;
        var rosca = yield ROSCATest.new(ROUND_PERIOD_IN_DAYS, CONTRIBUTION_SIZE, twoDayFromNow, MEMBER_LIST, SERVICE_FEE);
        if(!rosca)
            assert.isNotOk(true, "rosca with valid parameter is not working");
    }));
});
