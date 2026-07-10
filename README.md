<div align="center">

# Keeper Network

**Decentralized On-Chain Automation Protocol**

Bonded keepers execute recurring and one-time smart contract jobs. Base Network. Foundry invariant tested.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square&logo=solidity)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Tests-Foundry-F0B90B?style=flat-square)](https://book.getfoundry.sh/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.x-3C3C3D?style=flat-square)](https://openzeppelin.com/)
[![Tests](https://img.shields.io/badge/Tests-90_passing-2E7D32?style=flat-square)](#security-and-testing)
[![License](https://img.shields.io/badge/License-MIT-555555?style=flat-square)](LICENSE)

[Source Code](https://github.com/NexTechArchitect/OnChain-Automation-Protocol) · [Core Contract](https://sepolia.basescan.org/address/0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3)

</div>

---

## Overview

Keeper Network is an automation layer for Ethereum smart contracts. Any contract can register a job with a funded reward pool. Independent keepers bond ETH into a registry, watch for jobs that are due, and execute them for a reward. If a keeper misbehaves, they get slashed and eventually jailed.

The design solves three practical problems:

- **No trustless trigger mechanism.** JobManager holds job state and reward funds. Any bonded keeper can execute a due job, no permission needed.
- **Unreliable or malicious keepers.** KeeperRegistry requires an ETH bond to register. Bad behavior is punished with slashing, and repeat offenders get automatically jailed.
- **One bad job blocking a batch.** ExecutionEngine wraps each job call in try/catch during batch execution. A single failing target doesn't stop the rest of the batch.

## Architecture

Three separate layers. A bug in execution can't reach keeper bonds, and a bug in the registry can't reach job funds.

```
Job Owners
    |
    v  registerJob() / depositReward()
JobManager.sol
    |  stores job state, reward pools, O(1) active job list
    v  isJobReady() / recordExecution()
ExecutionEngine.sol
    |  try/catch fault isolation, single and batch execution
    v  isActive() / slash() / jail()
KeeperRegistry.sol
    |  ETH bonding, slashing, jailing, reputation
```

Design notes:

- ExecutionEngine never holds a standing ETH balance between transactions
- Checks-Effects-Interactions ordering on every state-changing function
- ReentrancyGuard on every function that touches funds
- O(1) swap and pop removal keeps the active job list cheap at any scale
- A keeper auto-jails after 3 slashes or if their bond drops below the minimum

## Deployed Contracts

Base Sepolia, Chain ID 84532.

| Contract | Address |
|---|---|
| KeeperRegistry | [0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3](https://sepolia.basescan.org/address/0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3) |
| JobManager | [0xBAa2B4c250DD6da358e23244C2fa85dA1927718C](https://sepolia.basescan.org/address/0xBAa2B4c250DD6da358e23244C2fa85dA1927718C) |
| ExecutionEngine | [0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9](https://sepolia.basescan.org/address/0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9) |

## Contract Reference

| Contract | Role |
|---|---|
| KeeperRegistry.sol | Keeper onboarding and bonding. Registration, unbonding cooldown, slashing, jailing, reputation. |
| JobManager.sol | Job lifecycle and reward pools. Register, pause, resume, cancel. Splits protocol fees on execution via pull payment. |
| ExecutionEngine.sol | Execution router. Confirms keeper is active and job is ready, then calls the target. Batch execution isolates failures per job. |
| KeeperMath.sol | Pure math library. Reward and fee splitting, reputation bounds, cooldown timing, base fee checks. |
| IAutomatable.sol | Interface a target contract implements to be job-compatible with the network. |

## Security and Testing

Framework: Foundry, unit, integration, fuzz, and invariant testing. Static analysis: Slither.

| Suite | Tests | Result |
|---|---|---|
| Unit | 55 | Passing |
| Integration | 20 | Passing |
| Fuzz, 256 runs each | 4 | Passing |
| Invariant, stateful | 11 | Passing |
| Total | 90 tests, 0 failed | |

Each of the 11 invariants ran 256 sequences of 500 randomized calls, roughly 128,000 calls per invariant and over 1.4 million calls total. Zero unexpected reverts. Invariants checked:

- Registry ETH balance always matches the sum of active, jailed, and exiting bonds
- JobManager ETH balance always matches reward pools plus accumulated fees
- ExecutionEngine never holds a standing ETH balance
- Total value in equals total value out across Registry, JobManager, and Treasury
- Active job list never duplicates or drops an entry
- Reputation score never exceeds its defined cap

Mitigations in place:

- try/catch fault isolation on batch execution
- Pull payment pattern on every withdrawal
- CEI ordering and ReentrancyGuard on every fund-touching function
- Ownable2Step on all privileged contracts
- Gas griefing protection via per-job max base fee limits
- Zero high or critical Slither findings, all informational findings reviewed

## Local Development

Requires Foundry and Git.

```bash
git clone https://github.com/NexTechArchitect/OnChain-Automation-Protocol.git
cd OnChain-Automation-Protocol
forge install && forge build
forge test -vvv
```

Local deployment with Anvil:

```bash
anvil
```

```bash
source .env
forge script script/DeployKeeperNetwork.s.sol:DeployKeeperNetwork \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

---

Built on Base. Tested with Foundry invariant suites.

[NexTechArchitect](https://github.com/NexTechArchitect)
