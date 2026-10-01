import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ChevronDown, Clock, FlaskConical, LogOut, Send, Users, Slack } from 'lucide-react';
import { api, Me } from '../lib/api';
import { useEmailUpdates } from '../lib/useEmailUpdates';
import { useToast } from '../lib/toast';

export function Logo() {
  return <span className="font-pixel text-[26px] leading-none tracking-tight">ONB</span>;
}

export function Avatar({ me, size = 28 }: { me: Pick<Me, 'name' | 'avatarUrl'>; size?: number }) {
  return me.avatarUrl ? (
    <img src={me.avatarUrl} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div style={{ width: size, height: size }} className="grid place-items-center rounded-full bg-brand text-xs font-medium text-white">
      {me.name[0]}
    </div>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${isActive ? 'bg-brand-tint font-medium' : 'hover:bg-field'}`;

export default function Layout({ me }: { me: Me }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const loadDemo = useMutation({
    mutationFn: (mode?: 'ratelimit') =>
      api<{ created: { total: number }[] }>(`/api/demo${mode ? `?mode=${mode}` : ''}`, { method: 'POST' }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      toast(`Loaded ${r.created.reduce((n, c) => n + c.total, 0)} demo emails`);
      nav('/scheduled');
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });
  const { data: counts } = useQuery({ queryKey: ['counts'], refetchInterval: 5000, queryFn: () => api<{ scheduled: number; sent: number }>('/api/emails/counts') });
  useEmailUpdates(counts);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    qc.clear();
    window.location.href = '/';
  };

  return (
    <div className="flex h-full">
      <aside className="w-[210px] shrink-0 border-r border-line p-4">
        <Logo />
        <div className="relative mt-4">
          <button onClick={() => setMenu((m) => !m)} className="flex w-full items-center gap-2 rounded-lg bg-field p-2 text-left">
            <Avatar me={me} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{me.name}</div>
              <div className="truncate text-[10px] text-ink-muted">{me.email}</div>
            </div>
            <ChevronDown size={14} className="text-ink-muted" />
          </button>
          {menu && (
            <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-line bg-white p-1 shadow-lg">
              {me.slackConnected ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-brand"><Slack size={13} /> Slack connected</div>
              ) : (
                <a href="/api/slack/connect" className="flex items-center gap-2 rounded px-3 py-2 text-xs hover:bg-field"><Slack size={13} /> Connect Slack</a>
              )}
              <a href="/admin/queues" target="_blank" className="block rounded px-3 py-2 text-xs hover:bg-field">Queue dashboard</a>
              <button onClick={logout} className="flex w-full items-center gap-2 rounded px-3 py-2 text-xs hover:bg-field"><LogOut size={13} /> Logout</button>
            </div>
          )}
        </div>
        <button onClick={() => nav('/compose')} className="btn-outline mt-4 w-full">Compose</button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={() => loadDemo.mutate(undefined)}
            disabled={loadDemo.isPending}
            title="Add sample campaigns: one sends now, one stays scheduled for the restart demo"
            className="flex items-center justify-center gap-1 rounded-lg bg-field py-1.5 text-[11px] hover:bg-line disabled:opacity-60"
          >
            <FlaskConical size={12} /> {loadDemo.isPending ? 'Loading…' : 'Demo data'}
          </button>
          <button
            onClick={() => loadDemo.mutate('ratelimit')}
            disabled={loadDemo.isPending}
            title="15 emails with an hourly limit of 3: shows rescheduling and the Slack alert"
            className="flex items-center justify-center gap-1 rounded-lg bg-field py-1.5 text-[11px] hover:bg-line disabled:opacity-60"
          >
            <FlaskConical size={12} /> Rate limit
          </button>
        </div>
        <div className="mb-2 mt-6 px-3 text-[10px] font-medium uppercase tracking-wider text-ink-muted">Core</div>
        <nav className="space-y-1">
          <NavLink to="/scheduled" className={navCls}>
            <Clock size={14} /> <span className="flex-1">Scheduled</span>
            <span className="text-[11px] text-ink-muted">{counts?.scheduled ?? 0}</span>
          </NavLink>
          <NavLink to="/sent" className={navCls}>
            <Send size={14} /> <span className="flex-1">Sent</span>
            <span className="text-[11px] text-ink-muted">{counts?.sent ?? 0}</span>
          </NavLink>
          <NavLink to="/senders" className={navCls}>
            <Users size={14} /> <span className="flex-1">Senders</span>
          </NavLink>
          <NavLink to="/analytics" className={navCls}>
            <BarChart3 size={14} /> <span className="flex-1">Analytics</span>
          </NavLink>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto"><Outlet /></main>
    </div>
  );
}
