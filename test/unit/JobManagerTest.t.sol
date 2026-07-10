// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {JobManager} from "../../src/core/JobManager.sol";
import {IJobManager} from "../../src/interfaces/IJobManager.sol";
import {RevertingReceiver} from "../mocks/MockProtocol.sol";

contract JobManagerTest is Test {
    JobManager public jobManager;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public engine = makeAddr("engine");

    address public alice = makeAddr("alice"); // Job Owner
    address public bob = makeAddr("bob");     // Keeper
    address public dummyTarget = makeAddr("target");

    uint16 public constant PROTOCOL_FEE_BPS = 1000; // 10%

    function setUp() public {
        vm.prank(owner);
        jobManager = new JobManager(owner, treasury, PROTOCOL_FEE_BPS);

        vm.prank(owner);
        jobManager.setExecutionEngine(engine);

        // Give Alice and Engine some ETH to play with
        vm.deal(alice, 100 ether);
        vm.deal(engine, 10 ether);
        vm.deal(address(this), 100 ether); // For fallback tests
    }

    // ==========================================
    // 1. REGISTRATION TESTS
    // ==========================================

    function test_RegisterJob_Success_Recurring() public {
        vm.startPrank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(
            dummyTarget,
            0.1 ether, // rewardPerExec
            1 days,    // interval
            50 gwei    // maxBaseFee
        );
        vm.stopPrank();

        IJobManager.Job memory job = jobManager.getJob(jobId);
        assertEq(job.target, dummyTarget);
        assertEq(job.owner, alice);
        assertEq(uint(job.status), uint(IJobManager.JobStatus.Active));
        assertEq(uint(job.jobType), uint(IJobManager.JobType.Recurring));
        
        assertEq(jobManager.getRewardPool(jobId), 1 ether);
        assertEq(jobManager.getTotalJobs(), 1);
        
        uint256[] memory activeJobs = jobManager.getActiveJobIds();
        assertEq(activeJobs.length, 1);
        assertEq(activeJobs[0], jobId);
    }

    function test_RegisterJob_Reverts() public {
        vm.startPrank(alice);
        
        // Zero Address
        vm.expectRevert(IJobManager.JobManager__ZeroAddress.selector);
        jobManager.registerJob{value: 1 ether}(address(0), 0.1 ether, 1 days, 50 gwei);

        // Zero Reward
        vm.expectRevert(IJobManager.JobManager__ZeroReward.selector);
        jobManager.registerJob{value: 1 ether}(dummyTarget, 0, 1 days, 50 gwei);

        // Insufficient Deposit (Sending 0.05 when reward is 0.1)
        vm.expectRevert(abi.encodeWithSelector(IJobManager.JobManager__InsufficientDeposit.selector, 0.05 ether, 0.1 ether));
        jobManager.registerJob{value: 0.05 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        
        vm.stopPrank();
    }

    // ==========================================
    // 2. PAUSE, RESUME & CANCEL (State Management)
    // ==========================================

    function test_PauseAndResume_Success() public {
        vm.startPrank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        
        // PAUSE
        jobManager.pauseJob(jobId);
        assertEq(uint(jobManager.getJob(jobId).status), uint(IJobManager.JobStatus.Paused));
        assertEq(jobManager.getActiveJobIds().length, 0); // Removed from active list

        // RESUME
        jobManager.resumeJob(jobId);
        assertEq(uint(jobManager.getJob(jobId).status), uint(IJobManager.JobStatus.Active));
        assertEq(jobManager.getActiveJobIds().length, 1); // Back in active list
        vm.stopPrank();
    }

    function test_CancelJob_SuccessAndRefund() public {
        vm.startPrank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        
        uint256 balBefore = alice.balance;
        
        jobManager.cancelJob(jobId);
        
        assertEq(uint(jobManager.getJob(jobId).status), uint(IJobManager.JobStatus.Inactive));
        assertEq(jobManager.getRewardPool(jobId), 0);
        assertEq(alice.balance, balBefore + 1 ether); // Full refund received
        assertEq(jobManager.getActiveJobIds().length, 0);
        vm.stopPrank();
    }

    function test_CancelJob_RevertTransferFailed() public {
        // Deploy a malicious contract that rejects ETH refunds
        RevertingReceiver badOwner = new RevertingReceiver();
        vm.deal(address(badOwner), 1 ether);

        vm.prank(address(badOwner));
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);

        vm.prank(address(badOwner));
        vm.expectRevert(IJobManager.JobManager__TransferFailed.selector);
        jobManager.cancelJob(jobId); // Fails because badOwner rejects the refund
    }

    // ==========================================
    // 3. FUNDS MANAGEMENT (Deposit & Withdraw)
    // ==========================================

    function test_DepositReward_Success() public {
        vm.startPrank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        
        jobManager.depositReward{value: 2 ether}(jobId);
        assertEq(jobManager.getRewardPool(jobId), 3 ether);
        vm.stopPrank();
    }

    function test_WithdrawReward_ActiveJobLimit() public {
        vm.startPrank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        
        vm.expectRevert(abi.encodeWithSelector(IJobManager.JobManager__InsufficientDeposit.selector, 0, 0.1 ether));
        jobManager.withdrawReward(jobId, 1 ether);

        jobManager.withdrawReward(jobId, 0.9 ether);
        assertEq(jobManager.getRewardPool(jobId), 0.1 ether);
        
        vm.stopPrank();
    }

    // ==========================================
    // 4. RECORD EXECUTION (The Core Engine)
    // ==========================================

    function test_RecordExecution_Success_Recurring() public {
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);

        vm.fee(40 gwei); 
        vm.prank(engine);
        jobManager.recordExecution(jobId, bob);

        IJobManager.Job memory job = jobManager.getJob(jobId);
        assertEq(job.totalExecutions, 1);
        assertEq(job.lastExecutedAt, block.timestamp);
        
        assertEq(bob.balance, 0.09 ether);
        assertEq(jobManager.getAccumulatedFees(), 0.01 ether);
        assertEq(jobManager.getRewardPool(jobId), 0.9 ether); // 1 - 0.1
    }

    function test_RecordExecution_Success_OneTime() public {
        vm.prank(alice);
        // Interval = 0 makes it a OneTime job
        uint256 jobId = jobManager.registerJob{value: 0.1 ether}(dummyTarget, 0.1 ether, 0, 50 gwei);

        vm.prank(engine);
        jobManager.recordExecution(jobId, bob);

        IJobManager.Job memory job = jobManager.getJob(jobId);
        assertEq(uint(job.status), uint(IJobManager.JobStatus.Completed)); // Automatically completed
        assertEq(jobManager.getActiveJobIds().length, 0); // Removed from queue
    }

    function test_RecordExecution_Reverts() public {
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);

        vm.prank(alice);
        vm.expectRevert(IJobManager.JobManager__Unauthorized.selector);
        jobManager.recordExecution(jobId, bob);

        vm.fee(100 gwei); // Network fee is 100, max allowed is 50
        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSelector(IJobManager.JobManager__GasPriceTooHigh.selector, 100 gwei, 50 gwei));
        jobManager.recordExecution(jobId, bob);

        vm.fee(40 gwei);
        vm.prank(engine);
        jobManager.recordExecution(jobId, bob);

        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSelector(IJobManager.JobManager__IntervalNotElapsed.selector, jobId, 1 days));
        jobManager.recordExecution(jobId, bob);
    }

    // ==========================================
    // 5. ARRAY SWAP-AND-POP & ADMIN TESTS
    // ==========================================

    function test_ActiveArray_SwapAndPop() public {
        vm.startPrank(alice);
        uint256 job1 = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        uint256 job2 = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        uint256 job3 = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        
        
        jobManager.pauseJob(job2);
        uint256[] memory activeJobs = jobManager.getActiveJobIds();
        assertEq(activeJobs.length, 2);
        assertEq(activeJobs[0], job1);
        assertEq(activeJobs[1], job3);
        vm.stopPrank();
    }

    function test_Admin_Setters_And_FeeWithdraw() public {
       
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(dummyTarget, 0.1 ether, 1 days, 50 gwei);
        vm.prank(engine);
        jobManager.recordExecution(jobId, bob); 
        
        uint256 treasBalBefore = treasury.balance;
        
        jobManager.withdrawFees();
        assertEq(treasury.balance, treasBalBefore + 0.01 ether);
        assertEq(jobManager.getAccumulatedFees(), 0);

        // Setters
        vm.startPrank(owner);
        jobManager.setExecutionEngine(makeAddr("newEngine"));
        assertEq(jobManager.getExecutionEngine(), makeAddr("newEngine"));
        
        vm.expectRevert(IJobManager.JobManager__Unauthorized.selector);
        jobManager.setProtocolFeeBps(15000); // Exceeds 100%
        vm.stopPrank();
    }
}