// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KeeperRegistry} from "../../src/core/KeeperRegistry.sol";
import {JobManager} from "../../src/core/JobManager.sol";
import {ExecutionEngine} from "../../src/core/ExecutionEngine.sol";
import {MockProtocol} from "./MockProtocol.sol";

/**
 * @title KeeperHandler
 * @notice Chaos-action surface for invariant fuzzing across KeeperRegistry,
 *         JobManager, and ExecutionEngine.
 */
contract KeeperHandler is Test {
    KeeperRegistry public registry;
    JobManager public jobManager;
    ExecutionEngine public engine;
    MockProtocol public mockTarget;

    address public owner;
    address public treasury;

    // Trackers for the Invariant file to loop over
    address[] public knownKeepers;
    uint256[] public knownJobIds;
    mapping(address => bool) internal _isKnownKeeper;

    uint256 public keeperNonce;
    uint256 public jobOwnerNonce;

    // ==========================================
    // GHOST ACCOUNTING (measured via balance deltas)
    // ==========================================
    uint256 public ghost_registryInflow;            // register()
    uint256 public ghost_registryToKeeperOutflow;    // withdrawBond()
    uint256 public ghost_registryToTreasuryOutflow;  // slash()

    uint256 public ghost_jobManagerInflow;           // registerJob() + depositReward()
    uint256 public ghost_jobManagerToOwnerOutflow;   // cancelJob() + withdrawReward()
    uint256 public ghost_jobManagerToKeeperOutflow;  // execution reward payouts
    uint256 public ghost_jobManagerToTreasuryOutflow;// withdrawFees()

    // ==========================================
    // CALL-COUNT TRACKING (fuzz distribution visibility)
    // ==========================================
    mapping(bytes32 => uint256) public calls;

    modifier countCall(bytes32 key) {
        calls[key]++;
        _;
    }

    constructor(
        KeeperRegistry registry_,
        JobManager jobManager_,
        ExecutionEngine engine_,
        address owner_,
        address treasury_
    ) {
        registry = registry_;
        jobManager = jobManager_;
        engine = engine_;
        owner = owner_;
        treasury = treasury_;

        mockTarget = new MockProtocol(address(engine));
    }

    // ==========================================
    // 1. KEEPER LIFECYCLE ACTIONS
    // ==========================================
    function registerKeeper(uint96 bondAmount, bool reuseExisting) public countCall("registerKeeper") {
        bondAmount = uint96(bound(bondAmount, registry.getMinBond(), 50 ether));

        address keeper;
        if (reuseExisting && knownKeepers.length > 0) {
            keeper = knownKeepers[bondAmount % knownKeepers.length];
        } else {
            keeper = makeAddr(string(abi.encodePacked("KEEPER_", keeperNonce++)));
        }

        vm.deal(keeper, bondAmount);
        uint256 balBefore = address(registry).balance;

        vm.prank(keeper);
        try registry.register{value: bondAmount}() {
            if (!_isKnownKeeper[keeper]) {
                _isKnownKeeper[keeper] = true;
                knownKeepers.push(keeper);
            }
            ghost_registryInflow += (address(registry).balance - balBefore);
        } catch {}
    }

    function initiateUnbond(uint256 keeperSeed) public countCall("initiateUnbond") {
        if (knownKeepers.length == 0) return;
        address keeper = knownKeepers[keeperSeed % knownKeepers.length];

        vm.prank(keeper);
        try registry.initiateUnbond() {} catch {}
    }

    function withdrawBond(uint256 keeperSeed, uint256 timeWarp) public countCall("withdrawBond") {
        if (knownKeepers.length == 0) return;
        address keeper = knownKeepers[keeperSeed % knownKeepers.length];

        vm.warp(block.timestamp + bound(timeWarp, 0, 10 days));

        uint256 balBefore = address(registry).balance;
        vm.prank(keeper);
        try registry.withdrawBond() {
            ghost_registryToKeeperOutflow += (balBefore - address(registry).balance);
        } catch {}
    }

    function unjailKeeper(uint256 keeperSeed) public countCall("unjailKeeper") {
        if (knownKeepers.length == 0) return;
        address keeper = knownKeepers[keeperSeed % knownKeepers.length];

        vm.prank(owner);
        try registry.unjail(keeper) {} catch {}
    }

    function slashKeeper(uint256 keeperSeed, uint96 slashAmount) public countCall("slashKeeper") {
        if (knownKeepers.length == 0) return;
        address keeper = knownKeepers[keeperSeed % knownKeepers.length];

        uint96 currentBond = registry.getBond(keeper);
        if (currentBond == 0) return;
        slashAmount = uint96(bound(slashAmount, 0, currentBond));

        uint256 registryBalBefore = address(registry).balance;
        uint256 treasuryBalBefore = treasury.balance;

        vm.prank(owner);
        try engine.slashKeeper(keeper, slashAmount) {
            uint256 moved = registryBalBefore - address(registry).balance;
            ghost_registryToTreasuryOutflow += moved;
            assertEq(treasury.balance, treasuryBalBefore + moved, "slash: treasury delta mismatch");
        } catch {}
    }

    // ==========================================
    // 2. JOB LIFECYCLE ACTIONS
    // ==========================================

    function registerJob(
        uint96 rewardPerExec,
        uint96 depositAmount,
        uint64 interval,
        uint96 maxBaseFee,
        bool reuseExisting
    ) public countCall("registerJob") {
        rewardPerExec = uint96(bound(rewardPerExec, 0.001 ether, 5 ether));
        depositAmount = uint96(bound(depositAmount, rewardPerExec, 100 ether));
        interval = uint64(bound(interval, 0, 30 days));
        maxBaseFee = uint96(bound(maxBaseFee, 0, 1000 gwei));

        address jobOwner_;
        if (reuseExisting && knownJobIds.length > 0) {
            jobOwner_ = jobManager.getJob(knownJobIds[depositAmount % knownJobIds.length]).owner;
        } else {
            jobOwner_ = makeAddr(string(abi.encodePacked("OWNER_", jobOwnerNonce++)));
        }
        vm.deal(jobOwner_, depositAmount);

        uint256 balBefore = address(jobManager).balance;
        vm.prank(jobOwner_);
        try jobManager.registerJob{value: depositAmount}(
            address(mockTarget), rewardPerExec, interval, maxBaseFee
        ) returns (uint256 jobId) {
            knownJobIds.push(jobId);
            ghost_jobManagerInflow += (address(jobManager).balance - balBefore);
        } catch {}
    }

    function depositReward(uint256 jobSeed, uint96 amount) public countCall("depositReward") {
        if (knownJobIds.length == 0) return;
        uint256 jobId = knownJobIds[jobSeed % knownJobIds.length];
        amount = uint96(bound(amount, 0.001 ether, 10 ether));

        address jobOwner_ = jobManager.getJob(jobId).owner;
        vm.deal(jobOwner_, amount);

        uint256 balBefore = address(jobManager).balance;
        vm.prank(jobOwner_);
        try jobManager.depositReward{value: amount}(jobId) {
            ghost_jobManagerInflow += (address(jobManager).balance - balBefore);
        } catch {}
    }

    function withdrawReward(uint256 jobSeed, uint96 amount) public countCall("withdrawReward") {
        if (knownJobIds.length == 0) return;
        uint256 jobId = knownJobIds[jobSeed % knownJobIds.length];
        uint96 pool = jobManager.getRewardPool(jobId);
        if (pool == 0) return;
        amount = uint96(bound(amount, 0, pool));

        address jobOwner_ = jobManager.getJob(jobId).owner;
        uint256 balBefore = address(jobManager).balance;

        vm.prank(jobOwner_);
        try jobManager.withdrawReward(jobId, amount) {
            ghost_jobManagerToOwnerOutflow += (balBefore - address(jobManager).balance);
        } catch {}
    }

    function cancelJob(uint256 jobSeed) public countCall("cancelJob") {
        if (knownJobIds.length == 0) return;
        uint256 jobId = knownJobIds[jobSeed % knownJobIds.length];
        address jobOwner_ = jobManager.getJob(jobId).owner;

        uint256 balBefore = address(jobManager).balance;
        vm.prank(jobOwner_);
        try jobManager.cancelJob(jobId) {
            ghost_jobManagerToOwnerOutflow += (balBefore - address(jobManager).balance);
        } catch {}
    }

    function toggleJobPause(uint256 jobSeed, bool shouldPause) public countCall("toggleJobPause") {
        if (knownJobIds.length == 0) return;
        uint256 jobId = knownJobIds[jobSeed % knownJobIds.length];
        address jobOwner_ = jobManager.getJob(jobId).owner;

        vm.prank(jobOwner_);
        if (shouldPause) {
            try jobManager.pauseJob(jobId) {} catch {}
        } else {
            try jobManager.resumeJob(jobId) {} catch {}
        }
    }

    // ==========================================
    // 3. EXECUTION ENGINE STRESS
    // ==========================================

    function executeRandomJob(
        uint256 jobSeed,
        uint256 keeperSeed,
        uint256 timeWarp,
        uint256 baseFeeSeed,
        bool makeTargetRevert
    ) public countCall("executeRandomJob") {
        if (knownJobIds.length == 0 || knownKeepers.length == 0) return;

        uint256 jobId = knownJobIds[jobSeed % knownJobIds.length];
        address keeper = knownKeepers[keeperSeed % knownKeepers.length];

        vm.warp(block.timestamp + bound(timeWarp, 0, 2 days));
        mockTarget.setShouldRevert(makeTargetRevert, "Chaos_Revert");
        vm.fee(bound(baseFeeSeed, 0, 200 gwei));

        uint256 keeperBalBefore = keeper.balance;

        vm.prank(keeper);
        try engine.executeJob(jobId, "0x") {
            uint256 keeperGain = keeper.balance - keeperBalBefore;
            ghost_jobManagerToKeeperOutflow += keeperGain;
        } catch {}
    }

    function withdrawProtocolFees() public countCall("withdrawProtocolFees") {
        uint256 balBefore = address(jobManager).balance;
        uint256 treasuryBefore = treasury.balance;

        try jobManager.withdrawFees() {
            uint256 moved = balBefore - address(jobManager).balance;
            ghost_jobManagerToTreasuryOutflow += moved;
            assertEq(treasury.balance, treasuryBefore + moved, "fee withdrawal: treasury delta mismatch");
        } catch {}
    }

    // ==========================================
    // 4. PROTOCOL-LEVEL PAUSE CHAOS
    // ==========================================

    function toggleEnginePause(bool shouldPause) public countCall("toggleEnginePause") {
        vm.prank(owner);
        if (shouldPause) { try engine.pause() {} catch {} }
        else { try engine.unpause() {} catch {} }
    }

    function toggleJobManagerPause(bool shouldPause) public countCall("toggleJobManagerPause") {
        vm.prank(owner);
        if (shouldPause) { try jobManager.pause() {} catch {} }
        else { try jobManager.unpause() {} catch {} }
    }

    function toggleRegistryPause(bool shouldPause) public countCall("toggleRegistryPause") {
        vm.prank(owner);
        if (shouldPause) { try registry.pause() {} catch {} }
        else { try registry.unpause() {} catch {} }
    }

    // ==========================================
    // 5. PROTOCOL PARAMETER CHAOS
    // ==========================================

    function chaosSetMinBond(uint96 newMinBond) public countCall("chaosSetMinBond") {
        newMinBond = uint96(bound(newMinBond, 0, 5 ether)); // registerKeeper caps at 50 ether
        vm.prank(owner);
        registry.setMinBond(newMinBond);
    }

    function chaosSetJailThreshold(uint32 newThreshold) public countCall("chaosSetJailThreshold") {
        newThreshold = uint32(bound(newThreshold, 0, 10));
        vm.prank(owner);
        registry.setJailThreshold(newThreshold);
    }

    function chaosSetUnbondCooldown(uint64 newCooldown) public countCall("chaosSetUnbondCooldown") {
        newCooldown = uint64(bound(newCooldown, 0, 14 days));
        vm.prank(owner);
        registry.setUnbondCooldown(newCooldown);
    }

    function chaosSetProtocolFeeBps(uint16 newFeeBps) public countCall("chaosSetProtocolFeeBps") {
        newFeeBps = uint16(bound(newFeeBps, 0, 10_000));
        vm.prank(owner);
        jobManager.setProtocolFeeBps(newFeeBps);
    }

    // ==========================================
    // GETTERS FOR INVARIANT LOOPS
    // ==========================================

    function getKeepersCount() external view returns (uint256) {
        return knownKeepers.length;
    }

    function getJobsCount() external view returns (uint256) {
        return knownJobIds.length;
    }

    receive() external payable {}
}
