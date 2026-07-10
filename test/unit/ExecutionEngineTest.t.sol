// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ExecutionEngine} from "../../src/core/ExecutionEngine.sol";
import {KeeperRegistry} from "../../src/core/KeeperRegistry.sol";
import {JobManager} from "../../src/core/JobManager.sol";
import {IKeeperRegistry} from "../../src/interfaces/IKeeperRegistry.sol";
import {IJobManager} from "../../src/interfaces/IJobManager.sol";
import {MockProtocol, ReentrantMockProtocol} from "../mocks/MockProtocol.sol";

contract ExecutionEngineTest is Test {
    KeeperRegistry public registry;
    JobManager public jobManager;
    ExecutionEngine public engine;
    
    MockProtocol public mockProtocol;
    ReentrantMockProtocol public reentrantMock;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public alice = makeAddr("alice");   // Job Owner
    address public bob = makeAddr("bob");       // Active Keeper
    address public charlie = makeAddr("charlie"); // Unregistered Keeper

    function setUp() public {
        vm.startPrank(owner);
        // 1. Deploy Core Contracts
        registry = new KeeperRegistry(owner, treasury);
        jobManager = new JobManager(owner, treasury, 1000); // 10% fee
        engine = new ExecutionEngine(owner, address(registry), address(jobManager));

        // 2. Wire up the Engine
        registry.setExecutionEngine(address(engine));
        jobManager.setExecutionEngine(address(engine));
        
        // 3. Deploy Mocks
        mockProtocol = new MockProtocol(address(engine));
        reentrantMock = new ReentrantMockProtocol(address(engine));
        vm.stopPrank();

        // 4. Register Bob as an active Keeper
        vm.deal(bob, 10 ether);
        vm.prank(bob);
        registry.register{value: 1 ether}();

        // 5. Fund Alice
        vm.deal(alice, 100 ether);
    }

    // ==========================================
    // 1. CONSTRUCTOR & INITIALIZATION
    // ==========================================

    function test_Constructor_ZeroAddresses() public {
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new ExecutionEngine(address(0), address(registry), address(jobManager));

        vm.expectRevert(ExecutionEngine.ExecutionEngine__ZeroAddress.selector);
        new ExecutionEngine(owner, address(0), address(jobManager));

        vm.expectRevert(ExecutionEngine.ExecutionEngine__ZeroAddress.selector);
        new ExecutionEngine(owner, address(registry), address(0));
    }

    // ==========================================
    // 2. SINGLE EXECUTION (Try / Catch Blocks)
    // ==========================================

    function test_ExecuteJob_Success() public {
        // Alice registers a one-time job
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(address(mockProtocol), 0.1 ether, 0, 50 gwei);

        vm.fee(40 gwei); // Mock network fee

        vm.prank(bob);
        engine.executeJob(jobId, "0x1234");

        // Verify state updates
        assertEq(mockProtocol.counter(), 1);
        assertEq(registry.getReputation(bob), 5); // REP_INCREASE_SUCCESS
        assertEq(registry.getKeeper(bob).totalJobsExecuted, 1);
        assertEq(uint(jobManager.getJob(jobId).status), uint(IJobManager.JobStatus.Completed));
    }

    function test_ExecuteJob_Revert_KeeperNotActive() public {
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(address(mockProtocol), 0.1 ether, 0, 50 gwei);

        // Charlie is not registered
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__KeeperNotActive.selector, charlie));
        engine.executeJob(jobId, "0x");
    }

    function test_ExecuteJob_Revert_JobNotReady() public {
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(address(mockProtocol), 0.1 ether, 1 days, 50 gwei);

        vm.prank(alice);
        jobManager.pauseJob(jobId); // Job is now Paused, so not ready

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ExecutionEngine.ExecutionEngine__JobNotReady.selector, jobId));
        engine.executeJob(jobId, "0x");
    }

    function test_ExecuteJob_TargetReverts_CaughtByCatch() public {
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(address(mockProtocol), 0.1 ether, 0, 50 gwei);

        mockProtocol.setShouldRevert(true, "CustomTargetError");

        vm.fee(40 gwei);
        vm.recordLogs();
        
        vm.prank(bob);
        engine.executeJob(jobId, "0x"); // This will pass!

        assertEq(registry.getReputation(bob), 0);
        assertEq(uint(jobManager.getJob(jobId).status), uint(IJobManager.JobStatus.Active)); // Still active, not completed
    }

    // ==========================================
    // 3. BATCH EXECUTION (The Loop & Fault Tolerance)
    // ==========================================

    function test_ExecuteBatch_LengthMismatch_And_Empty() public {
        uint256[] memory jobs = new uint256[](1);
        bytes[] memory data = new bytes[](2); // Mismatch length

        vm.startPrank(bob);
        vm.expectRevert(ExecutionEngine.ExecutionEngine__BatchLengthMismatch.selector);
        engine.executeBatch(jobs, data);

        uint256[] memory emptyJobs = new uint256[](0);
        bytes[] memory emptyData = new bytes[](0);
        
        vm.expectRevert(ExecutionEngine.ExecutionEngine__EmptyBatch.selector);
        engine.executeBatch(emptyJobs, emptyData);
        vm.stopPrank();
    }

    function test_ExecuteBatch_FaultTolerantLoop() public {
        MockProtocol faultyMock = new MockProtocol(address(engine));
        faultyMock.setShouldRevert(true, "Oops");

        vm.startPrank(alice);
        uint256 job1 = jobManager.registerJob{value: 1 ether}(address(mockProtocol), 0.1 ether, 0, 50 gwei);
        uint256 job2 = jobManager.registerJob{value: 1 ether}(address(mockProtocol), 0.1 ether, 0, 50 gwei);
        uint256 job3 = jobManager.registerJob{value: 1 ether}(address(faultyMock), 0.1 ether, 0, 50 gwei);
        vm.stopPrank();

        vm.prank(alice);
        jobManager.pauseJob(job2);


        uint256[] memory jobs = new uint256[](3);
        jobs[0] = job1; jobs[1] = job2; jobs[2] = job3;

        bytes[] memory data = new bytes[](3);
        data[0] = "0x"; data[1] = "0x"; data[2] = "0x";

        vm.fee(40 gwei);

        // EXECUTE BATCH
        vm.prank(bob);
        engine.executeBatch(jobs, data);

        assertEq(uint(jobManager.getJob(job1).status), uint(IJobManager.JobStatus.Completed));
        assertEq(registry.getReputation(bob), 5); 
        assertEq(uint(jobManager.getJob(job2).status), uint(IJobManager.JobStatus.Paused));
        assertEq(uint(jobManager.getJob(job3).status), uint(IJobManager.JobStatus.Active));
    }
    // ==========================================
    // 4. REENTRANCY GUARD (Gaddar Test)
    // ==========================================

    function test_ExecuteJob_ReentrancyBlocked() public {
        vm.prank(alice);
        uint256 jobId = jobManager.registerJob{value: 1 ether}(address(reentrantMock), 0.1 ether, 0, 50 gwei);

        // Arm the mock to try and re-enter `executeJob` when called
        reentrantMock.armReentrancy(jobId, "0x");

        vm.fee(40 gwei);
        
        vm.prank(bob);
        engine.executeJob(jobId, "0x");

        assertFalse(reentrantMock.reentryCallSucceeded());
    }

    // ==========================================
    // 5. ADMIN & GOVERNANCE
    // ==========================================

    function test_Admin_SlashAndJail() public {
        vm.startPrank(owner);
        
        engine.slashKeeper(bob, 0.5 ether);
        assertEq(registry.getBond(bob), 0.5 ether);

        engine.jailKeeper(bob);
        assertEq(uint(registry.getKeeper(bob).status), uint(IKeeperRegistry.KeeperStatus.Jailed));
        
        vm.stopPrank();
    }

    function test_Admin_PauseUnpause() public {
        vm.prank(owner);
        engine.pause();

        vm.prank(bob);
        vm.expectRevert(); // EnforcedPause
        engine.executeJob(1, "0x");

        vm.prank(owner);
        engine.unpause();
    }

    function test_Views() public view {
        assertEq(engine.getRegistry(), address(registry));
        assertEq(engine.getJobManager(), address(jobManager));
    }
}