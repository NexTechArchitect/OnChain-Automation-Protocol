// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IAutomatable
 * @notice Standard interface for contracts that require off-chain automation.
 * @dev Target contracts must implement this to be compatible with the Keeper Network.
 */
interface IAutomatable {

    error Automatable__NotExecutionEngine();
    error Automatable__UpkeepNotNeeded();

    event UpkeepPerformed(address indexed keeper, uint64 timestamp);

    /**
     * @notice Simulates off-chain to check if execution is required.
     * @return upkeepNeeded True if the contract requires upkeep.
     * @return performData Payload to pass into performUpkeep.
     */
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    
    /**
     * @notice Executes the actual logic on-chain. Must validate msg.sender.
     */
    function performUpkeep(bytes calldata performData) external;

    /**
     * @notice Returns the authorized execution engine to enforce access control.
     */
    function getExecutionEngine() external view returns (address);
}