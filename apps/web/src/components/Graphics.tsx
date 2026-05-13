export function IconShield() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconGlobe() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M2 12h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 2c2.8 2.7 4.4 6.4 4.4 10S14.8 19.3 12 22c-2.8-2.7-4.4-6.4-4.4-10S9.2 4.7 12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPuzzle() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3a2 2 0 0 1 4 0v1h2a2 2 0 0 1 2 2v2h1a2 2 0 1 1 0 4h-1v2a2 2 0 0 1-2 2h-2v1a2 2 0 1 1-4 0v-1H6a2 2 0 0 1-2-2v-2H3a2 2 0 1 1 0-4h1V6a2 2 0 0 1 2-2h2V3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChart() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 16v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 16V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 16v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconLayers() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 3 9l9 6 9-6-9-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M3 15l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoMark(props: { className?: string }) {
  return (
    <svg className={props.className ?? "h-7 w-7"} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 3.5 7.5v9L12 21.5l8.5-5v-9L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.2 12 12.8l4.5-2.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 12.8v5.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function HeroGraphic() {
  return (
    <svg className="h-full w-full" viewBox="0 0 640 400" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="640" y2="400" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EEF2FF" />
          <stop offset="0.55" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#ECFEFF" />
        </linearGradient>
        <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#4F46E5" stopOpacity="0.22" />
          <stop offset="1" stopColor="#06B6D4" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="639" height="399" rx="20" fill="url(#g1)" stroke="#E5E7EB" />

      <g opacity="0.9">
        <rect x="44" y="64" width="240" height="52" rx="12" fill="white" stroke="#E5E7EB" />
        <rect x="56" y="80" width="120" height="10" rx="5" fill="#E5E7EB" />
        <rect x="56" y="96" width="80" height="10" rx="5" fill="#EEF2FF" />

        <rect x="44" y="132" width="552" height="224" rx="18" fill="white" stroke="#E5E7EB" />
        <rect x="72" y="160" width="190" height="64" rx="14" fill="url(#g2)" />
        <rect x="286" y="160" width="190" height="64" rx="14" fill="#F3F4F6" />
        <rect x="72" y="244" width="404" height="12" rx="6" fill="#E5E7EB" />
        <rect x="72" y="268" width="340" height="12" rx="6" fill="#EEF2FF" />
        <rect x="72" y="292" width="280" height="12" rx="6" fill="#E5E7EB" />
      </g>
    </svg>
  );
}

