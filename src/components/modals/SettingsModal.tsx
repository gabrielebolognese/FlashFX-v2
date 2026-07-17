import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, XCircle, Loader2, Eye, EyeOff, User, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { validatePasswordStrength } from '../../utils/passwordStrength';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

type Tab = 'profile' | 'password';

const P = {
  bg:       '#111b2a',
  panel:    '#152030',
  header:   '#0f1a28',
  border:   '#1e3048',
  input:    '#0d1a28',
  inputHov: '#0f1e32',
  text:     '#e2e8f0',
  muted:    '#607898',
  label:    '#8aa0b8',
  accent:   '#f59e0b',
  accentD:  '#d97706',
  error:    '#ef4444',
  success:  '#22c55e',
  divider:  '#1a2c44',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: P.input,
  border: `1px solid ${P.border}`,
  borderRadius: 2,
  color: P.text,
  fontSize: 12,
  padding: '6px 10px',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  color: P.label,
  marginBottom: 4,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, profile, refreshProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameCheckTimeout, setUsernameCheckTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isOpen && profile) {
      setFullName(profile.full_name || '');
      setUsername(profile.username || '');
      setEmail(profile.email || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
      setUsernameStatus('idle');
      setActiveTab('profile');
    }
  }, [isOpen, profile]);

  const checkUsernameAvailability = useCallback(async (newUsername: string, currentUsername: string) => {
    if (!newUsername || newUsername.length < 3) { setUsernameStatus('idle'); return; }
    if (newUsername.toLowerCase() === currentUsername.toLowerCase()) { setUsernameStatus('idle'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) { setUsernameStatus('invalid'); return; }
    setUsernameStatus('checking');
    try {
      const { data, error } = await supabase.from('profiles').select('username').ilike('username', newUsername).maybeSingle();
      if (error && error.code !== 'PGRST116') { setUsernameStatus('idle'); return; }
      setUsernameStatus(data ? 'taken' : 'available');
    } catch { setUsernameStatus('idle'); }
  }, []);

  useEffect(() => {
    if (usernameCheckTimeout) clearTimeout(usernameCheckTimeout);
    if (username && profile && username.length >= 3) {
      const t = setTimeout(() => checkUsernameAvailability(username, profile.username || ''), 500);
      setUsernameCheckTimeout(t);
    } else {
      setUsernameStatus('idle');
    }
    return () => { if (usernameCheckTimeout) clearTimeout(usernameCheckTimeout); };
  }, [username, profile]);

  const handleSaveProfile = async () => {
    setError(''); setSuccess('');
    if (!fullName || !username || !email) { setError('Full name, username and email are required'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) { setError('Username: letters, numbers, hyphens and underscores only'); return; }
    if (usernameStatus === 'taken') { setError('This username is already taken'); return; }
    if (usernameStatus === 'checking') { setError('Please wait while we check username availability'); return; }
    setLoading(true);
    try {
      const { error: profileError } = await supabase.from('profiles').update({ full_name: fullName, username }).eq('id', user!.id);
      if (profileError) throw profileError;
      if (email !== profile?.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email });
        if (emailError) throw emailError;
        const { error: pErr } = await supabase.from('profiles').update({ email }).eq('id', user!.id);
        if (pErr) throw pErr;
      }
      await refreshProfile();
      setSuccess('Profile updated successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError(''); setSuccess('');
    if (!currentPassword || !newPassword || !confirmPassword) { setError('All password fields are required'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }
    const v = validatePasswordStrength(newPassword);
    if (!v.isValid) { setError(v.message || 'Password does not meet requirements'); return; }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile!.email, password: currentPassword });
      if (signInError) throw new Error('Current password is incorrect');
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setSuccess('Password changed successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User style={{ width: 13, height: 13 }} /> },
    { id: 'password', label: 'Password', icon: <Lock style={{ width: 13, height: 13 }} /> },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: P.bg, border: `1px solid ${P.border}`, borderRadius: 2, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ background: P.header, borderBottom: `1px solid ${P.border}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: P.text, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Account Settings</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.muted, display: 'flex', alignItems: 'center', padding: 2, borderRadius: 2 }}
            onMouseEnter={e => (e.currentTarget.style.color = P.text)}
            onMouseLeave={e => (e.currentTarget.style.color = P.muted)}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ background: P.panel, borderBottom: `1px solid ${P.border}`, display: 'flex', flexShrink: 0 }}>
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 500,
                  color: active ? P.accent : P.muted,
                  letterSpacing: '0.04em',
                  borderBottom: active ? `2px solid ${P.accent}` : '2px solid transparent',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = P.text; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = P.muted; }}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Alerts */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.35)`, borderRadius: 2, padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <XCircle style={{ width: 13, height: 13, color: P.error, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#fca5a5' }}>{error}</span>
            </div>
          )}
          {success && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.35)`, borderRadius: 2, padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle style={{ width: 13, height: 13, color: P.success, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#86efac' }}>{success}</span>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Full Name */}
              <div>
                <label style={labelStyle}>Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="John Doe"
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = P.accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = P.border)}
                />
              </div>

              {/* Username */}
              <div>
                <label style={labelStyle}>Username</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase())}
                    placeholder="username"
                    style={{
                      ...inputStyle,
                      paddingRight: 32,
                      borderColor:
                        usernameStatus === 'available' ? 'rgba(34,197,94,0.6)' :
                        usernameStatus === 'taken' ? 'rgba(239,68,68,0.6)' :
                        usernameStatus === 'invalid' ? 'rgba(239,68,68,0.6)' :
                        P.border,
                    }}
                    onFocus={e => { if (usernameStatus === 'idle') e.currentTarget.style.borderColor = P.accent; }}
                    onBlur={e => { if (usernameStatus === 'idle') e.currentTarget.style.borderColor = P.border; }}
                  />
                  <div style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    {usernameStatus === 'checking' && <Loader2 style={{ width: 12, height: 12, color: P.accent, animation: 'spin 1s linear infinite' }} />}
                    {usernameStatus === 'available' && <CheckCircle style={{ width: 12, height: 12, color: P.success }} />}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <XCircle style={{ width: 12, height: 12, color: P.error }} />}
                  </div>
                </div>
                <div style={{ marginTop: 3, fontSize: 10, color:
                  usernameStatus === 'available' ? '#86efac' :
                  usernameStatus === 'taken' ? '#fca5a5' :
                  usernameStatus === 'invalid' ? '#fca5a5' :
                  P.muted
                }}>
                  {usernameStatus === 'available' && 'Username is available'}
                  {usernameStatus === 'taken' && 'This username is already taken'}
                  {usernameStatus === 'invalid' && 'Invalid characters — use letters, numbers, hyphens or underscores'}
                  {(usernameStatus === 'idle' || usernameStatus === 'checking') && 'Letters, numbers, hyphens and underscores only'}
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = P.accent)}
                  onBlur={e => (e.currentTarget.style.borderColor = P.border)}
                />
                <div style={{ marginTop: 3, fontSize: 10, color: P.muted }}>Changing email will require verification</div>
              </div>

              {/* Save button */}
              <div style={{ paddingTop: 4 }}>
                <button
                  onClick={handleSaveProfile}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    background: loading ? 'rgba(245,158,11,0.3)' : `linear-gradient(135deg, ${P.accent} 0%, ${P.accentD} 100%)`,
                    border: `1px solid ${loading ? 'rgba(245,158,11,0.2)' : P.accentD}`,
                    borderRadius: 2,
                    color: loading ? 'rgba(255,255,255,0.5)' : '#0f1a28',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.88'; }}
                  onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = '1'; }}
                >
                  {loading && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                  {loading ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Current Password */}
              <div>
                <label style={labelStyle}>Current Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    style={{ ...inputStyle, paddingRight: 32 }}
                    onFocus={e => (e.currentTarget.style.borderColor = P.accent)}
                    onBlur={e => (e.currentTarget.style.borderColor = P.border)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: P.muted, display: 'flex', padding: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.color = P.text)}
                    onMouseLeave={e => (e.currentTarget.style.color = P.muted)}
                  >
                    {showCurrentPassword ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label style={labelStyle}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    style={{ ...inputStyle, paddingRight: 32 }}
                    onFocus={e => (e.currentTarget.style.borderColor = P.accent)}
                    onBlur={e => (e.currentTarget.style.borderColor = P.border)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: P.muted, display: 'flex', padding: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.color = P.text)}
                    onMouseLeave={e => (e.currentTarget.style.color = P.muted)}
                  >
                    {showNewPassword ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
                  </button>
                </div>
                <div style={{ marginTop: 3, fontSize: 10, color: P.muted }}>Min 8 characters — uppercase, lowercase and number required</div>
              </div>

              {/* Confirm Password */}
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{
                      ...inputStyle,
                      paddingRight: 32,
                      borderColor: confirmPassword && confirmPassword !== newPassword ? 'rgba(239,68,68,0.6)' : P.border,
                    }}
                    onFocus={e => {
                      if (!confirmPassword || confirmPassword === newPassword) e.currentTarget.style.borderColor = P.accent;
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = (confirmPassword && confirmPassword !== newPassword) ? 'rgba(239,68,68,0.6)' : P.border;
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: P.muted, display: 'flex', padding: 2 }}
                    onMouseEnter={e => (e.currentTarget.style.color = P.text)}
                    onMouseLeave={e => (e.currentTarget.style.color = P.muted)}
                  >
                    {showConfirmPassword ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <div style={{ marginTop: 3, fontSize: 10, color: '#fca5a5' }}>Passwords do not match</div>
                )}
              </div>

              {/* Change password button */}
              <div style={{ paddingTop: 4 }}>
                <button
                  onClick={handleChangePassword}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '8px 16px',
                    background: loading ? 'rgba(30,48,72,0.6)' : P.panel,
                    border: `1px solid ${loading ? P.divider : P.border}`,
                    borderRadius: 2,
                    color: loading ? P.muted : P.text,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                  onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#1e3048'; e.currentTarget.style.borderColor = P.accent; e.currentTarget.style.color = P.accent; } }}
                  onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = P.panel; e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.text; } }}
                >
                  {loading && <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />}
                  {loading ? 'Changing Password...' : 'Change Password'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${P.border}`, padding: '8px 20px', background: P.header, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              background: 'none',
              border: `1px solid ${P.border}`,
              borderRadius: 2,
              color: P.muted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P.muted; e.currentTarget.style.color = P.text; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.muted; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
