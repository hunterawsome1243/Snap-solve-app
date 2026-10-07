// One small icon set so every platform draws the same pictures (emoji look different on every phone).
const PATHS = {
  scan: <><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /></>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  upload: <path d="M12 16V4m0 0L8 8m4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />,
  text: <path d="M8 4h8M12 4v16M8 20h8" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></>,
  bag: <path d="M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.2 17 3 12 3z" /><circle cx="7.5" cy="11" r=".9" fill="currentColor" /><circle cx="10" cy="7" r=".9" fill="currentColor" /><circle cx="15" cy="7.5" r=".9" fill="currentColor" /></>,
  pdf: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 14h6M10 17h4" />,
  image: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m4 16 5-5 4 4 3-3 4 4" /><circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none" /></>,
  trend: <path d="m3 6 6 6 4-4 8 8M16 16h5v-5" />,
  barcode: <path d="M4 5v14M7 5v14M11 5v14M14 5v14M18 5v14M20.5 5v14" />,
  flame: <path d="M12 3c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.5.6-2.5 1.5-3.5C10 8 11.5 6 12 3z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  alert: <path d="M12 4 21 20H3zM12 10v4M12 17h.01" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="m15 6-6 6 6 6" />,
  torch: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  retake: <path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5" />,
  sliders: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 8v4l3 2" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  empty: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
}

export default function Icon({ name, size, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`ico-svg ${className}`}
      style={size ? { width: size, height: size } : undefined}
    >
      {PATHS[name]}
    </svg>
  )
}
