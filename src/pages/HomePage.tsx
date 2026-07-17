import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from '../hooks/useNavigate';
import { supabase, Project } from '../lib/supabase';
import { Upload, Settings, LogOut, Trash2, Cloud, Film } from 'lucide-react';
import NewProjectModal from '../components/modals/NewProjectModal';
import DeleteProjectModal from '../components/modals/DeleteProjectModal';
import LoadProjectModal from '../components/modals/LoadProjectModal';
import { SettingsModal } from '../components/modals/SettingsModal';
import { projectImporter } from '../project/ProjectImporter';
import type { ImportResult } from '../project/types';
import { StorageService } from '../services/StorageService';

type LocalProject = {
  id: string;
  name: string;
  data: Record<string, any>;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
};

type ActiveTab = 'yours' | 'cloud' | 'templates';

const GUEST_PROJECTS_KEY = 'flashfx_guest_projects';

/* ─── colours (slate-blue palette matching the rest of the app) ─── */
const C = {
  bg:          '#1e2a3a',  // main content background
  panel:       '#172030',  // header / tab bar / bottom bar
  card:        '#243350',  // project card base
  cardHover:   '#2c3d60',  // project card hover
  border:      '#2d4468',  // primary border
  borderLight: '#3a5580',  // slightly lighter border
  textPrimary: '#e2e8f0',  // main text
  textSecond:  '#94a3b8',  // secondary text
  textMuted:   '#607898',  // very muted
  textDisabled:'#3a5070',  // disabled elements
  btnBg:       '#1e2e48',  // button background
  btnHover:    '#263858',  // button hover
  accent:      '#f59e0b',  // amber accent (selected / open button)
  accentHover: '#d97706',
  danger:      '#f87171',
  dangerBg:    '#3a1622',
  dangerBorder:'#7f2e2e',
  overlay:     'rgba(0,0,0,0.65)',
  modalBg:     '#1a2840',
  modalBorder: '#2d4468',
};

const ProjectPlaceholder: React.FC = () => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#192438' }}>
    <Film style={{ width: 28, height: 28, color: '#2d4468' }} />
  </div>
);

const ProjectCard: React.FC<{
  project: Project | LocalProject;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onOpen: () => void;
}> = ({ project, isSelected, onSelect, onDelete, onOpen }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        borderRadius: 3,
        border: `2px solid ${isSelected ? C.accent : 'transparent'}`,
        background: hovered && !isSelected ? C.cardHover : C.card,
        userSelect: 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '16/9', overflow: 'hidden', borderRadius: '1px 1px 0 0' }}>
        {project.thumbnail ? (
          <img src={project.thumbnail} alt={project.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <ProjectPlaceholder />
        )}
        {(hovered || isSelected) && (
          <button
            onClick={onDelete}
            title="Delete project"
            style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: 2, padding: '3px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Trash2 style={{ width: 12, height: 12, color: C.danger }} />
          </button>
        )}
      </div>
      <div style={{ padding: '6px 8px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: isSelected ? C.accent : C.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={project.name}>
          {project.name}
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
          {new Date(project.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      </div>
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { user, profile, isGuest, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<(Project | LocalProject)[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | LocalProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadTimeout, setLoadTimeout] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('yours');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | LocalProject | null>(null);
  const [showLoadProjectModal, setShowLoadProjectModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (isGuest || (!user && !authLoading)) loadGuestProjects();
    else if (user) loadProjects();
  }, [user, isGuest, authLoading]);

  useEffect(() => {
    const id = setTimeout(() => { if (loading || authLoading) { setLoadTimeout(true); setLoading(false); } }, 10000);
    return () => clearTimeout(id);
  }, [loading, authLoading]);

  const loadGuestProjects = () => {
    try {
      setLoading(true);
      const stored = localStorage.getItem(GUEST_PROJECTS_KEY);
      setProjects(stored ? JSON.parse(stored) : []);
    } catch { setProjects([]); } finally { setLoading(false); }
  };

  const saveGuestProjects = (list: LocalProject[]) => {
    try { localStorage.setItem(GUEST_PROJECTS_KEY, JSON.stringify(list)); } catch {}
  };

  const loadProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      setProjects(data || []);
    } catch {} finally { setLoading(false); }
  };

  const handleNewProject = async (name: string, canvasSettings?: { width: number; height: number }) => {
    const canvas = { width: canvasSettings?.width || 3840, height: canvasSettings?.height || 2160, fps: 30, unit: 'px' as const, grid: { enabled: true, size: 20, snap: true }, zoom: 1, pan: { x: 0, y: 0 } };
    if (isGuest) {
      const np: LocalProject = { id: `guest-${Date.now()}`, name, data: { canvas }, thumbnail: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const updated = [np, ...(projects as LocalProject[])];
      setProjects(updated); setSelectedProject(np); saveGuestProjects(updated);
      navigate(`/editor?project=${np.id}`);
    } else {
      try {
        const projectData = { canvas };
        const projectSize = StorageService.calculateProjectSize(projectData);
        const check = await StorageService.canUploadProject(user!.id, projectSize);
        if (!check.canUpload) { alert(check.message || 'Storage limit exceeded'); return; }
        const { data, error } = await supabase.from('projects').insert({ user_id: user!.id, name, data: projectData, size_bytes: projectSize }).select().single();
        if (error) throw error;
        setProjects([data, ...projects]); setSelectedProject(data);
        navigate(`/editor?project=${data.id}`);
      } catch { alert('Failed to create project. Please try again.'); }
    }
  };

  const handleOpenProject = () => { if (selectedProject) navigate(`/editor?project=${selectedProject.id}`); };

  const handleDeleteProjectClick = (project: Project | LocalProject, e: React.MouseEvent) => {
    e.stopPropagation(); setProjectToDelete(project); setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    if (isGuest) {
      const updated = (projects as LocalProject[]).filter(p => p.id !== projectToDelete.id);
      setProjects(updated); saveGuestProjects(updated);
      if (selectedProject?.id === projectToDelete.id) setSelectedProject(updated[0] ?? null);
    } else {
      try {
        const { error } = await supabase.from('projects').delete().eq('id', projectToDelete.id);
        if (error) throw error;
        const updated = projects.filter(p => p.id !== projectToDelete.id);
        setProjects(updated);
        if (selectedProject?.id === projectToDelete.id) setSelectedProject(updated[0] ?? null);
      } catch { alert('Failed to delete project.'); }
    }
    setProjectToDelete(null);
  };

  const handleUploadProject = async (file: File): Promise<ImportResult> => {
    const result = await projectImporter.importProject(file);
    if (result.success && result.data) {
      const { elements, canvas, projectName } = result.data;
      const newProject = { name: projectName, data: { projectFileLoaded: true, elements, canvas } };
      if (isGuest) {
        const lp: LocalProject = { ...newProject, id: `guest-${Date.now()}`, thumbnail: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const updated = [lp, ...(projects as LocalProject[])];
        setProjects(updated); saveGuestProjects(updated); navigate(`/editor?project=${lp.id}`);
      } else {
        try {
          const projectSize = StorageService.calculateProjectSize(newProject.data);
          const check = await StorageService.canUploadProject(user!.id, projectSize);
          if (!check.canUpload) { alert(check.message || 'Storage limit exceeded'); return result; }
          const { data, error } = await supabase.from('projects').insert({ user_id: user!.id, name: newProject.name, data: newProject.data, size_bytes: projectSize }).select().single();
          if (error) throw error;
          navigate(`/editor?project=${data.id}`);
        } catch { alert('Failed to upload project.'); }
      }
    }
    return result;
  };

  const handleSignOut = async () => { await signOut(); window.location.href = '/auth'; };

  /* ── Loading screen ── */
  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!loadTimeout ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 34, height: 34, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
            <p style={{ color: C.textSecond, fontSize: 13 }}>{authLoading ? 'Initializing...' : 'Loading workspace...'}</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, padding: 24, maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <p style={{ color: C.textPrimary, fontSize: 15, marginBottom: 8 }}>Loading timed out</p>
            <p style={{ color: C.textSecond, fontSize: 12, marginBottom: 18 }}>Check your connection and try again.</p>
            <button onClick={() => { setLoadTimeout(false); setLoading(true); if (user) loadProjects(); else loadGuestProjects(); }}
              style={{ width: '100%', padding: '7px 0', background: C.accent, color: '#fff', border: 'none', borderRadius: 3, fontWeight: 600, cursor: 'pointer', marginBottom: 8, fontSize: 13 }}>
              Retry
            </button>
            <button onClick={() => { localStorage.setItem('guestMode', 'true'); setLoadTimeout(false); navigate('/home'); window.location.reload(); }}
              style={{ width: '100%', padding: '7px 0', background: C.btnBg, color: C.textSecond, border: `1px solid ${C.border}`, borderRadius: 3, cursor: 'pointer', fontSize: 13 }}>
              Continue as Guest
            </button>
          </div>
        )}
      </div>
    );
  }

  const displayName = isGuest ? 'Guest' : (profile?.username || profile?.email || 'User');
  const TABS: { id: ActiveTab; label: string; disabled?: boolean }[] = [
    { id: 'yours', label: 'Yours' },
    { id: 'cloud', label: 'Cloud', disabled: true },
    { id: 'templates', label: 'Templates' },
  ];

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'inherit' }}>

      {/* ── Header ── */}
      <div style={{ height: 42, background: C.panel, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0, gap: 10 }}>
        <span style={{ color: C.textPrimary, fontSize: 13, fontWeight: 600, letterSpacing: 0.3 }}>Projects</span>
        <div style={{ flex: 1 }} />
        {!isGuest && <span style={{ color: C.textMuted, fontSize: 12 }}>{displayName}</span>}
        {!isGuest && (
          <HdrBtn onClick={() => setShowSettingsModal(true)} title="Settings">
            <Settings style={{ width: 14, height: 14 }} />
          </HdrBtn>
        )}
        {!isGuest && (
          <HdrBtn onClick={() => setShowLogoutModal(true)} title="Sign out">
            <LogOut style={{ width: 14, height: 14 }} />
          </HdrBtn>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ height: 38, background: C.panel, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-end', padding: '0 18px', flexShrink: 0 }}>
        {TABS.map(tab => (
          <TabBtn key={tab.id} active={activeTab === tab.id} disabled={!!tab.disabled} onClick={() => !tab.disabled && setActiveTab(tab.id)}>
            {tab.label}{tab.disabled && <span style={{ fontSize: 9, color: C.textDisabled, marginLeft: 5 }}>—</span>}
          </TabBtn>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 18px 0' }}>
        {activeTab === 'yours' && (
          projects.length === 0 ? (
            <EmptyState icon={<Film style={{ width: 42, height: 42, color: C.border }} />} title="No projects yet" sub='Click "New Project" below to get started' />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: 12 }}>
              {projects.map(p => (
                <ProjectCard key={p.id} project={p} isSelected={selectedProject?.id === p.id}
                  onSelect={() => setSelectedProject(p)} onDelete={e => handleDeleteProjectClick(p, e)} onOpen={handleOpenProject} />
              ))}
            </div>
          )
        )}
        {activeTab === 'cloud' && <EmptyState icon={<Cloud style={{ width: 42, height: 42, color: C.border }} />} title="Cloud projects" sub="Coming soon" />}
        {activeTab === 'templates' && <EmptyState icon={<Film style={{ width: 42, height: 42, color: C.border }} />} title="Templates" sub="No templates available yet" />}
      </div>

      {/* ── Bottom Bar ── */}
      <div style={{ height: 52, background: C.panel, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 14px', flexShrink: 0, gap: 8 }}>
        <BarBtn onClick={() => setShowLoadProjectModal(true)} icon={<Upload style={{ width: 12, height: 12 }} />} label="Import" />
        <div style={{ flex: 1 }} />
        <BarBtn onClick={() => setShowNewProjectModal(true)} label="New Project" />
        <OpenBtn active={!!selectedProject && activeTab === 'yours'} onClick={handleOpenProject} />
      </div>

      {/* ── Modals ── */}
      <NewProjectModal isOpen={showNewProjectModal} onClose={() => setShowNewProjectModal(false)} onCreate={handleNewProject} />
      <DeleteProjectModal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setProjectToDelete(null); }} onConfirm={handleConfirmDelete} projectName={projectToDelete?.name || ''} />
      <LoadProjectModal isOpen={showLoadProjectModal} onClose={() => setShowLoadProjectModal(false)} onLoad={handleUploadProject} />
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

      {showLogoutModal && (
        <div style={{ position: 'fixed', inset: 0, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: C.modalBg, border: `1px solid ${C.modalBorder}`, borderRadius: 3, padding: 22, maxWidth: 340, width: '100%', margin: '0 16px' }}>
            <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Sign Out</p>
            <p style={{ color: C.textSecond, fontSize: 12, marginBottom: 18 }}>You will need to log in again to access your projects.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLogoutModal(false)} style={{ flex: 1, padding: '7px 0', background: C.btnBg, border: `1px solid ${C.border}`, borderRadius: 3, color: C.textSecond, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              <button onClick={async () => { setShowLogoutModal(false); await handleSignOut(); }} style={{ flex: 1, padding: '7px 0', background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 3, color: C.danger, cursor: 'pointer', fontSize: 12 }}>Sign Out</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

/* ── Sub-components ── */

const HdrBtn: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 3, display: 'flex', alignItems: 'center', color: h ? '#94a3b8' : '#4a6080' }}>
      {children}
    </button>
  );
};

const TabBtn: React.FC<{ active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, disabled, onClick, children }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: 'none', border: 'none', borderBottom: active ? '2px solid #f59e0b' : '2px solid transparent', marginBottom: -1, padding: '0 14px', height: 36, fontSize: 13, fontWeight: active ? 500 : 400, color: disabled ? '#1e3050' : active ? '#e2e8f0' : h ? '#94a3b8' : '#4a6080', cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: 0.2 }}>
      {children}
    </button>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; sub: string }> = ({ icon, title, sub }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
    {icon}
    <p style={{ fontSize: 13, color: '#4a6080', marginTop: 14, marginBottom: 5 }}>{title}</p>
    <p style={{ fontSize: 11, color: '#2a3d55' }}>{sub}</p>
  </div>
);

const BarBtn: React.FC<{ onClick: () => void; label: string; icon?: React.ReactNode }> = ({ onClick, label, icon }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 13px', background: h ? '#1e2e48' : '#162038', border: '1px solid #1e3050', borderRadius: 3, color: h ? '#e2e8f0' : '#94a3b8', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {icon}{label}
    </button>
  );
};

const OpenBtn: React.FC<{ active: boolean; onClick: () => void }> = ({ active, onClick }) => {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={!active} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: '5px 18px', background: active ? (h ? '#d97706' : '#f59e0b') : '#162038', border: `1px solid ${active ? '#d97706' : '#1e3050'}`, borderRadius: 3, color: active ? '#fff' : '#3a5070', fontSize: 12, fontWeight: active ? 600 : 400, cursor: active ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
      Open
    </button>
  );
};
