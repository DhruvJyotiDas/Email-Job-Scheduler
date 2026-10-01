import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, SenderRow } from '../lib/api';
import { useToast } from '../lib/toast';

export default function Senders() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['senders'], queryFn: () => api<SenderRow[]>('/api/senders'), refetchInterval: 5000 });

  const [manual, setManual] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const add = useMutation({
    mutationFn: (creds?: { user: string; pass: string }) => api<{ smtpWarning?: string }>('/api/senders/ethereal', { method: 'POST', body: JSON.stringify(creds ?? {}) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['senders'] });
      toast(r.smtpWarning ? `Sender added. The API could not reach SMTP (${r.smtpWarning}); the worker will try when sending.` : 'Ethereal sender added');
      setManual(false); setUser(''); setPass(''); },
    onError: (e: Error) => toast(e.message, 'err'),
  });
  const toggle = useMutation({
    mutationFn: (s: SenderRow) => api(`/api/senders/${s.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !s.isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['senders'] }),
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center">
        <h1 className="flex-1 text-base">Senders</h1>
        <button className="btn-outline mr-2" onClick={() => setManual((m) => !m)}>Use my Ethereal login</button>
        <button className="btn-outline flex items-center gap-1" onClick={() => add.mutate(undefined)} disabled={add.isPending}>
          <Plus size={13} /> {add.isPending ? 'Creating…' : 'Add Ethereal sender'}
        </button>
      </div>
      {manual && (
        <form
          onSubmit={(e) => { e.preventDefault(); add.mutate({ user, pass }); }}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-line p-4 text-xs"
        >
          <p className="w-full text-ink-muted">
            Create a free account at <a className="text-brand underline" href="https://ethereal.email/create" target="_blank" rel="noreferrer">ethereal.email/create</a> and paste its SMTP username and password here.
          </p>
          <input className="input w-64" placeholder="Ethereal username (name@ethereal.email)" value={user} onChange={(e) => setUser(e.target.value)} required />
          <input className="input w-48" placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} required />
          <button className="btn-primary" disabled={add.isPending}>{add.isPending ? 'Checking…' : 'Add sender'}</button>
        </form>
      )}
      <p className="mb-4 text-xs text-ink-muted">Campaigns rotate across active senders; when one hits its hourly cap, sends flow to the next with headroom.</p>
      {isLoading ? <div className="h-24 animate-pulse rounded bg-field" /> : !data?.length ? (
        <div className="rounded-lg border border-dashed border-line p-10 text-center text-xs text-ink-muted">No senders yet. Add one to start sending.</div>
      ) : (
        <ul className="space-y-2">
          {data.map((s) => {
            const pct = Math.min(100, (s.usedThisHour / s.hourlyLimit) * 100);
            return (
              <li key={s.id} className="rounded-lg border border-line p-4">
                <div className="mb-2 flex items-center text-xs">
                  <span className="flex-1 font-medium">{s.email}</span>
                  <button onClick={() => toggle.mutate(s)} className={`rounded-full px-3 py-0.5 text-[11px] ${s.isActive ? 'bg-brand-tint text-brand' : 'bg-field text-ink-muted'}`}>
                    {s.isActive ? 'Active' : 'Paused'}
                  </button>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-field">
                  <div className={`h-full ${pct >= 100 ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-ink-muted">{s.usedThisHour} / {s.hourlyLimit} this hour</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
