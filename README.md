# ChainVote — Decentralized Voting dApp

A full voting application on **Sepolia**:

- **Smart contract** (Solidity + Hardhat) — `Voting` (proposals, yes/no tallies, time windows, double-vote protection). Eligibility is delegated to the **live composite-DID registry** already deployed on Sepolia (`0xb1768B404EB4102CCF4DBc0c9b661a17D48dcef8`) — the vote-app no longer ships its own registration contract; it reads that registry's on-chain `isRegistered` hashtable.
- **Backend** (Express + ethers) — admin login, read-only chain queries (proposals, time-left, registration status), and a vote pre-check that rejects a repeat/invalid vote before any wallet signature.
- **Frontend** (React + Vite + ethers v6) — connect MetaMask, vote on proposals with a live countdown, and an admin console to deploy contracts and publish proposals.

Votes and contract deployments are **signed in the browser via MetaMask**, so a voter's address is provable from the transaction (`msg.sender`). The backend never holds user keys.

---

## How a vote is validated (on-chain)

`Voting.vote(proposalId, support)` reverts unless **all** hold:

1. The proposal exists and `startTime <= now <= endTime` (period enforced in the contract).
2. `DIDRegistry.isRegistered(msg.sender)` returns `true` — the live composite-DID
   registry's hashtable says this address holds a DID credential (else "not registered").
3. `hasVoted[proposalId][msg.sender]` is `false` (the double-vote hashtable).

On success it increments `yesCount`/`noCount` and sets `hasVoted[...] = true`.

The UI **does not** disable the vote button after you've voted. A repeat attempt is
caught first by the backend pre-check (`/api/proposals/:id/precheck/:address`, mirrored
client-side in `api.precheckVote`) and rejected immediately — before MetaMask is opened,
so there's no prompt, no gas, and no on-chain revert. (The contract's `hasVoted` guard
is still the final backstop if someone bypasses the UI.)

---

## Project layout

```
contracts/         Voting.sol  (Registration.sol kept for reference; no longer deployed)
scripts/           deploy.js (CLI deploy of Voting), export-abi.js (Voting ABI -> frontend & backend)
test/              Voting.test.js (Hardhat tests)
backend/           Express API (server.js); contracts/DIDRegistry.json = registry read ABI
frontend/          React + Vite app; src/contracts/DIDRegistry.json = registry read ABI
shared/            deployment.json (deployed addresses, written by admin/CLI)
```

---

## Setup

Prerequisites: Node 18–22 recommended, MetaMask in your browser, and some Sepolia test ETH ([faucet](https://sepoliafaucet.com)).

### 1. Contracts

```bash
npm install        # in project root
npm run build      # compiles + exports ABIs to frontend/ and backend/
npm test           # optional: runs the contract test suite
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # then edit credentials / RPC if desired
npm start              # http://localhost:4000
```

Key `.env` settings: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET`, `RPC_URL`, `CHAIN_ID`.
`DID_REGISTRY` overrides the registry address the backend checks (defaults to the live one).

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (proxies /api -> :4000)
```

---

## Using it

### Admin

1. Open the app → **Admin** tab → sign in (default `admin` / `changeme`).
2. Connect your MetaMask wallet (on Sepolia).
3. **Deploy the Voting contract** — deploys `Voting` from your wallet, pointed at the live DID registry, and saves the address to the backend.
4. **Publish a proposal** — enter a topic and pick start/end times (the voting period).
5. **Voter registration is external** — eligibility comes from the DID registry; voters earn a credential in the composite-DID app, no admin action needed.

### Voter

1. **Vote** tab → connect MetaMask.
2. If your address has no DID credential, follow **Register a DID →** to the composite-DID
   app, earn a credential, then return. (Eligibility is read live from the DID registry.)
3. Pick **Yes**/**No** on an open proposal and **Submit** — confirm the tx in MetaMask.
4. The card shows a live countdown and the running tally. After voting it says you've already
   voted, but doesn't disable the button — a second attempt is rejected instantly by the
   pre-check (no MetaMask prompt).

---

## CLI deploy (alternative to the admin UI)

```bash
# root .env: SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY
npm run deploy:sepolia      # writes shared/deployment.json
```

Or run a local chain: `npm run node` then `npm run deploy:local`.

---

## API reference (backend)

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET  | `/api/health` | – | Liveness |
| POST | `/api/admin/login` | – | `{username,password}` → `{token}` |
| GET  | `/api/config` | – | Deployed addresses + chain info |
| POST | `/api/config` | admin | Record addresses after browser deploy |
| GET  | `/api/proposals` | – | All proposals with status + `secondsLeft` |
| GET  | `/api/proposals/:id` | – | One proposal |
| GET  | `/api/proposals/:id/status/:address` | – | `{isRegistered, voted, active}` |
| GET  | `/api/proposals/:id/precheck/:address` | – | `{allowed, reason}` — rejects a repeat/invalid vote before signing |
| GET  | `/api/registered/:address` | – | DID-registry check (`isRegistered`) proxy |

---

## Deploy the frontend to GitHub Pages (static, no backend)

The frontend can run fully client-side: it reads chain state through a public
Sepolia RPC and signs votes/deploys via MetaMask. No server is needed.

1. **Repo name must match the base path.** The site lives at
   `https://<account>.github.io/vote-app/`, so the repo must be named `vote-app`
   (the Vite `base` is `/vote-app/`; override with the `VITE_BASE` env var if you
   fork to a different name).
2. **Commit the deployed addresses.** `frontend/public/config.json` holds the
   `Registration`/`Voting` addresses, chain id, and RPC URL that every visitor
   uses. It's already filled in with your deployed contracts.
3. **Push to `main`.** The included workflow (`.github/workflows/deploy.yml`)
   builds `frontend/` and publishes `dist/` to Pages.
4. **Enable Pages:** repo **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.
5. Open `https://<account>.github.io/vote-app/`.

To change contracts later: deploy from the Admin tab, copy the shown
`config.json` snippet into `frontend/public/config.json`, commit, and push.

> The `adminUsername`/`adminPassword` in `config.json` are a **cosmetic** gate
> only (the file is public). Real protection is on-chain: admin actions
> (`createProposal`, `registerVoter`) only succeed from the wallet that owns the
> contracts. For production reads, replace the public `rpcUrl` with your own
> Alchemy/Infura endpoint to avoid rate limits.

## Notes / security

- Admin auth is a simple username/password → JWT for the demo. Use a real identity provider and strong `JWT_SECRET` in production.
- The on-chain owner of `Registration`/`Voting` is whichever wallet deployed them — keep admin login and that wallet aligned.
- `shared/deployment.json` and `.env` files hold environment-specific data; don't commit secrets.
