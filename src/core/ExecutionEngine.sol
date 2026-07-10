// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IKeeperRegistry}          from "../interfaces/IKeeperRegistry.sol";
import {IJobManager}               from "../interfaces/IJobManager.sol";
import {IAutomatable}              from "../interfaces/IAutomatable.sol";
import {Ownable2Step, Ownable}    from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}          from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable}                 from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ExecutionEngine
 * @notice Central execution hub routing jobs from Keepers to Target Contracts safely.
 * @dev Employs try/catch fault isolation and off-chain validation compatibility.
 */
contract ExecutionEngine is Ownable2Step, ReentrancyGuard, Pausable {

    //==============================================
    // IMMUTABLES & CONSTANTS
    //==============================================

    /// @notice Immutable reference to the Keeper Registry.
    IKeeperRegistry private immutable i_registry;
    
    /// @notice Immutable reference to the Job Manager.
    IJobManager     private immutable i_jobManager;

    /// @notice Fixed reputation points awarded per successful job execution.
    uint16 private constant REP_INCREASE_SUCCESS = 5;

    //==============================================
    // ERRORS & EVENTS
    //==============================================

    error ExecutionEngine__ZeroAddress();
    error ExecutionEngine__KeeperNotActive(address keeper);
    error ExecutionEngine__JobNotReady(uint256 jobId);
    error ExecutionEngine__BatchLengthMismatch();
    error ExecutionEngine__EmptyBatch();

    event JobExecutionSuccess(uint256 indexed jobId, address indexed keeper, uint64 timestamp);
    event JobExecutionFailed(uint256 indexed jobId, address indexed keeper, bytes reason);
    event KeeperManuallySlashed(address indexed keeper, uint96 amount);
    event KeeperManuallyJailed(address indexed keeper);

    //==============================================
    // CONSTRUCTOR
    //==============================================

    constructor(address owner_, address registry_, address jobManager_) Ownable(owner_) {
        if (owner_      == address(0)) revert ExecutionEngine__ZeroAddress();
        if (registry_   == address(0)) revert ExecutionEngine__ZeroAddress();
        if (jobManager_ == address(0)) revert ExecutionEngine__ZeroAddress();

        i_registry   = IKeeperRegistry(registry_);
        i_jobManager = IJobManager(jobManager_);
    }

    //==============================================
    // CORE EXECUTION
    //==============================================

    /// @notice Executes a single job, facilitating payload delivery and reward distribution.
    /// @dev Keepers MUST simulate via eth_call before submission to avoid gas loss from malicious target contracts.
    /// @param jobId The ID of the job to execute.
    /// @param performData Off-chain computed payload strictly required by the target contract.
    function executeJob(uint256 jobId, bytes calldata performData)
        external
        nonReentrant
        whenNotPaused
    {
        if (!i_registry.isActive(msg.sender)) {
            revert ExecutionEngine__KeeperNotActive(msg.sender);
        }
        if (!i_jobManager.isJobReady(jobId)) {
            revert ExecutionEngine__JobNotReady(jobId);
        }

        IJobManager.Job memory job = i_jobManager.getJob(jobId);

        try IAutomatable(job.target).performUpkeep(performData) {
            
            i_jobManager.recordExecution(jobId, msg.sender);
            i_registry.increaseReputation(msg.sender, REP_INCREASE_SUCCESS);
            i_registry.incrementJobsExecuted(msg.sender);

            emit JobExecutionSuccess(jobId, msg.sender, uint64(block.timestamp));

        } catch (bytes memory reason) {
            emit JobExecutionFailed(jobId, msg.sender, reason);
        }
    }

    /// @notice Executes multiple jobs in a single transaction to amortize gas costs.
    /// @dev Fault-tolerant: If one job fails or is not ready, the loop continues to the next.
    /// @dev Keepers MUST simulate via eth_call before submission to avoid gas loss from malicious target contracts.
    /// @param jobIds Array of job IDs to process.
    /// @param performDatas Array of corresponding payloads for each job.
    function executeBatch(
        uint256[] calldata jobIds,
        bytes[]   calldata performDatas
    ) external nonReentrant whenNotPaused {
        uint256 len = jobIds.length;
        
        if (len == 0)                    revert ExecutionEngine__EmptyBatch();
        if (len != performDatas.length)  revert ExecutionEngine__BatchLengthMismatch();
        if (!i_registry.isActive(msg.sender)) {
            revert ExecutionEngine__KeeperNotActive(msg.sender);
        }

        for (uint256 i = 0; i < len;) {
            _executeSingle(jobIds[i], performDatas[i]);
            unchecked { i++; }
        }
    }

    //==============================================
    // INTERNAL HELPERS
    //==============================================

    /// @dev Internal isolated execution environment for batch processing.
    function _executeSingle(uint256 jobId, bytes calldata performData) internal {
        if (!i_jobManager.isJobReady(jobId)) return;

        IJobManager.Job memory job = i_jobManager.getJob(jobId);

        try IAutomatable(job.target).performUpkeep(performData) {
            
            i_jobManager.recordExecution(jobId, msg.sender);
            i_registry.increaseReputation(msg.sender, REP_INCREASE_SUCCESS);
            i_registry.incrementJobsExecuted(msg.sender);
            
            emit JobExecutionSuccess(jobId, msg.sender, uint64(block.timestamp));
            
        } catch (bytes memory reason) {
            emit JobExecutionFailed(jobId, msg.sender, reason);
        }
    }

    //==============================================
    // GOVERNANCE & ADMIN
    //==============================================

    /// @notice Allows the protocol owner to manually penalize a malicious keeper.
    /// @dev Phase 1 uses trusted admin slashing. Optimistic dispute resolution planned for Phase 2.
    function slashKeeper(address keeper, uint96 amount) external onlyOwner {
        i_registry.slash(keeper, amount);
        emit KeeperManuallySlashed(keeper, amount);
    }

    /// @notice Allows the protocol owner to manually freeze a keeper's activity.
    function jailKeeper(address keeper) external onlyOwner {
        i_registry.jail(keeper);
        emit KeeperManuallyJailed(keeper);
    }

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    //==============================================
    // VIEW FUNCTIONS
    //==============================================

    function getRegistry()   external view returns (address) { return address(i_registry);   }
    function getJobManager() external view returns (address) { return address(i_jobManager); }
}