// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IJobManager
 * @notice Manages job registrations, reward pools, and execution tracking.
 */
interface IJobManager {

    enum JobStatus { Inactive, Active, Paused, Completed }
    enum JobType   { Recurring, OneTime }

    struct Job {
        // Slot 1
        address   target;            // 160 bits
        uint96    rewardPerExec;     // 96 bits
        
        // Slot 2
        address   owner;             // 160 bits
        uint64    interval;          // 64 bits
        JobStatus status;            // 8 bits
        JobType   jobType;           // 8 bits
        
        // Slot 3
        uint64    lastExecutedAt;    // 64 bits
        uint64    registeredAt;      // 64 bits
        uint32    totalExecutions;   // 32 bits
        uint96    maxBaseFee;        // 96 bits (Gas-Griefing Protection)
    }

    // ERRORS
    error JobManager__JobNotFound(uint256 jobId);
    error JobManager__NotJobOwner(uint256 jobId);
    error JobManager__JobNotActive(uint256 jobId);
    error JobManager__JobNotPaused(uint256 jobId);
    error JobManager__IntervalNotElapsed(uint256 jobId, uint256 remaining);
    error JobManager__InsufficientDeposit(uint256 sent, uint256 required);
    error JobManager__RewardPoolEmpty(uint256 jobId);
    error JobManager__ZeroAddress();
    error JobManager__ZeroReward();
    error JobManager__ZeroInterval();
    error JobManager__Unauthorized();
    error JobManager__TransferFailed();
    error JobManager__GasPriceTooHigh(uint256 currentBaseFee, uint256 maxAllowed);
    error JobManager__ExecutionAlreadyHandled(uint256 jobId);

    // EVENTS
    event JobRegistered(uint256 indexed jobId, address indexed target, address indexed owner, uint96 rewardPerExec, JobType jobType);
    event JobCancelled(uint256 indexed jobId, uint96 refundAmount);
    event JobPaused(uint256 indexed jobId);
    event JobResumed(uint256 indexed jobId);
    event JobExecuted(uint256 indexed jobId, address indexed keeper, uint96 rewardPaid);
    event JobCompleted(uint256 indexed jobId);
    event RewardDeposited(uint256 indexed jobId, uint96 amount);
    event RewardWithdrawn(uint256 indexed jobId, uint96 amount);

    // ===================================
    // CORE FUNCTIONS
    // ===================================

    function registerJob(address target, uint96 rewardPerExec, uint64 interval, uint96 maxBaseFee) external payable returns (uint256 jobId);
    function cancelJob(uint256 jobId) external;
    function pauseJob(uint256 jobId) external;
    function resumeJob(uint256 jobId) external;
    function depositReward(uint256 jobId) external payable;
    function withdrawReward(uint256 jobId, uint96 amount) external;

    //=====================================
    // VIEWS
    //=====================================
    function recordExecution(uint256 jobId, address keeper) external;
    function getJob(uint256 jobId) external view returns (Job memory);
    function isJobReady(uint256 jobId) external view returns (bool);
    function getRewardPool(uint256 jobId) external view returns (uint96);
    function getTotalJobs() external view returns (uint256);
    function getActiveJobIds() external view returns (uint256[] memory);
}