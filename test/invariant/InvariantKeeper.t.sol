// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {KeeperRegistry} from "../../src/core/KeeperRegistry.sol";
import {JobManager} from "../../src/core/JobManager.sol";
import {ExecutionEngine} from "../../src/core/ExecutionEngine.sol";
import {IKeeperRegistry} from "../../src/interfaces/IKeeperRegistry.sol";
import {IJobManager} from "../../src/interfaces/IJobManager.sol";
import {KeeperHandler} from "../mocks/Handler.t.sol";


contract InvariantKeeper is StdInvariant, Test {
    KeeperRegistry public registry;
    JobManager public jobManager;
    ExecutionEngine public engine;
    KeeperHandler public handler;

    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");

    function setUp() public {
        vm.startPrank(owner);
        registry = new KeeperRegistry(owner, treasury);
        jobManager = new JobManager(owner, treasury, 500); // 5% protocol fee
        engine = new ExecutionEngine(owner, address(registry), address(jobManager));

        registry.setExecutionEngine(address(engine));
        jobManager.setExecutionEngine(address(engine));
        vm.stopPrank();

        handler = new KeeperHandler(registry, jobManager, engine, owner, treasury);

        targetContract(address(handler));

        bytes4[] memory selectors = new bytes4[](19);
        selectors[0] = KeeperHandler.registerKeeper.selector;
        selectors[1] = KeeperHandler.initiateUnbond.selector;
        selectors[2] = KeeperHandler.withdrawBond.selector;
        selectors[3] = KeeperHandler.unjailKeeper.selector;
        selectors[4] = KeeperHandler.slashKeeper.selector;
        selectors[5] = KeeperHandler.registerJob.selector;
        selectors[6] = KeeperHandler.depositReward.selector;
        selectors[7] = KeeperHandler.withdrawReward.selector;
        selectors[8] = KeeperHandler.cancelJob.selector;
        selectors[9] = KeeperHandler.toggleJobPause.selector;
        selectors[10] = KeeperHandler.executeRandomJob.selector;
        selectors[11] = KeeperHandler.withdrawProtocolFees.selector;
        selectors[12] = KeeperHandler.toggleEnginePause.selector;
        selectors[13] = KeeperHandler.toggleJobManagerPause.selector;
        selectors[14] = KeeperHandler.toggleRegistryPause.selector;
        selectors[15] = KeeperHandler.chaosSetMinBond.selector;
        selectors[16] = KeeperHandler.chaosSetJailThreshold.selector;
        selectors[17] = KeeperHandler.chaosSetUnbondCooldown.selector;
        selectors[18] = KeeperHandler.chaosSetProtocolFeeBps.selector;

        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    //=====================================================
    // SOLVENCY - DIRECT ENUMERATION
    //=====================================================

    /// @notice Registry's ETH balance must exactly equal the sum of all
    ///         outstanding (non-Unregistered) keeper bonds.
    function invariant_RegistrySolvency_DirectEnumeration() public view {
        uint256 expectedTotalBonds;
        uint256 keepersCount = handler.getKeepersCount();

        for (uint256 i = 0; i < keepersCount; i++) {
            address keeper = handler.knownKeepers(i);
            IKeeperRegistry.Keeper memory k = registry.getKeeper(keeper);
            if (k.status != IKeeperRegistry.KeeperStatus.Unregistered) {
                expectedTotalBonds += k.bondAmount;
            }
        }

        assertEq(
            address(registry).balance,
            expectedTotalBonds,
            "CRITICAL: registry balance != sum of outstanding bonds (direct enumeration)"
        );
    }

    /// @notice JobManager's ETH balance must exactly equal the sum of all
    ///         reward pools plus undistributed accumulated fees.
    function invariant_JobManagerSolvency_DirectEnumeration() public view {
        uint256 expectedTotalPools;
        uint256 jobsCount = handler.getJobsCount();

        for (uint256 i = 0; i < jobsCount; i++) {
            uint256 jobId = handler.knownJobIds(i);
            expectedTotalPools += jobManager.getRewardPool(jobId);
        }

        uint256 expectedBalance = expectedTotalPools + jobManager.getAccumulatedFees();

        assertEq(
            address(jobManager).balance,
            expectedBalance,
            "CRITICAL: jobManager balance != sum of reward pools + accumulated fees (direct enumeration)"
        );
    }

    //=====================================================
    // SOLVENCY - GHOST ACCOUNTING (independent cross-check)
    //=====================================================

    function invariant_RegistrySolvency_GhostAccounting() public view {
        uint256 expected = handler.ghost_registryInflow()
            - handler.ghost_registryToKeeperOutflow()
            - handler.ghost_registryToTreasuryOutflow();

        assertEq(
            address(registry).balance,
            expected,
            "CRITICAL: registry balance != ghost-tracked net inflow"
        );
    }

    function invariant_JobManagerSolvency_GhostAccounting() public view {
        uint256 expected = handler.ghost_jobManagerInflow()
            - handler.ghost_jobManagerToOwnerOutflow()
            - handler.ghost_jobManagerToKeeperOutflow()
            - handler.ghost_jobManagerToTreasuryOutflow();

        assertEq(
            address(jobManager).balance,
            expected,
            "CRITICAL: jobManager balance != ghost-tracked net inflow"
        );
    }

    function invariant_TreasurySolvency_GhostAccounting() public view {
        uint256 expected = handler.ghost_registryToTreasuryOutflow()
            + handler.ghost_jobManagerToTreasuryOutflow();

        assertEq(
            treasury.balance,
            expected,
            "CRITICAL: treasury balance != ghost-tracked total received"
        );
    }
    function invariant_GlobalValueConservation() public view {
        uint256 totalIn = handler.ghost_registryInflow() + handler.ghost_jobManagerInflow();
        uint256 totalOutToExternalParties = handler.ghost_registryToKeeperOutflow()
            + handler.ghost_jobManagerToOwnerOutflow()
            + handler.ghost_jobManagerToKeeperOutflow();

        uint256 currentlyHeld = address(registry).balance + address(jobManager).balance + treasury.balance;

        assertEq(
            currentlyHeld,
            totalIn - totalOutToExternalParties,
            "CRITICAL: global value conservation violated - ETH created or destroyed"
        );
    }

    //=====================================================
    // STRUCTURAL INTEGRITY
    //=====================================================

    /// @notice ExecutionEngine is a pure router - it must never hold ETH.
    function invariant_ExecutionEngineNeverHoldsETH() public view {
        assertEq(address(engine).balance, 0, "CRITICAL: ExecutionEngine should never hold ETH");
    }

    /// @notice Registry's internal keeper counter must match the number of
    ///         addresses the handler has ever successfully registered that
    ///         are still non-Unregistered.
    function invariant_TotalKeepersMatchesRegistryCounter() public view {
        uint256 activeCount;
        uint256 keepersCount = handler.getKeepersCount();

        for (uint256 i = 0; i < keepersCount; i++) {
            address keeper = handler.knownKeepers(i);
            if (registry.getKeeper(keeper).status != IKeeperRegistry.KeeperStatus.Unregistered) {
                activeCount++;
            }
        }

        assertEq(
            registry.getTotalKeepers(),
            activeCount,
            "CRITICAL: getTotalKeepers() out of sync with actual non-Unregistered keeper count"
        );
    }

    /// @notice Every successful job registration increments both the
    ///         handler's tracking array and JobManager's internal counter -
    ///         they must always agree.
    function invariant_TotalJobsMatchesHandlerCounter() public view {
        assertEq(
            jobManager.getTotalJobs(),
            handler.getJobsCount(),
            "CRITICAL: getTotalJobs() out of sync with handler's known job count"
        );
    }

    /// @notice Reputation is clamped in KeeperMath - this is a defense-in-
    ///         depth check that the clamp actually held for every keeper
    ///         that went through real fuzzed execution paths.
    function invariant_ReputationNeverExceedsMax() public view {
        uint256 keepersCount = handler.getKeepersCount();
        for (uint256 i = 0; i < keepersCount; i++) {
            address keeper = handler.knownKeepers(i);
            assertLe(registry.getReputation(keeper), 1000, "CRITICAL: reputation exceeded MAX_REPUTATION");
        }
    }

    /// @notice Every jobId returned by getActiveJobIds() must actually be
    ///         Active, must appear exactly once, and every job whose status
    function invariant_ActiveJobsListIntegrity() public view {
        uint256[] memory active = jobManager.getActiveJobIds();

        // direction 1: every listed id is genuinely Active, and no duplicates
        for (uint256 i = 0; i < active.length; i++) {
            IJobManager.Job memory job = jobManager.getJob(active[i]);
            assertEq(
                uint8(job.status),
                uint8(IJobManager.JobStatus.Active),
                "CRITICAL: active list contains a non-Active job"
            );
            for (uint256 j = i + 1; j < active.length; j++) {
                assertTrue(active[i] != active[j], "CRITICAL: active list contains a duplicate jobId");
            }
        }

        uint256 jobsCount = handler.getJobsCount();
        for (uint256 i = 0; i < jobsCount; i++) {
            uint256 jobId = handler.knownJobIds(i);
            IJobManager.Job memory job = jobManager.getJob(jobId);
            if (job.status != IJobManager.JobStatus.Active) continue;

            uint256 occurrences;
            for (uint256 j = 0; j < active.length; j++) {
                if (active[j] == jobId) occurrences++;
            }
            assertEq(occurrences, 1, "CRITICAL: an Active job is missing from (or duplicated in) the active list");
        }
    }

    //=====================================================
    // DEBUG VISIBILITY
    //=====================================================

    function afterInvariant() public view {
        console.log("===== INVARIANT RUN SUMMARY =====");
        console.log("Known keepers:", handler.getKeepersCount());
        console.log("Known jobs:", handler.getJobsCount());
        console.log("-- call distribution --");
        console.log("registerKeeper:", handler.calls("registerKeeper"));
        console.log("initiateUnbond:", handler.calls("initiateUnbond"));
        console.log("withdrawBond:", handler.calls("withdrawBond"));
        console.log("unjailKeeper:", handler.calls("unjailKeeper"));
        console.log("slashKeeper:", handler.calls("slashKeeper"));
        console.log("registerJob:", handler.calls("registerJob"));
        console.log("depositReward:", handler.calls("depositReward"));
        console.log("withdrawReward:", handler.calls("withdrawReward"));
        console.log("cancelJob:", handler.calls("cancelJob"));
        console.log("toggleJobPause:", handler.calls("toggleJobPause"));
        console.log("executeRandomJob:", handler.calls("executeRandomJob"));
        console.log("withdrawProtocolFees:", handler.calls("withdrawProtocolFees"));
        console.log("toggleEnginePause:", handler.calls("toggleEnginePause"));
        console.log("toggleJobManagerPause:", handler.calls("toggleJobManagerPause"));
        console.log("toggleRegistryPause:", handler.calls("toggleRegistryPause"));
        console.log("chaosSetMinBond:", handler.calls("chaosSetMinBond"));
        console.log("chaosSetJailThreshold:", handler.calls("chaosSetJailThreshold"));
        console.log("chaosSetUnbondCooldown:", handler.calls("chaosSetUnbondCooldown"));
        console.log("chaosSetProtocolFeeBps:", handler.calls("chaosSetProtocolFeeBps"));
    }
}
