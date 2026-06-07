import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api.js";
import {
  connectWallet,
  switchWallet,
  ensureSepolia,
  hasMetaMask,
  friendlyError,
  SEPOLIA,
  DID_REGISTER_APP_URL,
} from "./lib/eth.js";
import VoterPage from "./pages/VoterPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [config, setConfig] = useState(null);
  const [tab, setTab] = useState("vote");
  const [connectErr, setConnectErr] = useState(null);
  const [registered, setRegistered] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      setConfig(await api.getConfig());
    } catch (e) {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // React to MetaMask account/chain changes.
  useEffect(() => {
    if (!hasMetaMask()) return;
    const onAccounts = (accounts) => {
      // Empty array => the user locked MetaMask or revoked access.
      if (!accounts || accounts.length === 0) {
        setWallet(null);
        setRegistered(null);
      } else {
        connect();
      }
    };
    const onChain = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshRegistration = useCallback(
    async (address) => {
      if (!address || !config?.registrationAddress) {
        setRegistered(null);
        return;
      }
      try {
        const { registered } = await api.isRegistered(address);
        setRegistered(registered);
      } catch {
        setRegistered(null);
      }
    },
    [config]
  );

  useEffect(() => {
    if (wallet?.address) refreshRegistration(wallet.address);
  }, [wallet, refreshRegistration]);

  async function connect() {
    setConnectErr(null);
    try {
      const w = await connectWallet();
      setWallet(w);
    } catch (e) {
      setConnectErr(friendlyError(e));
    }
  }

  async function changeWallet() {
    setConnectErr(null);
    setMenuOpen(false);
    try {
      const w = await switchWallet();
      setWallet(w);
      setRegistered(null);
    } catch (e) {
      setConnectErr(friendlyError(e));
    }
  }

  function disconnect() {
    setMenuOpen(false);
    setWallet(null);
    setRegistered(null);
  }

  async function switchNetwork() {
    try {
      await ensureSepolia();
      await connect();
    } catch (e) {
      setConnectErr(friendlyError(e));
    }
  }

  const onWrongNetwork =
    wallet && config?.chainId && wallet.chainId !== config.chainId;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🗳️</span>
          <div>
            <h1>ChainVote</h1>
            <p>Decentralized voting on {SEPOLIA.name}</p>
          </div>
        </div>

        <div className="topbar-right">
          <nav className="tabs">
            <button
              className={tab === "vote" ? "active" : ""}
              onClick={() => setTab("vote")}
            >
              Vote
            </button>
            <button
              className={tab === "admin" ? "active" : ""}
              onClick={() => setTab("admin")}
            >
              Admin
            </button>
          </nav>
          {wallet ? (
            <div className="wallet-menu">
              <button
                className="wallet-pill"
                title={wallet.address}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="dot" />
                {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                <span className="caret">▾</span>
              </button>
              {menuOpen && (
                <div className="wallet-dropdown">
                  <div className="wallet-dropdown-addr">{wallet.address}</div>
                  <button onClick={changeWallet}>Switch wallet / account</button>
                  <button onClick={disconnect}>Disconnect</button>
                </div>
              )}
            </div>
          ) : (
            <button className="connect" onClick={connect}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      <main className="content">
        {!hasMetaMask() && (
          <div className="card note warn">
            MetaMask is not installed.{" "}
            <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
              Install it
            </a>{" "}
            to connect and vote.
          </div>
        )}

        {connectErr && <div className="card note error">{connectErr}</div>}

        {!wallet && hasMetaMask() && (
          <div className="card hero">
            <h2>Connect your wallet to begin</h2>
            <p>
              Voting is done by sending a transaction from your own wallet, so your
              address proves who you are. Connect MetaMask to see open proposals.
            </p>
            <button className="connect big" onClick={connect}>
              Connect MetaMask
            </button>
          </div>
        )}

        {wallet && onWrongNetwork && (
          <div className="card note warn">
            You're connected to chain {wallet.chainId}, but the contracts live on chain{" "}
            {config.chainId}.{" "}
            <button className="link-btn" onClick={switchNetwork}>
              Switch to Sepolia
            </button>
          </div>
        )}

        {wallet && tab === "vote" && (
          <>
            {registered === false && (
              <div className="card note warn registration-banner">
                <div>
                  <strong>Your address has no DID credential.</strong> Voting is
                  gated by the on-chain DID registry — get a credential there
                  first, then come back to vote.
                </div>
                <a
                  className="submit"
                  href={DID_REGISTER_APP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Register a DID →
                </a>
              </div>
            )}
            {registered === true && (
              <div className="card note success compact">
                ✓ Your address holds a DID credential — you can vote.
              </div>
            )}
            <VoterPage wallet={wallet} config={config} />
          </>
        )}

        {wallet && tab === "admin" && (
          <AdminPage wallet={wallet} config={config} onConfigChange={loadConfig} />
        )}
      </main>

      <footer className="footer">
        Fully on-chain · reads via public RPC · votes &amp; deploys are signed in your
        wallet.
      </footer>
    </div>
  );
}
