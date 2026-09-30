import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Stats {
  queue: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
  successRate: number | null;
  perHour: { hour: string; count: number }[];
  senders: { email: string; used: number; limit: number }[];
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-[11px] text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function Analytics() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/api/stats'), refetchInterval: 5000 });
  if (isLoading) return <div className="m-6 h-40 animate-pulse rounded bg-field" />;
  if (isError || !data) return <p className="p-8 text-center text-xs text-red-600">Could not load analytics.</p>;

  const max = Math.max(1, ...data.perHour.map((h) => h.count));
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-base">Analytics</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Total emails" value={data.total} />
        <Tile label="Success rate" value={data.successRate === null ? '—' : `${data.successRate}%`} />
        <Tile label="Queue waiting / active" value={`${data.queue.waiting ?? 0} / ${data.queue.active ?? 0}`} />
        <Tile label="Queue delayed" value={data.queue.delayed ?? 0} />
      </div>

      <section>
        <h2 className="mb-2 text-xs font-medium">Sent per hour (last 24h)</h2>
        <div className="flex h-32 items-end gap-1 rounded-lg border border-line p-3" role="img" aria-label="Sent emails per hour">
          {data.perHour.map((h) => (
            <div key={h.hour} className="group relative flex-1" title={`${h.hour}:00Z — ${h.count}`}>
              <div className="w-full rounded-t bg-brand" style={{ height: `${(h.count / max) * 100}%`, minHeight: h.count ? 2 : 0 }} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium">Status breakdown</h2>
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(data.byStatus).map(([s, n]) => (
            <span key={s} className="rounded-full bg-field px-3 py-1">{s.replace('_', ' ')}: <b>{n}</b></span>
          ))}
          {!Object.keys(data.byStatus).length && <span className="text-ink-muted">No emails yet.</span>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium">Sender usage this hour</h2>
        <ul className="space-y-2">
          {data.senders.map((s) => (
            <li key={s.email} className="text-[11px]">
              <div className="mb-1 flex justify-between"><span>{s.email}</span><span>{s.used}/{s.limit}</span></div>
              <div className="h-1.5 rounded-full bg-field"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (s.used / s.limit) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
