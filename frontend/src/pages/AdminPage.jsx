import { useState } from "react";
import { ethers } from "ethers";
import { api } from "../lib/api.js";
import { deployContracts, votingContract, friendlyError } from "../lib/eth.js";

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

  const [deployMsg, setDeployMsg] = useState(null);
  const [deployErr, setDeployErr] = useState(null);
  const [deploying, setDeploying] = useState(false);
  // Holds successfully-deployed addresses so a failed save can be retried
  // without redeploying.
  const [pendingAddrs, setPendingAddrs] = useState(null);

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
      console.log("Deployed:", { registrationAddress, votingAddress });
      if (!ethers.isAddress(registrationAddress) || !ethers.isAddress(votingAddress)) {
        throw new Error(
          `Deploy returned invalid addresses (registration=${registrationAddress}, voting=${votingAddress}). Check you're on the right network and the tx confirmed.`
        );
      }
      setPendingAddrs({ registrationAddress, votingAddress });
      await saveAddresses({ registrationAddress, votingAddress });
    } catch (e) {
      setDeployErr(friendlyError(e));
    } finally {
      setDeploying(false);
    }
  }

  // Save deployed addresses to this browser (localStorage) and produce the
  // config.json snippet the admin must commit so all visitors see the same
  // contracts. Static site = no backend to write to.
  async function saveAddresses(addrs) {
    setDeployMsg("Saving addresses to this browser…");
    await api.saveConfig(token, {
      registrationAddress: addrs.registrationAddress,
      votingAddress: addrs.votingAddress,
      chainId: wallet.chainId,
    });
    setDeployMsg("✅ Deployed. Active in this browser now.");
    setPendingAddrs(null);
    onConfigChange?.();
  }

  async function retrySave() {
    setDeployErr(null);
    try {
      await saveAddresses(pendingAddrs);
    } catch (e) {
      setDeployErr(friendlyError(e));
    }
  }

  // The exact contents to paste into frontend/public/config.json.
  function configSnippet() {
    const a = pendingAddrs || {
      registrationAddress: config?.registrationAddress,
      votingAddress: config?.votingAddress,
    };
    return JSON.stringify(
      {
        registrationAddress: a.registrationAddress,
        votingAddress: a.votingAddress,
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
      setPropErr("Deploy the contracts first.");
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
        <h2>1 · Deploy the Voting contract (Sepolia)</h2>
        <p className="hint">
          Deploys <code>Voting</code> from your connected wallet, pointed at the
          live <code>DIDRegistry</code> below — registration is external, so no
          Registration contract is deployed here. On this static site the new
          address is saved to your browser immediately; to make it live for
          everyone, commit it to <code>public/config.json</code> (snippet shown
          after deploy).
        </p>
        <div className="config-line">
          <span>DID registry (read-only):</span>
          <code>{config?.registrationAddress || "—"}</code>
        </div>
        <div className="config-line">
          <span>Voting:</span>
          <code>{config?.votingAddress || "— not deployed —"}</code>
        </div>
        <button className="submit" onClick={handleDeploy} disabled={deploying}>
          {deploying ? "Deploying…" : "Deploy new contracts"}
        </button>
        {deployMsg && <div className="note success">{deployMsg}</div>}
        {deployErr && <div className="note error">{deployErr}</div>}
        {pendingAddrs && (
          <div className="note warn">
            Deployed, but not yet saved to this browser.
            <div className="config-line">
              <span>Registration:</span>
              <code>{pendingAddrs.registrationAddress}</code>
            </div>
            <div className="config-line">
              <span>Voting:</span>
              <code>{pendingAddrs.votingAddress}</code>
            </div>
            <button className="submit" onClick={retrySave}>
              Retry save
            </button>
          </div>
        )}
        {(config?.votingAddress || pendingAddrs) && (
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
        <h2>2 · Publish a proposal</h2>
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

      <section className="card">
        <h2>3 · Voter registration</h2>
        <p className="hint">
          Eligibility is decided by the live composite-DID registry — the admin
          does not register voters. Anyone who earns a DID credential in the DID
          app is automatically allowed to vote; the Voting contract reads that
          registry's <code>isRegistered</code> hashtable on every vote.
        </p>
        <div className="config-line">
          <span>DID registry:</span>
          <code>{config?.registrationAddress || "—"}</code>
        </div>
      </section>
    </div>
  );
}
