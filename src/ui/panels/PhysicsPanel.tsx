import { useState } from 'react';
import { useEditorStore } from '../../store/editor';
import type { PhysicsBindingDef, PhysicsRoleDef, PhysicsColliderModeDef, PhysicsVelocitySourceDef } from '../../core/types';
import { Atom, Trash2, ChevronDown, ChevronRight, Zap } from 'lucide-react';

const EMPTY_BINDINGS: PhysicsBindingDef[] = [];

const ROLE_OPTIONS: { value: PhysicsRoleDef; label: string; desc: string }[] = [
  { value: 'dynamic', label: 'Dynamic', desc: 'Fully simulated by physics' },
  { value: 'kinematic', label: 'Kinematic', desc: 'Driven by keyframes, pushes others' },
  { value: 'static', label: 'Static', desc: 'Immovable barrier' },
  { value: 'ghost', label: 'Ghost', desc: 'Trigger zone, no collision response' },
];

const COLLIDER_OPTIONS: { value: PhysicsColliderModeDef; label: string }[] = [
  { value: 'boundingBox', label: 'Box' },
  { value: 'boundingCircle', label: 'Circle' },
  { value: 'convexHull', label: 'Convex Hull' },
  { value: 'polyline', label: 'Polyline' },
];

function BindingItem({ binding }: { binding: PhysicsBindingDef }) {
  const [expanded, setExpanded] = useState(false);
  const layers = useEditorStore((s) => s.composition.layers);
  const updatePhysicsBinding = useEditorStore((s) => s.updatePhysicsBinding);
  const removePhysicsBinding = useEditorStore((s) => s.removePhysicsBinding);

  const layerName = layers.find((l) => l.id === binding.layerId)?.name ?? 'Unknown';

  const roleColor = {
    dynamic: 'text-orange-400',
    kinematic: 'text-blue-400',
    static: 'text-slate-400',
    ghost: 'text-purple-400',
  }[binding.role];

  return (
    <div className="border border-[#1a2a42] rounded-md overflow-hidden">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 bg-[#0a1628] cursor-pointer hover:bg-[#0d1d35]"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Atom size={12} className={roleColor} />
        <span className="text-[11px] text-slate-300 truncate flex-1">{layerName}</span>
        <span className={`text-[9px] ${roleColor}`}>{binding.role}</span>
        <button
          onClick={(e) => { e.stopPropagation(); removePhysicsBinding(binding.id); }}
          className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-500/20 text-slate-500 hover:text-red-400"
        >
          <Trash2 size={9} />
        </button>
      </div>

      {expanded && (
        <div className="px-2 py-2 space-y-2.5 bg-[#060f1c]">
          {/* Role */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Role</div>
            <select
              value={binding.role}
              onChange={(e) => updatePhysicsBinding(binding.id, { role: e.target.value as PhysicsRoleDef })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
            >
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label} - {o.desc}</option>)}
            </select>
          </div>

          {/* Collider */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Collider Shape</div>
            <select
              value={binding.collider.mode}
              onChange={(e) => updatePhysicsBinding(binding.id, { collider: { ...binding.collider, mode: e.target.value as PhysicsColliderModeDef } })}
              className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
            >
              {COLLIDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Material */}
          <div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Material</div>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="text-[9px] text-slate-500">
                Mass
                <input type="number" value={binding.material.mass} step={0.1} min={0.01}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, mass: Math.max(0.01, +e.target.value) } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
              <label className="text-[9px] text-slate-500">
                Bounciness
                <input type="number" value={binding.material.restitution} step={0.05} min={0} max={1}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, restitution: Math.max(0, Math.min(1, +e.target.value)) } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
              <label className="text-[9px] text-slate-500">
                Friction
                <input type="number" value={binding.material.friction} step={0.05} min={0} max={2}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, friction: Math.max(0, +e.target.value) } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
              <label className="text-[9px] text-slate-500">
                Linear Damp
                <input type="number" value={binding.material.linearDamping} step={0.01} min={0}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, linearDamping: Math.max(0, +e.target.value) } })}
                  className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                />
              </label>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={binding.material.lockAxisX}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, lockAxisX: e.target.checked } })}
                  className="w-3 h-3 rounded"
                />
                Lock X
              </label>
              <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={binding.material.lockAxisY}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, lockAxisY: e.target.checked } })}
                  className="w-3 h-3 rounded"
                />
                Lock Y
              </label>
              <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={binding.material.lockRotation}
                  onChange={(e) => updatePhysicsBinding(binding.id, { material: { ...binding.material, lockRotation: e.target.checked } })}
                  className="w-3 h-3 rounded"
                />
                Lock Rot
              </label>
            </div>
          </div>

          {/* Birth Frame & Handoff (only for Dynamic) */}
          {binding.role === 'dynamic' && (
            <div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Activation</div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="text-[9px] text-slate-500">
                  Birth Frame
                  <input type="number" value={binding.birthFrame} min={0} step={1}
                    onChange={(e) => updatePhysicsBinding(binding.id, { birthFrame: Math.max(0, Math.round(+e.target.value)) })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
                <label className="text-[9px] text-slate-500">
                  End Frame
                  <input type="number" value={binding.endFrame ?? ''} min={0} step={1}
                    onChange={(e) => {
                      const val = e.target.value ? Math.max(0, Math.round(+e.target.value)) : undefined;
                      updatePhysicsBinding(binding.id, { endFrame: val });
                    }}
                    placeholder="None"
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
              </div>
              <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer mt-1.5">
                <input type="checkbox" checked={binding.solidBeforeActivation}
                  onChange={(e) => updatePhysicsBinding(binding.id, { solidBeforeActivation: e.target.checked })}
                  className="w-3 h-3 rounded"
                />
                Solid before activation
              </label>

              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 mt-2">Initial Velocity</div>
              <select
                value={binding.handoff.velocitySource}
                onChange={(e) => updatePhysicsBinding(binding.id, { handoff: { ...binding.handoff, velocitySource: e.target.value as PhysicsVelocitySourceDef } })}
                className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-0.5 text-[10px] text-slate-300 mb-1.5"
              >
                <option value="auto-derive">Auto-derive from keyframes</option>
                <option value="manual">Manual</option>
              </select>
              {binding.handoff.velocitySource === 'manual' ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[9px] text-slate-500">
                    Speed (px/s)
                    <input type="number" value={binding.handoff.manualMagnitude} step={10}
                      onChange={(e) => updatePhysicsBinding(binding.id, { handoff: { ...binding.handoff, manualMagnitude: +e.target.value } })}
                      className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                    />
                  </label>
                  <label className="text-[9px] text-slate-500">
                    Angle (deg)
                    <input type="number" value={binding.handoff.manualAngleDeg} step={5}
                      onChange={(e) => updatePhysicsBinding(binding.id, { handoff: { ...binding.handoff, manualAngleDeg: +e.target.value } })}
                      className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                    />
                  </label>
                </div>
              ) : (
                <label className="text-[9px] text-slate-500">
                  Sample Window (frames)
                  <input type="number" value={binding.handoff.deriveSampleWindow} min={1} max={10} step={1}
                    onChange={(e) => updatePhysicsBinding(binding.id, { handoff: { ...binding.handoff, deriveSampleWindow: Math.max(1, Math.round(+e.target.value)) } })}
                    className="w-full bg-[#0a1628] border border-[#1a2a42] rounded px-1 py-0.5 text-[10px] text-slate-300 mt-0.5"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PhysicsPanel() {
  const physicsBindings = useEditorStore((s) => s.composition.physicsBindings) ?? EMPTY_BINDINGS;
  const physicsWorld = useEditorStore((s) => s.composition.physicsWorld);
  const selectedIds = useEditorStore((s) => s.selection.selectedIds);
  const addPhysicsBinding = useEditorStore((s) => s.addPhysicsBinding);
  const updatePhysicsWorld = useEditorStore((s) => s.updatePhysicsWorld);
  const bakeStatus = useEditorStore((s) => s.physicsBakeStatus);

  const [selectedRole, setSelectedRole] = useState<PhysicsRoleDef>('dynamic');
  const activeLayerId = selectedIds[0] ?? null;

  const currentBinding = physicsBindings.find((b) => b.layerId === activeLayerId);
  const worldEnabled = physicsWorld?.enabled ?? false;

  return (
    <div className="px-2 py-2 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium text-slate-300 flex items-center gap-1.5">
          <Atom size={12} className="text-emerald-400" />
          Physics
        </h3>
        <span className="text-[9px] text-slate-600">{physicsBindings.length} object{physicsBindings.length !== 1 ? 's' : ''}</span>
      </div>

      {!worldEnabled && (
        <div className="border border-amber-500/20 rounded-md bg-amber-500/5 px-2.5 py-2 space-y-1.5">
          <p className="text-[10px] text-amber-400/90">World physics is disabled.</p>
          <p className="text-[9px] text-slate-500">Enable the physics world to simulate objects.</p>
          <button
            onClick={() => updatePhysicsWorld({ enabled: true })}
            className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/20 font-medium"
          >
            Enable Physics World
          </button>
        </div>
      )}

      {worldEnabled && bakeStatus === 'done' && (
        <div className="px-2 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded text-[9px] text-emerald-400/70 text-center">
          Simulation active
        </div>
      )}

      {worldEnabled && bakeStatus === 'stale' && (
        <div className="px-2 py-1 bg-orange-500/5 border border-orange-500/20 rounded text-[9px] text-orange-400/70 text-center">
          Settings changed - auto-rebaking...
        </div>
      )}

      {activeLayerId && !currentBinding && (
        <div className="flex items-center gap-1">
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as PhysicsRoleDef)}
            className="flex-1 bg-[#0a1628] border border-[#1a2a42] rounded px-1.5 py-1 text-[10px] text-slate-300"
          >
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => { if (activeLayerId) addPhysicsBinding(activeLayerId, selectedRole); }}
            className="px-1.5 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/20 flex items-center gap-0.5"
          >
            <Zap size={9} /> Enable
          </button>
        </div>
      )}

      {currentBinding && (
        <BindingItem binding={currentBinding} />
      )}

      {physicsBindings.length === 0 && !activeLayerId && (
        <div className="text-[10px] text-slate-600 text-center py-3">
          No physics objects. Select a layer and assign a physics role to begin simulation.
        </div>
      )}

      {physicsBindings.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider">All Physics Objects</div>
          {physicsBindings.filter((b) => b.layerId !== activeLayerId).map((binding) => (
            <BindingItem key={binding.id} binding={binding} />
          ))}
        </div>
      )}
    </div>
  );
}
