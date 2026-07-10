// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {KeeperRegistry} from "../../src/core/KeeperRegistry.sol";
import {JobManager} from "../../src/core/JobManager.sol";
import {ExecutionEngine} from "../../src/core/ExecutionEngine.sol";
import {IKeeperRegistry} from "../../src/interfaces/IKeeperRegistry.sol";
import {IJobManager} from "../../src/interfaces/IJobManager.sol";

import {
    MockProtocol,
    ReentrantMockProtocol,
    RevertingReceiver
} from "../mocks/MockProtocol.sol";

/**
 * @title KeeperFlowTest
 * @notice Integration tests wiring KeeperRegistry + JobManager + ExecutionEngine
 *         together with real (non-mocked) inter-contract calls. Unit-level edge
 *         cases already live in the per-contract unit test files — this file
 *         only asserts behavior that requires the full system wired up.
 */
contract KeeperFlowTest is Test {
    KeeperRegistry registry;
    JobManager jobManager;
    ExecutionEngine engine;
    MockProtocol protocol;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address keeper1 = makeAddr("keeper1");
    address keeper2 = makeAddr("keeper2");
    address jobOwner = makeAddr("jobOwner");

    uint16 constant PROTOCOL_FEE_BPS = 500; // 5%
    uint96 constant MIN_BOND = 0.1 ether;
    uint96 constant REWARD_PER_EXEC = 0.01 ether;
    uint64 constant JOB_INTERVAL = 1 days;
    uint96 constant MAX_BASE_FEE = type(uint96).max;

    function setUp() public {
        vm.startPrank(owner);
        registry = new KeeperRegistry(owner, treasury);
        jobManager = new JobManager(owner, treasury, PROTOCOL_FEE_BPS);
        engine = new ExecutionEngine(owner, address(registry), address(jobManager));

        registry.setExecutionEngine(address(engine));
        jobManager.setExecutionEngine(address(engine));
        vm.stopPrank();

        protocol = new MockProtocol(address(engine));

        vm.deal(keeper1, 10 ether);
        vm.deal(keeper2, 10 ether);
        vm.deal(jobOwner, 10 ether);
    }

    //=====================================
    // HELPERS
    //=====================================

    function _registerKeeper(address keeper) internal {
        vm.prank(keeper);
        registry.register{value: MIN_BOND}();
    }

    function _registerJob(address target, uint64 interval, uint96 maxBaseFee, uint96 fundMultiple)
        internal
        returns (uint256 jobId)
    {
        vm.prank(jobOwner);
        jobId = jobManager.registerJob{value: uint256(REWARD_PER_EXEC) * fundMultiple}(
            target,
            REWARD_PER_EXEC,
            interval,
            maxBaseFee
        );
    }

    function _split(uint96 reward) internal pure returns (uint96 keeperReward, uint96 fee) {
        fee = uint96((uint256(reward) * PROTOCOL_FEE_BPS) / 10_000);
        keeperReward = reward - fee;
    }

    //=====================================
    // HAPPY PATH
    //=====================================

    function test_OneTimeJob_FullLifecycle() public {
        _registerKeeper(keeper1);
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        (uint96 expectedKeeperReward, uint96 expectedFee) = _split(REWARD_PER_EXEC);
        uint256 keeperBalBefore = keeper1.balance;

        vm.prank(keeper1);
        engine.executeJob(jobId, "");

        assertEq(keeper1.balance, keeperBalBefore + expectedKeeperReward, "keeper reward mismatch");
        assertEq(jobManager.getAccumulatedFees(), expectedFee, "protocol fee mismatch");
        assertEq(registry.getReputation(keeper1), 5, "reputation should be +5");
        assertEq(registry.getKeeper(keeper1).totalJobsExecuted, 1, "jobs executed count");
        assertEq(protocol.counter(), 1, "target should have been called once");

        IJobManager.Job memory job = jobManager.getJob(jobId);
        assertEq(uint8(job.status), uint8(IJobManager.JobStatus.Completed), "one-time job should complete");

        uint256[] memory active = jobManager.getActiveJobIds();
        for (uint256 i = 0; i < active.length; i++) {
            assertTrue(active[i] != jobId, "completed job must leave active list");
        }
    }

    function test_RecurringJob_RespectsIntervalAcrossMultipleExecutions() public {
        _registerKeeper(keeper1);
        uint256 jobId = _registerJob(address(protocol), JOB_INTERVAL, MAX_BASE_FEE, 3);

        vm.prank(keeper1);
        engine.executeJob(jobId, "");

        // immediate re-execution should be blocked - interval not elapsed
        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__JobNotReady.selector, jobId));
        engine.executeJob(jobId, "");

        // warp forward exactly one interval - should now succeed
        vm.warp(block.timestamp + JOB_INTERVAL);
        vm.prank(keeper1);
        engine.executeJob(jobId, "");

        IJobManager.Job memory job = jobManager.getJob(jobId);
        assertEq(job.totalExecutions, 2, "should have executed twice");
        assertEq(uint8(job.status), uint8(IJobManager.JobStatus.Active), "recurring job stays active");
    }

    //=====================================
    // JOB READINESS GUARDS
    //=====================================

    function test_ExecuteJob_RevertsWhenRewardPoolExhausted() public {
        _registerKeeper(keeper1);
        // fund for exactly 1 execution
        uint256 jobId = _registerJob(address(protocol), JOB_INTERVAL, MAX_BASE_FEE, 1);

        vm.prank(keeper1);
        engine.executeJob(jobId, "");

        vm.warp(block.timestamp + JOB_INTERVAL);
        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__JobNotReady.selector, jobId));
        engine.executeJob(jobId, "");
    }

    function test_ExecuteJob_RevertsWhenBaseFeeExceedsMax() public {
        _registerKeeper(keeper1);
        uint96 maxBaseFee = 10 gwei;
        uint256 jobId = _registerJob(address(protocol), 0, maxBaseFee, 1);

        vm.fee(50 gwei); // network base fee now exceeds job's cap

        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__JobNotReady.selector, jobId));
        engine.executeJob(jobId, "");
    }

    function test_ExecuteJob_RevertsWhenKeeperNotActive() public {
        // keeper never registered
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__KeeperNotActive.selector, keeper1));
        engine.executeJob(jobId, "");
    }

    function test_ExecuteJob_RevertsWhenJobPaused() public {
        _registerKeeper(keeper1);
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        vm.prank(jobOwner);
        jobManager.pauseJob(jobId);

        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__JobNotReady.selector, jobId));
        engine.executeJob(jobId, "");
    }

    //=====================================
    // BATCH EXECUTION & FAULT ISOLATION
    //=====================================

    function test_ExecuteBatch_IsolatesFailureFromSuccess() public {
        _registerKeeper(keeper1);

        MockProtocol goodTarget = new MockProtocol(address(engine));
        MockProtocol badTarget = new MockProtocol(address(engine));
        badTarget.setShouldRevert(true, "target intentionally failing");

        uint256 job1 = _registerJob(address(goodTarget), 0, MAX_BASE_FEE, 1);
        uint256 job2 = _registerJob(address(badTarget), 0, MAX_BASE_FEE, 1);
        uint256 job3 = _registerJob(address(goodTarget), 0, MAX_BASE_FEE, 1);

        uint256[] memory jobIds = new uint256[](3);
        bytes[] memory data = new bytes[](3);
        jobIds[0] = job1;
        jobIds[1] = job2;
        jobIds[2] = job3;

        vm.prank(keeper1);
        engine.executeBatch(jobIds, data);

        assertEq(uint8(jobManager.getJob(job1).status), uint8(IJobManager.JobStatus.Completed), "job1 should complete");
        assertEq(uint8(jobManager.getJob(job2).status), uint8(IJobManager.JobStatus.Active), "job2 should remain active (failed)");
        assertEq(uint8(jobManager.getJob(job3).status), uint8(IJobManager.JobStatus.Completed), "job3 should complete");
        assertEq(registry.getKeeper(keeper1).totalJobsExecuted, 2, "only 2 successful executions credited");
    }

    function test_ExecuteBatch_RevertsOnEmptyBatch() public {
        _registerKeeper(keeper1);
        uint256[] memory jobIds = new uint256[](0);
        bytes[] memory data = new bytes[](0);

        vm.prank(keeper1);
        vm.expectRevert(ExecutionEngine.ExecutionEngine__EmptyBatch.selector);
        engine.executeBatch(jobIds, data);
    }

    function test_ExecuteBatch_RevertsOnLengthMismatch() public {
        _registerKeeper(keeper1);
        uint256[] memory jobIds = new uint256[](2);
        bytes[] memory data = new bytes[](1);

        vm.prank(keeper1);
        vm.expectRevert(ExecutionEngine.ExecutionEngine__BatchLengthMismatch.selector);
        engine.executeBatch(jobIds, data);
    }

    //=====================================
    // REENTRANCY PROTECTION
    //=====================================

    function test_ExecuteJob_BlocksReentrantExecution() public {
        _registerKeeper(keeper1);

        ReentrantMockProtocol reentrantTarget = new ReentrantMockProtocol(address(engine));
        uint256 jobId = _registerJob(address(reentrantTarget), 0, MAX_BASE_FEE, 1);

        reentrantTarget.armReentrancy(jobId, "");

        vm.prank(keeper1);
        engine.executeJob(jobId, "");

        // the outer call must succeed exactly once...
        assertEq(jobManager.getJob(jobId).totalExecutions, 1, "job must execute exactly once");
        assertEq(registry.getKeeper(keeper1).totalJobsExecuted, 1, "keeper credited exactly once");
        // ...while the nested re-entrant call must have been rejected
        assertFalse(reentrantTarget.reentryCallSucceeded(), "reentrant call must fail under nonReentrant");
    }

    //=====================================
    // SLASHING & JAILING
    //=====================================

    function test_SlashingThreeTimes_AutoJailsKeeper() public {
        _registerKeeper(keeper1);
        uint96 slashAmount = 0.01 ether;

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(owner);
            engine.slashKeeper(keeper1, slashAmount);
        }

        IKeeperRegistry.Keeper memory k = registry.getKeeper(keeper1);
        assertEq(k.totalSlashes, 3, "should have 3 recorded slashes");
        assertEq(uint8(k.status), uint8(IKeeperRegistry.KeeperStatus.Jailed), "keeper should be auto-jailed");
        assertEq(k.bondAmount, MIN_BOND - (slashAmount * 3), "bond should reflect cumulative slashes");

        // jailed keeper can no longer execute jobs
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);
        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__KeeperNotActive.selector, keeper1));
        engine.executeJob(jobId, "");
    }

    function test_SlashedFunds_RouteToTreasury() public {
        _registerKeeper(keeper1);
        uint96 slashAmount = 0.02 ether;
        uint256 treasuryBalBefore = treasury.balance;

        vm.prank(owner);
        engine.slashKeeper(keeper1, slashAmount);

        assertEq(treasury.balance, treasuryBalBefore + slashAmount, "slashed funds must reach treasury");
    }

    //=====================================
    // UNBONDING LIFECYCLE
    //=====================================

    function test_Unbonding_RevertsBeforeCooldownThenSucceedsAfter() public {
        _registerKeeper(keeper1);

        vm.prank(keeper1);
        registry.initiateUnbond();

        vm.prank(keeper1);
        vm.expectRevert(); // cooldown not elapsed - remaining amount varies, generic check
        registry.withdrawBond();

        vm.warp(block.timestamp + registry.getUnbondCooldown());

        uint256 balBefore = keeper1.balance;
        vm.prank(keeper1);
        registry.withdrawBond();

        assertEq(keeper1.balance, balBefore + MIN_BOND, "full bond should be returned");
        assertEq(uint8(registry.getKeeper(keeper1).status), uint8(IKeeperRegistry.KeeperStatus.Unregistered), "keeper record cleared");
    }

    //=====================================
    // TRANSFER-FAILURE HANDLING
    //=====================================

    function test_ExecuteJob_RevertsEntirelyWhenKeeperRejectsPayout() public {
        RevertingReceiver badKeeper = new RevertingReceiver();
        vm.deal(address(badKeeper), 10 ether);

        vm.prank(address(badKeeper));
        registry.register{value: MIN_BOND}();

        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        vm.prank(address(badKeeper));
        vm.expectRevert(IJobManager.JobManager__TransferFailed.selector);
        engine.executeJob(jobId, "");

        // entire tx reverted - job must remain untouched
        assertEq(uint8(jobManager.getJob(jobId).status), uint8(IJobManager.JobStatus.Active), "job must not be marked executed");
        assertEq(protocol.counter(), 0, "target should not register a call since the tx reverted");
    }

    function test_CancelJob_RevertsWhenOwnerRejectsRefund() public {
        RevertingReceiver badOwner = new RevertingReceiver();
        vm.deal(address(badOwner), 10 ether);

        vm.prank(address(badOwner));
        uint256 jobId = jobManager.registerJob{value: REWARD_PER_EXEC}(
            address(protocol), REWARD_PER_EXEC, 0, MAX_BASE_FEE
        );

        vm.prank(address(badOwner));
        vm.expectRevert(IJobManager.JobManager__TransferFailed.selector);
        jobManager.cancelJob(jobId);
    }

    //=====================================
    // JOB OWNER ACTIONS ACROSS CONTRACTS
    //=====================================

    function test_CancelJob_RefundsRemainingPoolAndRemovesFromActiveList() public {
        uint256 jobId = _registerJob(address(protocol), JOB_INTERVAL, MAX_BASE_FEE, 3);
        uint96 pool = jobManager.getRewardPool(jobId);
        uint256 balBefore = jobOwner.balance;

        vm.prank(jobOwner);
        jobManager.cancelJob(jobId);

        assertEq(jobOwner.balance, balBefore + pool, "owner should be refunded full remaining pool");
        uint256[] memory active = jobManager.getActiveJobIds();
        for (uint256 i = 0; i < active.length; i++) {
            assertTrue(active[i] != jobId, "cancelled job must leave active list");
        }
    }

    function test_PauseResumeJob_BlocksThenAllowsExecution() public {
        _registerKeeper(keeper1);
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        vm.prank(jobOwner);
        jobManager.pauseJob(jobId);
        assertFalse(jobManager.isJobReady(jobId), "paused job should not be ready");

        vm.prank(jobOwner);
        jobManager.resumeJob(jobId);
        assertTrue(jobManager.isJobReady(jobId), "resumed job should be ready again");

        vm.prank(keeper1);
        engine.executeJob(jobId, "");
        assertEq(protocol.counter(), 1, "resumed job should execute normally");
    }

    //=====================================
    // PROTOCOL-LEVEL PAUSE
    //=====================================

    function test_ExecutionEngine_PauseBlocksExecuteJob() public {
        _registerKeeper(keeper1);
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        vm.prank(owner);
        engine.pause();

        vm.prank(keeper1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.executeJob(jobId, "");
    }

    function test_JobManager_PauseBlocksNewJobRegistration() public {
        vm.prank(owner);
        jobManager.pause();

        vm.prank(jobOwner);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        jobManager.registerJob{value: REWARD_PER_EXEC}(address(protocol), REWARD_PER_EXEC, 0, MAX_BASE_FEE);
    }

    //=====================================
    // FEE ACCOUNTING
    //=====================================

    function test_WithdrawFees_IsPermissionlessPushToTreasury() public {
        _registerKeeper(keeper1);
        uint256 jobId = _registerJob(address(protocol), 0, MAX_BASE_FEE, 1);

        vm.prank(keeper1);
        engine.executeJob(jobId, "");

        (, uint96 expectedFee) = _split(REWARD_PER_EXEC);
        uint256 treasuryBalBefore = treasury.balance;

        // called by an unrelated address - withdrawFees always pushes to s_treasury, never to msg.sender
        address randomCaller = makeAddr("randomCaller");
        vm.prank(randomCaller);
        jobManager.withdrawFees();

        assertEq(treasury.balance, treasuryBalBefore + expectedFee, "fees must land in treasury regardless of caller");
        assertEq(jobManager.getAccumulatedFees(), 0, "accumulated fees should reset to zero");
    }
}
