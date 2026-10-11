import React from 'react';

/**
 * AtredLogo
 * Logo resmi ATRED berbasis referensi desain SVG kustom.
 */
export default function AtredLogo({ className = "h-8 w-auto", size = 32 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <rect width="120" height="120" rx="28" fill="#121215" stroke="#27272a" strokeWidth="2" />
      <path
        d="M24 88 L44 48 L62 70 L82 32 L96 46"
        stroke="#a78bfa"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="82" cy="32" r="6" fill="#34d399" stroke="#121215" strokeWidth="2" />
      <path d="M82 32 L96 46" stroke="#34d399" strokeWidth="4" strokeLinecap="round" />
      <path d="M28 92 C45 92, 75 92, 92 92" stroke="#52525b" strokeWidth="2" strokeDasharray="4 4" />
    </svg>
  );
}
