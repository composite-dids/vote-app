import { useCallback, useEffect, useState } from "react";
import ProposalCard from "../components/ProposalCard.jsx";
import { api } from "../lib/api.js";

export default function VoterPage({ wallet, config }) {
  const [proposals, setProposals] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!config?.votingAddress) {
      setError("No voting contract is configured yet. Ask the admin to deploy one.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const { proposals } = await api.getProposals();
      setProposals(proposals);
      if (wallet?.address) {
        const entries = await Promise.all(
          proposals.map(async (p) => {
            try {
              const s = await api.getStatus(p.id, wallet.address);
              return [p.id, s];
            } catch {
              return [p.id, null];
            }
          })
        );
        setStatuses(Object.fromEntries(entries));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [config, wallet]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000); // keep counts/time fresh
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <div className="card">Loading proposals…</div>;
  if (error) return <div className="card note warn">{error}</div>;
  if (!proposals.length)
    return <div className="card">No proposals have been published yet.</div>;

  return (
    <div className="proposal-list">
      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          config={config}
          signer={wallet.signer}
          address={wallet.address}
          status={statuses[p.id]}
          onChanged={load}
        />
      ))}
    </div>
  );
}
