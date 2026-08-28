// App-local icons the vendored design system does not carry, drawn inline.
// (A local .svg sprite is a trap here: Vite inlines small assets as data:
// URIs and <use href="data:...#id"> resolves nowhere. One component, zero
// asset pipeline.) Same look as the vendor sprite: clean lines, circles
// for people, stroke currentColor.

/** The Google "G", official brand colors - users recognize it instantly on
    a sign-in button; a monochrome remake would only add doubt. */
export function GoogleIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.14-4.06 1.14-3.12 0-5.77-2.11-6.71-4.94H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.29a12 12 0 0 0 0 10.78l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 1.29 6.61l4 3.1C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

/** Bento: uneven blocks, like the resizable grid it represents. */
export function BentoIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

/** Gallery: a dense masonry of columns, uneven heights. */
export function GalleryIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="5.5" height="10" rx="1.2" />
      <rect x="3" y="15" width="5.5" height="6" rx="1.2" />
      <rect x="9.25" y="3" width="5.5" height="6" rx="1.2" />
      <rect x="9.25" y="11" width="5.5" height="10" rx="1.2" />
      <rect x="15.5" y="3" width="5.5" height="13" rx="1.2" />
      <rect x="15.5" y="18" width="5.5" height="3" rx="1.2" />
    </svg>
  );
}

/** Carousel: one card up front, the next peeking from behind. */
export function CarouselIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="4" height="14" rx="1.2" opacity="0.5" />
      <rect x="7" y="3" width="12" height="18" rx="1.6" />
      <rect x="20" y="5" width="4" height="14" rx="1.2" opacity="0.5" />
    </svg>
  );
}

export function UsersIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
