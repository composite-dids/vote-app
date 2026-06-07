import { useState } from "react";
import Countdown from "./Countdown.jsx";
import { votingContract, friendlyError } from "../lib/eth.js";
import { api } from "../lib/api.js";

const statusLabel = {
  upcoming: "Upcoming",
  active: "Voting open",
  ended: "Closed",
};

export default function ProposalCard({
  proposal,
  config,
  signer,
  address,
  status,
  onChanged,
}) {
  const [choice, setChoice] = useState(null); // true=yes, false=no
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const total = proposal.yesCount + proposal.noCount;
  const yesPct = total ? Math.round((proposal.yesCount / total) * 100) : 0;
  const noPct = total ? 100 - yesPct : 0;

  const voted = status?.voted;
  const active = proposal.status === "active";
  // Registration is deliberately NOT a UI gate. A connected wallet can always
  // attempt to vote on an active proposal; whether the address is registered is
  // only checked when it votes — fetched from the registration contract in
  // submit() and ultimately enforced on-chain by Voting.vote(). Likewise `voted`
  // does not disable the button; a repeat vote is rejected by the pre-check.
  const canVote = active;

  async function submit() {
    if (choice === null) {
      setErr("Pick Yes or No first.");
      return;
    }
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      // Backend pre-check FIRST: a repeat vote is rejected immediately here,
      // before MetaMask is ever opened (no prompt, no gas, no on-chain revert).
      const pre = await api.precheckVote(proposal.id, address);
      if (!pre.allowed) {
        setErr(pre.reason);
        return;
      }
      const contract = votingContract(config, signer);
      const tx = await contract.vote(proposal.id, choice);
      setMsg("Submitting vote… waiting for confirmation.");
      await tx.wait();
      setMsg("✅ Vote confirmed on-chain!");
      onChanged?.();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card proposal ${proposal.status}`}>
      <div className="proposal-head">
        <h3>{proposal.topic}</h3>
        <span className={`badge ${proposal.status}`}>
          {statusLabel[proposal.status]}
        </span>
      </div>

      <div className="timing">
        {proposal.status === "upcoming" && (
          <Countdown
            label="Starts in"
            target={proposal.startTime}
            onElapsed={onChanged}
          />
        )}
        {proposal.status === "active" && (
          <Countdown label="Ends in" target={proposal.endTime} onElapsed={onChanged} />
        )}
        {proposal.status === "ended" && <span className="countdown">Voting closed</span>}
      </div>

      <div className="results">
        <div className="bar">
          <div className="bar-yes" style={{ width: `${yesPct}%` }} />
          <div className="bar-no" style={{ width: `${noPct}%` }} />
        </div>
        <div className="result-legend">
          <span className="yes">Yes · {proposal.yesCount} ({yesPct}%)</span>
          <span className="no">No · {proposal.noCount} ({noPct}%)</span>
        </div>
      </div>

      {/* Already-voted notice — informative only; it does NOT hide the controls
          or disable the button. A second submit is allowed to be attempted and
          gets rejected by the pre-check. */}
      {voted && (
        <div className="note success">
          You have already voted on this proposal. You can try again, but a
          repeat vote will be rejected.
        </div>
      )}

      {!active ? (
        <div className="note">Voting is not open right now.</div>
      ) : (
        <div className="vote-controls">
          <div className="choices">
            <button
              className={`choice yes ${choice === true ? "selected" : ""}`}
              onClick={() => setChoice(true)}
              disabled={busy}
            >
              👍 Yes
            </button>
            <button
              className={`choice no ${choice === false ? "selected" : ""}`}
              onClick={() => setChoice(false)}
              disabled={busy}
            >
              👎 No
            </button>
          </div>
          <button className="submit" onClick={submit} disabled={busy || !canVote}>
            {busy ? "Submitting…" : "Submit vote"}
          </button>
        </div>
      )}

      {msg && <div className="note success">{msg}</div>}
      {err && <div className="note error">{err}</div>}
    </div>
  );
}
