export interface GoogleFont {
  family: string;
  variants: string[];
  subsets: string[];
  category: string;
}

export interface CustomFont {
  family: string;
  url: string;
  format: string;
}

export interface FontState {
  googleFonts: GoogleFont[];
  customFonts: CustomFont[];
  loadedFonts: Set<string>;
  isLoading: boolean;
}

export interface TextCurveSettings {
  enabled: boolean;
  radius: number;
  direction: 'inside' | 'outside';
  angleOffset: number;
  centerX: number;
  centerY: number;
}

export interface AdvancedTextProperties {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic' | 'oblique';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  verticalAlign: 'top' | 'middle' | 'bottom';
  letterSpacing: number;
  lineHeight: number;
  wordSpacing: number;
  textDecoration: 'none' | 'underline' | 'line-through' | 'overline';
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  textShadow: {
    blur: number;
    offsetX: number;
    offsetY: number;
    color: string;
  };
  curve?: TextCurveSettings;
}