import { useState } from 'react';
import { Sparkles, X, Send, Plus, User, Bot } from 'lucide-react';
import { usePanelStore } from '../../store/panels';

// VS Code-style AI assistant side panel — MOCKUP only (no backend). Toggled from the toolbar; when
// open it occupies the right 20% of the editor and the rest of the layout compresses to fit.

interface Msg { role: 'user' | 'assistant'; text: string }

const SEED: Msg[] = [
  { role: 'user', text: 'Make the title fly in and add a soft glow.' },
  { role: 'assistant', text: 'Done — I added a position + scale keyframe intro on “Title” with an ease-out, and enabled an outer glow. Want me to stagger the subtitle after it?' },
  { role: 'user', text: 'Yes, 6 frames later.' },
  { role: 'assistant', text: 'Staggered the subtitle by 6 frames. You can scrub the timeline to preview, or ask me to tweak the easing.' },
];

export function AiChatPanel() {
  const toggleAiChat = usePanelStore((s) => s.toggleAiChat);
  const [messages, setMessages] = useState<Msg[]>(SEED);
  const [draft, setDraft] = useState('');

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { role: 'user', text },
      { role: 'assistant', text: 'This is a mockup assistant — no model is wired up yet. Your request would be turned into editor actions here.' },
    ]);
    setDraft('');
  };

  return (
    <aside className="flex-shrink-0 h-full flex flex-col bg-[#0b1220] border-l border-[#1a2a42]" style={{ width: '20%', minWidth: 240 }}>
      {/* Header */}
      <div className="h-9 flex-shrink-0 flex items-center gap-2 px-3 border-b border-[#1a2a42]">
        <Sparkles size={14} className="text-[#f7b500]" />
        <span className="text-[12px] font-semibold text-slate-200">AI Assistant</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#122240] text-slate-500 font-medium">Mockup</span>
        <div className="ml-auto flex items-center gap-1">
          <button title="New chat" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={() => setMessages([])}>
            <Plus size={13} />
          </button>
          <button title="Close" className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5" onClick={toggleAiChat}>
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-slate-600">
            <Sparkles size={22} />
            <p className="text-[12px]">Ask the assistant to build or edit your scene.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${m.role === 'user' ? 'bg-[#1a2f52] text-slate-300' : 'bg-[#f7b500]/15 text-[#f7b500]'}`}>
              {m.role === 'user' ? <User size={12} /> : <Bot size={12} />}
            </div>
            <div className={`max-w-[85%] px-2.5 py-1.5 rounded-lg text-[12px] leading-snug ${m.role === 'user' ? 'bg-[#1a2f52] text-slate-100' : 'bg-[#111a28] text-slate-300 border border-[#1a2a42]'}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 p-2 border-t border-[#1a2a42]">
        <div className="flex items-end gap-1.5 rounded-lg bg-[#0e1726] border border-[#1a2a42] focus-within:border-[#2a3a52] px-2 py-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Ask to build, edit, or animate…"
            className="flex-1 bg-transparent resize-none text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none max-h-24"
          />
          <button onClick={send} disabled={!draft.trim()} className={`p-1.5 rounded-md transition-colors ${draft.trim() ? 'text-[#0e1c32] bg-[#f7b500] hover:bg-[#ffc21a]' : 'text-slate-600 bg-[#122240]'}`} title="Send">
            <Send size={13} />
          </button>
        </div>
        <p className="mt-1 text-[9px] text-slate-600 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </aside>
  );
}
