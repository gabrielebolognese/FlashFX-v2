import { useEffect, useState } from 'react';
import { UserRound, KeyRound, HardDrive, Cloud, ShieldCheck, AlertTriangle, LogOut } from 'lucide-react';
import { Modal } from '../ui/primitives/Modal';
import { Button } from '../ui/primitives/Button';
import { Input } from '../ui/primitives/Input';
import { useAuthStore } from './store';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { deleteAllProjects, deleteAllAssets, getLocalStorageStats } from '../project-system/services/accountData';
import { getCloudMediaUsage } from '../project-system/services/cloudSync';
import { currentPlan } from '../billing/plans';
import { useIslandStore } from '../ui/island/islandStore';

type DangerAction = 'projects' | 'assets' | 'account';

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${Math.max(0, Math.round(n || 0))} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const signOut = useAuthStore((s) => s.signOut);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const [name, setName] = useState(user?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [stats, setStats] = useState<{ used: number; quota: number } | null>(null);
  const [cloudUsage, setCloudUsage] = useState<{ used: number; limit: number } | null>(null);
  const [armed, setArmed] = useState<DangerAction | null>(null);
  const [busy, setBusy] = useState<DangerAction | null>(null);

  useEffect(() => {
    let alive = true;
    getLocalStorageStats()
      .then((s) => { if (alive) setStats({ used: s.usedBytes, quota: s.estimatedQuota }); })
      .catch(() => { /* storage stats are best-effort */ });
    getCloudMediaUsage()
      .then((u) => { if (alive && u) setCloudUsage({ used: u.usedBytes, limit: u.limitBytes }); })
      .catch(() => { /* cloud usage is best-effort */ });
    return () => { alive = false; };
  }, []);

  const initials = ((user?.displayName || user?.email || '?').trim()[0] ?? '?').toUpperCase();

  const saveName = async () => {
    setSavingName(true); setNameMsg(null);
    const res = await updateDisplayName(name);
    setSavingName(false);
    setNameMsg(res.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: res.error ?? 'Could not save.' });
  };

  const savePassword = async () => {
    if (pw1.length < 6) { setPwMsg({ ok: false, text: 'Password must be at least 6 characters.' }); return; }
    if (pw1 !== pw2) { setPwMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    setSavingPw(true); setPwMsg(null);
    const res = await updatePassword(pw1);
    setSavingPw(false);
    if (res.ok) { setPw1(''); setPw2(''); setPwMsg({ ok: true, text: 'Password updated.' }); }
    else setPwMsg({ ok: false, text: res.error ?? 'Could not update password.' });
  };

  const runDanger = async (action: DangerAction) => {
    setBusy(action); setArmed(null);
    try {
      if (action === 'projects') {
        const n = await deleteAllProjects();
        await loadProjects();
        useIslandStore.getState().toast(`Deleted ${n} project${n === 1 ? '' : 's'}`, { tone: 'success', icon: 'check' });
      } else if (action === 'assets') {
        await deleteAllAssets();
        useIslandStore.getState().toast('Deleted all library assets', { tone: 'success', icon: 'check' });
      } else {
        // Delete account: wipe all local data + sign out. Removing the account RECORD itself needs a
        // server (service-role) function — wired later; sign-out is the closest client-side step.
        await deleteAllProjects();
        await deleteAllAssets();
        await signOut();
        return; // sign-out unmounts the dashboard (and this modal) via the auth gate
      }
    } catch {
      useIslandStore.getState().error('Something went wrong. Some items may not have been deleted.');
    } finally {
      setBusy(null);
    }
  };

  const usedPct = stats && stats.quota > 0 ? Math.min(100, (stats.used / stats.quota) * 100) : 0;
  const cloudPct = cloudUsage && cloudUsage.limit > 0 ? Math.min(100, (cloudUsage.used / cloudUsage.limit) * 100) : 0;
  const planLabel = currentPlan() === 'pro' ? 'Pro' : 'Free';

  return (
    <Modal onClose={onClose} size="md" icon={<UserRound size={16} />} title="Account">
      <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
        {/* Identity + quick sign out */}
        <div>
          <div className="flex items-center gap-2.5">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f7b500] to-[#e09000] text-[14px] font-bold text-[#0a0f16]">{initials}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-slate-100">{user?.displayName ?? 'Your account'}</div>
              <div className="truncate text-[11px] text-slate-500">{user?.email ?? ''}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-1 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <LogOut size={12} /> Log out
          </button>
        </div>

        {/* Profile */}
        <Section title="Profile">
          <label className="block text-[11px] text-slate-500">Full name</label>
          <div className="mt-1 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            <Button variant="secondary" size="comfortable" onClick={() => void saveName()} disabled={savingName || name.trim() === (user?.displayName ?? '')}>
              {savingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {nameMsg && <p className={`mt-1 text-[11px] ${nameMsg.ok ? 'text-success' : 'text-danger'}`}>{nameMsg.text}</p>}
        </Section>

        {/* Security */}
        <Section title="Security" icon={<ShieldCheck size={12} />}>
          <label className="block text-[11px] text-slate-500">Change password</label>
          <div className="mt-1 space-y-2">
            <Input type="password" autoComplete="new-password" placeholder="New password" value={pw1} onChange={(e) => setPw1(e.target.value)} minLength={6} />
            <div className="flex gap-2">
              <Input type="password" autoComplete="new-password" placeholder="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={6} />
              <Button variant="secondary" size="comfortable" onClick={() => void savePassword()} disabled={savingPw || !pw1 || !pw2}>
                {savingPw ? 'Saving…' : 'Update'}
              </Button>
            </div>
          </div>
          {pwMsg && <p className={`mt-1 text-[11px] ${pwMsg.ok ? 'text-success' : 'text-danger'}`}>{pwMsg.text}</p>}

          <div className="mt-4 flex items-center justify-between rounded-lg border border-hairline bg-surface-1 px-3 py-2">
            <div className="flex items-center gap-2">
              <KeyRound size={13} className="text-slate-500" />
              <div>
                <div className="text-[12px] text-slate-200">Two-factor authentication</div>
                <div className="text-[10.5px] text-slate-500">Add an extra layer of security at sign-in.</div>
              </div>
            </div>
            <SoonButton label="Set up" />
          </div>
        </Section>

        {/* Storage */}
        <Section title="Storage" icon={<HardDrive size={12} />}>
          <div className="rounded-lg border border-hairline bg-surface-1 px-3 py-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300">On this device (local)</span>
              <span className="text-slate-500">{stats ? `${formatBytes(stats.used)} of ${formatBytes(stats.quota)}` : '…'}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1a2233]">
              <div className="h-full rounded-full bg-[#f7b500]" style={{ width: `${usedPct}%` }} />
            </div>
          </div>
          <div className="mt-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-300"><Cloud size={12} className="text-slate-500" /> Cloud media ({planLabel} plan)</span>
              <span className="text-slate-500">{cloudUsage ? `${formatBytes(cloudUsage.used)} of ${formatBytes(cloudUsage.limit)}` : '—'}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1a2233]">
              <div className="h-full rounded-full bg-[#f7b500]" style={{ width: `${cloudPct}%` }} />
            </div>
          </div>
        </Section>

        {/* Danger zone */}
        <Section title="Danger zone" icon={<AlertTriangle size={12} className="text-danger" />}>
          <div className="space-y-2">
            <DangerRow
              label="Delete all projects"
              desc="Permanently removes every project and its media from this device."
              cta="Delete projects"
              armed={armed === 'projects'}
              busy={busy === 'projects'}
              onArm={() => setArmed('projects')}
              onCancel={() => setArmed(null)}
              onConfirm={() => void runDanger('projects')}
            />
            <DangerRow
              label="Delete all assets"
              desc="Clears your saved media library and brand kit."
              cta="Delete assets"
              armed={armed === 'assets'}
              busy={busy === 'assets'}
              onArm={() => setArmed('assets')}
              onCancel={() => setArmed(null)}
              onConfirm={() => void runDanger('assets')}
            />
            <DangerRow
              label="Delete account"
              desc="Erases all local projects and assets and signs you out. Removing the account record itself is coming soon."
              cta="Delete account"
              icon={<LogOut size={12} />}
              armed={armed === 'account'}
              busy={busy === 'account'}
              onArm={() => setArmed('account')}
              onCancel={() => setArmed(null)}
              onConfirm={() => void runDanger('account')}
            />
          </div>
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function SoonButton({ label }: { label: string }) {
  return (
    <button type="button" disabled title="Coming soon" className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-3 px-2.5 py-1 text-[11px] text-slate-500 opacity-70">
      {label}
      <span className="rounded bg-surface-4 px-1 py-px text-[9px]">Soon</span>
    </button>
  );
}

function DangerRow({ label, desc, cta, icon, armed, busy, onArm, onCancel, onConfirm }: {
  label: string; desc: string; cta: string; icon?: React.ReactNode;
  armed: boolean; busy: boolean; onArm: () => void; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-500/25 bg-red-500/[0.04] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-slate-200">{label}</div>
          <div className="text-[10.5px] leading-snug text-slate-500">{desc}</div>
        </div>
        {armed ? (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-md px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200">Cancel</button>
            <button type="button" onClick={onConfirm} disabled={busy} className="rounded-md bg-danger px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
              {busy ? 'Deleting…' : 'Confirm'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={onArm} className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-red-500/10">
            {icon}
            {cta}
          </button>
        )}
      </div>
    </div>
  );
}
