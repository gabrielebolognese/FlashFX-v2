import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Plus, Send, Square, KeyRound, Check, Trash2 } from 'lucide-react';
import { usePanelStore } from '../../store/panels';
import { useEditorStore } from '../../store/editor';
import { useProjectStore } from '../../project-system/hooks/useProjectStore';
import { useAiChatStore, EMPTY_CONVERSATION, convKey, type AiMsg } from '../../store/aiChat';
import { useAiSettingsStore, isAiConfigured, makeAiClient } from '../../store/aiSettings';
import { useIslandStore } from '../island/islandStore';

// AI assistant, wired to the REAL pipeline (Director → Coder → assemble → auto-fix). A prompt
// generates a whole scene and commits it as ONE undo step (Ctrl+Z reverts). The heavy engine (+zod
// +prompts) is dynamically imported on first generate so it stays out of the initial bundle.
// Model access is BYOK: the user's own Anthropic key lives only in their browser (see store/aiSettings);
// the app ships with no key. Multi-turn editing isn't supported yet — each prompt builds a fresh scene.

type Msg = AiMsg;

let uid = 0;
// Random suffix so ids don't collide with a conversation restored from a previous session
// (where the module-level counter has reset to 0).
const nextId = () => `m${++uid}_${Math.random().toString(36).slice(2, 8)}`;
const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function AiChatPanel() {
  const toggleAiChat = usePanelStore((s) => s.toggleAiChat);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Conversation is stored per project and persisted to localStorage; the panel reads its slice.
  const conv = useAiChatStore((s) => s.byProject[convKey(activeProjectId)] ?? EMPTY_CONVERSATION);
  const { messages, draft } = conv;
  const setMessagesFor = useAiChatStore((s) => s.setMessages);
  const setDraftFor = useAiChatStore((s) => s.setDraft);
  const clearConversation = useAiChatStore((s) => s.clearConversation);
  const settleStreaming = useAiChatStore((s) => s.settleStreaming);
  const setMessages = useCallback((u: Msg[] | ((p: Msg[]) => Msg[])) => setMessagesFor(activeProjectId, u), [setMessagesFor, activeProjectId]);
  const setDraft = useCallback((v: string) => setDraftFor(activeProjectId, v), [setDraftFor, activeProjectId]);

  const apiKey = useAiSettingsStore((s) => s.apiKey);
  const proxyUrl = useAiSettingsStore((s) => s.proxyUrl);
  const configured = isAiConfigured({ apiKey, proxyUrl });

  // Transient, per-mount generation state — a half-finished generation can't survive an unmount.
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showKey, setShowKey] = useState(false);
  const abortedRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stopTick = useCallback(() => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } }, []);
  useEffect(() => () => { abortedRef.current = true; stopTick(); }, [stopTick]);
  // On (re)open or project switch, clear any streaming flag left by a mid-generation close.
  useEffect(() => { settleStreaming(activeProjectId); }, [activeProjectId, settleStreaming]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const stop = useCallback(() => {
    // The in-flight request can't be aborted mid-call (no signal threaded through the pipeline yet),
    // so Stop detaches the UI and discards the result when it resolves — nothing is committed.
    abortedRef.current = true; stopTick(); setGenerating(false);
    setMessages((m) => m.map((x) => (x.streaming ? { ...x, streaming: false, text: x.text || 'Stopped.' } : x)));
  }, [stopTick, setMessages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || generating) return;
    if (!configured) { setShowKey(true); return; }
    const client = makeAiClient({ apiKey, proxyUrl });
    if (!client) { setShowKey(true); return; }
    // Release focus back to the editor so global shortcuts (Space to play, etc.) work again.
    textareaRef.current?.blur();

    const comp = useEditorStore.getState().composition;
    const canvas = { width: comp.settings.width, height: comp.settings.height };
    const fps = comp.settings.frameRate;
    const seed = (Date.now() >>> 0) % 100000; // runtime UI seed → variety across regenerations

    const userMsg: Msg = { id: nextId(), role: 'user', text };
    const asstId = nextId();
    setMessages((m) => [...m, userMsg, { id: asstId, role: 'assistant', text: '', streaming: true }]);
    setDraft('');
    setGenerating(true); setElapsed(0);
    abortedRef.current = false;
    const start = Date.now();
    tickRef.current = window.setInterval(() => setElapsed(Date.now() - start), 100);
    const patch = (fn: (x: Msg) => Msg) => setMessages((m) => m.map((x) => (x.id === asstId ? fn(x) : x)));

    try {
      const { generateScene, commitScene } = await import('../../ai/browserGenerate');
      const result = await generateScene({ description: text, client, canvas, fps, seed });
      if (abortedRef.current) return; // user hit Stop — drop the result, commit nothing
      const s = commitScene(result);
      const plural = (n: number) => (n === 1 ? '' : 's');
      const parts = [`Built ${s.layers} layer${plural(s.layers)} across ${s.panels} panel${plural(s.panels)}`];
      if (s.clonersBuilt) parts.push(`${s.clonersBuilt} cloner${plural(s.clonersBuilt)}`);
      let summary = parts.join(', ') + '.';
      if (s.repairs) summary += ` ${s.repairs} auto-fix round${plural(s.repairs)}.`;
      if (s.errors) summary += ` ${s.errors} issue${plural(s.errors)} left in the report.`;
      summary += ` ~$${s.costUsd.toFixed(2)}. Ctrl+Z to undo.`;
      patch((x) => ({ ...x, text: summary, streaming: false, ms: Date.now() - start }));
    } catch (e) {
      if (abortedRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      const hint = /401|403|api[_-]?key|authentication/i.test(msg) ? ' Check your API key in the key menu.' : '';
      patch((x) => ({ ...x, text: `Generation failed: ${msg}${hint}`, streaming: false, ms: Date.now() - start }));
      useIslandStore.getState().error('AI generation failed');
    } finally {
      stopTick(); setGenerating(false);
    }
  }, [draft, generating, configured, apiKey, proxyUrl, setMessages, setDraft, stopTick]);

  const newChat = () => { stop(); clearConversation(activeProjectId); };

  return (
    <aside className="flex-shrink-0 h-full flex flex-col bg-surface-sunken border-l border-hairline" style={{ width: '20%', minWidth: 260 }}>
      {/* Header */}
      <div className="h-9 flex-shrink-0 flex items-center gap-2 px-3 border-b border-hairline">
        <Sparkles size={14} className="text-accent" />
        <span className="text-[12px] font-semibold text-slate-200">AI Assistant</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            title={configured ? 'Model connected — manage key' : 'Connect your Anthropic key'}
            className={`p-1 rounded hover:bg-white/5 ${configured ? 'text-emerald-400' : 'text-amber-400'}`}
            onClick={() => setShowKey((v) => !v)}
          >
            <KeyRound size={13} />
          </button>
          <button title="New chat" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={newChat}><Plus size={13} /></button>
          <button title="Close" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={toggleAiChat}><X size={13} /></button>
        </div>
      </div>

      {showKey && <KeyPanel onClose={() => setShowKey(false)} />}

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-600 px-3">
            <Sparkles size={22} />
            <p className="text-[12px] leading-relaxed">Describe a scene and the assistant will build it — layers, motion, and palette — onto the canvas.</p>
            {!configured && (
              <button onClick={() => setShowKey(true)} className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-3 border border-hairline text-[11px] text-amber-300 hover:bg-white/5">
                <KeyRound size={12} /> Connect your Anthropic key to start
              </button>
            )}
          </div>
        )}
        {messages.map((m) => m.role === 'user' ? (
          <div key={m.id} className="rounded-md bg-[#111a28] border border-hairline px-3 py-2">
            <p className="text-[12px] leading-snug text-slate-200 whitespace-pre-wrap">{m.text}</p>
          </div>
        ) : (
          <div key={m.id} className="pl-0.5">
            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-500">
              <Sparkles size={11} className="text-accent" />
              <span className="font-medium text-slate-400">FlashFX AI</span>
              {m.streaming && <ThinkingDots elapsed={elapsed} />}
              {!m.streaming && m.ms != null && <span>· {fmt(m.ms)}</span>}
            </div>
            {m.text && (
              <p className="text-[12.5px] leading-relaxed text-slate-300 whitespace-pre-wrap">{m.text}</p>
            )}
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 p-2 border-t border-hairline">
        <div className="rounded-lg bg-[#0e1726] border border-hairline">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
            rows={2}
            placeholder={configured ? 'Describe a scene to build…' : 'Connect a key, then describe a scene…'}
            className="w-full bg-transparent resize-none text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none px-2.5 py-2 max-h-32"
          />
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <span className="text-[10px] text-slate-600 px-1">Opus builds a full scene · one undo step</span>
            <div className="ml-auto">
              {generating ? (
                <button onClick={stop} title="Stop" className="flex items-center justify-center w-7 h-7 rounded-md text-slate-200 bg-surface-4 hover:bg-[#33445e]"><Square size={11} fill="currentColor" /></button>
              ) : (
                <button onClick={() => void send()} disabled={!draft.trim()} title="Generate" className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${draft.trim() ? 'text-on-accent bg-accent hover:bg-[#ffc21a]' : 'text-slate-600 bg-surface-3'}`}><Send size={13} /></button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1 text-[9px] text-slate-600 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </aside>
  );
}

// BYOK key manager. The key is the user's own and lives only in their browser (localStorage).
function KeyPanel({ onClose }: { onClose: () => void }) {
  const apiKey = useAiSettingsStore((s) => s.apiKey);
  const proxyUrl = useAiSettingsStore((s) => s.proxyUrl);
  const setApiKey = useAiSettingsStore((s) => s.setApiKey);
  const setProxyUrl = useAiSettingsStore((s) => s.setProxyUrl);
  const clear = useAiSettingsStore((s) => s.clear);
  const [key, setKey] = useState(apiKey);
  const [proxy, setProxy] = useState(proxyUrl);

  const save = () => { setApiKey(key); setProxyUrl(proxy); onClose(); };

  return (
    <div className="flex-shrink-0 border-b border-hairline bg-[#0b1320] px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
        <KeyRound size={12} className="text-amber-400" /> Model access
      </div>
      <label className="block">
        <span className="text-[10px] text-slate-500">Anthropic API key</span>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-…"
          spellCheck={false}
          autoComplete="off"
          className="mt-0.5 w-full bg-[#0e1726] border border-hairline rounded px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-[10px] text-slate-500">Proxy URL (optional — advanced)</span>
        <input
          type="text"
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder="https://your-proxy.example.com"
          spellCheck={false}
          autoComplete="off"
          className="mt-0.5 w-full bg-[#0e1726] border border-hairline rounded px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent"
        />
      </label>
      <p className="text-[9.5px] leading-relaxed text-slate-600">
        Your key is stored only in this browser and sent directly to Anthropic (or your proxy). It is never
        uploaded to FlashFX. Set a proxy to keep the key server-side instead.
      </p>
      <div className="flex items-center gap-1.5">
        <button onClick={save} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-on-accent text-[11px] font-medium hover:bg-[#ffc21a]">
          <Check size={12} /> Save
        </button>
        {(apiKey || proxyUrl) && (
          <button onClick={() => { clear(); setKey(''); setProxy(''); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-3 border border-hairline text-[11px] text-slate-300 hover:bg-white/5">
            <Trash2 size={12} /> Remove
          </button>
        )}
        <button onClick={onClose} className="ml-auto px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">Close</button>
      </div>
    </div>
  );
}

function ThinkingDots({ elapsed }: { elapsed: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-accent animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}
      </span>
      <span className="text-slate-500">Generating… {fmt(elapsed)}</span>
    </span>
  );
}
