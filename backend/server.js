import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  ADMIN_USERNAME = "admin",
  ADMIN_PASSWORD = "changeme",
  JWT_SECRET = "dev-secret-change-me",
  RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com",
  CHAIN_ID = "11155111",
  REGISTRAR_PRIVATE_KEY = "",
  PORT = "4000",
} = process.env;

// ---------------------------------------------------------------------------
// Contract ABIs (exported from Hardhat by `npm run build` in the root project)
// ---------------------------------------------------------------------------
function loadAbi(name) {
  const file = path.join(__dirname, "contracts", `${name}.json`);
  if (!fs.existsSync(file)) {
    console.warn(
      `[warn] Missing ${file}. Run "npm run build" in the project root to export ABIs.`
    );
    return null;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")).abi;
}
const VOTING_ABI = loadAbi("Voting");
const REGISTRATION_ABI = loadAbi("Registration");

// ---------------------------------------------------------------------------
// Deployment config: shared/deployment.json holds the deployed addresses.
// The admin UI can update it after deploying from the browser.
// ---------------------------------------------------------------------------
const DEPLOYMENT_FILE = path.join(__dirname, "..", "shared", "deployment.json");

function readDeployment() {
  try {
    if (fs.existsSync(DEPLOYMENT_FILE)) {
      return JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Failed to read deployment.json:", e.message);
  }
  return { registrationAddress: null, votingAddress: null, chainId: Number(CHAIN_ID) };
}

function writeDeployment(data) {
  fs.mkdirSync(path.dirname(DEPLOYMENT_FILE), { recursive: true });
  fs.writeFileSync(DEPLOYMENT_FILE, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Chain helpers
// ---------------------------------------------------------------------------
const provider = new ethers.JsonRpcProvider(RPC_URL, Number(CHAIN_ID));

function votingContract(runner = provider) {
  const { votingAddress } = readDeployment();
  if (!votingAddress) throw new Error("Voting contract not configured yet");
  if (!VOTING_ABI) throw new Error("Voting ABI not exported");
  return new ethers.Contract(votingAddress, VOTING_ABI, runner);
}

function registrationContract(runner = provider) {
  const { registrationAddress } = readDeployment();
  if (!registrationAddress) throw new Error("Registration contract not configured yet");
  if (!REGISTRATION_ABI) throw new Error("Registration ABI not exported");
  return new ethers.Contract(registrationAddress, REGISTRATION_ABI, runner);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.use(cors());
app.use(express.json());

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") throw new Error("not admin");
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Admin auth ---
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin", username }, JWT_SECRET, {
      expiresIn: "8h",
    });
    return res.json({ token, username });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

// --- Deployment config ---
app.get("/api/config", (_req, res) => {
  const d = readDeployment();
  res.json({
    registrationAddress: d.registrationAddress || null,
    votingAddress: d.votingAddress || null,
    chainId: d.chainId || Number(CHAIN_ID),
    rpcUrl: RPC_URL,
    relayerEnabled: Boolean(REGISTRAR_PRIVATE_KEY),
  });
});

// Admin records the addresses after deploying from the browser.
app.post("/api/config", requireAdmin, (req, res) => {
  const { registrationAddress, votingAddress, chainId } = req.body || {};
  if (!ethers.isAddress(registrationAddress) || !ethers.isAddress(votingAddress)) {
    return res.status(400).json({
      error: `Invalid addresses — registration=${JSON.stringify(
        registrationAddress
      )}, voting=${JSON.stringify(votingAddress)}`,
    });
  }
  const data = {
    ...readDeployment(),
    // Normalize to checksummed form.
    registrationAddress: ethers.getAddress(registrationAddress),
    votingAddress: ethers.getAddress(votingAddress),
    chainId: chainId || Number(CHAIN_ID),
    updatedAt: new Date().toISOString(),
  };
  writeDeployment(data);
  res.json({ ok: true, ...data });
});

// --- Chain reads ---
function shapeProposal(id, raw) {
  const now = Math.floor(Date.now() / 1000);
  const startTime = Number(raw.startTime ?? raw[1]);
  const endTime = Number(raw.endTime ?? raw[2]);
  const yesCount = Number(raw.yesCount ?? raw[3]);
  const noCount = Number(raw.noCount ?? raw[4]);
  const topic = raw.topic ?? raw[0];
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

app.get("/api/proposals", async (_req, res) => {
  try {
    const voting = votingContract();
    const count = Number(await voting.proposalCount());
    const proposals = [];
    for (let i = 0; i < count; i++) {
      const raw = await voting.getProposal(i);
      proposals.push(shapeProposal(i, raw));
    }
    res.json({ count, proposals });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.get("/api/proposals/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const voting = votingContract();
    const raw = await voting.getProposal(id);
    res.json(shapeProposal(id, raw));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Registration check API (proxies the contract's isRegistered).
app.get("/api/registered/:address", async (req, res) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    const registration = registrationContract();
    const registered = await registration.isRegistered(address);
    res.json({ address, registered });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Has a given address voted on a proposal?
app.get("/api/proposals/:id/status/:address", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    const voting = votingContract();
    const [isRegistered, voted, active] = await voting.getVoteStatus(id, address);
    res.json({ proposalId: id, address, isRegistered, voted, active });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// --- Optional relayer: backend registers a voter on-chain (the "send tx" role) ---
app.post("/api/register", requireAdmin, async (req, res) => {
  if (!REGISTRAR_PRIVATE_KEY) {
    return res.status(400).json({ error: "Relayer disabled (no REGISTRAR_PRIVATE_KEY)" });
  }
  try {
    const { address } = req.body || {};
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }
    const wallet = new ethers.Wallet(REGISTRAR_PRIVATE_KEY, provider);
    const registration = registrationContract(wallet);
    const tx = await registration.registerVoter(address);
    const receipt = await tx.wait();
    res.json({ ok: true, txHash: receipt.hash, address });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(Number(PORT), () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`RPC: ${RPC_URL} (chainId ${CHAIN_ID})`);
  const d = readDeployment();
  console.log(
    `Contracts: registration=${d.registrationAddress || "—"} voting=${
      d.votingAddress || "—"
    }`
  );
});
