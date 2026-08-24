/** 极简内联图标（避免引入图标库）。 */
interface IconProps {
  className?: string;
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 17v5M9 3h6l-1 7 3 3v2H7v-2l3-3-1-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VolumeOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VolumeOnIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
