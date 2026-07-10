// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KeeperRegistry} from "../../src/core/KeeperRegistry.sol";
import {JobManager} from "../../src/core/JobManager.sol";
import {IKeeperRegistry} from "../../src/interfaces/IKeeperRegistry.sol";

contract FuzzKeeperTest is Test {
    KeeperRegistry public registry;
    JobManager public jobManager;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public engine = makeAddr("engine");
    
    address public randomKeeper = makeAddr("keeper");
    address public randomUser = makeAddr("user");

    function setUp() public {
        vm.startPrank(owner);
        registry = new KeeperRegistry(owner, treasury);
        jobManager = new JobManager(owner, treasury, 1000); // 10% Protocol Fee
        
        registry.setExecutionEngine(engine);
        jobManager.setExecutionEngine(engine);
        vm.stopPrank();
    }

    // ==========================================
    // 1. FUZZING REGISTRY (Bonds & Slashing Math)
    // ==========================================

    /// @notice Fuzz test to ensure anyone can register as long as bond >= MIN_BOND
    /// @param bondAmount Foundry will inject thousands of random uint96 values here
    function testFuzz_KeeperRegistration(uint96 bondAmount) public {
        bondAmount = uint96(bound(bondAmount, registry.getMinBond(), type(uint96).max));

        vm.deal(randomKeeper, bondAmount);

        vm.prank(randomKeeper);
        registry.register{value: bondAmount}();

        assertEq(registry.getBond(randomKeeper), bondAmount);
        assertTrue(registry.isActive(randomKeeper));
    }

    /// @notice Fuzz test to ensure slashing math never underflows or behaves weirdly
    function testFuzz_SlashingMath(uint96 initialBond, uint96 slashAmount) public {

        initialBond = uint96(bound(initialBond, registry.getMinBond(), type(uint96).max));
     
        slashAmount = uint96(bound(slashAmount, 0, initialBond));

        vm.deal(randomKeeper, initialBond);
        vm.prank(randomKeeper);
        registry.register{value: initialBond}();

        vm.prank(engine);
        registry.slash(randomKeeper, slashAmount);

        IKeeperRegistry.Keeper memory k = registry.getKeeper(randomKeeper);
        assertEq(k.bondAmount, initialBond - slashAmount);
        
        if (k.bondAmount < registry.getMinBond()) {
            assertEq(uint(k.status), uint(IKeeperRegistry.KeeperStatus.Jailed));
        }
    }

    // ==========================================
    // 2. FUZZING JOB MANAGER (Rewards & Deposits)
    // ==========================================

    /// @notice Fuzz test to ensure Job Registration math holds up against extreme random values
    function testFuzz_JobRegistration(
        uint96 rewardPerExec, 
        uint64 interval, 
        uint96 maxBaseFee, 
        uint256 depositAmount
    ) public {
        vm.assume(rewardPerExec > 0); 
        
        depositAmount = bound(depositAmount, rewardPerExec, type(uint96).max);

        vm.deal(randomUser, depositAmount);

        vm.prank(randomUser);
        uint256 jobId = jobManager.registerJob{value: depositAmount}(
            makeAddr("target"), 
            rewardPerExec, 
            interval, 
            maxBaseFee
        );

        assertEq(jobManager.getRewardPool(jobId), depositAmount);
    }

    /// @notice Fuzz test to ensure Top-up deposits never cause arithmetic overflow
    function testFuzz_RewardPoolDeposit(uint96 initialDeposit, uint96 topUpAmount) public {
        vm.assume(initialDeposit > 0);
        vm.assume(topUpAmount > 0);

        vm.assume(uint256(initialDeposit) + uint256(topUpAmount) <= type(uint96).max);

        vm.deal(randomUser, uint256(initialDeposit) + uint256(topUpAmount));
        
        vm.startPrank(randomUser);
        uint256 jobId = jobManager.registerJob{value: initialDeposit}(
            makeAddr("target"), 
            initialDeposit, 
            1 days, 
            50 gwei
        );

        jobManager.depositReward{value: topUpAmount}(jobId);
        vm.stopPrank();

        assertEq(jobManager.getRewardPool(jobId), initialDeposit + topUpAmount);
    }
}