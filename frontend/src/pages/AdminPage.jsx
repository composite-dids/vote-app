import { useState } from "react";
import { ethers } from "ethers";
import { api } from "../lib/api.js";
import {
  votingContract,
  friendlyError,
  deployContracts,
  DID_REGISTRY_ADDRESS,
} from "../lib/eth.js";

function toUnix(localValue) {
  // localValue is "YYYY-MM-DDTHH:mm" in local time.
  return Math.floor(new Date(localValue).getTime() / 1000);
}

function defaultLocal(offsetMinutes) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  d.setSeconds(0, 0);
  // Convert to local datetime-local string.
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function AdminPage({ wallet, config, onConfigChange }) {
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState(null);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState(null);
  const [deployErr, setDeployErr] = useState(null);
  const [deployedVoting, setDeployedVoting] = useState(null);

  // Proposal form
  const [topic, setTopic] = useState("");
  const [start, setStart] = useState(defaultLocal(1));
  const [end, setEnd] = useState(defaultLocal(60));
  const [propMsg, setPropMsg] = useState(null);
  const [propErr, setPropErr] = useState(null);
  const [publishing, setPublishing] = useState(false);

  async function login(e) {
    e.preventDefault();
    setLoginErr(null);
    try {
      const { token } = await api.login(username, password);
      setToken(token);
    } catch (e) {
      setLoginErr(e.message);
    }
  }

  // Deploy a fresh Voting contract from the connected wallet, pointed at the
  // fixed DID registry. The deployer becomes the contract's owner, but proposal
  // creation is open to anyone, so ownership only matters for transferOwnership.
  async function handleDeploy() {
    setDeployErr(null);
    setDeployMsg(null);
    if (!wallet?.signer) {
      setDeployErr("Connect your wallet first.");
      return;
    }
    setDeploying(true);
    try {
      const { registrationAddress, votingAddress } = await deployContracts(
        wallet.signer,
        (step) => setDeployMsg(step)
      );
      if (!ethers.isAddress(votingAddress)) {
        throw new Error(
          "Deploy returned an invalid address. Check you're on Sepolia and the tx confirmed."
        );
      }
      // Persist to THIS browser so it's usable immediately; to make it live for
      // everyone, commit the snippet below to public/config.json.
      await api.saveConfig(token, {
        registrationAddress,
        votingAddress,
        chainId: wallet.chainId,
      });
      setDeployedVoting(votingAddress);
      setDeployMsg(
        "✅ Deployed and active in this browser. Commit config.json to make it live for everyone."
      );
      onConfigChange?.();
    } catch (e) {
      setDeployErr(friendlyError(e));
    } finally {
      setDeploying(false);
    }
  }

  // The exact contents to paste into frontend/public/config.json.
  function configSnippet() {
    return JSON.stringify(
      {
        registrationAddress: DID_REGISTRY_ADDRESS,
        votingAddress: deployedVoting || config?.votingAddress || "",
        chainId: wallet?.chainId || 11155111,
        rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
        adminUsername: "admin",
        adminPassword: "changeme",
      },
      null,
      2
    );
  }

  async function publishProposal(e) {
    e.preventDefault();
    setPropErr(null);
    setPropMsg(null);
    if (!config?.votingAddress) {
      setPropErr("No voting contract is configured. Deploy one first.");
      return;
    }
    const startTs = toUnix(start);
    const endTs = toUnix(end);
    if (!(endTs > startTs)) {
      setPropErr("End time must be after start time.");
      return;
    }
    setPublishing(true);
    try {
      const contract = votingContract(config, wallet.signer);
      const tx = await contract.createProposal(topic, startTs, endTs);
      setPropMsg("Publishing… waiting for confirmation.");
      await tx.wait();
      setPropMsg("✅ Proposal published!");
      setTopic("");
      onConfigChange?.();
    } catch (e) {
      setPropErr(friendlyError(e));
    } finally {
      setPublishing(false);
    }
  }

  if (!token) {
    return (
      <div className="card admin-login">
        <h2>Admin sign in</h2>
        <form onSubmit={login}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="submit" type="submit">
            Sign in
          </button>
          {loginErr && <div className="note error">{loginErr}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="admin-grid">
      <section className="card">
        <h2>Deploy the Voting contract</h2>
        <p className="hint">
          Deploys a fresh <code>Voting</code> contract from your connected
          wallet, pointed at the fixed DID registry below. Registration is
          external, so no Registration contract is deployed here. The new
          address is saved to this browser immediately; commit the snippet to{" "}
          <code>public/config.json</code> to make it live for everyone.
        </p>
        <div className="config-line">
          <span>Registration (DID registry, fixed):</span>
          <code>{DID_REGISTRY_ADDRESS}</code>
        </div>
        <div className="config-line">
          <span>Voting:</span>
          <code>{config?.votingAddress || "— not deployed —"}</code>
        </div>
        <button
          className="submit"
          onClick={handleDeploy}
          disabled={deploying || !wallet?.signer}
        >
          {deploying
            ? "Deploying…"
            : wallet?.signer
            ? "Deploy new Voting contract"
            : "Connect a wallet first"}
        </button>
        {deployMsg && <div className="note success">{deployMsg}</div>}
        {deployErr && <div className="note error">{deployErr}</div>}
        {deployedVoting && (
          <div className="note">
            <strong>Make it live for everyone:</strong> paste this into{" "}
            <code>frontend/public/config.json</code>, then commit &amp; push.
            <pre className="snippet">{configSnippet()}</pre>
            <button
              className="submit"
              onClick={() => navigator.clipboard?.writeText(configSnippet())}
            >
              Copy config.json
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Publish a proposal</h2>
        <p className="hint">
          Any signed-in admin with a connected wallet can publish a proposal —
          the transaction is signed by your wallet on Sepolia.
        </p>
        <form onSubmit={publishProposal}>
          <label>
            Topic / question
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Should we adopt proposal X?"
              required
            />
          </label>
          <div className="row">
            <label>
              Start
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </label>
            <label>
              End
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>
          </div>
          <button className="submit" type="submit" disabled={publishing}>
            {publishing ? "Publishing…" : "Publish proposal"}
          </button>
          {propMsg && <div className="note success">{propMsg}</div>}
          {propErr && <div className="note error">{propErr}</div>}
        </form>
      </section>
    </div>
  );
}
