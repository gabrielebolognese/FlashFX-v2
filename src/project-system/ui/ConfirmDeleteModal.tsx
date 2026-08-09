import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// GitHub-style destructive confirmation: the user must type the project's exact name to enable
// the permanent-delete button. Used from the Trash view — this is the irreversible erase.
interface Props {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({ name, onConfirm, onClose }: Props) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const match = typed.trim() === name;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[400px] max-w-[92vw] bg-[#111821] border border-[#2a3a50] rounded-lg shadow-2xl shadow-black/50 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[#1c2433] flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-400" />
          <h2 className="text-[13px] font-semibold text-slate-100">Delete project permanently</h2>
        </div>

        <div className="px-4 py-3.5 space-y-3">
          <p className="text-[12px] text-slate-400 leading-relaxed">
            This <span className="text-slate-200 font-medium">cannot be undone</span>. The project, its
            scene and all of its media assets are erased.
          </p>
          <p className="text-[12px] text-slate-400">
            Type <span className="px-1 py-0.5 rounded bg-[#1a2233] text-slate-200 font-mono text-[11px]">{name}</span> to confirm.
          </p>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && match) onConfirm(); }}
            placeholder="Project name"
            className="w-full bg-[#0b1220] border border-[#1c2433] rounded-md px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-red-500/40 focus:outline-none"
          />
        </div>

        <div className="px-4 py-3 border-t border-[#1c2433] flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-[6px] text-[11px] font-medium text-slate-300 hover:text-slate-100 rounded-md hover:bg-[#1a2233] transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!match}
            className="px-3 py-[6px] text-[11px] font-semibold rounded-md transition-colors bg-red-600 hover:bg-red-500 text-white disabled:bg-[#2a1a1e] disabled:text-red-300/40 disabled:cursor-not-allowed"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
