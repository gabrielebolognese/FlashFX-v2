import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, X, Plus, Send, Paperclip, HardDrive, Image as ImageIcon, Hash, AtSign,
  Copy, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, Square,
} from 'lucide-react';
import { usePanelStore } from '../../store/panels';

// VS Code / Copilot-style AI assistant — MOCKUP (no model). Assistant responses are borderless plain
// text with a thinking loader → streaming → a response timer; the user turn sits in a subtle box.
// The single seam for a real model is streamResponse() below: swap its body for a streaming client and
// the whole UI (thinking, token streaming, elapsed timer, stop, done state) already works.

type AttachKind = 'file' | 'drive' | 'image';
interface Attachment { id: string; name: string; kind: AttachKind }
interface Msg { id: string; role: 'user' | 'assistant'; text: string; streaming?: boolean; ms?: number; attachments?: Attachment[] }

let uid = 0;
const nextId = () => `m${++uid}`;

const REPLIES = [
  'Done. I added a position + scale keyframe intro with an ease-out and enabled an outer glow on the title. Scrub the timeline to preview, or tell me to tweak the easing.',
  "Here's what I changed:\n• Split the value text into per-digit odometers\n• Staggered the bars on a 40ms grid index\n• Rescaled the axis from the shared max\nWant motion blur on the reorder swaps too?",
  'I turned the selection into a data-bound repeater — 40 clips are now two repeaters, so adding rows is just a data change. Ask me to reorder them and they animate live.',
];

// The model seam. Currently streams a canned reply word-by-word after a short "thinking" delay.
// Returns a cancel handle. Replace the body with a real streaming client (SSE / fetch stream); keep
// the onToken / onDone(ms) contract and the UI is unchanged.
function streamResponse(prompt: string, cb: { onToken: (t: string) => void; onDone: (ms: number) => void }): { cancel: () => void } {
  let cancelled = false;
  const timers: number[] = [];
  const reply = REPLIES[Math.abs(hash(prompt)) % REPLIES.length];
  const tokens = reply.split(/(\s+)/); // keep whitespace so streaming looks natural
  const start = Date.now();
  timers.push(window.setTimeout(function think() {
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      if (i < tokens.length) {
        cb.onToken(tokens[i]); i++;
        timers.push(window.setTimeout(tick, 24 + Math.random() * 46));
      } else {
        cb.onDone(Date.now() - start);
      }
    };
    tick();
  }, 480 + Math.random() * 420));
  return { cancel: () => { cancelled = true; timers.forEach(clearTimeout); } };
}
function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function AiChatPanel() {
  const toggleAiChat = usePanelStore((s) => s.toggleAiChat);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const genRef = useRef<{ cancel: () => void } | null>(null);
  const tickRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const stopTick = useCallback(() => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } }, []);
  useEffect(() => () => { genRef.current?.cancel(); stopTick(); }, [stopTick]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const stop = useCallback(() => {
    genRef.current?.cancel(); genRef.current = null; stopTick(); setGenerating(false);
    setMessages((m) => m.map((x) => (x.streaming ? { ...x, streaming: false } : x)));
  }, [stopTick]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || generating) return;
    const userMsg: Msg = { id: nextId(), role: 'user', text, attachments: attachments.length ? attachments : undefined };
    const asstId = nextId();
    setMessages((m) => [...m, userMsg, { id: asstId, role: 'assistant', text: '', streaming: true }]);
    setDraft(''); setAttachments([]);
    setGenerating(true); setElapsed(0);
    const start = Date.now();
    tickRef.current = window.setInterval(() => setElapsed(Date.now() - start), 100);
    genRef.current = streamResponse(text, {
      onToken: (t) => setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, text: x.text + t } : x))),
      onDone: (ms) => { stopTick(); setGenerating(false); genRef.current = null; setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, streaming: false, ms } : x))); },
    });
  }, [draft, generating, attachments, stopTick]);

  const attach = (kind: AttachKind) => {
    const names: Record<AttachKind, string> = { file: 'timeline.ffx', drive: 'brand_kit.zip', image: 'reference.png' };
    setAttachments((a) => [...a, { id: nextId(), name: names[kind], kind }]);
  };
  const newChat = () => { stop(); setMessages([]); setAttachments([]); setDraft(''); };

  return (
    <aside className="flex-shrink-0 h-full flex flex-col bg-[#0b1220] border-l border-[#1a2a42]" style={{ width: '20%', minWidth: 260 }}>
      {/* Header */}
      <div className="h-9 flex-shrink-0 flex items-center gap-2 px-3 border-b border-[#1a2a42]">
        <Sparkles size={14} className="text-[#f7b500]" />
        <span className="text-[12px] font-semibold text-slate-200">AI Assistant</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#122240] text-slate-500 font-medium">Mockup</span>
        <div className="ml-auto flex items-center gap-1">
          <button title="New chat" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={newChat}><Plus size={13} /></button>
          <button title="Close" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={toggleAiChat}><X size={13} /></button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-600 px-2">
            <Sparkles size={22} />
            <p className="text-[12px] leading-relaxed">Ask the assistant to build, edit, or animate your scene.</p>
          </div>
        )}
        {messages.map((m) => m.role === 'user' ? (
          <div key={m.id} className="rounded-md bg-[#111a28] border border-[#1a2a42] px-3 py-2">
            {m.attachments && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {m.attachments.map((a) => <AttachChip key={a.id} a={a} />)}
              </div>
            )}
            <p className="text-[12px] leading-snug text-slate-200 whitespace-pre-wrap">{m.text}</p>
          </div>
        ) : (
          <div key={m.id} className="pl-0.5">
            {/* Borderless assistant response (VS Code style) */}
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-500">
              <Sparkles size={11} className="text-[#f7b500]" />
              <span className="font-medium text-slate-400">FlashFX AI</span>
              {m.streaming && m.text === '' && <ThinkingDots elapsed={elapsed} />}
              {!m.streaming && m.ms != null && <span>· {fmt(m.ms)}</span>}
            </div>
            {m.text && (
              <p className="text-[12.5px] leading-relaxed text-slate-300 whitespace-pre-wrap">
                {m.text}{m.streaming && <span className="inline-block w-[6px] h-[13px] -mb-[2px] ml-[1px] bg-slate-400 animate-pulse" />}
              </p>
            )}
            {!m.streaming && m.ms != null && (
              <div className="flex items-center gap-1 mt-1.5 text-slate-600">
                <IconBtn title="Copy"><Copy size={12} /></IconBtn>
                <IconBtn title="Good response"><ThumbsUp size={12} /></IconBtn>
                <IconBtn title="Bad response"><ThumbsDown size={12} /></IconBtn>
                <IconBtn title="Regenerate"><RotateCcw size={12} /></IconBtn>
                <span className="ml-1 text-[10px]">Generated in {fmt(m.ms)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 p-2 border-t border-[#1a2a42]">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {attachments.map((a) => (
              <AttachChip key={a.id} a={a} onRemove={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} />
            ))}
          </div>
        )}
        <div className="rounded-lg bg-[#0e1726] border border-[#1a2a42] focus-within:border-[#2a3a52]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder="Ask to build, edit, or animate…  (# for context, @ for a layer)"
            className="w-full bg-transparent resize-none text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none px-2.5 py-2 max-h-32"
          />
          {/* Toolbar of (mockup) composer actions */}
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <ToolBtn title="Attach file" onClick={() => attach('file')}><Paperclip size={13} /></ToolBtn>
            <ToolBtn title="Add from Drive" onClick={() => attach('drive')}><HardDrive size={13} /></ToolBtn>
            <ToolBtn title="Add image" onClick={() => attach('image')}><ImageIcon size={13} /></ToolBtn>
            <ToolBtn title="Add context" onClick={() => setDraft((d) => d + '#')}><Hash size={13} /></ToolBtn>
            <ToolBtn title="Reference a layer" onClick={() => setDraft((d) => d + '@')}><AtSign size={13} /></ToolBtn>
            <button title="Model" className="ml-1 flex items-center gap-1 px-1.5 h-6 rounded text-[10.5px] text-slate-400 hover:text-slate-200 hover:bg-white/5">
              FlashFX AI <ChevronDown size={11} />
            </button>
            <div className="ml-auto">
              {generating ? (
                <button onClick={stop} title="Stop" className="flex items-center justify-center w-7 h-7 rounded-md text-slate-200 bg-[#2a3a52] hover:bg-[#33445e]"><Square size={11} fill="currentColor" /></button>
              ) : (
                <button onClick={send} disabled={!draft.trim()} title="Send" className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${draft.trim() ? 'text-[#0e1c32] bg-[#f7b500] hover:bg-[#ffc21a]' : 'text-slate-600 bg-[#122240]'}`}><Send size={13} /></button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1 text-[9px] text-slate-600 text-center">Mockup — no model connected. Enter to send · Shift+Enter for newline</p>
      </div>
    </aside>
  );
}

function ThinkingDots({ elapsed }: { elapsed: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-[#f7b500] animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}
      </span>
      <span className="text-slate-500">Thinking… {fmt(elapsed)}</span>
    </span>
  );
}

function AttachChip({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const Icon = a.kind === 'drive' ? HardDrive : a.kind === 'image' ? ImageIcon : Paperclip;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#122240] border border-[#1a2a42] text-[10px] text-slate-300">
      <Icon size={10} className="text-slate-500" />
      {a.name}
      {onRemove && <button onClick={onRemove} className="text-slate-500 hover:text-slate-200"><X size={10} /></button>}
    </span>
  );
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button title={title} onClick={onClick} className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors">{children}</button>;
}
function IconBtn({ title, children }: { title: string; children: React.ReactNode }) {
  return <button title={title} className="p-1 rounded hover:text-slate-300 hover:bg-white/5 transition-colors">{children}</button>;
}
