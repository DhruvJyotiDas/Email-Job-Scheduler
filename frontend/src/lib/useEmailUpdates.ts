import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './toast';

interface Counts {
  scheduled: number;
  sent: number;
}

/**
 * Live-ish updates without websockets: the sidebar counts are polled, and when they change the email and sender
 * lists are refetched and a toast is shown for newly sent emails.
 */
export function useEmailUpdates(counts?: Counts) {
  const qc = useQueryClient();
  const toast = useToast();
  const prev = useRef<Counts>();

  useEffect(() => {
    if (!counts) return;
    const before = prev.current;
    prev.current = counts;
    if (!before || (before.sent === counts.sent && before.scheduled === counts.scheduled)) return;
    qc.invalidateQueries({ queryKey: ['emails'] });
    qc.invalidateQueries({ queryKey: ['senders'] });
    if (counts.sent > before.sent) toast(`${counts.sent - before.sent} email(s) sent`);
  }, [counts, qc, toast]);
}
