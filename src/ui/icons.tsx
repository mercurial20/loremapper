import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...p,
});

export const RaiseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 20 L9 10 L13 15 L16 11 L21 20 Z" />
    <path d="M12 7 V2 M9.5 4.5 L12 2 L14.5 4.5" />
  </svg>
);

export const LowerIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 13 L9 7 L13 11 L16 8 L21 13" />
    <path d="M3 17 H21" opacity=".5" />
    <path d="M12 16 V22 M9.5 19.5 L12 22 L14.5 19.5" />
  </svg>
);

export const SmoothIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 16 C7 16 8 9 12 9 C16 9 17 14 21 14" />
    <path d="M3 20 H21" opacity=".5" />
  </svg>
);

export const FlattenIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 18 L7 12 H17 L21 18" />
    <path d="M7 8 H17" opacity=".6" />
    <path d="M12 4 V8" opacity=".6" />
  </svg>
);

export const RidgeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 20 L7 9 L10 14 L14 4 L18 13 L20 10 L22 20 Z" />
    <path d="M14 4 L12.5 8 L14.5 9.5 L15.5 7" />
  </svg>
);

export const RiverIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 3 C8 7 3 11 8 14 C13 17 9 20 13 22" />
    <path d="M10 3 C14 7 9 11 14 14 C18 16.5 16 19.5 19 22" opacity=".5" />
  </svg>
);

export const RoadIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 21 C8 15 10 12 16 3" strokeDasharray="3 2.6" />
    <path d="M10 21 C13 15 15 12 20 5" opacity=".45" />
  </svg>
);

export const TerritoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7 L10 3 L18 5 L21 12 L16 20 L7 19 L3 13 Z" strokeDasharray="3 2.2" />
    <path d="M9 11 L12 9 L15 11.5 L12 15 Z" fill="currentColor" opacity=".35" stroke="none" />
  </svg>
);

export const FogIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 15 C3 15 3 10.5 6.5 10.5 C7 7 12 6 13.5 9 C17 8 19 11 18 13 C20.5 13.5 20 16.5 17.5 16.5 Z" />
    <path d="M4 20 H14 M17 20 H20" opacity=".6" />
  </svg>
);

export const PeakIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4 L19 18 H5 Z" />
    <path d="M12 4 V1.5" opacity=".6" />
    <path d="M9 21 H15" opacity=".6" />
  </svg>
);

export const BiomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 3 L3.5 10 H6 L3 15 H11 L8 10 H10.5 Z" />
    <path d="M7 15 V18" />
    <path d="M14 20 C15 15 18 13 21 13 C21 17 18 20 14 20 Z" />
    <path d="M14 20 L18 16" />
  </svg>
);

export const CompassRose = ({ size = 72 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" className="compass-rose" aria-hidden>
    <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
    <circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" strokeWidth=".7" opacity=".4" strokeDasharray="1.5 2.5" />
    <path d="M50 8 L56 44 L50 50 L44 44 Z" fill="#b33a2a" stroke="currentColor" strokeWidth="1" />
    <path d="M50 92 L56 56 L50 50 L44 56 Z" fill="currentColor" opacity=".85" />
    <path d="M8 50 L44 44 L50 50 L44 56 Z M92 50 L56 44 L50 50 L56 56 Z" fill="currentColor" opacity=".55" />
    <path d="M26 26 L47 47 M74 26 L53 47 M26 74 L47 53 M74 74 L53 53" stroke="currentColor" strokeWidth="1" opacity=".5" />
    <text x="50" y="6.5" textAnchor="middle" fontSize="10" fontFamily="Cinzel Variable, serif" fontWeight="700" fill="currentColor">
      N
    </text>
  </svg>
);
