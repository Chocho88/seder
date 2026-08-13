// Per-line direction detection ("first strong character" heuristic, like
// Unicode UBA paragraph direction). Every piece of user content gets its
// direction from its own text, independent of the UI chrome language.

const RTL_RANGE =
  /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-ﭏﭐ-﷿ﹰ-﻿]/;
const LTR_RANGE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

export function detectDir(text: string): 'rtl' | 'ltr' | 'auto' {
  for (const ch of text) {
    if (RTL_RANGE.test(ch)) return 'rtl';
    if (LTR_RANGE.test(ch)) return 'ltr';
  }
  return 'auto';
}

/** Props to spread on any element that renders user content. */
export function dirProps(text: string): { dir: 'rtl' | 'ltr' | 'auto' } {
  return { dir: detectDir(text) };
}
