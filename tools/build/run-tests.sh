#!/bin/bash

# Creates the ROSCATest.sol contract (with members publicized)
# and runs the tests.
# Any commandline parameters are passed to "truffle test".

runCommand() {
  echo "### $@"
  $@ || { echo "*** Command '$@' failed, exiting" ; exit 1; }
}

# Create ROSCATest.sol with all the internal
# variable and functions publicized
runCommand ./tools/build/publicizer.py contracts/ROSCA.sol
runCommand ./tools/build/publicizer.py contracts/tokenableROSCA.sol

runCommand truffle compile
runCommand truffle migrate --reset
runCommand truffle test $@
