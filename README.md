
<div align="center">

<br/>

<img src="https://img.shields.io/badge/⚙️_KEEPER-AUTOMATION_PROTOCOL-6366f1?style=for-the-badge&labelColor=0f172a" height="100"/>

<br/>

**Decentralized On-Chain Automation Infrastructure**

*Base Network · Batch Execution Router · Bonded Keeper Registry · Foundry Invariant Verified*

<br/>

[![Network](https://img.shields.io/badge/Network-Base_Sepolia-0052FF?style=flat-square&logo=base&logoColor=white)](https://sepolia.basescan.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?style=flat-square&logo=solidity)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Tests-Foundry-F0B90B?style=flat-square)](https://book.getfoundry.sh/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.x-4E5EE4?style=flat-square)](https://openzeppelin.com/)
[![Tests](https://img.shields.io/badge/Tests-90_passing-22c55e?style=flat-square)](#security--testing)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<br/>

> A modular, security-first automation protocol for Ethereum smart contracts.
> Bonded keepers monitor and execute recurring or one-time on-chain jobs -
> liquidations, rebalancing, scheduled payments - in exchange for ETH rewards,
> removing the need for centralized bots or manual triggers.

<br/>

[📄 Source Code](https://github.com/NexTechArchitect/OnChain-Automation-Protocol) &nbsp;·&nbsp;
[🔗 Core Contract](https://sepolia.basescan.org/address/0xEF80cd6370D4619D2f71BD4000a4757357Be5564)

<br/>

</div>

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Deployed Contracts](#deployed-contracts)
- [Contract Reference](#contract-reference)
- [Security & Testing](#security--testing)
- [Local Development](#local-development)

---

## Overview

Keeper Network solves three core problems in on-chain automation:

| Problem | Solution |
|:---|:---|
| **No trustless way to trigger jobs** | `JobManager` lets any contract register a recurring or one-time job with a funded reward pool. Any bonded keeper can execute it once it's due. |
| **Malicious or unreliable keepers** | `KeeperRegistry` requires an ETH bond to register. Bad behavior gets the keeper slashed and, past a threshold, automatically jailed. |
| **One bad job blocking a whole batch** | `ExecutionEngine.executeBatch` wraps every job call in try/catch. A single reverting or malicious target is isolated to that job; the rest of the batch still executes. |
| **Funds getting stuck mid-transaction** | Reward, fee, and bond withdrawals all follow a pull-payment model, so a reverting recipient can never block other users' funds. |

---

## Architecture

The protocol runs across three isolated layers. A bug in execution can't touch keeper bonds, and a bug in the registry can't touch job funds.

```
┌─────────────────────────────────────────────────────────────────┐
│                     JOB OWNERS / DAPPS                          │
│         Register jobs, fund reward pools, set intervals          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ registerJob() / depositReward()
┌──────────────────────────▼──────────────────────────────────────┐
│                      JOB MANAGER LAYER                          │
│                       JobManager.sol                             │
│   Stores job state · O(1) active job list · pull-payment fees   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ isJobReady() / recordExecution()
┌──────────────────────────▼──────────────────────────────────────┐
│                    EXECUTION ROUTER LAYER                       │
│                    ExecutionEngine.sol                           │
│   try/catch fault isolation · single & batch execution           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ isActive() / slash() / jail()
┌──────────────────────────▼──────────────────────────────────────┐
│                    KEEPER REGISTRY LAYER                        │
│                    KeeperRegistry.sol                            │
│   ETH bonding · slashing · jailing · reputation tracking         │
└─────────────────────────────────────────────────────────────────┘
```

**Key design invariants:**

- Execution engine never holds a standing ETH balance between transactions
- CEI (Checks-Effects-Interactions) enforced on every state-changing function
- `ReentrancyGuard` on all external entry points touching funds
- O(1) swap-and-pop removal keeps the active job list gas-efficient at any scale
- A keeper auto-jails after 3 slashes or if their bond drops below the minimum

---

## Deployed Contracts

Deployed and live on **Base Sepolia** (Chain ID: `84532`).

| Contract | Address | Basescan |
|:---|:---|:---|
| **KeeperRegistry** | `0xEF80cd6370D4619D2f71BD4000a4757357Be5564` | [↗ View](https://sepolia.basescan.org/address/0xEF80cd6370D4619D2f71BD4000a4757357Be5564) |
| **JobManager** | `0xB7939f8b41C932595cf358842BC63AFE221D2Ba3` | [↗ View](https://sepolia.basescan.org/address/0xB7939f8b41C932595cf358842BC63AFE221D2Ba3) |
| **ExecutionEngine** | `0x897a76eC710DC780E4627532A0e863F2672d50A7` | [↗ View](https://sepolia.basescan.org/address/0x897a76eC710DC780E4627532A0e863F2672d50A7) |

---

## Contract Reference

| Contract | Role |
|:---|:---|
| `KeeperRegistry.sol` | Keeper onboarding and bonding. Handles registration, unbonding cooldowns, slashing, jailing, and reputation scoring. Auto-jails after 3 slashes or if bond falls below minimum. |
| `JobManager.sol` | Job lifecycle and reward pools. Registers, pauses, resumes, and cancels jobs. Tracks per-job reward balances and splits protocol fees on each execution via pull-payment. |
| `ExecutionEngine.sol` | Execution router. Verifies keeper is active and job is ready, then calls the target contract. `executeBatch` isolates failures per-job via try/catch so one bad target can't stall the batch. |
| `KeeperMath.sol` | Pure math library. Reward/fee splitting, reputation bounds, cooldown timing, and base-fee gas-griefing checks. |
| `IAutomatable.sol` | Interface any target contract implements to be job-compatible with the network. |

---

## Security & Testing

**Framework:** Foundry (Unit, Integration, Fuzz, Invariant) · **Static Analysis:** Slither

**Full test suite result:**

| Suite | Tests | Status |
|:---|:---|:---|
| Unit (Registry, JobManager, ExecutionEngine, Math) | 55 | All passing |
| Integration (full lifecycle flows) | 20 | All passing |
| Fuzz (256 runs each) | 4 | All passing |
| Invariant (stateful, chaos testing) | 11 | All passing |
| **Total** | **90 tests, 0 failed, 0 skipped** | ✅ |

**Invariant testing depth:** each of the 11 invariants ran 256 sequences of 500 randomized calls, for 128,000 calls per invariant and over 1.4 million total calls across the suite. Zero unexpected reverts. Invariants checked include:

- Registry ETH balance always matches the sum of all active, jailed, and exiting bonds
- JobManager ETH balance always matches reward pools plus accumulated fees
- ExecutionEngine never holds a standing ETH balance
- Total value in equals total value out across Registry, JobManager, and Treasury
- Active job list never duplicates or drops an entry
- Reputation score never exceeds its protocol-defined cap

**Implemented mitigations:**

- try/catch fault isolation on all batch execution paths
- Pull-payment pattern on all withdrawals, no push transfers that can be griefed
- CEI pattern and `ReentrancyGuard` on every fund-touching function
- `Ownable2Step` on all privileged contracts, no single-step ownership transfer risk
- Gas-griefing protection via per-job max base fee limits
- Zero high or critical Slither findings; all informational findings reviewed and documented

---

## Local Development

**Prerequisites:** [Foundry](https://book.getfoundry.sh/getting-started/installation) · Git

```bash
# Clone & setup
git clone https://github.com/NexTechArchitect/OnChain-Automation-Protocol.git
cd OnChain-Automation-Protocol

forge install && forge build
forge test -vvv
```

```bash
# Local Anvil deployment
anvil

# In a second terminal
source .env
forge script script/DeployKeeperNetwork.s.sol:DeployKeeperNetwork \
  --rpc-url http://127.0.0.1:8545 \
  --private-key $PRIVATE_KEY \
  --broadcast \
  -vvvv
```

<div align="center">

Built on **Base** · Verified with **Foundry Invariant Testing** · Secured with **Slither**

*Engineered by [NexTechArchitect](https://github.com/NexTechArchitect)*

</div>
