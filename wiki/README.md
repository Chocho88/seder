# Seder wiki - read this first

Seder (סדר) is a personal projects/todo app: one holistic canvas (Eisenhower
matrix + list cards), local-first with Supabase sync, Hebrew/English with
per-line RTL, installable PWA. Live: https://seder-plum.vercel.app

This wiki is for agents (and humans) picking the codebase up cold. Read in
order; each page is short and load-bearing.

| # | Page | What you learn |
|---|------|----------------|
| 1 | [principles.md](principles.md) | The user, the taste, the non-negotiables (no em-dash, do the tedious work, verify with real input) |
| 2 | [architecture.md](architecture.md) | Files, data flow, store, sync engine, auth |
| 3 | [data-model.md](data-model.md) | Item / Category fields, the Next Move engine, sections, the Pool |
| 4 | [ui-system.md](ui-system.md) | Design tokens, the canonical row, cards, matrix, drag layer, RTL rules |
| 5 | [mobile.md](mobile.md) | Phone layout, touch drag (iOS arbitration), what differs from desktop |
| 6 | [testing.md](testing.md) | The screenshot rig, geometry invariants, how to verify touch for real |
| 7 | [deploy.md](deploy.md) | Vercel, Supabase, env, push-to-deploy, icons |
| 8 | [history.md](history.md) | How we got here - decisions and reversals, so you don't re-argue them |
| 9 | [sharing.md](sharing.md) | Shared lists: the ours/mine split, shares + item_prefs, RLS, ownership |
| 10 | [next.md](next.md) | Shared-lists milestone: BUILT - what remains to go live |

Golden rules in one breath: keep the calm; every visible string goes through
`t()` in both languages; user content gets `dirProps()`; never overlay when
in-flow works; run `npm run check` before every push; push to `main` deploys.
