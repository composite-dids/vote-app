// frontend/src/lib/api.js// Fully-static data layer. There is no backend on GitHub Pages, so this reads
// contract state directly from a public Sepolia RPC (writes still go through
// MetaMask in the components). It keeps the same method names the components
// already use (api.getConfig, api.getProposals, ...).
import { ethers } from "ethers";
import {
  votingContract,
  registrationContract,
  DID_REGISTRY_ADDRESS,
} from "./eth.js";

const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const DEFAULT_CHAIN_ID = 11155111;
const LS_KEY = "chainvote.config";

let readProvider = null;
let readRpc = null;
function getReadProvider(rpcUrl) {
  if (!readProvider || readRpc !== rpcUrl) {
    readRpc = rpcUrl;
    readProvider = new ethers.JsonRpcProvider(rpcUrl, DEFAULT_CHAIN_ID);
  }
  return readProvider;
}

// Static config committed at public/config.json (source of truth for everyone).
async function loadStaticConfig() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    /* no committed config yet */
  }
  return {};
}

function loadLocalOverride() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function shapeProposal(id, raw) {
  const now = Math.floor(Date.now() / 1000);
  const topic = raw.topic ?? raw[0];
  const startTime = Number(raw.startTime ?? raw[1]);
  const endTime = Number(raw.endTime ?? raw[2]);
  const yesCount = Number(raw.yesCount ?? raw[3]);
  const noCount = Number(raw.noCount ?? raw[4]);
  let status = "active";
  if (now < startTime) status = "upcoming";
  else if (now > endTime) status = "ended";
  return {
    id,
    topic,
    startTime,
    endTime,
    yesCount,
    noCount,
    status,
    secondsLeft: status === "ended" ? 0 : Math.max(0, endTime - now),
    secondsUntilStart: status === "upcoming" ? Math.max(0, startTime - now) : 0,
  };
}

// ethers v6 rejects addresses whose mixed-case doesn't match the EIP-55
// checksum. Config/localStorage may hold a hand-edited address in any casing,
// so normalize to a proper checksummed address (or null) before it ever reaches
// ethers.Contract. getAddress also accepts all-lowercase input.
function normalizeAddress(addr) {
  if (!addr) return null;
  try {
    return ethers.getAddress(addr);
  } catch {
    return ethers.getAddress(String(addr).toLowerCase());
  }
}

async function resolveConfig() {
  const stat = await loadStaticConfig();
  const override = loadLocalOverride(); // admin's freshly-deployed addresses
  const cfg = { ...stat, ...override };
  return {
    // Registration is always the live DIDRegistry unless explicitly overridden.
    registrationAddress:
      normalizeAddress(cfg.registrationAddress) || DID_REGISTRY_ADDRESS,
    votingAddress: normalizeAddress(cfg.votingAddress),
    chainId: cfg.chainId || DEFAULT_CHAIN_ID,
    rpcUrl: cfg.rpcUrl || DEFAULT_RPC,
    adminUsername: cfg.adminUsername || "admin",
    adminPassword: cfg.adminPassword || "changeme",
  };
}

export const api = {
  getConfig: () => resolveConfig(),

  // Static deploy: persist to THIS browser so the admin can use the new
  // contracts immediately. For all other visitors, the addresses must be
  // committed to public/config.json (the AdminPage shows the snippet to paste).
  async saveConfig(_token, body) {
    const next = {
      ...loadLocalOverride(),
      registrationAddress: body.registrationAddress,
      votingAddress: body.votingAddress,
      chainId: body.chainId,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    return { ok: true, ...next };
  },

  // Cosmetic, client-side admin gate (honors the original UX). The real
  // protection is on-chain: admin actions only succeed from the owner wallet.
  async login(username, password) {
    const cfg = await resolveConfig();
    if (username === cfg.adminUsername && password === cfg.adminPassword) {
      return { token: "client-admin", username };
    }
    throw new Error("Invalid credentials");
  },

  async getProposals() {
    const cfg = await resolveConfig();
    if (!cfg.votingAddress) throw new Error("No voting contract configured");
    const voting = votingContract(cfg.votingAddress, getReadProvider(cfg.rpcUrl));
    const count = Number(await voting.proposalCount());
    const proposals = [];
    for (let i = 0; i < count; i++) {
      proposals.push(shapeProposal(i, await voting.getProposal(i)));
    }
    return { count, proposals };
  },

  async getProposal(id) {
    const cfg = await resolveConfig();
    const voting = votingContract(cfg.votingAddress, getReadProvider(cfg.rpcUrl));
    return shapeProposal(id, await voting.getProposal(id));
  },

  async getStatus(id, address) {
    const cfg = await resolveConfig();
    const voting = votingContract(cfg.votingAddress, getReadProvider(cfg.rpcUrl));
    const [isRegistered, voted, active] = await voting.getVoteStatus(id, address);
    return { proposalId: id, address, isRegistered, voted, active };
  },

  async isRegistered(address) {
    const cfg = await resolveConfig();
    const registration = registrationContract(
      cfg.registrationAddress,
      getReadProvider(cfg.rpcUrl)
    );
    const registered = await registration.isRegistered(address);
    return { address, registered };
  },

  // Pre-flight performed BEFORE asking the wallet to sign, ordered to match the
  // voting flow: first the LOCAL already-voted check (a repeat vote — already in
  // the Voting contract's per-proposal hashtable — is rejected immediately here,
  // no MetaMask prompt, no gas), then the voting-window check. Registration is
  // intentionally NOT checked here: it is verified last, as a fetch from the
  // registration contract performed on-chain inside Voting.vote() when the
  // transaction is sent (the contract reverts "Voting: not registered" for an
  // address with no DID credential). The UI never blocks the button on `voted`;
  // this is the gate that does.
  async precheckVote(id, address) {
    const cfg = await resolveConfig();
    if (!ethers.isAddress(address)) return { allowed: false, reason: "Invalid address." };
    const voting = votingContract(cfg.votingAddress, getReadProvider(cfg.rpcUrl));
    const [, voted, active] = await voting.getVoteStatus(id, address);
    if (voted)
      return { allowed: false, reason: "You have already voted on this proposal." };
    if (!active)
      return { allowed: false, reason: "Voting is not open right now." };
    return { allowed: true, reason: null };
  },
};
