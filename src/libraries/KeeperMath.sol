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
}