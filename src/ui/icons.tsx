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

// brand marks from Simple Icons (CC0)
export const GitHubMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

export const RedditMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
  </svg>
);
