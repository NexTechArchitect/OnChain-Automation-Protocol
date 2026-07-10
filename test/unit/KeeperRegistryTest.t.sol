// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {KeeperRegistry} from "../../src/core/KeeperRegistry.sol";
import {IKeeperRegistry} from "../../src/interfaces/IKeeperRegistry.sol";
import {RevertingReceiver} from "../mocks/MockProtocol.sol"; 

contract KeeperRegistryTest is Test {
    KeeperRegistry public registry;
    
    address public owner = makeAddr("owner");
    address public treasury = makeAddr("treasury");
    address public engine = makeAddr("engine");
    
    address public keeper1 = makeAddr("keeper1");
    address public keeper2 = makeAddr("keeper2");

    uint96 public constant MIN_BOND = 0.1 ether;
    uint64 public constant COOLDOWN = 3 days;

    function setUp() public {
        vm.prank(owner);
        registry = new KeeperRegistry(owner, treasury);

        vm.prank(owner);
        registry.setExecutionEngine(engine);

        vm.deal(keeper1, 10 ether);
        vm.deal(keeper2, 10 ether);
    }

    // ==========================================
    // 1. REGISTRATION & UNBONDING
    // ==========================================

    function test_Register_Success() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();
        assertTrue(registry.isActive(keeper1));
        assertEq(registry.getTotalKeepers(), 1);
    }

    function test_Register_RevertBondTooLow() public {
        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(IKeeperRegistry.KeeperRegistry__BondTooLow.selector, 0.05 ether, MIN_BOND));
        registry.register{value: 0.05 ether}();
    }

    function test_Register_RevertAlreadyRegistered() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();
        vm.prank(keeper1);
        vm.expectRevert(IKeeperRegistry.KeeperRegistry__AlreadyRegistered.selector);
        registry.register{value: 1 ether}();
    }

    function test_InitiateUnbond_Success() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();
        vm.prank(keeper1);
        registry.initiateUnbond();
        assertFalse(registry.isActive(keeper1));
    }

    function test_Withdraw_Success() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();
        vm.prank(keeper1);
        registry.initiateUnbond();

        vm.warp(block.timestamp + 4 days);
        uint256 balBefore = keeper1.balance;
        vm.prank(keeper1);
        registry.withdrawBond();
        assertEq(keeper1.balance, balBefore + 1 ether);
    }

    function test_Withdraw_RevertCooldownNotOver() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();
        vm.prank(keeper1);
        registry.initiateUnbond();

        vm.warp(block.timestamp + 1 days);
        vm.prank(keeper1);
        vm.expectRevert(abi.encodeWithSelector(IKeeperRegistry.KeeperRegistry__CooldownNotOver.selector, 2 days));
        registry.withdrawBond();
    }

    // ==========================================
    // 2. SLASHING, JAILING & METRICS
    // ==========================================

    function test_Slash_SuccessAndAutoJail_LowBond() public {
        vm.prank(keeper1);
        registry.register{value: 0.15 ether}(); 

        vm.prank(engine); 
        registry.slash(keeper1, 0.1 ether); 

        IKeeperRegistry.Keeper memory k = registry.getKeeper(keeper1);
        assertEq(k.bondAmount, 0.05 ether);
        assertEq(uint(k.status), uint(IKeeperRegistry.KeeperStatus.Jailed)); 
    }

    function test_Slash_AutoJail_Threshold() public {
        vm.prank(keeper1);
        registry.register{value: 5 ether}(); 

        vm.startPrank(engine);
        registry.slash(keeper1, 0.1 ether);
        registry.slash(keeper1, 0.1 ether);
        registry.slash(keeper1, 0.1 ether); // 3rd slash triggers jail
        vm.stopPrank();

        assertEq(uint(registry.getKeeper(keeper1).status), uint(IKeeperRegistry.KeeperStatus.Jailed));
    }

    function test_ManualJail_And_Unjail() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();

        vm.prank(engine);
        registry.jail(keeper1);
        assertEq(uint(registry.getKeeper(keeper1).status), uint(IKeeperRegistry.KeeperStatus.Jailed));

        // Unjail Success
        vm.prank(owner);
        registry.unjail(keeper1);
        assertTrue(registry.isActive(keeper1));
    }

    function test_Reputation_And_Jobs() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();

        vm.startPrank(engine);
        registry.increaseReputation(keeper1, 50);
        assertEq(registry.getReputation(keeper1), 50);

        registry.decreaseReputation(keeper1, 20);
        assertEq(registry.getReputation(keeper1), 30);

        registry.incrementJobsExecuted(keeper1);
        assertEq(registry.getKeeper(keeper1).totalJobsExecuted, 1);
        vm.stopPrank();
    }

    // ==========================================
    // 3. ADMIN SETTERS & GETTERS (Coverage Boosters)
    // ==========================================

    function test_Admin_SettersAndGetters() public {
        vm.startPrank(owner);
        registry.setExecutionEngine(makeAddr("newEngine"));
        assertEq(registry.getExecutionEngine(), makeAddr("newEngine"));

        registry.setMinBond(0.2 ether);
        assertEq(registry.getMinBond(), 0.2 ether);

        registry.setTreasury(makeAddr("newTreasury"));
        assertEq(registry.getTreasury(), makeAddr("newTreasury"));

        registry.setUnbondCooldown(5 days);
        assertEq(registry.getUnbondCooldown(), 5 days);

        registry.setJailThreshold(5);
        assertEq(registry.getJailThreshold(), 5);
        vm.stopPrank();
    }

    function test_Pause_Unpause() public {
        vm.prank(owner);
        registry.pause();

        // Register should fail when paused
        vm.prank(keeper1);
        vm.expectRevert(); // Catches OpenZeppelin EnforcedPause
        registry.register{value: 1 ether}();

        vm.prank(owner);
        registry.unpause();

        // Should work now
        vm.prank(keeper1);
        registry.register{value: 1 ether}();
        assertTrue(registry.isActive(keeper1));
    }

    // ==========================================
    // 4. DEEP BRANCH TESTS (The Final 10%)
    // ==========================================

    function test_Constructor_ZeroAddresses() public {
        // 1. Owner = Zero Address (Caught by OpenZeppelin's Ownable constructor first)
        vm.expectRevert(abi.encodeWithSignature("OwnableInvalidOwner(address)", address(0)));
        new KeeperRegistry(address(0), treasury);

        // 2. Treasury = Zero Address (Caught by our custom error inside KeeperRegistry)
        vm.expectRevert(IKeeperRegistry.KeeperRegistry__ZeroAddress.selector);
        new KeeperRegistry(owner, address(0));
    }

    function test_Setter_ZeroAddresses() public {
        vm.startPrank(owner);
        vm.expectRevert(IKeeperRegistry.KeeperRegistry__ZeroAddress.selector);
        registry.setExecutionEngine(address(0));

        vm.expectRevert(IKeeperRegistry.KeeperRegistry__ZeroAddress.selector);
        registry.setTreasury(address(0));
        vm.stopPrank();
    }

    function test_Revert_WhenNotRegistered() public {
        vm.startPrank(engine);
        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.slash(keeper2, 0.1 ether);

        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.jail(keeper2);

        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.increaseReputation(keeper2, 10);

        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.decreaseReputation(keeper2, 10);

        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.incrementJobsExecuted(keeper2);
        vm.stopPrank();

        vm.startPrank(keeper2);
        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.initiateUnbond();

        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotRegistered.selector);
        registry.withdrawBond();
        vm.stopPrank();
    }

    function test_Slash_ExceedsBond() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();

        vm.prank(engine);
        vm.expectRevert(abi.encodeWithSelector(IKeeperRegistry.KeeperRegistry__SlashExceedsBond.selector, 2 ether, 1 ether));
        registry.slash(keeper1, 2 ether);
    }

    function test_Unjail_RevertIfNotJailed() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();

        vm.prank(owner);
        vm.expectRevert(IKeeperRegistry.KeeperRegistry__NotJailed.selector);
        registry.unjail(keeper1);
    }

    function test_Unjail_RevertIfBondTooLow() public {
        vm.prank(keeper1);
        registry.register{value: 0.1 ether}(); // exact min bond

        vm.startPrank(engine);
        registry.slash(keeper1, 0.05 ether); // Now below min bond & jailed
        vm.stopPrank();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IKeeperRegistry.KeeperRegistry__BondTooLow.selector, 0.05 ether, MIN_BOND));
        registry.unjail(keeper1);
    }

    function test_DoubleJail_Ignored() public {
        vm.prank(keeper1);
        registry.register{value: 1 ether}();

        vm.startPrank(engine);
        registry.jail(keeper1);
        registry.jail(keeper1); // Testing the early return in _jail()
        vm.stopPrank();

        assertEq(uint(registry.getKeeper(keeper1).status), uint(IKeeperRegistry.KeeperStatus.Jailed));
    }
}