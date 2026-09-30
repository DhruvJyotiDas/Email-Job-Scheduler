import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Filter, RefreshCw, Search, Star } from 'lucide-react';
import { api, EmailRow } from '../lib/api';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' });

function Badge({ e }: { e: EmailRow }) {
  if (e.status === 'sent') return <span className="shrink-0 rounded-md bg-field px-2 py-0.5 text-[11px]">Sent</span>;
  if (e.status === 'failed') return <span className="shrink-0 rounded-md bg-red-100 px-2 py-0.5 text-[11px] text-red-700" title={e.error ?? ''}>Failed</span>;
  if (e.status === 'suppressed') return <span className="shrink-0 rounded-md bg-field px-2 py-0.5 text-[11px]">Suppressed</span>;
  const label = e.status === 'sending' ? 'Sending…' : e.status === 'delayed_ratelimit' ? `Rate-limited · ${fmtTime(e.scheduledAt)}` : fmtTime(e.scheduledAt);
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-sched-bg px-2 py-0.5 text-[11px] text-sched-fg">
      <Clock size={11} /> {label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-field" />)}
    </div>
  );
}

export default function Dashboard({ tab }: { tab: 'scheduled' | 'sent' }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['emails', tab, debounced],
    queryFn: () =>
      debounced
        ? api<EmailRow[]>(`/api/emails/search?tab=${tab}&q=${encodeURIComponent(debounced)}`)
        : api<EmailRow[]>(`/api/emails?tab=${tab}`),
  });

  const star = useMutation({
    mutationFn: (id: string) => api(`/api/emails/${id}/star`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emails'] }),
  });

  return (
    <div>
      <div className="flex items-center gap-3 p-4">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full rounded-full bg-field py-2 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <Filter size={15} className="text-ink-muted" />
        <button onClick={() => qc.invalidateQueries({ queryKey: ['emails'] })} title="Refresh">
          <RefreshCw size={15} className={`text-ink-muted ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : isError ? (
        <p className="p-8 text-center text-xs text-red-600">Could not load emails. Is the API running?</p>
      ) : !data?.length ? (
        <div className="p-16 text-center text-xs text-ink-muted">
          {debounced ? `No results for “${debounced}”.` : tab === 'scheduled' ? 'No scheduled emails yet. Compose your first campaign.' : 'Nothing sent yet.'}
        </div>
      ) : (
        <ul>
          {data.map((e) => (
            <li
              key={e.id}
              onClick={() => nav(`/email/${e.id}`)}
              className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 hover:bg-field/60"
            >
              <span className="w-[170px] shrink-0 truncate text-xs" dangerouslySetInnerHTML={{ __html: `To: ${e.highlight?.recipient?.[0] ?? esc(e.recipient)}` }} />
              <Badge e={e} />
              <span className="min-w-0 flex-1 truncate text-xs">
                <b className="font-semibold" dangerouslySetInnerHTML={{ __html: e.highlight?.subject?.[0] ?? esc(e.subject) }} />
                <span className="text-ink-muted"> - <span dangerouslySetInnerHTML={{ __html: e.highlight?.body?.[0] ? stripTags(e.highlight.body[0]) : esc(e.preview) }} /></span>
              </span>
              <button
                onClick={(ev) => { ev.stopPropagation(); star.mutate(e.id); }}
                aria-label="Star"
              >
                <Star size={14} className={e.starred ? 'fill-yellow-400 text-yellow-400' : 'text-ink-muted'} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** ES highlights are already HTML-encoded (server uses encoder: html); drop any tags except <mark>. */
const stripTags = (s: string) => s.replace(/<(?!\/?mark>)[^>]*>/g, '');
