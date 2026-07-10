# Keeper Network — Full Source Code

---

## `src/core/ExecutionEngine.sol`

```solidity
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
    // VIEWS
    //==============================================

    function getRegistry()   external view returns (address) { return address(i_registry);   }
    function getJobManager() external view returns (address) { return address(i_jobManager); }
}```

---

## `src/core/JobManager.sol`

```solidity
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

}```

---

## `src/core/KeeperRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IKeeperRegistry}          from "../interfaces/IKeeperRegistry.sol";
import {KeeperMath}               from "../libraries/KeeperMath.sol";
import {Ownable2Step, Ownable}    from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard}          from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable}                 from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title KeeperRegistry
 * @notice Core registry managing Keeper onboarding, bonds, slashing, and reputation.
 * @dev Optimized for EVM storage packing. Follows strict CEI patterns.
 */
contract KeeperRegistry is IKeeperRegistry, Ownable2Step, ReentrancyGuard, Pausable {

    //==============================================
    // CONSTANTS
    //==============================================

    uint64 private constant DEFAULT_UNBOND_COOLDOWN = 3 days;
    uint96 private constant DEFAULT_MIN_BOND        = 0.1 ether;
    uint32 private constant DEFAULT_JAIL_THRESHOLD  = 3;

    //==============================================
    // STORAGE
    //==============================================

    /// @notice Address of the authorized Execution Engine.
    address private s_executionEngine;
    
    /// @notice Minimum required bond for a keeper to register and remain active.
    uint96  private s_minBond;

    /// @notice Address collecting slashed funds.
    address private s_treasury;
    
    /// @notice Duration in seconds a keeper must wait before withdrawing their bond.
    uint64  private s_unbondCooldown;

    /// @notice Number of slashes required to automatically jail a keeper.
    uint32  private s_jailThreshold;
    
    /// @notice Total number of active and historically registered keepers.
    uint64  private s_totalKeepers;

    /// @notice Core mapping containing the state and metrics of all registered keepers.
    mapping(address => Keeper) private s_keepers;

    //==============================================
    // MODIFIERS
    //==============================================

    modifier onlyEngine() {
        if (msg.sender != s_executionEngine) revert KeeperRegistry__Unauthorized();
        _;
    }

    constructor(address owner_, address treasury_) Ownable(owner_) {
        if (owner_    == address(0)) revert KeeperRegistry__ZeroAddress();
        if (treasury_ == address(0)) revert KeeperRegistry__ZeroAddress();

        s_treasury       = treasury_;
        s_minBond        = DEFAULT_MIN_BOND;
        s_unbondCooldown = DEFAULT_UNBOND_COOLDOWN;
        s_jailThreshold  = DEFAULT_JAIL_THRESHOLD;
    }

    //==============================================
    // REGISTRATION & UNBONDING
    //==============================================

    /// @notice Registers a new keeper and locks their security bond.
    /// @dev Requires `msg.value` to be strictly greater than or equal to `s_minBond`.
    function register() external payable whenNotPaused {
        if (s_keepers[msg.sender].status != KeeperStatus.Unregistered) {
            revert KeeperRegistry__AlreadyRegistered();
        }
        if (msg.value < s_minBond) {
            revert KeeperRegistry__BondTooLow(msg.value, s_minBond);
        }

        s_keepers[msg.sender] = Keeper({
            bondAmount:        uint96(msg.value),
            registeredAt:      uint64(block.timestamp),
            unbondInitiatedAt: 0,
            totalJobsExecuted: 0,
            totalSlashes:      0,
            reputationScore:   0,
            status:            KeeperStatus.Active
        });
    
        unchecked {
            s_totalKeepers++;
        }
        
        emit KeeperRegistered(msg.sender, uint96(msg.value));
    }

    /// @notice Initiates the unbonding process, preventing further job executions.
    function initiateUnbond() external whenNotPaused {
        Keeper storage k = s_keepers[msg.sender];

        if (k.status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered();
        if (k.status != KeeperStatus.Active) revert KeeperRegistry__NotActive();

        k.status            = KeeperStatus.Exiting;
        k.unbondInitiatedAt = uint64(block.timestamp);

        emit KeeperUnbondInitiated(msg.sender, uint64(block.timestamp));
    }

    /// @notice Withdraws the security bond after the unbond cooldown period has elapsed.
    function withdrawBond() external nonReentrant {
        Keeper storage k = s_keepers[msg.sender];

        if (k.status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered();
        if (k.status != KeeperStatus.Exiting)      revert KeeperRegistry__NotExiting();
        if (!KeeperMath.isCooldownOver(k.unbondInitiatedAt, s_unbondCooldown)) { 
            revert KeeperRegistry__CooldownNotOver(
                KeeperMath.remainingCooldown(k.unbondInitiatedAt, s_unbondCooldown)
            );
        }
        
        uint96 bondToReturn = k.bondAmount;

        delete s_keepers[msg.sender];
        unchecked { s_totalKeepers--; }

        emit KeeperExited(msg.sender, bondToReturn);

        (bool ok,) = msg.sender.call{value: bondToReturn}("");
        if (!ok) revert KeeperRegistry__TransferFailed();
    }

    //==============================================
    // SLASHING & JAILING
    //==============================================

    /// @notice Slashes a keeper's bond and routes funds to the treasury.
    /// @param keeper The address of the keeper to penalize.
    /// @param amount The penalty amount to deduct from the bond.
    function slash(address keeper, uint96 amount) external onlyEngine {
        Keeper storage k = s_keepers[keeper];

        if (k.status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered();
        if (amount > k.bondAmount) revert KeeperRegistry__SlashExceedsBond(amount, k.bondAmount);

        unchecked {
            k.bondAmount   -= amount;
            k.totalSlashes += 1;
        }
        
        emit KeeperSlashed(keeper, amount, k.totalSlashes);

        if (k.totalSlashes >= s_jailThreshold || k.bondAmount < s_minBond) {
            _jail(keeper);
        }

        (bool ok,) = s_treasury.call{value: amount}("");
        if (!ok) revert KeeperRegistry__TransferFailed();
    }

    /// @notice Instantly jails a keeper, blocking them from the execution network.
    /// @param keeper The address of the keeper to jail.
    function jail(address keeper) external onlyEngine {
        if (s_keepers[keeper].status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered();
        _jail(keeper);
    }

    /// @notice Reinstates a jailed keeper if they meet the minimum bond threshold.
    /// @param keeper The address of the keeper to unjail.
    function unjail(address keeper) external onlyOwner {
        Keeper storage k = s_keepers[keeper]; 

        if (k.status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered();
        if (k.status != KeeperStatus.Jailed)       revert KeeperRegistry__NotJailed(); 

        if (k.bondAmount < s_minBond) revert KeeperRegistry__BondTooLow(k.bondAmount, s_minBond);

        k.status = KeeperStatus.Active;

        emit KeeperUnjailed(keeper);
    }

    //==============================================
    // REPUTATION & METRICS
    //==============================================

    /// @notice Safely increases the reputation score of a keeper.
    /// @param keeper The keeper address.
    /// @param delta The amount to increase the score by.
    function increaseReputation(address keeper, uint16 delta) external onlyEngine {
        Keeper storage k = s_keepers[keeper]; 
        if (k.status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered(); 

        uint16 old        = k.reputationScore;
        k.reputationScore = KeeperMath.increaseReputation(old, delta);

        emit KeeperReputationUpdated(keeper, old, k.reputationScore);
    }

    /// @notice Safely decreases the reputation score of a keeper.
    /// @param keeper The keeper address.
    /// @param delta The amount to decrease the score by.
    function decreaseReputation(address keeper, uint16 delta) external onlyEngine {
        Keeper storage k = s_keepers[keeper]; 
        if (k.status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered(); 

        uint16 old        = k.reputationScore;
        k.reputationScore = KeeperMath.decreaseReputation(old, delta);

        emit KeeperReputationUpdated(keeper, old, k.reputationScore);
    }

    /// @notice Increments the successful execution counter for a keeper.
    /// @param keeper The keeper address.
    function incrementJobsExecuted(address keeper) external onlyEngine {
        if (s_keepers[keeper].status == KeeperStatus.Unregistered) revert KeeperRegistry__NotRegistered();
        unchecked {
            s_keepers[keeper].totalJobsExecuted++;
        }    
    }

    //==============================================
    // ADMIN SETTERS
    //==============================================
    
    function setExecutionEngine(address engine_) external onlyOwner {
        if (engine_ == address(0)) revert KeeperRegistry__ZeroAddress(); 
        s_executionEngine = engine_;
    }

    function setMinBond(uint96 minBond_) external onlyOwner {
        uint96 old = s_minBond;
        s_minBond  = minBond_;
        emit MinBondUpdated(old, s_minBond);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert KeeperRegistry__ZeroAddress(); 
        s_treasury = treasury_;
    }

    function setUnbondCooldown(uint64 cooldown_) external onlyOwner {
        s_unbondCooldown = cooldown_;   
    }

    function setJailThreshold(uint32 threshold_) external onlyOwner { 
        s_jailThreshold = threshold_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    //==============================================
    // INTERNAL HELPERS
    //==============================================
    
    /// @dev Internal logic to update the state to Jailed and emit the event.
    function _jail(address keeper) internal {
        Keeper storage k = s_keepers[keeper]; 
        if (k.status == KeeperStatus.Jailed) return;
        k.status = KeeperStatus.Jailed;
        
        emit KeeperJailed(keeper);
    }

    //==============================================
    // VIEWS & GETTERS
    //==============================================

    /// @notice Retrieves the full struct of a specific keeper.
    function getKeeper(address keeper) external view returns (Keeper memory) {
        return s_keepers[keeper];
    }

    /// @notice Checks if a keeper is currently active and eligible for jobs.
    function isActive(address keeper) external view returns (bool) {
        return s_keepers[keeper].status == KeeperStatus.Active;
    }

    /// @notice Gets the current bond amount of a keeper.
    function getBond(address keeper) external view returns (uint96) {
        return s_keepers[keeper].bondAmount;
    }

    /// @notice Gets the current reputation score of a keeper.
    function getReputation(address keeper) external view returns (uint16) {
        return s_keepers[keeper].reputationScore;
    }

    /// @notice Gets the protocol's minimum required bond.
    function getMinBond() external view returns (uint96) {
        return s_minBond;
    }

    /// @notice Gets the protocol's unbond cooldown duration in seconds.
    function getUnbondCooldown() external view returns (uint64) {
        return s_unbondCooldown;
    }

    function getExecutionEngine() external view returns (address) { return s_executionEngine; }
    function getTreasury()        external view returns (address) { return s_treasury;        }
    function getTotalKeepers()    external view returns (uint64)  { return s_totalKeepers;    }
    function getJailThreshold()   external view returns (uint32)  { return s_jailThreshold;   }
}```

---

## `src/interfaces/IAutomatable.sol`

```solidity
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
}```

---

## `src/interfaces/IJobManager.sol`

```solidity
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
        // --- Slot 1: 256 bits 
        address   target;            // 160 bits
        uint96    rewardPerExec;     // 96 bits
        
        // --- Slot 2: 240 bits 
        address   owner;             // 160 bits
        uint64    interval;          // 64 bits
        JobStatus status;            // 8 bits
        JobType   jobType;           // 8 bits
        
        // --- Slot 3: 256 bits 
        uint64    lastExecutedAt;    // 64 bits
        uint64    registeredAt;      // 64 bits
        uint32    totalExecutions;   // 32 bits
        uint96    maxBaseFee;        // 96 bits (Gas-Griefing Protection)
    }

    // --- Errors ---
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

    // --- Events ---
    event JobRegistered(uint256 indexed jobId, address indexed target, address indexed owner, uint96 rewardPerExec, JobType jobType);
    event JobCancelled(uint256 indexed jobId, uint96 refundAmount);
    event JobPaused(uint256 indexed jobId);
    event JobResumed(uint256 indexed jobId);
    event JobExecuted(uint256 indexed jobId, address indexed keeper, uint96 rewardPaid);
    event JobCompleted(uint256 indexed jobId);
    event RewardDeposited(uint256 indexed jobId, uint96 amount);
    event RewardWithdrawn(uint256 indexed jobId, uint96 amount);

    // --- Core Functions ---
    function registerJob(address target, uint96 rewardPerExec, uint64 interval, uint96 maxBaseFee) external payable returns (uint256 jobId);
    function cancelJob(uint256 jobId) external;
    function pauseJob(uint256 jobId) external;
    function resumeJob(uint256 jobId) external;
    function depositReward(uint256 jobId) external payable;
    function withdrawReward(uint256 jobId, uint96 amount) external;

    // --- Execution & Views ---
    function recordExecution(uint256 jobId, address keeper) external;
    function getJob(uint256 jobId) external view returns (Job memory);
    function isJobReady(uint256 jobId) external view returns (bool);
    function getRewardPool(uint256 jobId) external view returns (uint96);
    function getTotalJobs() external view returns (uint256);
    function getActiveJobIds() external view returns (uint256[] memory);
}```

---

## `src/interfaces/IKeeperRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IKeeperRegistry {

    enum KeeperStatus { Unregistered, Active, Jailed, Exiting }

    struct Keeper {
        // --- Slot 1: 256 bits ---
        uint96       bondAmount;         // 96 bits
        uint64       registeredAt;       // 64 bits
        uint64       unbondInitiatedAt;  // 64 bits
        uint32       totalJobsExecuted;  // 32 bits
        // --- Slot 2: 56 bits (200 bits reserved) ---
        uint32       totalSlashes;       // 32 bits
        uint16       reputationScore;    // 16 bits
        KeeperStatus status;             // 8 bits
    }

    error KeeperRegistry__AlreadyRegistered();
    error KeeperRegistry__NotRegistered();
    error KeeperRegistry__BondTooLow(uint256 sent, uint256 required);
    error KeeperRegistry__NotActive();
    error KeeperRegistry__NotJailed();
    error KeeperRegistry__NotExiting();
    error KeeperRegistry__CooldownNotOver(uint256 remaining);
    error KeeperRegistry__ZeroAddress();
    error KeeperRegistry__Unauthorized();
    error KeeperRegistry__SlashExceedsBond(uint256 slash, uint256 bond);
    error KeeperRegistry__TransferFailed();

    event KeeperRegistered(address indexed keeper, uint96 bondAmount);
    event KeeperUnbondInitiated(address indexed keeper, uint64 timestamp);
    event KeeperExited(address indexed keeper, uint96 bondReturned);
    event KeeperSlashed(address indexed keeper, uint96 slashAmount, uint32 totalSlashes);
    event KeeperJailed(address indexed keeper);
    event KeeperUnjailed(address indexed keeper);
    event KeeperReputationUpdated(address indexed keeper, uint16 oldScore, uint16 newScore);
    event MinBondUpdated(uint96 oldBond, uint96 newBond);

    function register() external payable;
    function initiateUnbond() external;
    function withdrawBond() external;

    function slash(address keeper, uint96 amount) external;
    function jail(address keeper) external;
    function unjail(address keeper) external;
    function incrementJobsExecuted(address keeper) external;

    function increaseReputation(address keeper, uint16 delta) external;
    function decreaseReputation(address keeper, uint16 delta) external;

    function getKeeper(address keeper) external view returns (Keeper memory);
    function isActive(address keeper) external view returns (bool);
    function getBond(address keeper) external view returns (uint96);
    function getReputation(address keeper) external view returns (uint16);
    function getMinBond() external view returns (uint96);
    function getUnbondCooldown() external view returns (uint64);
}
```

---

## `src/libraries/KeeperMath.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title KeeperMath
 * @notice Pure math library for Keeper calculations including rewards and reputation.
 */
 library KeeperMath {

// ==========================================
// CONSTANTS
// ==========================================

///@notice Denominator for basis points calculations (100% = 10,000).
uint256 internal constant BPS_DENOMINATOR = 10_000;

///@notice Upper boundary for a keeper's reputation score. 
uint16 internal constant MAX_REPUTATION = 1_000;

///@notice Lower boundary for a keeper's reputation score. 
uint16 internal constant MIN_REPUTATION = 0;

/// ERRORS
error KeeperMath__BpsExceedsDenominator(uint256 bps);
error KeeperMath__ZeroAmount();

// ==========================================
// FUNCTIONS
// ==========================================

/**
 * @notice Splits execution reward into keeper share and protocol fee.
 * @param protocolFeeBps The protocol fee percentage in basis points.
 */
function calcRewardSplit(uint96 rewardPerExec, uint256 protocolFeeBps) 
    internal 
    pure
    returns(uint96 keeperReward, uint96 protocolFee) 
{
    if(rewardPerExec == 0) revert KeeperMath__ZeroAmount();
    if (protocolFeeBps > BPS_DENOMINATOR) revert KeeperMath__BpsExceedsDenominator(protocolFeeBps);

    uint256 fee = (uint256(rewardPerExec) * protocolFeeBps) / BPS_DENOMINATOR;
    
    // forge-lint: disable-next-line(unsafe-typecast)
    protocolFee = uint96(fee);
    
    unchecked {
        keeperReward = rewardPerExec - protocolFee;
    }
}

/**
 * @notice Safely increases a keeper's reputation up to the maximum protocol limit.
 */
function increaseReputation(uint16 current, uint16 delta) 
    internal
    pure
    returns(uint16)
{
    uint256 result = uint256(current) + uint256(delta);

    // forge-lint: disable-next-line(unsafe-typecast)
    return result >= MAX_REPUTATION ? MAX_REPUTATION : uint16(result);
}

/**
 * @notice Safely decreases a keeper's reputation down to the minimum protocol limit.
 */
function decreaseReputation(uint16 current, uint16 delta) 
    internal
    pure
    returns(uint16)
{
    return current > delta ? current - delta : MIN_REPUTATION;
}

/**
 * @notice Checks if the unbonding cooldown period has completely elapsed.
 * @param cooldownDuration The required wait time in seconds.
 */
function isCooldownOver(uint64 unbondInititatedAt, uint64 cooldownDuration)
    internal
    view
    returns(bool)
{
    unchecked {
        return block.timestamp >= uint256(unbondInititatedAt) + uint256(cooldownDuration);
    }
}

/**
 * @notice Returns the remaining wait time in seconds before a keeper can withdraw.
 */
function remainingCooldown(uint64 unbondInitiatedAt, uint64 cooldownDuration)
    internal
    view
    returns (uint256)
{
    unchecked {
        uint256 endTime = uint256(unbondInitiatedAt) + uint256(cooldownDuration);
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }
}

/**
 * @notice Validates if the current network base fee is acceptable for job execution.
 * @param maxBaseFee The maximum base fee authorized by the job owner.
 */
function isBaseFeeAcceptable(uint96 maxBaseFee) 
    internal
    view
    returns(bool)
{
    return block.basefee <= uint256(maxBaseFee);
 }    

/**
     * @notice Checks if the job's reward pool can cover at least one more execution.
     */
function hasSufficientReward(uint96 rewardPool, uint96 rewardPerExec)
        internal
        pure
        returns (bool)
{
        return rewardPool >= rewardPerExec;
    }
}```

