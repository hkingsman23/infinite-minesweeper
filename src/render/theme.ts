export interface Theme {
  bg: string;
  cap: string;
  hi: string;
  slot: string;
  revealed: string;
  grid: string;
  sector: string;
  num: string;
  lockOverlay: string;
  doneOverlay: string;
  clearPulse: string;
}

export const THEMES: Record<'dark' | 'light', Theme> = {
  dark: {
    bg: '#15161A',
    cap: '#2E313A',
    hi: '#3C404B',
    slot: '#1B1D22',
    revealed: '#202329',
    grid: '#26282F',
    sector: '#3E424C',
    num: '#D6DAE2',
    lockOverlay: 'rgba(48,7,7,0.9)',
    doneOverlay: 'rgba(8,9,11,0.65)',
    clearPulse: 'rgba(120,230,170,ALPHA)',
  },
  light: {
    // Own scheme (not GRYKUBY's crimson): blue-grey bg, white caps, rose accent.
    bg: '#E4E8EF',
    cap: '#FFFFFF',
    hi: '#FFFFFF',
    slot: '#D5DAE3',
    revealed: '#F3F5F9',
    grid: '#C9CFDA',
    sector: '#D98CA0',
    num: '#2B2E38',
    lockOverlay: 'rgba(55,10,10,0.9)',
    doneOverlay: 'rgba(45,48,58,0.65)',
    clearPulse: 'rgba(60,180,120,ALPHA)',
  },
};

/** Dark is the default regardless of system preference — the player can
 * still switch to light via the HUD toggle for the current session. */
export function detectInitialTheme(): 'dark' | 'light' {
  return 'dark';
}
