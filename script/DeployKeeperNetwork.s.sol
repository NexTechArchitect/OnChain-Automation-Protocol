// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KeeperRegistry} from "../src/core/KeeperRegistry.sol";
import {JobManager} from "../src/core/JobManager.sol";
import {ExecutionEngine} from "../src/core/ExecutionEngine.sol";

/**
 * @title DeployKeeperNetwork
 * @notice Production deployment script for the Keeper Network.
 * @dev Deploys and links KeeperRegistry, JobManager, and ExecutionEngine with automated sanity wiring checks.
 */
contract DeployKeeperNetwork is Script {
    uint16 public constant PROTOCOL_FEE_BPS = 500; // 5%

    function run() external returns (KeeperRegistry registry, JobManager jobManager, ExecutionEngine engine) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        console.log("=========================================");
        console.log("DEPLOYING KEEPER NETWORK");
        console.log("=========================================");
        console.log("Deployer: ", deployer);
        console.log("Treasury: ", treasury);
        console.log("Fee BPS : ", PROTOCOL_FEE_BPS);
        console.log("-----------------------------------------");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Storage Layer
        registry = new KeeperRegistry(deployer, treasury);
        console.log("[1/4] KeeperRegistry  : ", address(registry));

        jobManager = new JobManager(deployer, treasury, PROTOCOL_FEE_BPS);
        console.log("[2/4] JobManager      : ", address(jobManager));

        // 2. Deploy Execution Layer
        engine = new ExecutionEngine(deployer, address(registry), address(jobManager));
        console.log("[3/4] ExecutionEngine : ", address(engine));

        // 3. System Wire-up
        registry.setExecutionEngine(address(engine));
        jobManager.setExecutionEngine(address(engine));
        console.log("[4/4] Network Wired Up Successfully");

        vm.stopBroadcast();

        // Post-Deployment Wiring Sanity Check
        require(registry.getExecutionEngine() == address(engine), "Registry wiring failed");
        require(jobManager.getExecutionEngine() == address(engine), "JobManager wiring failed");

        console.log("=========================================");
        console.log("DEPLOYMENT COMPLETE");
        console.log("=========================================");
    }
}