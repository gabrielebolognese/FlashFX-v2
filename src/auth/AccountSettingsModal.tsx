import { useEffect, useState } from 'react';
import { UserRound, KeyRound, Trash2, AlertTriangle, LogOut, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { Modal } from '../ui/primitives/Modal';
import { Button } from '../ui/primitives/Button';
import { Input } from '../ui/primitives/Input';
import { useAuthStore } from './store';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { deleteAllProjects, deleteAllAssets, getLocalStorageStats } from '../project-system/services/accountData';
import { getCloudMediaUsage } from '../project-system/services/cloudSync';
import { usePlanStore } from '../billing/plans';
import { UpgradeModal } from '../billing/UpgradeModal';
import { useIslandStore } from '../ui/island/islandStore';

type Dialog = 'password' | 'projects' | 'media' | 'account' | null;

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${Math.max(0, Math.round(n || 0))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const plan = usePlanStore((s) => s.plan);

  const [local, setLocal] = useState<{ used: number; quota: number } | null>(null);
  const [cloud, setCloud] = useState<{ used: number; limit: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getLocalStorageStats().then((s) => { if (alive) setLocal({ used: s.usedBytes, quota: s.estimatedQuota }); }).catch(() => {});
    getCloudMediaUsage().then((u) => { if (alive && u) setCloud({ used: u.usedBytes, limit: u.limitBytes }); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const initials = ((user?.displayName || user?.email || '?').trim()[0] ?? '?').toUpperCase();
  const planLabel = plan === 'pro' ? 'Pro' : 'Free';

  const run = async (action: 'projects' | 'media' | 'account') => {
    setBusy(true);
    try {
      if (action === 'projects') {
        const n = await deleteAllProjects();
        await loadProjects();
        useIslandStore.getState().toast(`Deleted ${n} project${n === 1 ? '' : 's'}`, { tone: 'success', icon: 'check' });
      } else if (action === 'media') {
        await deleteAllAssets();
        useIslandStore.getState().toast('Deleted library assets', { tone: 'success', icon: 'check' });
      } else {
        await deleteAllProjects();
        await deleteAllAssets();
        await signOut();
        return; // sign-out unmounts this
      }
      setDialog(null);
    } catch {
      useIslandStore.getState().error('Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} size="sm" icon={<UserRound size={16} />} title="Account">
      <div className="space-y-4">
        {/* Big profile */}
        <div className="flex items-center gap-4">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f7b500] to-[#e09000] text-[26px] font-bold text-[#0a0f16]">{initials}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-semibold text-slate-100">{user?.displayName ?? 'Your account'}</div>
            <div className="truncate text-[12px] text-slate-500">{user?.email ?? ''}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{planLabel} plan</span>
              {plan === 'free' && (
                <button onClick={() => setShowUpgrade(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#f7b500] hover:underline">
                  <Sparkles size={11} /> Upgrade
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Log out + 2FA */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void signOut()} className="flex items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-1 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100">
            <LogOut size={12} /> Log out
          </button>
          <button disabled title="Coming soon" className="flex items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-1 py-1.5 text-[11px] font-medium text-slate-500 opacity-70">
            <ShieldCheck size={12} /> 2FA · Soon
          </button>
        </div>

        {/* Storage (compact) */}
        <div className="space-y-2">
          <StorageBar label={`Cloud · ${planLabel}`} used={cloud?.used} total={cloud?.limit} />
          <StorageBar label="Device" used={local?.used} total={local?.quota} />
        </div>

        {/* Actions grid */}
        <div className="grid grid-cols-3 gap-2">
          <GridButton icon={KeyRound} label="Password" onClick={() => setDialog('password')} />
          <GridButton icon={Trash2} label="Projects" danger onClick={() => setDialog('projects')} />
          <GridButton icon={Trash2} label="Media" danger onClick={() => setDialog('media')} />
        </div>
        <button
          onClick={() => setDialog('account')}
          className="w-full rounded-md border border-red-500/40 py-2 text-[12px] font-semibold text-danger transition-colors hover:bg-red-500/10"
        >
          Delete account
        </button>
      </div>

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
      {dialog === 'password' && <ChangePasswordModal onClose={() => setDialog(null)} />}
      {dialog === 'projects' && (
        <ConfirmDialog title="Delete all projects?" body="Permanently removes every project and its media from this device." confirmLabel="Delete projects" busy={busy} onConfirm={() => void run('projects')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'media' && (
        <ConfirmDialog title="Delete all media?" body="Clears your saved media library and brand kit." confirmLabel="Delete media" busy={busy} onConfirm={() => void run('media')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'account' && (
        <ConfirmDialog title="Delete account?" body="Erases all local projects and assets and signs you out." phrase="DELETE" confirmLabel="Delete account" busy={busy} onConfirm={() => void run('account')} onClose={() => setDialog(null)} />
      )}
    </Modal>
  );
}

function StorageBar({ label, used, total }: { label: string; used?: number; total?: number }) {
  const pct = used != null && total && total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-600">{used != null && total != null ? `${formatBytes(used)} / ${formatBytes(total)}` : '—'}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#1a2233]">
        <div className="h-full rounded-full bg-[#f7b500]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function GridButton({ icon: Icon, label, danger, onClick }: {
  icon: LucideIcon; label: string; danger?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border py-3 text-[11px] font-medium transition-colors ${
        danger ? 'border-red-500/30 text-red-300 hover:bg-red-500/10' : 'border-hairline text-slate-300 hover:bg-white/5'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// GitHub-style confirmation: a warning modal with a red confirm button. For the nuclear action
// (account deletion) `phrase` requires typing an exact word before the button enables.
function ConfirmDialog({ title, body, confirmLabel, phrase, busy, onConfirm, onClose }: {
  title: string; body: string; confirmLabel: string; phrase?: string; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const ready = !phrase || typed.trim() === phrase;
  return (
    <Modal onClose={onClose} size="sm" icon={<AlertTriangle size={16} className="text-danger" />} title={title}>
      <div className="space-y-3">
        <p className="text-[12px] leading-relaxed text-slate-400">{body}</p>
        {phrase && (
          <div className="space-y-1">
            <p className="text-[11px] text-slate-500">Type <span className="font-mono font-semibold text-slate-300">{phrase}</span> to confirm</p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoFocus />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="comfortable" onClick={onClose} disabled={busy}>Cancel</Button>
          <button
            onClick={onConfirm}
            disabled={!ready || busy}
            className="rounded-md bg-danger px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (pw1.length < 6) { setMsg({ ok: false, text: 'At least 6 characters.' }); return; }
    if (pw1 !== pw2) { setMsg({ ok: false, text: 'Passwords don’t match.' }); return; }
    setBusy(true); setMsg(null);
    const res = await updatePassword(pw1);
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: 'Password updated.' }); setPw1(''); setPw2(''); }
    else setMsg({ ok: false, text: res.error ?? 'Could not update.' });
  };

  return (
    <Modal onClose={onClose} size="sm" icon={<KeyRound size={16} />} title="Change password">
      <div className="space-y-2.5">
        <Input type="password" autoComplete="new-password" placeholder="New password" value={pw1} onChange={(e) => setPw1(e.target.value)} minLength={6} autoFocus />
        <Input type="password" autoComplete="new-password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} />
        {msg && <p className={`text-[11px] ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="comfortable" onClick={onClose}>Close</Button>
          <Button variant="primary" size="comfortable" onClick={() => void save()} disabled={busy || !pw1 || !pw2}>{busy ? 'Saving…' : 'Update'}</Button>
        </div>
      </div>
    </Modal>
  );
}
