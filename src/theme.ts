// Visual tokens. Inspired by the minimalist look of MonAi (own palette, no brand assets).

export const colors = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#1C1C1E',
  textMuted: '#8E8E93',
  textFaint: '#C7C7CC',
  border: '#EDEDEF',
  chip: '#F1F1F3',
  accent: '#F25C54',
  accentSoft: '#FFE9E4',
  income: '#2FB37A',
  incomeSoft: '#DDF4E9',
  expense: '#1C1C1E',
  danger: '#E5484D',
} as const;

// Pastel colors used for category bars and emoji bubbles.
export const categoryPalette = [
  '#E4EFC7',
  '#F8D8C6',
  '#E5E0F7',
  '#FAD3D7',
  '#CFE6F6',
  '#FBEABD',
  '#D3EFE2',
  '#EFDFD1',
  '#DEE5EC',
  '#F6D8EB',
] as const;

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;
