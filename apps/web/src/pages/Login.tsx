import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

const GoogleG = () => (
  <svg width="14" height="14" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export default function Login() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isDev = import.meta.env.DEV;

  // Email/password is rendered to match the design; only Google sign-in (and a dev shortcut) is wired.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDev) return toast('Please sign in with Google', 'err');
    setBusy(true);
    try {
      await api('/api/auth/dev-login', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err: any) {
      toast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center">
      <form onSubmit={submit} className="w-[292px] rounded-lg border border-line p-8">
        <h1 className="mb-6 text-center text-2xl font-semibold">Login</h1>
        <a href="/api/auth/google" className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-tint py-2.5 text-xs">
          <GoogleG /> Login with Google
        </a>
        <div className="my-4 flex items-center gap-2 text-[10px] text-ink-muted">
          <div className="h-px flex-1 bg-line" /> or sign up through email <div className="h-px flex-1 bg-line" />
        </div>
        <input className="input mb-2" placeholder="Email ID" type="email" />
        <input className="input mb-4" placeholder="Password" type="password" />
        <button className="btn-primary w-full" disabled={busy}>Login</button>
        {isDev && <p className="mt-3 text-center text-[10px] text-ink-muted">Dev mode: Login button signs in as the demo user.</p>}
      </form>
    </div>
  );
}
