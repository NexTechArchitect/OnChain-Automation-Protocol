// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IJobManager}             from "../interfaces/IJobManager.sol";
import {KeeperMath}              from "../libraries/KeeperMath.sol";
import {Ownable2Step, Ownable}   from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}         from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable}                from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title JobManager
 * @notice Core registry and state manager for automated smart contract jobs.
 * @dev Implements O(1) job arrays, pull-payment fee accumulation, and strict CEI patterns.
 */
contract JobManager is IJobManager, Ownable2Step, ReentrancyGuard, Pausable {

    //=====================================
    // STORAGE
    //=====================================
    
    /// @notice Address of the authorized Execution Engine.
    address private s_executionEngine;
    
    /// @notice Auto-incrementing counter for generating unique job IDs.
    uint64  private s_nextJobId;

    /// @notice Address collecting protocol execution fees.
    address private s_treasury;
    
    /// @notice Protocol fee in basis points (e.g., 100 = 1%).
    uint16  private s_protocolFeeBps;
    
    /// @notice Total unpaid fees pending treasury withdrawal (Pull-payment).
    uint256 private s_accumulatedFees;

    /// @notice Maps job ID to its core Job struct data.
    mapping(uint256 => Job)     private s_jobs;
    
    /// @notice Maps job ID to its available reward balance.
    mapping(uint256 => uint96)  private s_rewardPools;

    /// @notice Array of currently active job IDs for O(n) off-chain enumeration.
    uint256[]                   private s_activeJobIds;
    
    /// @notice 1-indexed mapping to track a job's position in the active array for O(1) deletion.
    mapping(uint256 => uint256) private s_activeIndex;

    //=====================================
    // MODIFIERS
    //=====================================
    
    modifier onlyEngine() {
        if (msg.sender != s_executionEngine) revert JobManager__Unauthorized();
        _;
    }

    modifier jobExists(uint256 jobId) {
        if (s_jobs[jobId].owner == address(0)) revert JobManager__JobNotFound(jobId);     
        _;
    }

    modifier onlyJobOwner(uint256 jobId) {
        if (s_jobs[jobId].owner != msg.sender) revert JobManager__NotJobOwner(jobId);
        _;  
    }

    constructor(address owner_, address treasury_, uint16 protocolFeeBps_) Ownable(owner_) {
        if (owner_ == address(0)) revert JobManager__ZeroAddress();
        if (treasury_ == address(0)) revert JobManager__ZeroAddress();
        if (uint256(protocolFeeBps_) > KeeperMath.BPS_DENOMINATOR) revert JobManager__Unauthorized();

        s_treasury       = treasury_;
        s_protocolFeeBps = protocolFeeBps_;
        s_nextJobId      = 1;
    }

    //=====================================
    // EXTERNAL FUNCTIONS
    //=====================================

    /// @notice Registers a new automation job.
    /// @param target The smart contract address to be executed.
    /// @param rewardPerExec The payout amount for each successful execution.
    /// @param interval The cooldown period in seconds (0 for one-time jobs).
    /// @param maxBaseFee The maximum acceptable block base fee to prevent gas griefing.
    /// @return jobId The unique identifier of the newly created job.
    function registerJob(
        address target,
        uint96 rewardPerExec,
        uint64 interval,
        uint96 maxBaseFee
    ) external payable whenNotPaused returns (uint256 jobId) {
        if (target        == address(0))       revert JobManager__ZeroAddress();
        if (rewardPerExec == 0)                revert JobManager__ZeroReward();
        if (msg.value     < rewardPerExec)     revert JobManager__InsufficientDeposit(msg.value, rewardPerExec);
        if (msg.value     > type(uint96).max)  revert JobManager__InsufficientDeposit(msg.value, type(uint96).max);

        JobType jType = (interval == 0) ? JobType.OneTime : JobType.Recurring;

        jobId = uint256(s_nextJobId);
        unchecked { s_nextJobId++; }

        s_jobs[jobId] = Job({
            target:          target,
            rewardPerExec:   rewardPerExec,
            owner:           msg.sender,
            interval:        interval,
            status:          JobStatus.Active,
            jobType:         jType,
            lastExecutedAt:  0,
            registeredAt:    uint64(block.timestamp),
            totalExecutions: 0,
            maxBaseFee:      maxBaseFee
        });
        
        s_rewardPools[jobId] = uint96(msg.value);
        _addToActiveList(jobId);

        emit JobRegistered(jobId, target, msg.sender, rewardPerExec, jType);
    }

    /// @notice Cancels a job and refunds the remaining reward pool to the owner.
    /// @param jobId The unique identifier of the job to cancel.
    function cancelJob(uint256 jobId)
        external
        nonReentrant
        jobExists(jobId)
        onlyJobOwner(jobId)
    {
        Job storage job = s_jobs[jobId];
        JobStatus prevStatus = job.status;

        if (prevStatus == JobStatus.Inactive || prevStatus == JobStatus.Completed) {
            revert JobManager__JobNotActive(jobId);
        }

        uint96 refund        = s_rewardPools[jobId];
        job.status           = JobStatus.Inactive;
        s_rewardPools[jobId] = 0;

        if (prevStatus == JobStatus.Active) {
            _removeFromActiveList(jobId);
        }

        emit JobCancelled(jobId, refund);

        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert JobManager__TransferFailed();
        }
    }    

    /// @notice Pauses an active job, temporarily removing it from the execution queue.
    /// @param jobId The unique identifier of the job.
    function pauseJob(uint256 jobId) external jobExists(jobId) onlyJobOwner(jobId) {
        Job storage job = s_jobs[jobId];
        if (job.status != JobStatus.Active) revert JobManager__JobNotActive(jobId);
        
        job.status = JobStatus.Paused;
        _removeFromActiveList(jobId);
        
        emit JobPaused(jobId);
    }

    /// @notice Resumes a paused job if sufficient reward funds are available.
    /// @param jobId The unique identifier of the job.
    function resumeJob(uint256 jobId)
        external
        whenNotPaused
        jobExists(jobId)
        onlyJobOwner(jobId)
    {
        Job storage job = s_jobs[jobId];
        if (job.status != JobStatus.Paused) revert JobManager__JobNotPaused(jobId);
        if (!KeeperMath.hasSufficientReward(s_rewardPools[jobId], job.rewardPerExec)) {
            revert JobManager__RewardPoolEmpty(jobId);
        }

        job.status = JobStatus.Active;
        _addToActiveList(jobId);

        emit JobResumed(jobId);
    }

    /// @notice Adds additional funds to the reward pool of a specific job.
    /// @param jobId The unique identifier of the job.
    function depositReward(uint256 jobId) external payable whenNotPaused jobExists(jobId) {
        if (msg.value == 0)                   revert JobManager__ZeroReward();
        if (msg.value > type(uint96).max)     revert JobManager__InsufficientDeposit(msg.value, type(uint96).max);
    
        uint96 added   = uint96(msg.value);
        uint96 current = s_rewardPools[jobId];

        if (uint256(current) + uint256(added) > type(uint96).max) {
            revert JobManager__InsufficientDeposit(
                msg.value, (type(uint96).max) - uint256(current)
            );
        }

        unchecked {
            s_rewardPools[jobId] = current + added;
        }
        
        emit RewardDeposited(jobId, added);
    }

    /// @notice Withdraws excess funds from the reward pool while maintaining minimum balances.
    /// @param jobId The unique identifier of the job.
    /// @param amount The requested withdrawal amount.
    function withdrawReward(uint256 jobId, uint96 amount) 
        external
        nonReentrant
        jobExists(jobId)
        onlyJobOwner(jobId)
    {
        Job storage job   = s_jobs[jobId];
        uint96 currentPool = s_rewardPools[jobId];

        if (amount > currentPool) revert JobManager__RewardPoolEmpty(jobId);

        uint96 remaining;
        unchecked { remaining = currentPool - amount; }

        if (job.status == JobStatus.Active) {
            if (!KeeperMath.hasSufficientReward(remaining, job.rewardPerExec)) {
                revert JobManager__InsufficientDeposit(remaining, job.rewardPerExec);
            }
        }
        
        s_rewardPools[jobId] = remaining;
        emit RewardWithdrawn(jobId, amount);

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert JobManager__TransferFailed();
    }

    /// @notice Records execution, updates state, and distributes rewards.
    /// @dev Strictly callable only by the Execution Engine.
    /// @param jobId The unique identifier of the executed job.
    /// @param keeper The address of the keeper who executed the job.
    function recordExecution(uint256 jobId, address keeper)
     external 
     onlyEngine
     nonReentrant
     jobExists(jobId)
    {
        Job storage job = s_jobs[jobId];

        if (job.status != JobStatus.Active) revert JobManager__JobNotActive(jobId);

        if (!KeeperMath.isBaseFeeAcceptable(job.maxBaseFee)) {
            revert JobManager__GasPriceTooHigh(block.basefee, job.maxBaseFee);
        }

        if (job.lastExecutedAt != 0) {
            uint256 elapsed = block.timestamp - uint256(job.lastExecutedAt);
            if (elapsed < uint256(job.interval)) {
                uint256 remaining;
                unchecked { remaining = uint256(job.interval) - elapsed; }
                revert JobManager__IntervalNotElapsed(jobId, remaining);
            }
        }
        
        uint96 pool = s_rewardPools[jobId];
        if (!KeeperMath.hasSufficientReward(pool, job.rewardPerExec)) {
            revert JobManager__RewardPoolEmpty(jobId);
        }
        
        (uint96 keeperReward, uint96 protocolFee) = KeeperMath.calcRewardSplit(
            job.rewardPerExec,
            uint256(s_protocolFeeBps)
        );

        job.lastExecutedAt = uint64(block.timestamp);
        unchecked {
            job.totalExecutions++;
            s_rewardPools[jobId] = pool - job.rewardPerExec;
            s_accumulatedFees   += uint256(protocolFee);
        }
        
        if (job.jobType == JobType.OneTime) {
            job.status = JobStatus.Completed;
            _removeFromActiveList(jobId);
            emit JobCompleted(jobId);
        }
        
        emit JobExecuted(jobId, keeper, keeperReward);

        (bool ok,) = keeper.call{value: keeperReward}("");
        if (!ok) revert JobManager__TransferFailed();
    }
    
    /// @notice Allows the Treasury to pull accumulated fees, preventing DoS vectors.
    function withdrawFees() external nonReentrant {
        address treas = s_treasury;
        uint256 fees = s_accumulatedFees;

        if (fees == 0) return;

        s_accumulatedFees = 0;

        (bool ok,) = treas.call{value: fees}("");
        if (!ok) revert JobManager__TransferFailed();
    }

    //=====================================
    // ADMIN SETTERS
    //=====================================

    function setExecutionEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert JobManager__ZeroAddress();
        s_executionEngine = engine_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert JobManager__ZeroAddress();
        s_treasury = treasury_;
    }

    function setProtocolFeeBps(uint16 feeBps_) external onlyOwner {
        if (uint256(feeBps_) > KeeperMath.BPS_DENOMINATOR) revert JobManager__Unauthorized();
        s_protocolFeeBps = feeBps_;
    }

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    //==================================
    // INTERNAL HELPERS
    //==================================
    
    /// @dev Adds a job to the active 1-indexed array for enumeration.
    function _addToActiveList(uint256 jobId) internal {
        s_activeIndex[jobId] = s_activeJobIds.length + 1;
        s_activeJobIds.push(jobId);
    }

    /// @dev Removes a job using an O(1) swap-and-pop technique.
    function _removeFromActiveList(uint256 jobId) internal {
        uint256 pos1 = s_activeIndex[jobId];
        if (pos1 == 0) return;

        uint256 index     = pos1 - 1;
        uint256 lastIndex = s_activeJobIds.length - 1;

        if (index != lastIndex) {
            uint256 lastJobId = s_activeJobIds[lastIndex];
            s_activeJobIds[index] = lastJobId;
            s_activeIndex[lastJobId] = index + 1;
        }
        
        s_activeJobIds.pop(); 
        delete s_activeIndex[jobId];  
    }

    //==================================
    // VIEWS & GETTERS
    //==================================

    /// @notice Retrieves the complete state of a specific job.
    function getJob(uint256 jobId) external view returns (Job memory) {
        return s_jobs[jobId];
    }

    /// @notice Evaluates if a job is currently eligible for execution.
    function isJobReady(uint256 jobId) external view returns (bool) {
        Job storage job = s_jobs[jobId];
        if (job.status != JobStatus.Active)                                            return false;
        if (!KeeperMath.isBaseFeeAcceptable(job.maxBaseFee))                           return false;
        if (!KeeperMath.hasSufficientReward(s_rewardPools[jobId], job.rewardPerExec))  return false;
        if (job.lastExecutedAt == 0)                                                   return true;
        
        return block.timestamp >= uint256(job.lastExecutedAt) + uint256(job.interval);
    }

    /// @notice Returns the available reward balance for a given job.
    function getRewardPool(uint256 jobId) external view returns (uint96) {
        return s_rewardPools[jobId];
    }

    /// @notice Returns the total number of jobs created to date.
    function getTotalJobs() external view returns (uint256) {
        return uint256(s_nextJobId) - 1;
    }

    /// @notice Returns the array of all currently active jobs. 
    /// @dev Avoid calling on-chain due to unbounded array loop gas costs.
    function getActiveJobIds() external view returns (uint256[] memory) {
        return s_activeJobIds;
    }

    function getExecutionEngine()  external view returns (address) { return s_executionEngine;   }
    function getTreasury()         external view returns (address) { return s_treasury;            }
    function getProtocolFeeBps()   external view returns (uint16)  { return s_protocolFeeBps;      }
    function getAccumulatedFees()  external view returns (uint256) { return s_accumulatedFees;    }

}