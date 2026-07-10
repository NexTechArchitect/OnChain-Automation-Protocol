// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KeeperMath} from "../../src/libraries/KeeperMath.sol"; 

// ==========================================
// HARNESS CONTRACT (To expose internal library functions)
// ==========================================
contract KeeperMathHarness {
    function calcRewardSplit(uint96 rewardPerExec, uint256 protocolFeeBps) external pure returns (uint96, uint96) {
        return KeeperMath.calcRewardSplit(rewardPerExec, protocolFeeBps);
    }

    function increaseReputation(uint16 current, uint16 delta) external pure returns (uint16) {
        return KeeperMath.increaseReputation(current, delta);
    }

    function decreaseReputation(uint16 current, uint16 delta) external pure returns (uint16) {
        return KeeperMath.decreaseReputation(current, delta);
    }

    function isCooldownOver(uint64 unbondInitiatedAt, uint64 cooldownDuration) external view returns (bool) {
        return KeeperMath.isCooldownOver(unbondInitiatedAt, cooldownDuration);
    }

    function remainingCooldown(uint64 unbondInitiatedAt, uint64 cooldownDuration) external view returns (uint256) {
        return KeeperMath.remainingCooldown(unbondInitiatedAt, cooldownDuration);
    }

    function isBaseFeeAcceptable(uint96 maxBaseFee) external view returns (bool) {
        return KeeperMath.isBaseFeeAcceptable(maxBaseFee);
    }

    function hasSufficientReward(uint96 rewardPool, uint96 rewardPerExec) external pure returns (bool) {
        return KeeperMath.hasSufficientReward(rewardPool, rewardPerExec);
    }
}

// ==========================================
// TEST CONTRACT
// ==========================================
contract KeeperMathTest is Test {
    KeeperMathHarness public harness;

    function setUp() public {
        harness = new KeeperMathHarness();
    }

    function test_CalcRewardSplit_Success() public view {
        uint96 totalReward = 100 ether;
        uint256 feeBps = 500; // 5%

        (uint96 keeperReward, uint96 protocolFee) = harness.calcRewardSplit(totalReward, feeBps);
        
        assertEq(protocolFee, 5 ether);
        assertEq(keeperReward, 95 ether);
    }

    function test_CalcRewardSplit_RevertZeroAmount() public {
        vm.expectRevert(KeeperMath.KeeperMath__ZeroAmount.selector);
        harness.calcRewardSplit(0, 500);
    }

    function test_CalcRewardSplit_RevertBpsExceeds() public {
        vm.expectRevert(abi.encodeWithSelector(KeeperMath.KeeperMath__BpsExceedsDenominator.selector, 10001));
        harness.calcRewardSplit(100 ether, 10001);
    }

   

    function test_IncreaseReputation_Normal() public view {
        uint16 result = harness.increaseReputation(500, 100);
        assertEq(result, 600);
    }

    function test_IncreaseReputation_MaxCap() public view {
        uint16 result = harness.increaseReputation(950, 100); // 1050
        assertEq(result, 1000); // Should cap at MAX_REPUTATION (1000)
    }

    function test_DecreaseReputation_Normal() public view {
        uint16 result = harness.decreaseReputation(500, 100);
        assertEq(result, 400);
    }

    function test_DecreaseReputation_MinCap() public view {
        uint16 result = harness.decreaseReputation(50, 100); 
        assertEq(result, 0); // Should cap at MIN_REPUTATION (0)
    }

   
    function test_IsCooldownOver_True() public {
        vm.warp(1000); // Set current timestamp to 1000
        bool over = harness.isCooldownOver(500, 500); // Initiated at 500, wait 500
        assertTrue(over);
    }

    function test_IsCooldownOver_False() public {
        vm.warp(999); 
        bool over = harness.isCooldownOver(500, 500); 
        assertFalse(over);
    }

    function test_RemainingCooldown() public {
        vm.warp(800);
        // Initiated at 500, needs 500 (End time = 1000). Current time = 800. Remaining = 200
        uint256 remaining = harness.remainingCooldown(500, 500);
        assertEq(remaining, 200);
    }

    function test_RemainingCooldown_ZeroIfPassed() public {
        vm.warp(1200);
        uint256 remaining = harness.remainingCooldown(500, 500);
        assertEq(remaining, 0);
    }

    function test_IsBaseFeeAcceptable() public {
        vm.fee(50 gwei); // Mocks the block.basefee

        assertTrue(harness.isBaseFeeAcceptable(60 gwei)); // Max is 60, current is 50
        assertFalse(harness.isBaseFeeAcceptable(40 gwei)); // Max is 40, current is 50
    }

    function test_HasSufficientReward() public view {
        assertTrue(harness.hasSufficientReward(10 ether, 5 ether));
        assertTrue(harness.hasSufficientReward(5 ether, 5 ether));
        assertFalse(harness.hasSufficientReward(4 ether, 5 ether));
    }
}