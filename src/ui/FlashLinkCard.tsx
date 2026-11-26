// FlashFX Link card + banner (docs/MCP-PRODUCT-ARCHITECTURE.md, R1 / R9). Mounted in its own root (outside
// the editor tree, so it never re-renders the app) by src/main.tsx, only when the Link feature flag is on. States:
//   pending    -> "Connect Claude" card (the Connect click is the user gesture the browser prompt needs)
//   connecting -> spinner
//   connected  -> small "Claude is building here" banner with Pause / Disconnect
//   paused     -> Resume / Disconnect
//   error      -> what went wrong + Retry / Close
import type { ReactNode } from 'react';
import { Link2, Loader2, Pause, Play, Unplug, X } from 'lucide-react';
import {
  connectFlashLink,
  disconnectFlashLink,
  pauseFlashLink,
  resumeFlashLink,
  useLinkStore,
} from '../agent/bridge';

const GOLD = '#d9a521';

function Button({ onClick, children, primary, label }: { onClick: () => void; children: ReactNode; primary?: boolean; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        primary ? 'text-black hover:brightness-110' : 'bg-white/5 text-white/80 hover:bg-white/10'
      }`}
      style={primary ? { backgroundColor: GOLD } : undefined}
    >
      {children}
    </button>
  );
}

export function FlashLinkCard() {
  const { status, error, calls, lastAction, mode, target } = useLinkStore();
  if (status === 'idle') return null;

  if (status === 'connected' || status === 'paused') {
    return (
      <div
        data-ffx-link-banner={status}
        className="fixed bottom-4 right-4 z-[10000] flex items-center gap-3 rounded-xl border border-white/10 bg-[#111214]/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur"
      >
        <span className="relative flex h-2.5 w-2.5">
          {status === 'connected' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: GOLD }} />}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status === 'connected' ? GOLD : '#6b7280' }} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{status === 'connected' ? 'Claude is building in this editor' : 'Claude is paused'}</div>
          <div className="truncate text-white/50">
            {calls} action{calls === 1 ? '' : 's'}{lastAction ? `, last: ${lastAction}` : ''}{mode === 'personal' ? ' (personal mode)' : ''}
          </div>
        </div>
        {status === 'connected' ? (
          <Button onClick={pauseFlashLink} label="Pause Claude"><Pause className="h-3.5 w-3.5" />Pause</Button>
        ) : (
          <Button onClick={resumeFlashLink} label="Resume Claude" primary><Play className="h-3.5 w-3.5" />Resume</Button>
        )}
        <Button onClick={disconnectFlashLink} label="Disconnect Claude"><Unplug className="h-3.5 w-3.5" /></Button>
      </div>
    );
  }

  return (
    <div
      data-ffx-link-card={status}
      role="dialog"
      aria-label="Connect Claude to FlashFX"
      className="fixed bottom-4 right-4 z-[10000] w-[340px] rounded-2xl border border-white/10 bg-[#111214]/95 p-4 text-sm text-white shadow-2xl backdrop-blur"
    >
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="h-4 w-4" style={{ color: GOLD }} />
        <div className="font-semibold">Connect Claude to this editor</div>
        <button type="button" aria-label="Close" onClick={disconnectFlashLink} className="ml-auto text-white/40 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      {status === 'pending' && (
        <>
          <p className="mb-3 text-xs leading-relaxed text-white/70">
            Claude on this computer wants to build animations in this tab with FlashFX Link (port {target?.port}).
            After you click Connect, your browser may ask to let this page talk to apps on this device: click <b>Allow</b>.
            You can pause or disconnect at any time.
          </p>
          <div className="flex gap-2">
            <Button primary onClick={connectFlashLink}><Link2 className="h-3.5 w-3.5" />Connect</Button>
            <Button onClick={disconnectFlashLink}>Not now</Button>
          </div>
        </>
      )}
      {status === 'connecting' && (
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Loader2 className="h-4 w-4 animate-spin" />Connecting to FlashFX Link...
        </div>
      )}
      {status === 'error' && (
        <>
          <p className="mb-3 text-xs leading-relaxed text-white/70" data-ffx-link-error>{error}</p>
          <p className="mb-3 text-[11px] leading-relaxed text-white/40">
            Blocked by mistake? Click the icon left of the address bar, open Site settings and allow access to apps on this device, then ask Claude to connect again.
          </p>
          <div className="flex gap-2">
            {target && <Button primary onClick={connectFlashLink}>Retry</Button>}
            <Button onClick={disconnectFlashLink}>Close</Button>
          </div>
        </>
      )}
    </div>
  );
}
