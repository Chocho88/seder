/**
 * KLOD Design System — JS Token Export
 *
 * For React/JS projects that need token values in code.
 *
 * Usage:
 *   import { getPreset } from '../design-system/tokens';
 *   const theme = getPreset('classic');
 *   // theme.fonts.display => '"Abril Fatface", serif'
 */

const shared = {
  space: {
    0: '0', px: '1px', '0.5': '0.125rem',
    1: '0.25rem', '1.5': '0.375rem', 2: '0.5rem', 3: '0.75rem',
    4: '1rem', 5: '1.25rem', 6: '1.5rem', 8: '2rem',
    10: '2.5rem', 12: '3rem', 16: '4rem', 20: '5rem', 24: '6rem', 32: '8rem',
  },
  zIndex: { base: 0, dropdown: 100, sticky: 200, header: 250, overlay: 300, modal: 400, popover: 500, toast: 600, tooltip: 700 },
  breakpoints: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
  hebrewFonts: {
    noto:    { family: '"Noto Sans Hebrew", sans-serif', label: 'Noto Sans Hebrew (default)', role: 'all' },
    yarden:  { family: '"Yarden", "Noto Sans Hebrew", sans-serif', label: 'Yarden', role: 'all' },
    migdal:  { family: '"Migdal Haemeq", "Noto Sans Hebrew", sans-serif', label: 'Migdal Haemeq', role: 'display' },
    heshbon: { family: '"Heshbon", "Noto Sans Hebrew", sans-serif', label: 'Heshbon', role: 'all' },
    asakim:  { family: '"Asakim", "Noto Sans Hebrew", sans-serif', label: 'Asakim Bold', role: 'display' },
  },
};

const presets = {
  classic: {
    name: 'classic',
    isDark: false,
    colors: {
      accent: '#8b5e34', accentLight: '#d1bba5', accentDark: '#53381f',
      black: '#000000', white: '#ffffff',
      success: '#16a34a', warning: '#ca8a04', error: '#dc2626', info: '#2563eb',
    },
    fonts: {
      // Per-app: pick ONE via data-font attr — "abril" (default) or "dm-serif"
      display: '"Abril Fatface", serif',
      displayAlt: '"DM Serif Display", serif',
      heading: '"Abril Fatface", serif',
      body: '"Poppins", sans-serif',
      data: '"Courier New", monospace',
      ui: '"Poppins", sans-serif',
      heDisplay: '"Noto Sans Hebrew", sans-serif',
      heBody: '"Noto Sans Hebrew", sans-serif',
      heData: '"Heshbon", "Courier New", monospace',
      heYarden: '"Yarden", "Noto Sans Hebrew", sans-serif',
      heMigdal: '"Migdal Haemeq", "Noto Sans Hebrew", sans-serif',
      heHeshbon: '"Heshbon", "Noto Sans Hebrew", sans-serif',
      heAsakim: '"Asakim", "Noto Sans Hebrew", sans-serif',
    },
    radius: { sm: '4px', md: '6px', lg: '10px', xl: '14px' },
  },
  punchy: {
    name: 'punchy',
    isDark: false,
    isNeoBrutalism: true,
    colors: {
      accent: '#ff3d69', accentLight: '#ffb8c6', accentDark: '#d42f54',
      black: '#000000', white: '#ffffff',
      success: '#22c55e', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
    },
    fonts: {
      // Per-app: pick ONE via data-font attr — "montserrat" (default) or "poppins"
      display: '"Montserrat", sans-serif',
      displayAlt: '"Poppins", sans-serif',
      heading: '"Montserrat", sans-serif',
      body: '"Poppins", sans-serif',
      data: '"Courier New", monospace',
      ui: '"Poppins", sans-serif',
      heDisplay: '"Noto Sans Hebrew", sans-serif',
      heBody: '"Noto Sans Hebrew", sans-serif',
      heData: '"Heshbon", "Courier New", monospace',
      heYarden: '"Yarden", "Noto Sans Hebrew", sans-serif',
      heMigdal: '"Migdal Haemeq", "Noto Sans Hebrew", sans-serif',
      heHeshbon: '"Heshbon", "Noto Sans Hebrew", sans-serif',
      heAsakim: '"Asakim", "Noto Sans Hebrew", sans-serif',
    },
    radius: { sm: '0', md: '4px', lg: '8px', xl: '12px' },
    shadow: { sm: '3px 3px 0 #000', md: '5px 5px 0 #000', lg: '7px 7px 0 #000' },
    borderWidth: { thin: '2px', medium: '3px', thick: '4px' },
  },
  clean: {
    name: 'clean',
    isDark: false,
    colors: {
      accent: '#525252', accentLight: '#d4d4d4', accentDark: '#262626',
      black: '#000000', white: '#ffffff',
      success: '#16a34a', warning: '#ca8a04', error: '#dc2626', info: '#6b7280',
    },
    fonts: {
      display: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      body: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      data: '"SF Mono", Menlo, monospace',
      ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      heDisplay: '"Noto Sans Hebrew", sans-serif',
      heBody: '"Noto Sans Hebrew", sans-serif',
      heData: '"Heshbon", "Courier New", monospace',
      heYarden: '"Yarden", "Noto Sans Hebrew", sans-serif',
      heMigdal: '"Migdal Haemeq", "Noto Sans Hebrew", sans-serif',
      heHeshbon: '"Heshbon", "Noto Sans Hebrew", sans-serif',
      heAsakim: '"Asakim", "Noto Sans Hebrew", sans-serif',
    },
    radius: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  },
  glass: {
    name: 'glass',
    isDark: true,
    colors: {
      accent: '#6382ff', accentLight: '#b1c1ff', accentDark: '#3d56cc',
      black: '#000000', white: '#ffffff',
      success: '#34d399', warning: '#fbbf24', error: '#f87171', info: '#6382ff',
    },
    fonts: {
      display: '"Inter", -apple-system, sans-serif',
      heading: '"Inter", -apple-system, sans-serif',
      body: '"Inter", -apple-system, sans-serif',
      data: '"JetBrains Mono", "Fira Code", monospace',
      ui: '"Inter", -apple-system, sans-serif',
      heDisplay: '"Noto Sans Hebrew", sans-serif',
      heBody: '"Noto Sans Hebrew", sans-serif',
      heData: '"Heshbon", "Courier New", monospace',
      heYarden: '"Yarden", "Noto Sans Hebrew", sans-serif',
      heMigdal: '"Migdal Haemeq", "Noto Sans Hebrew", sans-serif',
      heHeshbon: '"Heshbon", "Noto Sans Hebrew", sans-serif',
      heAsakim: '"Asakim", "Noto Sans Hebrew", sans-serif',
    },
    radius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
    glass: {
      bg: 'rgba(255,255,255,0.05)',
      bgHover: 'rgba(255,255,255,0.08)',
      bgStrong: 'rgba(255,255,255,0.12)',
      border: 'rgba(255,255,255,0.1)',
      borderStrong: 'rgba(255,255,255,0.18)',
      blur: '16px',
      blurStrong: '24px',
    },
  },
};

export function getPreset(name) {
  const preset = presets[name];
  if (!preset) throw new Error(`Unknown preset: "${name}". Use: classic, punchy, clean, glass`);
  return { ...shared, ...preset };
}

export const tokens = shared;
export { presets };
export default presets;
