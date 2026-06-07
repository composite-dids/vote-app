import { useEffect, useState } from "react";

function format(seconds) {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/**
 * Live countdown to a unix `target` (seconds). Calls onElapsed once when it
 * crosses zero so the parent can refresh proposal status.
 */
export default function Countdown({ target, label, onElapsed }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = target - now;
  useEffect(() => {
    if (remaining <= 0) onElapsed?.();
  }, [remaining <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span className="countdown">
      {label} <strong>{format(Math.max(0, remaining))}</strong>
    </span>
  );
}
