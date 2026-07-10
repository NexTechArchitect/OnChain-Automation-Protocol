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
}