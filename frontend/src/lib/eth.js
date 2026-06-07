import { ethers } from "ethers";
import DIDRegistryArtifact from "../contracts/DIDRegistry.json";
import VotingArtifact from "../contracts/Voting.json";

export const SEPOLIA = {
  chainId: 11155111,
  chainIdHex: "0xaa36a7",
  name: "Sepolia",
};

// The live composite-DID registry on Sepolia. Voting checks its on-chain
// hashtable (isRegistered) to decide who may vote — the vote-app no longer
// deploys its own Registration contract. Users register in the separate DID
// app; the credential they earn there lands in this registry.
export const DID_REGISTRY_ADDRESS =
  "0xb1768B404EB4102CCF4DBc0c9b661a17D48dcef8";

// Where voters go to obtain a DID credential (the composite-DID frontend).
export const DID_REGISTER_APP_URL = "https://composite-dids.github.io/";

export function hasMetaMask() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export function getBrowserProvider() {
  if (!hasMetaMask()) throw new Error("MetaMask not found");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function connectWallet() {
  const provider = getBrowserProvider();
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  return { provider, signer, address, chainId: Number(network.chainId) };
}

/**
 * Force MetaMask to show its account picker so the user can switch to a
 * different account, then return the newly selected connection.
 */
export async function switchWallet() {
  if (!hasMetaMask()) throw new Error("MetaMask not found");
  await window.ethereum.request({
    method: "wallet_requestPermissions",
    params: [{ eth_accounts: {} }],
  });
  return connectWallet();
}

/** Ask MetaMask to switch to Sepolia (adds it if missing). */
export async function ensureSepolia() {
  if (!hasMetaMask()) throw new Error("MetaMask not found");
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA.chainIdHex }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA.chainIdHex,
            chainName: "Sepolia test network",
            nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export function votingContract(addressOrConfig, runner) {
  const address =
    typeof addressOrConfig === "string"
      ? addressOrConfig
      : addressOrConfig.votingAddress;
  return new ethers.Contract(address, VotingArtifact.abi, runner);
}

// Reads against the live DIDRegistry (isRegistered / registeredSignalsOf).
export function registrationContract(address, runner) {
  return new ethers.Contract(
    address || DID_REGISTRY_ADDRESS,
    DIDRegistryArtifact.abi,
    runner
  );
}

/**
 * Deploy only the Voting contract, pointing it at the live DIDRegistry.
 * Registration is external (the composite-DID app), so we no longer deploy a
 * Registration contract here.
 */
export async function deployContracts(signer, onStep, registryAddress) {
  const registrationAddress = registryAddress || DID_REGISTRY_ADDRESS;

  const VotingFactory = new ethers.ContractFactory(
    VotingArtifact.abi,
    VotingArtifact.bytecode,
    signer
  );
  onStep?.("Deploying Voting (using the live DID registry)…");
  const voting = await VotingFactory.deploy(registrationAddress);
  await voting.waitForDeployment();
  const votingAddress = await voting.getAddress();

  return { registrationAddress, votingAddress };
}

/** Decode a revert reason from a failed transaction into a friendly message. */
export function friendlyError(err) {
  const msg =
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.data?.message ||
    err?.message ||
    "Transaction failed";
  if (msg.includes("not registered")) return "Your address is not registered.";
  if (msg.includes("already voted")) return "You have already voted on this proposal.";
  if (msg.includes("not started")) return "Voting has not started yet.";
  if (msg.includes("ended")) return "Voting has ended.";
  if (msg.includes("user rejected")) return "You rejected the transaction.";
  return msg;
}
