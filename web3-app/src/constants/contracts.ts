import KeeperRegistryABI from './abis/KeeperRegistry.json';
import JobManagerABI from './abis/JobManager.json';
import ExecutionEngineABI from './abis/ExecutionEngine.json';

export const BASE_CHAIN_ID = 8453;

export const CONTRACT_ADDRESSES = {
  KEEPER_REGISTRY: '0xcEa37b9CCA6170d43BF133CCfdeaD9CB2A4D61D3' as `0x${string}`,
  JOB_MANAGER: '0xBAa2B4c250DD6da358e23244C2fa85dA1927718C' as `0x${string}`,
  EXECUTION_ENGINE: '0x388665c32F9F17E0d5cfEE3Eabe1880A3AEd80e9' as `0x${string}`,
};

export const CONTRACT_ABIS = {
  KEEPER_REGISTRY: KeeperRegistryABI,
  JOB_MANAGER: JobManagerABI,
  EXECUTION_ENGINE: ExecutionEngineABI,
};