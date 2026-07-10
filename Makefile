# Include environment variables
-include .env

.PHONY: all clean compile build test test-invariant deploy-local deploy-sepolia deploy-base slither git-sync

# Default target
all: clean compile build test

# Development & Compilation
clean:
	@forge clean

compile:
	@forge compile

build:
	@forge build

# Testing & Analysis
test:
	@forge test -vvv

test-invariant:
	@forge test --match-contract InvariantKeeper -vvv

slither:
	@slither . --compile-force-framework foundry

# Deployment Routes
deploy-local:
	@forge script script/DeployKeeperNetwork.s.sol:DeployKeeperNetwork --rpc-url http://127.0.0.1:8545 --private-key $(PRIVATE_KEY) --broadcast -vvvv

deploy-sepolia:
	@forge script script/DeployKeeperNetwork.s.sol:DeployKeeperNetwork --rpc-url $(SEPOLIA_RPC_URL) --private-key $(PRIVATE_KEY) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv

deploy-base:
	@forge script script/DeployKeeperNetwork.s.sol:DeployKeeperNetwork --rpc-url $(BASE_MAINNET_URL) --private-key $(PRIVATE_KEY) --broadcast --verify --verifier sourcify -vvvv

# Repository Sync
git-sync:
	@git rm -r --cached . && git add . && git commit -m "chore: repository sync via makefile" && git push -u origin main --force