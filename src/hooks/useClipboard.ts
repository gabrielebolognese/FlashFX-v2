import { useState, useCallback } from 'react';
import { DesignElement } from '../types/design';

export interface StyleClipboard {
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  shadow: {
    blur: number;
    color: string;
    x: number;
    y: number;
  };
  // Text properties
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  fontStyle?: string;
  textTransform?: string;
  textAlign?: string;
  verticalAlign?: string;
  textColor?: string;
  letterSpacing?: number;
  lineHeight?: number;
  wordSpacing?: number;
  textDecoration?: string;
}

export const useClipboard = () => {
  const [copiedStyle, setCopiedStyle] = useState<StyleClipboard | null>(null);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }, []);

  const pasteFromClipboard = useCallback(async (): Promise<string | null> => {
    try {
      const text = await navigator.clipboard.readText();
      return text;
    } catch (error) {
      console.error('Failed to paste from clipboard:', error);
      return null;
    }
  }, []);

  const copyStyle = useCallback((element: DesignElement) => {
    const style: StyleClipboard = {
      width: Math.round(element.width),
      height: Math.round(element.height),
      x: Math.round(element.x),
      y: Math.round(element.y),
      rotation: Math.round(element.rotation),
      opacity: element.opacity,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: Math.round(element.strokeWidth),
      borderRadius: Math.round(element.borderRadius),
      shadow: element.shadow ? {
        blur: Math.round(element.shadow.blur),
        color: element.shadow.color,
        x: Math.round(element.shadow.x),
        y: Math.round(element.shadow.y)
      } : { blur: 0, color: '#000000', x: 0, y: 0 }
    };

    // Add text properties if they exist
    if (element.fontSize !== undefined) style.fontSize = Math.round(element.fontSize);
    if (element.fontWeight) style.fontWeight = element.fontWeight;
    if (element.fontFamily) style.fontFamily = element.fontFamily;
    if (element.fontStyle) style.fontStyle = element.fontStyle;
    if (element.textTransform) style.textTransform = element.textTransform;
    if (element.textAlign) style.textAlign = element.textAlign;
    if (element.verticalAlign) style.verticalAlign = element.verticalAlign;
    if (element.textColor) style.textColor = element.textColor;
    if (element.letterSpacing !== undefined) style.letterSpacing = Math.round(element.letterSpacing);
    if (element.lineHeight !== undefined) style.lineHeight = element.lineHeight;
    if (element.wordSpacing !== undefined) style.wordSpacing = Math.round(element.wordSpacing);
    if (element.textDecoration) style.textDecoration = element.textDecoration;

    setCopiedStyle(style);
    
    // Also copy to system clipboard as JSON
    copyToClipboard(JSON.stringify(style, null, 2));
    
    return style;
  }, [copyToClipboard]);

  const pasteStyle = useCallback((targetElement: DesignElement): Partial<DesignElement> | null => {
    if (!copiedStyle) return null;

    const updates: Partial<DesignElement> = {
      width: copiedStyle.width,
      height: copiedStyle.height,
      rotation: copiedStyle.rotation,
      opacity: copiedStyle.opacity,
      fill: copiedStyle.fill,
      stroke: copiedStyle.stroke,
      strokeWidth: copiedStyle.strokeWidth,
      borderRadius: copiedStyle.borderRadius,
      shadow: copiedStyle.shadow
    };

    // Add text properties if they exist in copied style and target supports them
    if (targetElement.type === 'text' || targetElement.type === 'button' || targetElement.type === 'chat-bubble') {
      if (copiedStyle.fontSize !== undefined) updates.fontSize = copiedStyle.fontSize;
      if (copiedStyle.fontWeight) updates.fontWeight = copiedStyle.fontWeight;
      if (copiedStyle.fontFamily) updates.fontFamily = copiedStyle.fontFamily;
      if (copiedStyle.fontStyle) updates.fontStyle = copiedStyle.fontStyle;
      if (copiedStyle.textTransform) updates.textTransform = copiedStyle.textTransform;
      if (copiedStyle.textAlign) updates.textAlign = copiedStyle.textAlign;
      if (copiedStyle.verticalAlign) updates.verticalAlign = copiedStyle.verticalAlign;
      if (copiedStyle.textColor) updates.textColor = copiedStyle.textColor;
      if (copiedStyle.letterSpacing !== undefined) updates.letterSpacing = copiedStyle.letterSpacing;
      if (copiedStyle.lineHeight !== undefined) updates.lineHeight = copiedStyle.lineHeight;
      if (copiedStyle.wordSpacing !== undefined) updates.wordSpacing = copiedStyle.wordSpacing;
      if (copiedStyle.textDecoration) updates.textDecoration = copiedStyle.textDecoration;
    }

    return updates;
  }, [copiedStyle]);

  const copyValue = useCallback(async (value: number | string) => {
    const stringValue = typeof value === 'number' ? Math.round(value).toString() : value;
    return await copyToClipboard(stringValue);
  }, [copyToClipboard]);

  const pasteValue = useCallback(async (): Promise<number | null> => {
    const text = await pasteFromClipboard();
    if (!text) return null;
    
    const number = parseFloat(text.trim());
    return isNaN(number) ? null : Math.round(number);
  }, [pasteFromClipboard]);

  return {
    copyStyle,
    pasteStyle,
    copyValue,
    pasteValue,
    copiedStyle,
    copyToClipboard,
    pasteFromClipboard
  };
};