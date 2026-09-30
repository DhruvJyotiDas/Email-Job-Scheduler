import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { EmailUpdateEvent } from '@ejs/shared';
import { useToast } from './toast';

// Mirrors SOCKET_EVENT_EMAIL in @ejs/shared (the shared package is CJS + uses node:crypto, so the browser imports types only).
const SOCKET_EVENT_EMAIL = 'email:update';

/** Live status updates: invalidates list/count queries and toasts on each send. */
export function useEmailEvents() {
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    const socket = io({ withCredentials: true });
    socket.on(SOCKET_EVENT_EMAIL, (ev: EmailUpdateEvent) => {
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['counts'] });
      qc.invalidateQueries({ queryKey: ['senders'] });
      if (ev.status === 'sent') toast(`Email sent to ${ev.recipient}${ev.senderEmail ? ` from ${ev.senderEmail}` : ''}`);
      if (ev.status === 'failed') toast(`Failed to send to ${ev.recipient}`, 'err');
    });
    return () => void socket.disconnect();
  }, [qc, toast]);
}
