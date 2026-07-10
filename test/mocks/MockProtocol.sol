// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IAutomatable} from "../../src/interfaces/IAutomatable.sol";

contract MockProtocol is IAutomatable {
    address private s_executionEngine;

    uint256 public counter;
    bool public upkeepNeeded = true;
    bool public shouldRevert;
    bool public shouldPanic;      // triggers a Panic(0x11) - arithmetic overflow
    bool public shouldConsumeGas; // burns gas to test gas-griefing scenarios
    string public revertReason = "MockProtocol: forced revert";

    event Performed(bytes performData, address caller);

    constructor(address executionEngine_) {
        s_executionEngine = executionEngine_;
    }

    function checkUpkeep(bytes calldata checkData)
        external
        view
        override
        returns (bool upkeepNeeded_, bytes memory performData)
    {
        return (upkeepNeeded, checkData);
    }

    function performUpkeep(bytes calldata performData) external override {
        if (msg.sender != s_executionEngine) revert Automatable__NotExecutionEngine();
        if (!upkeepNeeded) revert Automatable__UpkeepNotNeeded();
        if (shouldRevert) revert(revertReason);
        if (shouldPanic) {
            uint256 x = 0;
            unchecked { x = x - 1; } // won't panic under unchecked - see note below
            assert(x == 0); // forces Panic(0x01) instead, keeps this deterministic
        }
        if (shouldConsumeGas) {
            uint256 sum;
            for (uint256 i = 0; i < 500_000; i++) {
                sum += i;
            }
        }

        counter++;
        emit Performed(performData, msg.sender);
        emit UpkeepPerformed(msg.sender, uint64(block.timestamp));
    }

    function getExecutionEngine() external view override returns (address) {
        return s_executionEngine;
    }

    // ---- test configuration helpers ----
    function setUpkeepNeeded(bool v) external { upkeepNeeded = v; }
    function setShouldRevert(bool v, string calldata reason) external {
        shouldRevert = v;
        if (bytes(reason).length > 0) revertReason = reason;
    }
    function setShouldPanic(bool v) external { shouldPanic = v; }
    function setShouldConsumeGas(bool v) external { shouldConsumeGas = v; }
    function setExecutionEngine(address engine_) external { s_executionEngine = engine_; }
}

contract ReentrantMockProtocol is IAutomatable {
    address private s_executionEngine;
    uint256 public jobIdToReenter;
    bytes public reentryPerformData;
    bool public attemptReentrancy;
    bool public reentryCallSucceeded; // should remain false if the guard works

    constructor(address executionEngine_) {
        s_executionEngine = executionEngine_;
    }

    function checkUpkeep(bytes calldata) external pure override returns (bool, bytes memory) {
        return (true, "");
    }

    function performUpkeep(bytes calldata) external override {
        if (msg.sender != s_executionEngine) revert Automatable__NotExecutionEngine();

        if (attemptReentrancy) {
            attemptReentrancy = false; // prevent infinite recursion if the guard fails
            (bool ok, ) = s_executionEngine.call(
                abi.encodeWithSignature(
                    "executeJob(uint256,bytes)",
                    jobIdToReenter,
                    reentryPerformData
                )
            );
            reentryCallSucceeded = ok;
        }
    }

    function getExecutionEngine() external view override returns (address) {
        return s_executionEngine;
    }

    function armReentrancy(uint256 jobId_, bytes calldata data_) external {
        jobIdToReenter = jobId_;
        reentryPerformData = data_;
        attemptReentrancy = true;
        reentryCallSucceeded = false;
    }
}


contract RevertingReceiver {
    receive() external payable {
        revert("RevertingReceiver: rejecting ETH");
    }
}

contract GasGuzzlingReceiver {
    uint256 private sink;

    receive() external payable {
        for (uint256 i = 0; i < 200_000; i++) {
            sink += i;
        }
    }
}
