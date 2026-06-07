import { useCallback, useEffect, useState } from "react";
import { api } from "./lib/api.js";
import {
  connectWallet,
  switchWallet,
  ensureSepolia,
  hasMetaMask,
  registrationContract,
  friendlyError,
  SEPOLIA,
} from "./lib/eth.js";
import VoterPage from "./pages/VoterPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [config, setConfig] = useState(null);
  const [tab, setTab] = useState("vote");
  const [connectErr, setConnectErr] = useState(null);
  const [registered, setRegistered] = useState(null);
  const [regBusy, setRegBusy] = useState(false);
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

  async function selfRegister() {
    setRegBusy(true);
    try {
      const contract = registrationContract(
        config.registrationAddress,
        wallet.signer
      );
      const tx = await contract.register();
      await tx.wait();
      await refreshRegistration(wallet.address);
    } catch (e) {
      setConnectErr(friendlyError(e));
    } finally {
      setRegBusy(false);
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
            {config?.registrationAddress && registered === false && (
              <div className="card note warn registration-banner">
                <div>
                  <strong>Your address is not registered.</strong> You must be
                  registered before you can vote.
                </div>
                <button className="submit" onClick={selfRegister} disabled={regBusy}>
                  {regBusy ? "Registering…" : "Register me"}
                </button>
              </div>
            )}
            {registered === true && (
              <div className="card note success compact">
                ✓ Your address is registered to vote.
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
        Backend reads chain state · votes &amp; deploys are signed in your wallet.
      </footer>
    </div>
  );
}
