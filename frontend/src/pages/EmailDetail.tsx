import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Star } from 'lucide-react';
import { api, EmailRow } from '../lib/api';
import { useMe } from '../lib/auth';
import { Avatar } from '../components/Layout';

type Detail = EmailRow & { body: string; previewUrl: string | null };

export default function EmailDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: me } = useMe();
  const { data: e, isLoading, isError } = useQuery({ queryKey: ['email', id], queryFn: () => api<Detail>(`/api/emails/${id}`) });

  const when = e ? new Date(e.sentAt ?? e.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-line px-6 py-4">
        <button onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="flex-1 truncate text-base">{e?.subject ?? ''}</h1>
        <Star size={15} className={e?.starred ? 'fill-yellow-400 text-yellow-400' : 'text-ink-muted'} />
        {me && <Avatar me={me} size={26} />}
      </div>
      {isLoading && <div className="m-8 h-40 animate-pulse rounded bg-field" />}
      {isError && <p className="p-8 text-center text-xs text-red-600">Email not found.</p>}
      {e && (
        <div className="mx-auto max-w-[680px] p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-medium text-white">{(e.senderEmail ?? e.recipient)[0].toUpperCase()}</div>
            <div className="flex-1 text-xs">
              <div className="font-semibold">{e.senderEmail ?? 'Auto-selected sender'}</div>
              <div className="text-ink-muted">to {e.recipient}</div>
            </div>
            <div className="text-[11px] text-ink-muted">{when}</div>
          </div>
          {/* Sandboxed: user-authored HTML never runs script in the app origin. */}
          <iframe title="Email body" sandbox="" srcDoc={`<base target="_blank"><body style="font:13px Inter,system-ui,sans-serif;margin:0">${e.body}</body>`} className="h-[420px] w-full rounded-lg border border-line" />
          {e.error && <p className="mt-3 text-xs text-red-600">Error: {e.error}</p>}
          {e.previewUrl && (
            <a href={e.previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-brand">
              View delivered message on Ethereal <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
