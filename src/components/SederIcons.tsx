// App-local icons the vendored design system does not carry, drawn inline.
// (A local .svg sprite is a trap here: Vite inlines small assets as data:
// URIs and <use href="data:...#id"> resolves nowhere. One component, zero
// asset pipeline.) Same look as the vendor sprite: clean lines, circles
// for people, stroke currentColor.

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
