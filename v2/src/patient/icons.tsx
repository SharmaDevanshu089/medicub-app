// Stroke icons for Medicub (decorative: aria-hidden; labels live on the button).
const P = {
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9v4l2.5 2',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4',
  alert: 'M12 3L2 21h20L12 3zM12 10v5M12 18v.5',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  nfc: 'M6 8.5a8 8 0 0 1 0 7M9.5 6.5a12 12 0 0 1 0 11M13 4.5a16 16 0 0 1 0 15',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3M21 14v7h-7',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  doc: 'M5 4h10l4 4v12H5zM9 12h6M9 16h4',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  xray: 'M12 4v16M12 7c-3 0-5 1-7 3M12 7c3 0 5 1 7 3M12 11c-3 0-5 1-7 3M12 11c3 0 5 1 7 3M12 15c-2.5 0-4 .8-5.5 2M12 15c2.5 0 4 .8 5.5 2',
  store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  fingerprint: 'M7 11a5 5 0 0 1 10 0v2a9 9 0 0 1-1.5 5M12 11v4a6 6 0 0 1-2 4.5M4 9.5a8 8 0 0 1 16 0',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  x: 'M6 6l12 12M18 6L6 18',
  block: 'M8 2h8l6 6v8l-6 6H8l-6-6V8zM7 9l10 6M17 9L7 15',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  mic: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8',
  micOff: 'M1 1l22 22M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.68-1.33M19 10v1a7 7 0 0 1-1.07 3.73M5 10v1a7 7 0 0 0 10.93 5.86M12 18v4M8 22h8',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  play: 'M5 3l14 9-14 9V3z',
  stop: 'M5 5h14v14H5z',
  waveform: 'M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4',
} as const

export type IconName = keyof typeof P

export function I({ n, size = 24, stroke = 2, className = '' }: { n: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[n]} />
    </svg>
  )
}

/** Two-tone capsule used as the medicine pictogram. */
export const Pill = ({ size = 44, light = false }: { size?: number; light?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="6" y="17" width="36" height="14" rx="7" fill={light ? '#FFFFFF' : '#CC3762'} />
    <rect x="24" y="17" width="18" height="14" rx="7" fill="#F2B8C8" />
  </svg>
)
