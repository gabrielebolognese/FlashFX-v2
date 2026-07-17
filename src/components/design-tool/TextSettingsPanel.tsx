import React, { useState, useRef, useCallback } from 'react';
import { 
  Type, 
  Search, 
  Upload, 
  Bold, 
  Italic, 
  Underline, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  MoreHorizontal,
  X,
  Download,
  Trash2
} from 'lucide-react';
import { DesignElement } from '../../types/design';
import { AdvancedTextProperties } from '../../types/fonts';
import { useFonts } from '../../hooks/useFonts';

interface TextSettingsPanelProps {
  selectedElements: DesignElement[];
  updateElement: (id: string, updates: Partial<DesignElement>) => void;
  isOpen: boolean;
  onClose: () => void;
}

const TextSettingsPanel: React.FC<TextSettingsPanelProps> = ({
  selectedElements,
  updateElement,
  isOpen,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [selectedFontCategory, setSelectedFontCategory] = useState<'all' | 'system' | 'google' | 'custom'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    googleFonts, 
    customFonts, 
    loadedFonts, 
    loadGoogleFont, 
    addCustomFont, 
    removeCustomFont, 
    getAllFonts 
  } = useFonts();

  const textElements = selectedElements.filter(el => 
    el.type === 'text' || el.type === 'button' || el.type === 'chat-bubble'
  );

  if (!isOpen || textElements.length === 0) return null;

  const selectedElement = textElements[0];
  const isMultiSelect = textElements.length > 1;

  const handleUpdate = (updates: Partial<DesignElement>) => {
    if (isMultiSelect) {
      textElements.forEach(element => {
        updateElement(element.id, updates);
      });
    } else {
      updateElement(selectedElement.id, updates);
    }
  };

  const handleFontChange = async (fontFamily: string) => {
    // Load Google Font if needed
    const googleFont = googleFonts.find(f => f.family === fontFamily);
    if (googleFont && !loadedFonts.has(fontFamily)) {
      await loadGoogleFont(fontFamily, googleFont.variants);
    }

    handleUpdate({ 
      fontFamily,
      // Reset to available weight if current weight is not available
      fontWeight: googleFont?.variants.includes(selectedElement.fontWeight || '400') 
        ? selectedElement.fontWeight 
        : googleFont?.variants[0] || '400'
    });
    setShowFontDropdown(false);
  };

  const handleCustomFontUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fontFamily = await addCustomFont(file);
      handleUpdate({ fontFamily });
    } catch (error) {
      console.error('Failed to upload font:', error);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const allFonts = getAllFonts();
  const filteredFonts = allFonts.filter(font => {
    const matchesSearch = font.family.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedFontCategory === 'all' || font.category === selectedFontCategory;
    return matchesSearch && matchesCategory;
  });

  const currentFont = allFonts.find(f => f.family === selectedElement.fontFamily) || allFonts[0];

  return (
    <div className="w-80 bg-gray-800/50 backdrop-blur-xl border-l border-gray-700/50 flex flex-col text-panel">
      {/* Header */}
      <div className="p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Type className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">Text Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-600/50 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        {isMultiSelect && (
          <div className="text-sm text-yellow-400 bg-yellow-400/10 px-3 py-2 rounded-lg">
            {textElements.length} text elements selected
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Font Selection */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
            Font Family
          </h4>
          
          <div className="relative">
            <button
              onClick={() => setShowFontDropdown(!showFontDropdown)}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-left text-white hover:bg-gray-600/50 transition-colors flex items-center justify-between"
            >
              <span style={{ fontFamily: currentFont.family }}>{currentFont.family}</span>
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showFontDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-80 flex flex-col">
                {/* Search and Upload */}
                <div className="p-3 border-b border-gray-700">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search fonts..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
                      autoFocus
                    />
                  </div>

                  {/* Category Filter */}
                  <div className="flex space-x-1 mb-3">
                    {(['all', 'system', 'google', 'custom'] as const).map(category => (
                      <button
                        key={category}
                        onClick={() => setSelectedFontCategory(category)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          selectedFontCategory === category
                            ? 'bg-yellow-400/20 text-yellow-400'
                            : 'bg-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Upload Custom Font */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 rounded text-sm font-medium hover:from-yellow-300 hover:to-orange-400 transition-all flex items-center justify-center space-x-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Font</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    onChange={handleCustomFontUpload}
                    className="hidden"
                  />
                </div>

                {/* Font List */}
                <div className="flex-1 overflow-y-auto">
                  {filteredFonts.map((font) => (
                    <button
                      key={font.family}
                      onClick={() => handleFontChange(font.family)}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        currentFont.family === font.family ? 'bg-yellow-400/20 text-yellow-400' : 'text-white'
                      }`}
                      style={{ fontFamily: font.family }}
                    >
                      <span>{font.family}</span>
                      <div className="flex items-center space-x-1">
                        <span className={`text-xs px-2 py-1 rounded ${
                          font.category === 'system' ? 'bg-blue-500/20 text-blue-400' :
                          font.category === 'google' ? 'bg-green-500/20 text-green-400' :
                          'bg-purple-500/20 text-purple-400'
                        }`}>
                          {font.category}
                        </span>
                        {font.category === 'custom' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCustomFont(font.family);
                            }}
                            className="p-1 hover:bg-red-500/20 rounded"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Font Style Controls */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
            Font Style
          </h4>

          {/* Font Size */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Font Size</label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="8"
                max="200"
                value={selectedElement.fontSize || 16}
                onChange={(e) => handleUpdate({ fontSize: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="number"
                min="8"
                max="200"
                value={selectedElement.fontSize || 16}
                onChange={(e) => handleUpdate({ fontSize: Number(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-sm text-white focus:outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          {/* Font Weight */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Font Weight</label>
            <select
              value={selectedElement.fontWeight || '400'}
              onChange={(e) => handleUpdate({ fontWeight: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400"
            >
              <option value="100">Thin (100)</option>
              <option value="200">Extra Light (200)</option>
              <option value="300">Light (300)</option>
              <option value="400">Normal (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semi Bold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extra Bold (800)</option>
              <option value="900">Black (900)</option>
            </select>
          </div>

          {/* Font Style & Transform */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-2">Style</label>
              <select
                value={selectedElement.fontStyle || 'normal'}
                onChange={(e) => handleUpdate({ fontStyle: e.target.value as 'normal' | 'italic' | 'oblique' })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="normal">Normal</option>
                <option value="italic">Italic</option>
                <option value="oblique">Oblique</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-2">Transform</label>
              <select
                value={selectedElement.textTransform || 'none'}
                onChange={(e) => handleUpdate({ textTransform: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600/50 rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400"
              >
                <option value="none">None</option>
                <option value="uppercase">UPPERCASE</option>
                <option value="lowercase">lowercase</option>
                <option value="capitalize">Capitalize</option>
              </select>
            </div>
          </div>
        </div>

        {/* Alignment */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
            Alignment
          </h4>

          {/* Horizontal Alignment */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Horizontal</label>
            <div className="grid grid-cols-4 gap-1">
              {[
                { value: 'left', icon: AlignLeft },
                { value: 'center', icon: AlignCenter },
                { value: 'right', icon: AlignRight },
                { value: 'justify', icon: AlignJustify }
              ].map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleUpdate({ textAlign: value as any })}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    selectedElement.textAlign === value
                      ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                  }`}
                >
                  <Icon className="w-4 h-4 mx-auto" />
                </button>
              ))}
            </div>
          </div>

          {/* Vertical Alignment */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Vertical</label>
            <div className="grid grid-cols-3 gap-1">
              {[
                { value: 'top', label: 'Top' },
                { value: 'middle', label: 'Middle' },
                { value: 'bottom', label: 'Bottom' }
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleUpdate({ verticalAlign: value as any })}
                  className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                    selectedElement.verticalAlign === value
                      ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Spacing Controls */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
            Spacing
          </h4>

          {/* Letter Spacing */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Letter Spacing</label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="-5"
                max="20"
                step="0.1"
                value={selectedElement.letterSpacing || 0}
                onChange={(e) => handleUpdate({ letterSpacing: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="number"
                min="-5"
                max="20"
                step="0.1"
                value={selectedElement.letterSpacing || 0}
                onChange={(e) => handleUpdate({ letterSpacing: Number(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-sm text-white focus:outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          {/* Line Height */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Line Height</label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="0.8"
                max="3"
                step="0.1"
                value={selectedElement.lineHeight || 1.2}
                onChange={(e) => handleUpdate({ lineHeight: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="number"
                min="0.8"
                max="3"
                step="0.1"
                value={selectedElement.lineHeight || 1.2}
                onChange={(e) => handleUpdate({ lineHeight: Number(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-sm text-white focus:outline-none focus:border-yellow-400"
              />
            </div>
          </div>

          {/* Word Spacing */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Word Spacing</label>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="-10"
                max="20"
                step="0.5"
                value={selectedElement.wordSpacing || 0}
                onChange={(e) => handleUpdate({ wordSpacing: Number(e.target.value) })}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <input
                type="number"
                min="-10"
                max="20"
                step="0.5"
                value={selectedElement.wordSpacing || 0}
                onChange={(e) => handleUpdate({ wordSpacing: Number(e.target.value) })}
                className="w-16 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-sm text-white focus:outline-none focus:border-yellow-400"
              />
            </div>
          </div>
        </div>

        {/* Text Decorations */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-red-400 rounded-full mr-2"></span>
            Decorations
          </h4>

          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'none', label: 'None' },
              { value: 'underline', label: 'Underline' },
              { value: 'line-through', label: 'Strike' },
              { value: 'overline', label: 'Overline' }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleUpdate({ textDecoration: value as any })}
                className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                  selectedElement.textDecoration === value
                    ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-300 flex items-center">
            <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2"></span>
            Quick Actions
          </h4>

          <div className="flex space-x-2">
            <button
              onClick={() => handleUpdate({ 
                fontWeight: selectedElement.fontWeight === '700' ? '400' : '700' 
              })}
              className={`p-2 rounded-lg transition-all duration-200 ${
                selectedElement.fontWeight === '700'
                  ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
              }`}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleUpdate({ 
                fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' 
              })}
              className={`p-2 rounded-lg transition-all duration-200 ${
                selectedElement.fontStyle === 'italic'
                  ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
              }`}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleUpdate({ 
                textDecoration: selectedElement.textDecoration === 'underline' ? 'none' : 'underline' 
              })}
              className={`p-2 rounded-lg transition-all duration-200 ${
                selectedElement.textDecoration === 'underline'
                  ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/50'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
              }`}
              title="Underline (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextSettingsPanel;