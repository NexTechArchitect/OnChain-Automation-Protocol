// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IKeeperRegistry {

    enum KeeperStatus { Unregistered, Active, Jailed, Exiting }

    struct Keeper {
        // Slot 1: 
        uint96       bondAmount;         // 96 bits
        uint64       registeredAt;       // 64 bits
        uint64       unbondInitiatedAt;  // 64 bits
        uint32       totalJobsExecuted;  // 32 bits
        // Slot 2: 
        uint32       totalSlashes;       // 32 bits
        uint16       reputationScore;    // 16 bits
        KeeperStatus status;             // 8 bits
    }
    // ERRORS
    error KeeperRegistry__AlreadyRegistered();
    error KeeperRegistry__NotRegistered();
    error KeeperRegistry__BondTooLow(uint256 sent, uint256 required);
    error KeeperRegistry__NotActive();
    error KeeperRegistry__NotJailed();
    error KeeperRegistry__NotExiting();
    error KeeperRegistry__CooldownNotOver(uint256 remaining);
    error KeeperRegistry__ZeroAddress();
    error KeeperRegistry__Unauthorized();
    error KeeperRegistry__SlashExceedsBond(uint256 slash, uint256 bond);
    error KeeperRegistry__TransferFailed();

    // EVENTS
    event KeeperRegistered(address indexed keeper, uint96 bondAmount);
    event KeeperUnbondInitiated(address indexed keeper, uint64 timestamp);
    event KeeperExited(address indexed keeper, uint96 bondReturned);
    event KeeperSlashed(address indexed keeper, uint96 slashAmount, uint32 totalSlashes);
    event KeeperJailed(address indexed keeper);
    event KeeperUnjailed(address indexed keeper);
    event KeeperReputationUpdated(address indexed keeper, uint16 oldScore, uint16 newScore);
    event MinBondUpdated(uint96 oldBond, uint96 newBond);

    // FUNCTIONS
    function register() external payable;
    function initiateUnbond() external;
    function withdrawBond() external;

    function slash(address keeper, uint96 amount) external;
    function jail(address keeper) external;
    function unjail(address keeper) external;
    function incrementJobsExecuted(address keeper) external;

    function increaseReputation(address keeper, uint16 delta) external;
    function decreaseReputation(address keeper, uint16 delta) external;

    // VIEWS
    function getKeeper(address keeper) external view returns (Keeper memory);
    function isActive(address keeper) external view returns (bool);
    function getBond(address keeper) external view returns (uint96);
    function getReputation(address keeper) external view returns (uint16);
    function getMinBond() external view returns (uint96);
    function getUnbondCooldown() external view returns (uint64);
}
