import { useState, useEffect, useCallback } from 'react';
import { GoogleFont, CustomFont, FontState } from '../types/fonts';

const GOOGLE_FONTS_API_KEY = 'AIzaSyDummyKeyForDemo'; // Replace with actual API key
const GOOGLE_FONTS_API_URL = `https://www.googleapis.com/webfonts/v1/webfonts?key=${GOOGLE_FONTS_API_KEY}`;

// Popular Google Fonts for demo (in production, fetch from API)
const DEMO_GOOGLE_FONTS: GoogleFont[] = [
  { family: 'Inter', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Roboto', variants: ['300', '400', '500', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Open Sans', variants: ['300', '400', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Lato', variants: ['300', '400', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Montserrat', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Poppins', variants: ['300', '400', '500', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Source Sans Pro', variants: ['300', '400', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Nunito', variants: ['300', '400', '600', '700'], subsets: ['latin'], category: 'sans-serif' },
  { family: 'Playfair Display', variants: ['400', '700'], subsets: ['latin'], category: 'serif' },
  { family: 'Merriweather', variants: ['300', '400', '700'], subsets: ['latin'], category: 'serif' },
  { family: 'Lora', variants: ['400', '700'], subsets: ['latin'], category: 'serif' },
  { family: 'Fira Code', variants: ['300', '400', '500'], subsets: ['latin'], category: 'monospace' },
  { family: 'JetBrains Mono', variants: ['300', '400', '500'], subsets: ['latin'], category: 'monospace' },
];

export const useFonts = () => {
  const [fontState, setFontState] = useState<FontState>({
    googleFonts: DEMO_GOOGLE_FONTS,
    customFonts: [],
    loadedFonts: new Set(['Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana']),
    isLoading: false
  });

  const loadGoogleFont = useCallback(async (fontFamily: string, variants: string[] = ['400']) => {
    if (fontState.loadedFonts.has(fontFamily)) return;

    try {
      // Create font face declarations
      const fontUrl = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, '+')}:wght@${variants.join(';')}&display=swap`;
      
      // Check if font link already exists
      const existingLink = document.querySelector(`link[href*="${fontFamily.replace(/\s+/g, '+')}"]`);
      if (existingLink) return;

      // Create and append font link
      const link = document.createElement('link');
      link.href = fontUrl;
      link.rel = 'stylesheet';
      document.head.appendChild(link);

      // Wait for font to load
      await new Promise((resolve) => {
        link.onload = resolve;
        setTimeout(resolve, 2000); // Fallback timeout
      });

      setFontState(prev => ({
        ...prev,
        loadedFonts: new Set([...prev.loadedFonts, fontFamily])
      }));
    } catch (error) {
      console.error('Failed to load Google Font:', error);
    }
  }, [fontState.loadedFonts]);

  const addCustomFont = useCallback(async (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const fontFamily = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
      const format = file.name.split('.').pop()?.toLowerCase() || 'truetype';

      // Create font face rule
      const fontFace = new FontFace(fontFamily, `url(${url})`, {
        style: 'normal',
        weight: '400'
      });

      await fontFace.load();
      document.fonts.add(fontFace);

      const customFont: CustomFont = {
        family: fontFamily,
        url,
        format: format === 'ttf' ? 'truetype' : format
      };

      setFontState(prev => ({
        ...prev,
        customFonts: [...prev.customFonts, customFont],
        loadedFonts: new Set([...prev.loadedFonts, fontFamily])
      }));

      return fontFamily;
    } catch (error) {
      console.error('Failed to load custom font:', error);
      throw error;
    }
  }, []);

  const removeCustomFont = useCallback((fontFamily: string) => {
    setFontState(prev => {
      const customFont = prev.customFonts.find(f => f.family === fontFamily);
      if (customFont) {
        URL.revokeObjectURL(customFont.url);
      }

      const newLoadedFonts = new Set(prev.loadedFonts);
      newLoadedFonts.delete(fontFamily);

      return {
        ...prev,
        customFonts: prev.customFonts.filter(f => f.family !== fontFamily),
        loadedFonts: newLoadedFonts
      };
    });
  }, []);

  const getAllFonts = useCallback(() => {
    const systemFonts = [
      'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana', 
      'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black'
    ];

    return [
      ...systemFonts.map(font => ({ family: font, category: 'system' })),
      ...fontState.googleFonts.map(font => ({ ...font, category: 'google' })),
      ...fontState.customFonts.map(font => ({ ...font, category: 'custom' }))
    ];
  }, [fontState.googleFonts, fontState.customFonts]);

  return {
    ...fontState,
    loadGoogleFont,
    addCustomFont,
    removeCustomFont,
    getAllFonts
  };
};