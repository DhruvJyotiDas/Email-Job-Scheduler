import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import {
  AlignCenter, ArrowLeft, Bold, Calendar, Clock, Italic, List, ListOrdered, Quote, Redo2, Strikethrough,
  Underline as UnderlineIcon, Undo2, Upload,
} from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { spamCheck } from '@shared/spam';
import { api, SenderRow } from '../lib/api';
import { useToast } from '../lib/toast';

interface Recipient { email: string; variables?: Record<string, string> }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** datetime-local value in the *browser's* timezone; we convert to UTC ISO on submit. */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const tomorrowAt = (h?: number) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (h === undefined) return d;
  d.setHours(h, 0, 0, 0);
  return d;
};

function SendLaterPopover({ value, onDone, onCancel }: { value: Date | null; onDone: (d: Date | null) => void; onCancel: () => void }) {
  const [v, setV] = useState(value ? toLocalInput(value) : '');
  const opts: [string, Date][] = [
    ['Tomorrow', tomorrowAt()],
    ['Tomorrow, 10:00 AM', tomorrowAt(10)],
    ['Tomorrow, 11:00 AM', tomorrowAt(11)],
    ['Tomorrow, 3:00 PM', tomorrowAt(15)],
  ];
  return (
    <div className="absolute right-0 top-9 z-20 w-[230px] rounded-lg border border-line bg-white p-4 shadow-xl">
      <div className="mb-3 text-xs font-medium">Send Later</div>
      <div className="relative mb-3">
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} className="w-full border-b border-line pb-1 text-[11px] outline-none" />
        <Calendar size={12} className="pointer-events-none absolute right-0 top-0 text-ink-muted" />
      </div>
      <div className="mb-4 space-y-2.5">
        {opts.map(([label, d]) => (
          <button key={label} type="button" onClick={() => setV(toLocalInput(d))} className="block w-full text-left text-[11px] hover:text-brand">
            {label}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 text-[11px]">Cancel</button>
        <button type="button" onClick={() => onDone(v ? new Date(v) : null)} className="btn-outline py-1">Done</button>
      </div>
    </div>
  );
}

export default function Compose() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: senders } = useQuery({ queryKey: ['senders'], queryFn: () => api<SenderRow[]>('/api/senders') });

  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const [delaySec, setDelaySec] = useState('2');
  const [hourly, setHourly] = useState('200');
  const [when, setWhen] = useState<Date | null>(null);
  const [showLater, setShowLater] = useState(false);
  const [csvInfo, setCsvInfo] = useState<{ valid: number; invalid: number } | null>(null);

  const [html, setHtml] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAi, setShowAi] = useState(false);
  const { data: ai } = useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ enabled: boolean; remaining: number }>('/api/ai/status') });

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextAlign.configure({ types: ['paragraph'] })],
    content: '',
    editorProps: { attributes: { 'data-placeholder': 'Type Your Reply…' } },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  const spam = spamCheck(subject, html);

  const generate = useMutation({
    mutationFn: () =>
      api<{ subject: string; body: string; cached: boolean; remaining?: number }>('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt }),
      }),
    onSuccess: (r) => {
      setSubject(r.subject);
      editor?.commands.setContent(r.body);
      setHtml(r.body);
      setShowAi(false);
      qc.invalidateQueries({ queryKey: ['ai-status'] });
      toast(r.cached ? 'Draft loaded from cache (no AI credits used)' : 'Draft generated');
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const addDraft = () => {
    const parts = draft.split(/[\s,;]+/).filter(Boolean);
    const bad = parts.filter((p) => !EMAIL_RE.test(p));
    if (bad.length) toast(`Invalid email: ${bad[0]}`, 'err');
    const good = parts.filter((p) => EMAIL_RE.test(p));
    setRecipients((r) => dedupe([...r, ...good.map((email) => ({ email }))]));
    setDraft(bad.join(' '));
  };

  const onCsv = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const emailKey = res.meta.fields?.find((f) => /^e-?mail/i.test(f));
        if (!emailKey) return toast('CSV needs an "email" column', 'err');
        const valid: Recipient[] = [];
        let invalid = 0;
        for (const row of res.data) {
          const email = (row[emailKey] ?? '').trim();
          if (!EMAIL_RE.test(email)) { invalid++; continue; }
          const { [emailKey]: _e, ...vars } = row;
          valid.push({ email, variables: vars });
        }
        const merged = dedupe([...recipients, ...valid]);
        setRecipients(merged);
        setCsvInfo({ valid: valid.length, invalid });
        toast(`${valid.length} emails detected${invalid ? `, ${invalid} invalid skipped` : ''}`);
      },
      error: (e) => toast(e.message, 'err'),
    });
  };

  const submit = useMutation({
    mutationFn: () => {
      if (!recipients.length) throw new Error('Add at least one recipient');
      if (!subject.trim()) throw new Error('Subject is required');
      const html = editor?.getHTML() ?? '';
      if (!editor?.getText().trim()) throw new Error('Email body is empty');
      const startAt = when && when.getTime() > Date.now() ? when : new Date(Date.now() + 5000);
      return api<{ total: number; duplicate: boolean }>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          senderId: senderId || undefined,
          recipients, subject, body: html,
          startAt: startAt.toISOString(),
          delayMs: Math.round(Number(delaySec || 0) * 1000),
          hourlyLimit: Number(hourly || 200),
        }),
      });
    },
    onSuccess: (r) => {
      toast(r.duplicate ? `Already scheduled (${r.total} emails) - no duplicates created` : `Scheduled ${r.total} emails`);
      qc.invalidateQueries({ queryKey: ['emails'] });
      qc.invalidateQueries({ queryKey: ['counts'] });
      nav('/scheduled');
    },
    onError: (e: Error) => toast(e.message, 'err'),
  });

  const shown = recipients.slice(0, 3);
  const tb = (active: boolean) => `grid h-7 w-7 place-items-center rounded ${active ? 'bg-brand-tint text-brand' : 'hover:bg-line'}`;

  return (
    <div className="mx-auto h-full max-w-[900px] overflow-y-auto px-6 py-6">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => nav(-1)} aria-label="Back"><ArrowLeft size={18} /></button>
        <h1 className="flex-1 text-base">Compose New Email</h1>
        <div className="relative flex items-center gap-3">
          <button type="button" onClick={() => setShowLater((s) => !s)} aria-label="Send later" className={when ? 'text-brand' : 'text-ink-muted'}>
            <Clock size={16} />
          </button>
          <button className="btn-outline" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? 'Scheduling…' : when ? 'Send Later' : 'Send'}
          </button>
          {showLater && (
            <SendLaterPopover
              value={when}
              onCancel={() => setShowLater(false)}
              onDone={(d) => {
                if (d && d.getTime() <= Date.now()) return toast('Pick a time in the future', 'err');
                setWhen(d);
                setShowLater(false);
              }}
            />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[700px] space-y-4 text-xs">
        <Row label="From">
          <select value={senderId} onChange={(e) => setSenderId(e.target.value)} className="rounded-full bg-field px-3 py-1.5 outline-none">
            <option value="">Auto-rotate all senders</option>
            {senders?.map((s) => <option key={s.id} value={s.id}>{s.email}</option>)}
          </select>
          {senders && !senders.length && <a href="/senders" className="ml-3 text-brand">Add a sender first</a>}
        </Row>

        <Row label="To">
          <div className="flex flex-1 flex-wrap items-center gap-1.5 border-b border-line pb-1.5">
            {shown.map((r) => (
              <span key={r.email} className="rounded-full border border-brand px-2.5 py-0.5 text-[11px] text-brand">
                {r.email}
                <button className="ml-1.5" onClick={() => setRecipients((x) => x.filter((y) => y.email !== r.email))} aria-label={`Remove ${r.email}`}>×</button>
              </span>
            ))}
            {recipients.length > 3 && <span className="rounded-full border border-brand px-2.5 py-0.5 text-[11px] text-brand">+{recipients.length - 3}</span>}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (['Enter', ',', ' '].includes(e.key) && draft.trim()) { e.preventDefault(); addDraft(); } }}
              onBlur={() => draft.trim() && addDraft()}
              placeholder={recipients.length ? '' : 'recipient@example.com'}
              className="min-w-[140px] flex-1 bg-transparent outline-none"
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="ml-auto flex items-center gap-1 text-brand">
              <Upload size={13} /> Upload List
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsv(f); e.target.value = ''; }} />
          </div>
        </Row>
        {recipients.length > 0 && (
          <p className="pl-[78px] text-[11px] text-brand">
            ✅ {recipients.length.toLocaleString()} recipient{recipients.length === 1 ? '' : 's'} ready
            {csvInfo?.invalid ? <span className="text-red-600"> · {csvInfo.invalid} invalid rows skipped</span> : null}
            <button className="ml-3 text-ink-muted underline" onClick={() => { setRecipients([]); setCsvInfo(null); }}>clear</button>
          </p>
        )}

        <Row label="Subject">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="flex-1 border-b border-line bg-transparent pb-1.5 outline-none" />
        </Row>

        <div className="flex items-center gap-3 pl-[78px]">
          <label className="flex items-center gap-2">Delay between 2 emails
            <input value={delaySec} onChange={(e) => setDelaySec(e.target.value.replace(/\D/g, ''))} placeholder="00" className="w-12 rounded bg-field px-2 py-1 text-center outline-none" />
            <span className="text-ink-muted">sec</span>
          </label>
          <label className="flex items-center gap-2">Hourly Limit
            <input value={hourly} onChange={(e) => setHourly(e.target.value.replace(/\D/g, ''))} placeholder="00" className="w-14 rounded bg-field px-2 py-1 text-center outline-none" />
          </label>
        </div>
        {when && <p className="pl-[78px] text-[11px] text-ink-muted">Scheduled for {when.toLocaleString()} ({Intl.DateTimeFormat().resolvedOptions().timeZone}) · stored as UTC</p>}
        <div className="flex flex-wrap items-center gap-3 pl-[78px]">
          <button type="button" disabled={!ai?.enabled} onClick={() => setShowAi((s) => !s)} className="flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-[11px] text-brand disabled:opacity-50" title={ai?.enabled ? '' : 'AI is not configured'}>
            <Sparkles size={12} /> Generate with AI{ai?.enabled ? ` (${ai.remaining} left today)` : ''}
          </button>
          {(subject || html) && (
            <span
              title={spam.issues.join('\n') || 'No issues found'}
              className={`rounded-full px-3 py-1 text-[11px] ${spam.level === 'good' ? 'bg-brand-tint text-brand' : spam.level === 'warn' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-700'}`}
            >
              Spam score: {spam.score}/100 {spam.level === 'good' ? '✅ Looks good' : spam.level === 'warn' ? '⚠ Review' : '⛔ Likely spam'}
            </span>
          )}
        </div>
        {showAi && (
          <div className="ml-[78px] flex gap-2">
            <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="e.g. Intro email offering a free product demo to SaaS founders" className="input flex-1" maxLength={400} />
            <button type="button" className="btn-primary" disabled={generate.isPending || aiPrompt.trim().length < 5} onClick={() => generate.mutate()}>
              {generate.isPending ? 'Writing…' : 'Generate'}
            </button>
          </div>
        )}
        {spam.issues.length > 0 && <p className="pl-[78px] text-[11px] text-ink-muted">{spam.issues.join(' · ')}</p>}
        <p className="pl-[78px] text-[11px] text-ink-muted">Personalize with {'{{firstName}}'} from CSV columns, and vary wording with {'{Hi|Hello|Hey}'}.</p>

        <div className="rounded-lg bg-field">
          <EditorContent editor={editor} />
          {editor && (
            <div className="m-2 flex flex-wrap items-center gap-0.5 rounded-full bg-white px-3 py-1">
              <button type="button" className={tb(false)} onClick={() => editor.chain().focus().undo().run()} aria-label="Undo"><Undo2 size={14} /></button>
              <button type="button" className={tb(false)} onClick={() => editor.chain().focus().redo().run()} aria-label="Redo"><Redo2 size={14} /></button>
              <span className="mx-1 h-4 w-px bg-line" />
              <button type="button" className={tb(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold"><Bold size={14} /></button>
              <button type="button" className={tb(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic size={14} /></button>
              <button type="button" className={tb(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Underline"><UnderlineIcon size={14} /></button>
              <span className="mx-1 h-4 w-px bg-line" />
              <button type="button" className={tb(editor.isActive({ textAlign: 'center' }))} onClick={() => editor.chain().focus().setTextAlign(editor.isActive({ textAlign: 'center' }) ? 'left' : 'center').run()} aria-label="Center"><AlignCenter size={14} /></button>
              <button type="button" className={tb(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list"><ListOrdered size={14} /></button>
              <button type="button" className={tb(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list"><List size={14} /></button>
              <button type="button" className={tb(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="Quote"><Quote size={14} /></button>
              <button type="button" className={tb(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="Strikethrough"><Strikethrough size={14} /></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-[62px] shrink-0 text-[11px]">{label}</span>
      {children}
    </div>
  );
}

function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = r.email.toLowerCase();
    return seen.has(k) ? false : (seen.add(k), true);
  });
}
