// One shared "is this a phone?" signal - the same 768px line the CSS
// mobile layer draws, so JS layout decisions (bento spans, canvas pick)
// can never disagree with the stylesheet about which world they're in.
import { useSyncExternalStore } from 'react';

const mq = typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)') : null;

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => mq?.matches ?? false,
  );
}
