
<div align="center">

<img src="https://img.shields.io/badge/⚙️-Keeper_Network-F0B90B?style=for-the-badge&labelColor=0f172a&color=F0B90B" height="36"/>

# On-Chain Automation Protocol
### Base Mainnet · Permissionless · Slashing-Secured

<br>

[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](https://opensource.org/licenses/MIT)
[![Foundry](https://img.shields.io/badge/Built_With-Foundry-F0B90B?style=flat-square)](https://book.getfoundry.sh/)
[![Network](https://img.shields.io/badge/Network-Base_Mainnet-808080?style=flat-square)](https://basescan.org/)
[![Tests](https://img.shields.io/badge/Tests-90_Passing-22c55e?style=flat-square)](#testing-methodology)
[![Slither](https://img.shields.io/badge/Slither-0_High_0_Critical-22c55e?style=flat-square)](#security-model)

<br>

> **A fully decentralized automation protocol for Ethereum smart contracts.**
> Keepers bond ETH to a slashing-secured registry, then compete to execute due jobs
> through a fault-isolated batch router, earning rewards from a pull-payment vault.

<br>

<a href="https://github.com/NexTechArchitect/OnChain-Automation-Protocol">💻 Source Code</a> &nbsp;·&nbsp;
<a href="https://basescan.org/address/0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3">🔗 Core Registry</a>

</div>

---

## 🎯 What Makes This Protocol Different

Most automation relies on centralized cron-bots or permissioned multisigs to trigger execution. This protocol replaces that single point of failure with a permissionless, economically secured game between independent keepers.

| Traditional Execution | Protocol Solution |
|:---|:---|
| Centralized bot failure halts the system | Any bonded keeper can step in, no permission needed |
| Malicious triggers drain target contracts | ETH bonding, automated slashing, permanent jailing |
| One failing job reverts the whole batch | `try/catch` isolation per job in `ExecutionEngine` |
| Unbounded arrays blow past gas limits | `O(1)` swap-and-pop active job list |
| Push-payments create DoS risk | Rewards, fees, and bonds are pull-payment only |

---

## 🏛️ Architecture

Three isolated layers. A bug in execution logic can never reach keeper bonds, and a bug in the registry can never reach job funds.

```
Job Owners
    │
    ▼  registerJob() / depositReward()
┌─────────────────────────────────────┐
│  JobManager.sol                      │
│  job state · reward pools            │
│  O(1) active job list                │
└──────────────┬────────────────────────┘
               │  isJobReady() / recordExecution()
               ▼
┌─────────────────────────────────────┐
│  ExecutionEngine.sol                 │
│  try/catch fault isolation            │
│  single + batch execution             │
└──────────────┬────────────────────────┘
               │  isActive() / slash() / jail()
               ▼
┌─────────────────────────────────────┐
│  KeeperRegistry.sol                  │
│  ETH bonding · slashing · jailing     │
│  reputation tracking                  │
└─────────────────────────────────────┘
```

**Design invariants:**

1. **Fault isolation.** `ExecutionEngine` never holds a standing ETH balance. If Job A reverts, Job B and Job C in the same batch still execute.
2. **Absolute solvency.** Registry and JobManager balances always match what they owe in bonds, rewards, and fees. Verified across 1.4M+ invariant calls.
3. **Checks-Effects-Interactions.** All state changes happen before any external call, closing the standard reentrancy vector by construction.
4. **Economic slashing.** A keeper auto-jails after 3 slashes or if the bond drops below minimum.

---

## ✅ Deployed Contracts

Deployed and verified on **Base Mainnet** (Chain ID: `8453`).

| Contract | Address | Basescan |
|:---|:---|:---|
| **KeeperRegistry** | `0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3` | [↗ View](https://basescan.org/address/0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3) |
| **JobManager** | `0xBAa2B4c250DD6da358e23244C2fa85dA1927718C` | [↗ View](https://basescan.org/address/0xBAa2B4c250DD6da358e23244C2fa85dA1927718C) |
| **ExecutionEngine** | `0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9` | [↗ View](https://basescan.org/address/0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9) |

---

## 🧩 Contract Reference

#### `KeeperRegistry.sol`
Bonding, slashing, and reputation. `register()` locks a minimum ETH bond. Unbonding is two-step: `initiateUnbond()` starts a cooldown, `withdrawBond()` releases funds after it clears. Slashing deducts from the bond and auto-jails past a threshold. Reputation is clamped between `0` and `MAX_REPUTATION` so it can't over or underflow.

#### `JobManager.sol`
Job lifecycle and reward pools. `registerJob()` sets a target, a per-execution reward, an interval, and a `maxBaseFee` ceiling for gas-griefing protection. Active jobs are tracked with an `O(1)` swap-and-pop array. `recordExecution()` splits the payout via `KeeperMath` and pays the keeper directly. Protocol fees accumulate and are claimed permissionlessly through `withdrawFees()`, a pull rather than a push.

#### `ExecutionEngine.sol`
The only contract that talks to external targets, and the only one that never custodies funds. `executeJob()` and `executeBatch()` both wrap target calls in `try/catch`, so a single bad target can never stall a batch or brick a transaction. Owner has manual `slashKeeper()` / `jailKeeper()` overrides for Phase 1.

#### `KeeperMath.sol`
Pure library, no state, no external calls.

```
keeperReward   = rewardPerExec − protocolFee
protocolFee    = (rewardPerExec × protocolFeeBps) / 10_000
isCooldownOver = block.timestamp ≥ unbondInitiatedAt + cooldownDuration
```

---

## 🛠️ Local Setup

```bash
git clone https://github.com/NexTechArchitect/OnChain-Automation-Protocol.git
cd OnChain-Automation-Protocol

forge install && forge build
forge test -vvv
---

## 🧪 Static Analysis

Slither v0.10 run against the full build: 13 contracts, 101 detectors, 41 results across 9 categories. Every one manually reviewed against source. **0 Critical, 0 High, 0 Medium.** Remaining findings are informational: intentional `try/catch` loops, standard pull-payment `.call()` usage, and a few flags inherited from OpenZeppelin's own library code.

---
---

## 🔐 Security Model

| Attack Vector | Mitigation |
|:---|:---|
| Reentrancy | `ReentrancyGuard` + CEI ordering on every fund-touching function |
| Batch stalling from a bad job | `try/catch` isolation per job in `executeBatch` |
| Unbounded array gas costs | O(1) swap-and-pop on the active job list |
| Push-payment DoS | Rewards, fees, and bonds claimed via pull-payment only |
| Malicious keepers | ETH bonding + automatic slashing + auto-jail |
| Gas-griefing | Per-job `maxBaseFee` ceiling on execution |
| Ownership takeover | `Ownable2Step` on all privileged contracts |
| Stuck funds in the router | `ExecutionEngine` never custodies ETH between transactions |

---

<div align="center">

**Built with ⚙️ by [NexTech Architect](https://github.com/NexTechArchitect)**

*Smart Contract Developer · Solidity · Foundry · Full Stack Web3*

</div>
