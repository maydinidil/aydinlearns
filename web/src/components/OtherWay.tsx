// web/src/components/OtherWay.tsx: "Other ways to write this" (sprint 4a Task D1; S4-11, S4-12). After a pass, one different correct query
// from the answer key with a one-line trade-off. Opening asks the server, which writes one other_way_opened; closing and opening again shows
// the same text without asking again.
import { useState } from 'react';
import { api } from '../api.ts';
import type { Phase } from '../../../core/envelope.ts';
import { OTHER_WAY_BUTTON, otherWayFailure } from '../lib/other-way.ts';
import { SqlCode } from './SqlCode.tsx';

export function OtherWay({ itemId, instanceId, phase }: { itemId: string; instanceId: string; phase: Phase }) {
  const [shown, setShown] = useState<{ sql: string; tradeoff: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    if (open) { setOpen(false); return; }
    if (shown) { setOpen(true); return; }
    setBusy(true); setMessage(null);
    try {
      setShown(await api.otherWay(itemId, instanceId, phase));
      setOpen(true);
    } catch (e) { setMessage(otherWayFailure(e)); } finally { setBusy(false); }
  }

  return (
    <div className="other-way">
      <button type="button" className="link-quiet" aria-expanded={open} onClick={() => void toggle()} disabled={busy}>{OTHER_WAY_BUTTON}</button>
      {message && <p role="alert">{message}</p>}
      {open && shown && (
        <div>
          <SqlCode sql={shown.sql} />
          <p className="muted">{shown.tradeoff}</p>
        </div>
      )}
    </div>
  );
}
