





















export const colors = {
  




  background: '#0B0D14',
  
  surface: '#141824',
  
  surfaceFocused: '#232A3D',
  




  surfaceElevated: '#1C2233',
  




  surfaceOverArt: 'rgba(20, 24, 36, 0.66)',
  border: '#252B3B',
  
  borderOverArt: 'rgba(243, 245, 249, 0.16)',

  
  accent: '#38BDF8',
  accentMuted: 'rgba(56, 189, 248, 0.22)',

  
  
  
  
  
  
  brandCyan: '#22D3EE',
  brandBlue: '#3B82F6',
  brandViolet: '#8B5CF6',
  brandMagenta: '#EC4899',
  brandAmber: '#F59E0B',

  






  focusGlow: 'rgba(56, 189, 248, 0.35)',

  live: '#F43F5E',

  textPrimary: '#F3F5F9',
  textSecondary: '#A7B0C2',
  textMuted: '#6B7488',
  
  textOnAccent: '#04141F',
  



  textOnArt: 'rgba(243, 245, 249, 0.92)',

  danger: '#F87171',
  scrim: 'rgba(4, 6, 12, 0.72)',

  







  controlSurface: 'rgba(20, 24, 36, 0.58)',
  
  controlSurfaceActive: 'rgba(35, 42, 61, 0.92)',
  
  controlSurfaceOn: 'rgba(56, 189, 248, 0.26)',
  
  controlBorder: 'rgba(243, 245, 249, 0.14)',
} as const;









export function backgroundAlpha(alpha: number): string {
  return `rgba(11, 13, 20, ${alpha})`;
}


export function shadeAlpha(alpha: number): string {
  return `rgba(0, 0, 0, ${alpha})`;
}
