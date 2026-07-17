import React, { useState, useCallback, useRef } from 'react';
import { DesignElement } from '../../types/design';
import { ChevronDown, ChevronRight, Type, Palette, Sparkles, LayoutGrid as Layout, Info, Upload, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { useFonts } from '../../hooks/useFonts';
import { v4 as uuidv4 } from 'uuid';

interface AdvancedTextSettingsPanelProps {
  element: DesignElement;
  onUpdate: (updates: Partial<DesignElement>) => void;
  onApplyTextAnimationControl?: (elementId: string) => void;
}

const AdvancedTextSettingsPanel: React.FC<AdvancedTextSettingsPanelProps> = ({
  element,
  onUpdate,
  onApplyTextAnimationControl
}) => {
  const [activeSubtab, setActiveSubtab] = useState<'styling' | 'motion'>('styling');
  const [expandedSections, setExpandedSections] = useState({
    typography: true,
    fill: true,
    texture: false,
    pattern: false,
    stroke: false,
    shadow: false,
    spacing: false,
    layout: false,
  });

  const textureInputRef = useRef<HTMLInputElement>(null);

  const { getAllFonts, loadGoogleFont, addCustomFont, removeCustomFont } = useFonts();
  const allFonts = getAllFonts();

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleFontUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    try {
      const fontFamily = await addCustomFont(file);
      onUpdate({ fontFamily });
    } catch (error) {
      console.error('Failed to upload font:', error);
      alert('Failed to upload font. Please try again.');
    }
  }, [addCustomFont, onUpdate]);

  const handleTextureUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      onUpdate({
        textTextureFillEnabled: true,
        textTextureFillImage: imageData,
        textTextureFillScale: 100,
        textTextureFillOffsetX: 0,
        textTextureFillOffsetY: 0
      });
    };
    reader.readAsDataURL(file);
  }, [onUpdate]);

  const initializeGradientColors = useCallback(() => {
    if (!element.textGradientColors || element.textGradientColors.length < 2) {
      onUpdate({
        textGradientEnabled: true,
        textGradientType: 'linear',
        textGradientAngle: 90,
        textGradientColors: [
          { color: '#FF0080', position: 0, id: uuidv4() },
          { color: '#7928CA', position: 100, id: uuidv4() }
        ]
      });
    } else {
      onUpdate({ textGradientEnabled: true });
    }
  }, [element.textGradientColors, onUpdate]);

  const addGradientColor = useCallback(() => {
    const existingColors = element.textGradientColors || [];
    const newPosition = existingColors.length > 0
      ? Math.max(...existingColors.map(c => c.position)) + 10
      : 50;
    const newColors = [...existingColors, { color: '#FFFFFF', position: Math.min(newPosition, 100), id: uuidv4() }];
    onUpdate({ textGradientColors: newColors });
  }, [element.textGradientColors, onUpdate]);

  const removeGradientColor = useCallback((id: string) => {
    const newColors = (element.textGradientColors || []).filter(c => c.id !== id);
    if (newColors.length >= 2) {
      onUpdate({ textGradientColors: newColors });
    }
  }, [element.textGradientColors, onUpdate]);

  const addRichTextSegment = useCallback(() => {
    const segments = element.richTextSegments || [];
    const newSegment = {
      id: uuidv4(),
      text: 'New text',
      fontFamily: element.fontFamily || 'Inter',
      fontSize: element.fontSize || 16,
      fontWeight: element.fontWeight || '400',
      fontStyle: (element.fontStyle || 'normal') as 'normal' | 'italic' | 'oblique',
      color: element.textColor || '#FFFFFF',
      textDecoration: (element.textDecoration || 'none') as 'none' | 'underline' | 'line-through' | 'overline',
      letterSpacing: element.letterSpacing || 0
    };
    onUpdate({
      richTextEnabled: true,
      richTextSegments: [...segments, newSegment]
    });
  }, [element, onUpdate]);

  const updateRichTextSegment = useCallback((id: string, updates: Partial<typeof element.richTextSegments>[0]) => {
    const segments = element.richTextSegments || [];
    const newSegments = segments.map(seg =>
      seg.id === id ? { ...seg, ...updates } : seg
    );
    onUpdate({ richTextSegments: newSegments });
  }, [element.richTextSegments, onUpdate]);

  const removeRichTextSegment = useCallback((id: string) => {
    const segments = element.richTextSegments || [];
    const newSegments = segments.filter(seg => seg.id !== id);
    onUpdate({ richTextSegments: newSegments });
  }, [element.richTextSegments, onUpdate]);

  const convertToRichText = useCallback(() => {
    if (element.text) {
      onUpdate({
        richTextEnabled: true,
        richTextSegments: [{
          id: uuidv4(),
          text: element.text,
          fontFamily: element.fontFamily || 'Inter',
          fontSize: element.fontSize || 16,
          fontWeight: element.fontWeight || '400',
          fontStyle: (element.fontStyle || 'normal') as 'normal' | 'italic' | 'oblique',
          color: element.textColor || '#FFFFFF',
          textDecoration: (element.textDecoration || 'none') as 'none' | 'underline' | 'line-through' | 'overline',
          letterSpacing: element.letterSpacing || 0
        }]
      });
    }
  }, [element, onUpdate]);

  const fontWeights = [
    { value: '100', label: 'Thin (100)' },
    { value: '200', label: 'Extra Light (200)' },
    { value: '300', label: 'Light (300)' },
    { value: '400', label: 'Regular (400)' },
    { value: '500', label: 'Medium (500)' },
    { value: '600', label: 'Semi Bold (600)' },
    { value: '700', label: 'Bold (700)' },
    { value: '800', label: 'Extra Bold (800)' },
    { value: '900', label: 'Black (900)' }
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Subtab Bar */}
      <div className="border-b border-gray-700/50">
        <div className="flex">
          <button
            onClick={() => setActiveSubtab('styling')}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              activeSubtab === 'styling'
                ? 'bg-gray-700/50 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
            }`}
          >
            Styling
          </button>
          <button
            onClick={() => setActiveSubtab('motion')}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              activeSubtab === 'motion'
                ? 'bg-gray-700/50 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
            }`}
          >
            Motion Control
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeSubtab === 'styling' ? (
          <div className="space-y-2 text-sm p-3">
            {/* Typography Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('typography')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors text-white"
        >
          <div className="flex items-center gap-2">
            <Type className="w-4 h-4 text-white" />
            <span className="font-medium text-white">Typography</span>
          </div>
          {expandedSections.typography ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
        </button>

        {expandedSections.typography && (
          <div className="p-3 bg-gray-800/50 space-y-3">
            {/* Text Content */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Content</label>
              <textarea
                value={element.text || ''}
                onChange={(e) => onUpdate({ text: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Enter text..."
              />
            </div>

            {/* Font Family */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Font Family</label>
              <div className="flex gap-2">
                <select
                  value={element.fontFamily || 'Inter'}
                  onChange={(e) => {
                    const fontFamily = e.target.value;
                    onUpdate({ fontFamily });
                    const font = allFonts.find(f => f.family === fontFamily);
                    if (font && font.category === 'google') {
                      loadGoogleFont(fontFamily);
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontFamily: element.fontFamily || 'Inter' }}
                >
                  <optgroup label="System Fonts">
                    {allFonts.filter(f => f.category === 'system').map(font => (
                      <option key={font.family} value={font.family} style={{ fontFamily: font.family }}>
                        {font.family}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Google Fonts">
                    {allFonts.filter(f => f.category === 'google').map(font => (
                      <option key={font.family} value={font.family} style={{ fontFamily: font.family }}>
                        {font.family}
                      </option>
                    ))}
                  </optgroup>
                  {allFonts.filter(f => f.category === 'custom').length > 0 && (
                    <optgroup label="Custom Fonts">
                      {allFonts.filter(f => f.category === 'custom').map(font => (
                        <option key={font.family} value={font.family} style={{ fontFamily: font.family }}>
                          {font.family}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded cursor-pointer flex items-center justify-center transition-colors">
                  <input
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    onChange={handleFontUpload}
                    className="hidden"
                  />
                  <span className="text-sm">Upload</span>
                </label>
              </div>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Font Size (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="8"
                  max="300"
                  value={element.fontSize || 16}
                  onChange={(e) => onUpdate({ fontSize: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.fontSize || 16}
                  onChange={(e) => onUpdate({ fontSize: parseFloat(e.target.value) || 16 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                />
              </div>
            </div>

            {/* Font Weight */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Font Weight</label>
              <select
                value={element.fontWeight || '400'}
                onChange={(e) => onUpdate({ fontWeight: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {fontWeights.map(weight => (
                  <option key={weight.value} value={weight.value}>
                    {weight.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Style */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Font Style</label>
              <div className="flex gap-2">
                {(['normal', 'italic', 'oblique'] as const).map(style => (
                  <button
                    key={style}
                    onClick={() => onUpdate({ fontStyle: style })}
                    className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                      (element.fontStyle || 'normal') === style
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Transform */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Transform</label>
              <select
                value={element.textTransform || 'none'}
                onChange={(e) => onUpdate({ textTransform: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">None</option>
                <option value="uppercase">UPPERCASE</option>
                <option value="lowercase">lowercase</option>
                <option value="capitalize">Capitalize</option>
                <option value="small-caps">Small Caps</option>
              </select>
            </div>

            {/* Text Decoration */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Decoration</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'none', label: 'None' },
                  { value: 'underline', label: 'Underline' },
                  { value: 'line-through', label: 'Strike' },
                  { value: 'overline', label: 'Overline' }
                ] as const).map(decoration => (
                  <button
                    key={decoration.value}
                    onClick={() => onUpdate({ textDecoration: decoration.value })}
                    className={`px-3 py-2 rounded text-sm transition-colors ${
                      (element.textDecoration || 'none') === decoration.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {decoration.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fill & Color Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('fill')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors text-white"
        >
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-white" />
            <span className="font-medium text-white">Fill & Color</span>
          </div>
          {expandedSections.fill ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
        </button>

        {expandedSections.fill && (
          <div className="p-3 bg-gray-800/50 space-y-3">
            {/* Text Color */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={element.textColor || '#FFFFFF'}
                  onChange={(e) => onUpdate({ textColor: e.target.value })}
                  className="w-12 h-10 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={element.textColor || '#FFFFFF'}
                  onChange={(e) => onUpdate({ textColor: e.target.value })}
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>

            {/* Gradient Fill Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-900 rounded">
              <span className="text-sm">Enable Gradient Fill</span>
              <button
                onClick={() => {
                  if (!element.textGradientEnabled) {
                    initializeGradientColors();
                  } else {
                    onUpdate({ textGradientEnabled: false });
                  }
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${
                  element.textGradientEnabled ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  element.textGradientEnabled ? 'translate-x-7' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Gradient Settings */}
            {element.textGradientEnabled && (
              <>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Gradient Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onUpdate({ textGradientType: 'linear' })}
                      className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                        (element.textGradientType || 'linear') === 'linear'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      Linear
                    </button>
                    <button
                      onClick={() => onUpdate({ textGradientType: 'radial' })}
                      className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                        (element.textGradientType || 'linear') === 'radial'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      Radial
                    </button>
                  </div>
                </div>

                {element.textGradientType === 'linear' && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Gradient Angle (°)</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={element.textGradientAngle || 90}
                        onChange={(e) => onUpdate({ textGradientAngle: parseFloat(e.target.value) })}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={element.textGradientAngle || 90}
                        onChange={(e) => onUpdate({ textGradientAngle: parseFloat(e.target.value) || 90 })}
                        className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {/* Gradient Colors */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-gray-400">Gradient Colors</label>
                    <button
                      onClick={addGradientColor}
                      className="p-1 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
                      title="Add color stop"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(element.textGradientColors || []).map((colorStop, index) => (
                      <div key={colorStop.id} className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={colorStop.color}
                          onChange={(e) => {
                            const newColors = [...(element.textGradientColors || [])];
                            newColors[index] = { ...colorStop, color: e.target.value };
                            onUpdate({ textGradientColors: newColors });
                          }}
                          className="w-10 h-8 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={colorStop.color}
                          onChange={(e) => {
                            const newColors = [...(element.textGradientColors || [])];
                            newColors[index] = { ...colorStop, color: e.target.value };
                            onUpdate({ textGradientColors: newColors });
                          }}
                          className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                          type="number"
                          value={colorStop.position}
                          onChange={(e) => {
                            const newColors = [...(element.textGradientColors || [])];
                            newColors[index] = { ...colorStop, position: parseFloat(e.target.value) };
                            onUpdate({ textGradientColors: newColors });
                          }}
                          className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="100"
                        />
                        <span className="text-xs text-gray-400">%</span>
                        {(element.textGradientColors || []).length > 2 && (
                          <button
                            onClick={() => removeGradientColor(colorStop.id)}
                            className="p-1 bg-red-600/50 hover:bg-red-600 rounded text-white transition-colors"
                            title="Remove color stop"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Gradient Preview */}
                  {element.textGradientColors && element.textGradientColors.length >= 2 && (
                    <div className="mt-3">
                      <label className="block text-xs text-gray-400 mb-1.5">Preview</label>
                      <div
                        className="h-8 rounded border border-gray-700"
                        style={{
                          background: element.textGradientType === 'radial'
                            ? `radial-gradient(circle, ${[...element.textGradientColors].sort((a, b) => a.position - b.position).map(c => `${c.color} ${c.position}%`).join(', ')})`
                            : `linear-gradient(${element.textGradientAngle || 90}deg, ${[...element.textGradientColors].sort((a, b) => a.position - b.position).map(c => `${c.color} ${c.position}%`).join(', ')})`
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Texture Fill Sub-section */}
            <div className="border border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('texture')}
                className="w-full flex items-center justify-between p-2.5 bg-gray-700/50 hover:bg-gray-700 transition-colors text-white"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-white" />
                  <span className="text-sm text-white">Texture Fill</span>
                </div>
                {expandedSections.texture ? <ChevronDown className="w-3.5 h-3.5 text-white" /> : <ChevronRight className="w-3.5 h-3.5 text-white" />}
              </button>

              {expandedSections.texture && (
                <div className="p-3 bg-gray-800/30 space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-900 rounded">
                    <span className="text-sm">Enable Texture Fill</span>
                    <button
                      onClick={() => onUpdate({ textTextureFillEnabled: !element.textTextureFillEnabled })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        element.textTextureFillEnabled ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        element.textTextureFillEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Texture Image</label>
                    <input
                      ref={textureInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleTextureUpload}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => textureInputRef.current?.click()}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Image
                      </button>
                      {element.textTextureFillImage && (
                        <button
                          onClick={() => onUpdate({ textTextureFillImage: undefined, textTextureFillEnabled: false })}
                          className="px-3 py-2 bg-red-600/50 hover:bg-red-600 rounded text-sm transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {element.textTextureFillImage && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Preview</label>
                      <div className="w-full h-20 bg-gray-900 rounded border border-gray-700 overflow-hidden">
                        <img
                          src={element.textTextureFillImage}
                          alt="Texture preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  )}

                  {element.textTextureFillEnabled && element.textTextureFillImage && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Scale (%)</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="range"
                            min="10"
                            max="500"
                            value={element.textTextureFillScale || 100}
                            onChange={(e) => onUpdate({ textTextureFillScale: parseFloat(e.target.value) })}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            value={element.textTextureFillScale || 100}
                            onChange={(e) => onUpdate({ textTextureFillScale: parseFloat(e.target.value) || 100 })}
                            className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1.5">Offset X (px)</label>
                          <input
                            type="number"
                            value={element.textTextureFillOffsetX || 0}
                            onChange={(e) => onUpdate({ textTextureFillOffsetX: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1.5">Offset Y (px)</label>
                          <input
                            type="number"
                            value={element.textTextureFillOffsetY || 0}
                            onChange={(e) => onUpdate({ textTextureFillOffsetY: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Pattern Fill Sub-section */}
            <div className="border border-gray-600 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('pattern')}
                className="w-full flex items-center justify-between p-2.5 bg-gray-700/50 hover:bg-gray-700 transition-colors text-white"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <span className="text-sm text-white">Pattern Fill</span>
                </div>
                {expandedSections.pattern ? <ChevronDown className="w-3.5 h-3.5 text-white" /> : <ChevronRight className="w-3.5 h-3.5 text-white" />}
              </button>

              {expandedSections.pattern && (
                <div className="p-3 bg-gray-800/30 space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-900 rounded">
                    <span className="text-sm">Enable Pattern Fill</span>
                    <button
                      onClick={() => {
                        if (!element.textPatternFillEnabled) {
                          onUpdate({
                            textPatternFillEnabled: true,
                            textPatternType: element.textPatternType || 'dots',
                            textPatternColor: element.textPatternColor || '#FFFFFF',
                            textPatternBackgroundColor: element.textPatternBackgroundColor || '#000000',
                            textPatternSize: element.textPatternSize || 10,
                            textPatternSpacing: element.textPatternSpacing || 5,
                            textPatternAngle: element.textPatternAngle || 0
                          });
                        } else {
                          onUpdate({ textPatternFillEnabled: false });
                        }
                      }}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        element.textPatternFillEnabled ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        element.textPatternFillEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {element.textPatternFillEnabled && (
                    <>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Pattern Type</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['dots', 'lines', 'grid', 'diagonal', 'chevron'] as const).map(type => (
                            <button
                              key={type}
                              onClick={() => onUpdate({ textPatternType: type })}
                              className={`px-3 py-2 rounded text-xs transition-colors ${
                                (element.textPatternType || 'dots') === type
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                              }`}
                            >
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Pattern Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={element.textPatternColor || '#FFFFFF'}
                            onChange={(e) => onUpdate({ textPatternColor: e.target.value })}
                            className="w-12 h-10 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={element.textPatternColor || '#FFFFFF'}
                            onChange={(e) => onUpdate({ textPatternColor: e.target.value })}
                            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Background Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={element.textPatternBackgroundColor || '#000000'}
                            onChange={(e) => onUpdate({ textPatternBackgroundColor: e.target.value })}
                            className="w-12 h-10 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={element.textPatternBackgroundColor || '#000000'}
                            onChange={(e) => onUpdate({ textPatternBackgroundColor: e.target.value })}
                            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Pattern Size (px)</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="range"
                            min="2"
                            max="50"
                            value={element.textPatternSize || 10}
                            onChange={(e) => onUpdate({ textPatternSize: parseFloat(e.target.value) })}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            value={element.textPatternSize || 10}
                            onChange={(e) => onUpdate({ textPatternSize: parseFloat(e.target.value) || 10 })}
                            className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Pattern Spacing (px)</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="range"
                            min="0"
                            max="50"
                            value={element.textPatternSpacing || 5}
                            onChange={(e) => onUpdate({ textPatternSpacing: parseFloat(e.target.value) })}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            value={element.textPatternSpacing || 5}
                            onChange={(e) => onUpdate({ textPatternSpacing: parseFloat(e.target.value) || 5 })}
                            className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">Pattern Angle (deg)</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={element.textPatternAngle || 0}
                            onChange={(e) => onUpdate({ textPatternAngle: parseFloat(e.target.value) })}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            value={element.textPatternAngle || 0}
                            onChange={(e) => onUpdate({ textPatternAngle: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {/* Stroke Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('stroke')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors text-white"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="font-medium text-white">Text Stroke / Outline</span>
          </div>
          {expandedSections.stroke ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
        </button>

        {expandedSections.stroke && (
          <div className="p-3 bg-gray-800/50 space-y-3">
            {/* Stroke Color */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Stroke Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={element.textStrokeColor || '#000000'}
                  onChange={(e) => onUpdate({ textStrokeColor: e.target.value })}
                  className="w-12 h-10 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={element.textStrokeColor || '#000000'}
                  onChange={(e) => onUpdate({ textStrokeColor: e.target.value })}
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Stroke Width */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Stroke Width (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={element.textStrokeWidth || 0}
                  onChange={(e) => onUpdate({ textStrokeWidth: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.textStrokeWidth || 0}
                  onChange={(e) => onUpdate({ textStrokeWidth: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.5"
                />
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Shadow & Glow Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('shadow')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors text-white"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-white" />
            <span className="font-medium text-white">Shadow & Glow</span>
          </div>
          {expandedSections.shadow ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
        </button>

        {expandedSections.shadow && (
          <div className="p-3 bg-gray-800/50 space-y-3">
            <p className="text-xs font-medium text-gray-300">Shadow</p>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Shadow Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={element.textShadowColor || '#000000'}
                  onChange={(e) => onUpdate({ textShadowColor: e.target.value })}
                  className="w-12 h-10 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={element.textShadowColor || '#000000'}
                  onChange={(e) => onUpdate({ textShadowColor: e.target.value })}
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="#000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Horizontal Offset (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={element.textShadowOffsetX || 0}
                  onChange={(e) => onUpdate({ textShadowOffsetX: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.textShadowOffsetX || 0}
                  onChange={(e) => onUpdate({ textShadowOffsetX: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Vertical Offset (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={element.textShadowOffsetY || 0}
                  onChange={(e) => onUpdate({ textShadowOffsetY: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.textShadowOffsetY || 0}
                  onChange={(e) => onUpdate({ textShadowOffsetY: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Blur Radius (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={element.textShadowBlur || 0}
                  onChange={(e) => onUpdate({ textShadowBlur: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.textShadowBlur || 0}
                  onChange={(e) => onUpdate({ textShadowBlur: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-700 pt-3">
              <p className="text-xs font-medium text-gray-300 mb-3">Glow</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Glow Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={element.textGlowColor || '#FFFFFF'}
                      onChange={(e) => onUpdate({ textGlowColor: e.target.value })}
                      className="w-12 h-10 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={element.textGlowColor || '#FFFFFF'}
                      onChange={(e) => onUpdate({ textGlowColor: e.target.value })}
                      className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Glow Size (px)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={element.textGlowSize || 0}
                      onChange={(e) => onUpdate({ textGlowSize: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      value={element.textGlowSize || 0}
                      onChange={(e) => onUpdate({ textGlowSize: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Glow Intensity</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={element.textGlowIntensity || 0}
                      onChange={(e) => onUpdate({ textGlowIntensity: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      value={element.textGlowIntensity || 0}
                      onChange={(e) => onUpdate({ textGlowIntensity: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      step="0.1"
                      min="0"
                      max="1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spacing Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('spacing')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors text-white"
        >
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-white" />
            <span className="font-medium text-white">Spacing & Baseline</span>
          </div>
          {expandedSections.spacing ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
        </button>

        {expandedSections.spacing && (
          <div className="p-3 bg-gray-800/50 space-y-3">
            {/* Letter Spacing */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Letter Spacing (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="-10"
                  max="50"
                  step="0.1"
                  value={element.letterSpacing || 0}
                  onChange={(e) => onUpdate({ letterSpacing: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.letterSpacing || 0}
                  onChange={(e) => onUpdate({ letterSpacing: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                />
              </div>
            </div>

            {/* Line Height */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Line Height</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={element.lineHeight || 1.2}
                  onChange={(e) => onUpdate({ lineHeight: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.lineHeight || 1.2}
                  onChange={(e) => onUpdate({ lineHeight: parseFloat(e.target.value) || 1.2 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                />
              </div>
            </div>

            {/* Word Spacing */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Word Spacing (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="-20"
                  max="50"
                  step="0.5"
                  value={element.wordSpacing || 0}
                  onChange={(e) => onUpdate({ wordSpacing: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.wordSpacing || 0}
                  onChange={(e) => onUpdate({ wordSpacing: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  step="0.5"
                />
              </div>
            </div>

            {/* Baseline Shift */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Baseline Shift (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="-20"
                  max="20"
                  value={element.baselineShift || 0}
                  onChange={(e) => onUpdate({ baselineShift: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.baselineShift || 0}
                  onChange={(e) => onUpdate({ baselineShift: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Positive = superscript, Negative = subscript</p>
            </div>

            {/* Text Indent */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Indent (px)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={element.textIndent || 0}
                  onChange={(e) => onUpdate({ textIndent: parseFloat(e.target.value) })}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={element.textIndent || 0}
                  onChange={(e) => onUpdate({ textIndent: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Layout Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('layout')}
          className="w-full flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-750 transition-colors text-white"
        >
          <div className="flex items-center gap-2">
            <Layout className="w-4 h-4 text-white" />
            <span className="font-medium text-white">Layout & Alignment</span>
          </div>
          {expandedSections.layout ? <ChevronDown className="w-4 h-4 text-white" /> : <ChevronRight className="w-4 h-4 text-white" />}
        </button>

        {expandedSections.layout && (
          <div className="p-3 bg-gray-800/50 space-y-3">
            {/* Horizontal Alignment */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Horizontal Alignment</label>
              <div className="grid grid-cols-4 gap-2">
                {(['left', 'center', 'right', 'justify'] as const).map(align => (
                  <button
                    key={align}
                    onClick={() => onUpdate({ textAlign: align })}
                    className={`px-3 py-2 rounded text-sm transition-colors ${
                      (element.textAlign || 'left') === align
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Vertical Alignment */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Vertical Alignment</label>
              <div className="grid grid-cols-3 gap-2">
                {(['top', 'middle', 'bottom'] as const).map(align => (
                  <button
                    key={align}
                    onClick={() => onUpdate({ verticalAlign: align })}
                    className={`px-3 py-2 rounded text-sm transition-colors ${
                      (element.verticalAlign || 'middle') === align
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Wrap */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Wrapping</label>
              <select
                value={element.textWrap || 'wrap'}
                onChange={(e) => onUpdate({ textWrap: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="wrap">Wrap</option>
                <option value="nowrap">No Wrap</option>
                <option value="balance">Balance (experimental)</option>
              </select>
            </div>

            {/* Text Overflow */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Text Overflow</label>
              <select
                value={element.textOverflow || 'visible'}
                onChange={(e) => onUpdate({ textOverflow: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="visible">Visible</option>
                <option value="clip">Clip</option>
                <option value="ellipsis">Ellipsis (...)</option>
              </select>
            </div>

            {/* Max Lines */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Maximum Lines (0 = unlimited)</label>
              <input
                type="number"
                value={element.maxLines || 0}
                onChange={(e) => onUpdate({ maxLines: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
              />
            </div>

            {/* Text Padding */}
            <div>
              <label className="block text-xs text-gray-400 mb-2">Text Padding (px)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Top</label>
                  <input
                    type="number"
                    value={element.textPaddingTop || 0}
                    onChange={(e) => onUpdate({ textPaddingTop: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Right</label>
                  <input
                    type="number"
                    value={element.textPaddingRight || 0}
                    onChange={(e) => onUpdate({ textPaddingRight: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bottom</label>
                  <input
                    type="number"
                    value={element.textPaddingBottom || 0}
                    onChange={(e) => onUpdate({ textPaddingBottom: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Left</label>
                  <input
                    type="number"
                    value={element.textPaddingLeft || 0}
                    onChange={(e) => onUpdate({ textPaddingLeft: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Motion Control Tab Content */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2 text-blue-300 text-xs">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Animation Control</p>
                  <p className="text-blue-300/70">
                    Control how animations are applied to your text. Choose between animating the whole text at once, or breaking it down per line, word, or character with stagger timing.
                  </p>
                </div>
              </div>
            </div>

            {/* Animation Mode */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-2">Animation Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'whole', label: 'Whole Text', desc: 'Animate entire text as one unit' },
                    { value: 'line', label: 'Per Line', desc: 'Animate each line separately' },
                    { value: 'word', label: 'Per Word', desc: 'Animate each word separately' },
                    { value: 'character', label: 'Per Character', desc: 'Animate each character separately' }
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => onUpdate({ textAnimationMode: value as any })}
                      className={`p-3 rounded-lg border-2 transition-all text-left ${
                        (element.textAnimationMode || 'whole') === value
                          ? 'border-blue-500 bg-blue-500/20 text-white'
                          : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-gray-400 mt-1">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Stagger Delay (only show if not "whole") */}
              {element.textAnimationMode && element.textAnimationMode !== 'whole' && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-2">
                    Time Gap Between {element.textAnimationMode === 'line' ? 'Lines' : element.textAnimationMode === 'word' ? 'Words' : 'Characters'} (seconds)
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={element.textAnimationStaggerDelay || 0.1}
                        onChange={(e) => onUpdate({ textAnimationStaggerDelay: parseFloat(e.target.value) })}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.05"
                        value={element.textAnimationStaggerDelay || 0.1}
                        onChange={(e) => onUpdate({ textAnimationStaggerDelay: parseFloat(e.target.value) || 0.1 })}
                        className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-400">s</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Delay between each {element.textAnimationMode} animation start
                    </p>
                  </div>
                </div>
              )}

              {/* Example Calculation */}
              {element.textAnimationMode && element.textAnimationMode !== 'whole' && element.text && (
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <p className="text-xs font-medium text-gray-300 mb-2">Animation Preview Info</p>
                  <div className="space-y-1 text-xs text-gray-400">
                    {element.textAnimationMode === 'word' && (
                      <>
                        <p>Total words: {element.text.trim().split(/\s+/).length}</p>
                        <p>Time gap: {(element.textAnimationStaggerDelay || 0.1).toFixed(2)}s</p>
                        <p>Total animation spread: ~{(element.text.trim().split(/\s+/).length * (element.textAnimationStaggerDelay || 0.1)).toFixed(2)}s</p>
                      </>
                    )}
                    {element.textAnimationMode === 'character' && (
                      <>
                        <p>Total characters: {element.text.length}</p>
                        <p>Time gap: {(element.textAnimationStaggerDelay || 0.1).toFixed(2)}s</p>
                        <p>Total animation spread: ~{(element.text.length * (element.textAnimationStaggerDelay || 0.1)).toFixed(2)}s</p>
                      </>
                    )}
                    {element.textAnimationMode === 'line' && (
                      <>
                        <p>Total lines: {element.text.split('\n').length}</p>
                        <p>Time gap: {(element.textAnimationStaggerDelay || 0.1).toFixed(2)}s</p>
                        <p>Total animation spread: ~{(element.text.split('\n').length * (element.textAnimationStaggerDelay || 0.1)).toFixed(2)}s</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {element.textAnimationMode && element.textAnimationMode !== 'whole' && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-xs font-medium text-blue-400 mb-1">How to use:</p>
                  <ol className="list-decimal list-inside text-xs text-blue-300/80 space-y-1">
                    <li>Choose your animation mode and time gap above</li>
                    <li>Click the green "Update" button below to apply the changes</li>
                    <li>Your text will be split into separate animated elements</li>
                    <li>Go to the FX tab to customize individual animations if needed</li>
                  </ol>
                </div>
              )}

              {/* Update Button - Placed under "How to use" panel */}
              {element.textAnimationMode && element.textAnimationMode !== 'whole' && onApplyTextAnimationControl && (
                <div className="pt-3">
                  <button
                    onClick={() => onApplyTextAnimationControl(element.id)}
                    className="w-full px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold rounded-lg transition-all shadow-lg text-sm flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update to Per-{element.textAnimationMode === 'line' ? 'Line' : element.textAnimationMode === 'word' ? 'Word' : 'Character'} Animation
                  </button>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    This will split your text into {element.textAnimationMode === 'line' ? 'lines' : element.textAnimationMode === 'word' ? 'words' : 'characters'} with staggered animation
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedTextSettingsPanel;
