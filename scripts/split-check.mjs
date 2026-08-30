// Unit checks for the shared/personal split (src/lib/shareSplit.ts) - the
// one piece of the sharing model that is pure logic. Runs the REAL module
// via node's type stripping; no browser, no mocks.
// Usage: node scripts/split-check.mjs
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
if (!process.env.SEDER_SPLIT_CHILD) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', self],
    { stdio: 'inherit', env: { ...process.env, SEDER_SPLIT_CHILD: '1' } },
  );
  process.exit(r.status ?? 1);
}

const { PERSONAL_FIELDS, splitPatch, composeItem, prefsFromItem, neutralizeShared, prefsId, isMissingTableError, rekeySnapshot } =
  await import(join(dirname(self), '../src/lib/shareSplit.ts'));

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

const item = {
  id: 'it-1',
  title: 'buy soap',
  kind: 'task',
  categoryId: 'cat-home',
  parentId: null,
  order: 3,
  nextMove: 'go to the store',
  stateOverride: null,
  done: false,
  doneAt: null,
  archivedAt: null,
  deletedAt: null,
  important: true,
  urgent: null,
  today: true,
  todaySince: 111,
  evening: true,
  pinned: true,
  matrixOrder: 2000,
  suggestSnooze: 999,
  due: 12345,
  nudge: null,
  notes: 'the good kind',
  links: [],
  source: null,
  tags: [],
  createdAt: 1,
  updatedAt: 2,
};

// 1. a mixed patch splits cleanly and completely
{
  const patch = { title: 'buy soap now', today: false, urgent: true, due: 777, matrixOrder: 5 };
  const { shared, personal } = splitPatch(patch);
  check('shared half carries no personal field', Object.keys(shared).every((k) => !PERSONAL_FIELDS.includes(k)));
  check('personal half carries only personal fields', Object.keys(personal).every((k) => PERSONAL_FIELDS.includes(k)));
  check(
    'nothing is lost in the split',
    Object.keys(shared).length + Object.keys(personal).length === Object.keys(patch).length,
  );
  check('title goes shared', shared.title === 'buy soap now');
  check('due goes shared (a deadline is the task\'s)', shared.due === 777);
  check('today goes personal', personal.today === false);
  check('urgent goes personal', personal.urgent === true);
}

// 2. every personal field is personal; nudge stays shared by design
{
  const everyPersonal = Object.fromEntries(PERSONAL_FIELDS.map((f) => [f, 1]));
  const { shared, personal } = splitPatch(everyPersonal);
  check('all PERSONAL_FIELDS route to prefs', Object.keys(personal).length === PERSONAL_FIELDS.length);
  check('no PERSONAL_FIELD leaks to shared', Object.keys(shared).length === 0);
  const { shared: s2, personal: p2 } = splitPatch({ nudge: 42, done: true });
  check('nudge is shared (waiting state belongs to the task)', s2.nudge === 42 && !('nudge' in p2));
  check('done is shared', s2.done === true);
}

// 3. lift then compose is identity for the personal fields
{
  const prefs = prefsFromItem('user-a', item);
  check('prefs id is user:item', prefs.id === prefsId('user-a', 'it-1'));
  const composed = composeItem(neutralizeShared(item), prefs);
  check(
    'compose(neutralize(item), lift(item)) restores every personal field',
    PERSONAL_FIELDS.every((f) => JSON.stringify(composed[f]) === JSON.stringify(item[f])),
  );
  check('shared fields survive untouched', composed.title === item.title && composed.due === item.due && composed.order === item.order);
}

// 4. the neutralized row betrays no triage
{
  const n = neutralizeShared(item);
  check(
    'neutralized row has no personal signal',
    n.today === false && n.todaySince === null && n.evening === false && n.pinned === false &&
      n.important === null && n.urgent === null && n.matrixOrder === undefined && n.suggestSnooze === null,
  );
  check('neutralized row keeps the shared truth', n.title === item.title && n.done === item.done && n.nextMove === item.nextMove);
}

// 5. composing without prefs falls back to the item's own (legacy) fields
{
  const composed = composeItem(item, undefined);
  check('no prefs row: legacy fields stand', composed.today === true && composed.important === true);
}

// 6. composing is idempotent
{
  const prefs = prefsFromItem('user-a', item);
  const once = composeItem(item, prefs);
  const twice = composeItem(once, prefs);
  check('compose twice = compose once', JSON.stringify(once) === JSON.stringify(twice));
}

// 7. missing-table classification: "sharing not installed" vs real failure
{
  check('42P01 is a missing table', isMissingTableError({ code: '42P01', message: 'x' }));
  check('PGRST205 is a missing table', isMissingTableError({ code: 'PGRST205', message: 'x' }));
  check(
    'schema-cache message is a missing table',
    isMissingTableError({ message: "Could not find the table 'public.item_prefs' in the schema cache" }),
  );
  check(
    'relation-does-not-exist message is a missing table',
    isMissingTableError({ message: 'relation "public.shares" does not exist' }),
  );
  check('an RLS denial is NOT a missing table', !isMissingTableError({ code: '42501', message: 'new row violates row-level security policy' }));
  check('a network error is NOT a missing table', !isMissingTableError({ message: 'TypeError: Failed to fetch' }));
  check('null is NOT a missing table', !isMissingTableError(null));
}

// 8. recovery re-keying: fresh ids, remapped links, pool folded, archived left behind
{
  let n = 0;
  const newId = () => `new-${++n}`;
  const snap = {
    categories: [
      { id: 'old-pool', name: 'Pool', system: true, archived: false, colorKey: 'fog', order: -1 },
      { id: 'old-cat', name: 'בית', archived: false, colorKey: 'sage', order: 0 },
      { id: 'old-arch', name: 'gone', archived: true, colorKey: 'clay', order: 1 },
    ],
    items: [
      { ...item, id: 'old-a', categoryId: 'old-cat', parentId: null },
      { ...item, id: 'old-b', categoryId: 'old-cat', parentId: 'old-a' },
      { ...item, id: 'old-c', categoryId: 'old-pool', parentId: null },
      { ...item, id: 'old-d', categoryId: 'old-cat', parentId: null, archivedAt: 123 },
    ],
  };
  const out = rekeySnapshot(snap, { poolId: 'my-pool', ownerId: 'me', nextOrder: 5, newId });
  check('rekey: archived category dropped', out.categories.length === 1 && out.categories[0].name === 'בית');
  check('rekey: category got a fresh id and appended order', out.categories[0].id !== 'old-cat' && out.categories[0].order === 5);
  check('rekey: archived item left behind', out.items.length === 3);
  const a = out.items.find((i) => i.title === item.title && i.parentId === null && i.categoryId === out.categories[0].id);
  const bItem = out.items.find((i) => i.parentId !== null);
  check('rekey: sub-item follows its re-keyed parent', bItem?.parentId === a?.id);
  check('rekey: old pool items fold into MY pool', out.items.some((i) => i.categoryId === 'my-pool'));
  check('rekey: no old id survives', out.items.every((i) => !i.id.startsWith('old-')) && out.categories.every((c) => !c.id.startsWith('old-')));
  check('rekey: every item gets my prefs row', out.prefs.length === out.items.length && out.prefs.every((p) => p.id.startsWith('me:')));
}

// 9. Markdown import parser (mdImport.ts) - the two dialects
{
  const { parseMarkdownTasks, countMdTasks } = await import(join(dirname(self), '../src/lib/mdImport.ts'));
  // paragraph-block dialect (the user's real file shape, synthetic content)
  const paragraphMd = [
    'משימות לפני המעבר - 1.1.2027',
    '',
    '# רשימה א',
    '',
    'משימה ראשונה',
    'הסבר על המשימה הראשונה.',
    'שורה שנייה של ההסבר.',
    '',
    'משימה שנייה בלי הערות',
    '',
    '# רשימה ב',
    '',
    'משימה שלישית',
    'עם הערה.',
  ].join('\n');
  const p = parseMarkdownTasks(paragraphMd);
  check('md: two lists parsed', p.length === 2 && p[0].name === 'רשימה א' && p[1].name === 'רשימה ב');
  check('md: lone title line before headings is not a task', countMdTasks(p) === 3);
  check('md: block first line is the title', p[0].items[0].title === 'משימה ראשונה');
  check('md: block rest becomes notes', p[0].items[0].notes === 'הסבר על המשימה הראשונה.\nשורה שנייה של ההסבר.');
  check('md: title-only block has empty notes', p[0].items[1].notes === '');

  // bullet dialect with checkboxes and sub-items
  const bulletMd = ['# קניות', '- [ ] חלב', '- [x] לחם', '  - תת משימה', '- גבינה'].join('\n');
  const b = parseMarkdownTasks(bulletMd);
  check('md: bullets become items', b[0].items.length === 3);
  check('md: [x] marks done', b[0].items[1].done === true && b[0].items[0].done === false);
  check('md: indented bullet is a sub-item of the previous bullet', b[0].items[1].children[0]?.title === 'תת משימה');

  // preamble bullets (no heading) land in the headingless list -> the Pool
  const noHeading = parseMarkdownTasks('- ראשון\n- שני');
  check('md: bullets without a heading form a Pool-bound list', noHeading.length === 1 && noHeading[0].name === null && noHeading[0].items.length === 2);
  check('md: empty text imports nothing', parseMarkdownTasks('\n\n').length === 0);
}

// ---- syncHealth.ts: parking + humane status (pure, browser-free) ----
{
  const { parseSyncError, isTransientError, shouldPark, mergeParked, unparkPlan, statusView } = await import(
    join(dirname(self), '../src/lib/syncHealth.ts')
  );

  // legacy pre-stamped strings from old builds are discarded on read
  check('health: legacy string error parses to null', parseSyncError('[20:38] push categories: RLS') === null);
  check('health: null/undefined parse to null', parseSyncError(null) === null && parseSyncError(undefined) === null);
  const good = parseSyncError({ at: 123, detail: 'push items: boom' });
  check('health: structured error passes', good !== null && good.at === 123 && good.detail === 'push items: boom');
  check('health: structured error needs a real timestamp', parseSyncError({ at: NaN, detail: 'x' }) === null);
  check('health: structured error needs a detail', parseSyncError({ at: 1, detail: '' }) === null);

  check('health: Load failed is transient', isTransientError('TypeError: Load failed'));
  check('health: fetch failure is transient', isTransientError('Failed to fetch'));
  check('health: RLS message is not transient', !isTransientError('new row violates row-level security policy'));

  check('health: heal-declined parks immediately', shouldPark('heal-declined', 1, false));
  check('health: transient never parks', !shouldPark('heal-declined', 99, true) && !shouldPark('push-error', 99, true));
  check('health: push errors park at 5 attempts', !shouldPark('push-error', 4, false) && shouldPark('push-error', 5, false));

  const p1 = { table: 'categories', rowId: 'pool-x', deleted: false, at: 10, reason: 'rls', parkedAt: 100, attempts: 1 };
  const p2 = { table: 'categories', rowId: 'pool-x', deleted: false, at: 20, reason: 'rls again', parkedAt: 200, attempts: 1 };
  const p3 = { table: 'items', rowId: 'it-9', deleted: true, at: 30, categoryId: 'cat-1', reason: 'dup', parkedAt: 300, attempts: 1 };
  const merged = mergeParked([p1], [p2, p3]);
  check('health: mergeParked dedupes by table:rowId', merged.length === 2);
  const poolEntry = merged.find((e) => e.rowId === 'pool-x');
  check('health: merge keeps newest and sums attempts', poolEntry.parkedAt === 200 && poolEntry.attempts === 2);
  const plan = unparkPlan(merged);
  check(
    'health: unpark round-trips to outbox shape',
    plan.length === 2 &&
      plan.every((e) => e.seq === undefined && typeof e.at === 'number') &&
      plan.find((e) => e.rowId === 'it-9').categoryId === 'cat-1' &&
      plan.find((e) => e.rowId === 'pool-x').categoryId === undefined,
  );

  const now = 1_000_000_000_000;
  const HOUR = 3600_000;
  const base = { pending: 0, parked: 0, lastOk: null, lastPullOk: null, error: null, now };
  check('health: nothing known -> never line', statusView(base).line === 'never');
  check('health: pending wins the line', statusView({ ...base, pending: 3, lastOk: now }).line === 'pending');
  check('health: lastOk -> fresh', statusView({ ...base, lastOk: now - HOUR }).freshAt === now - HOUR);
  check('health: pull freshness fallback', statusView({ ...base, lastPullOk: now - 2 * HOUR }).line === 'fresh');
  check('health: lastOk preferred over pull', statusView({ ...base, lastOk: 5, lastPullOk: 9 }).freshAt === 5);
  const oldErr = { at: now - 25 * HOUR, detail: 'x' };
  const newErr = { at: now - HOUR, detail: 'x' };
  check('health: stale error hidden when idle', !statusView({ ...base, error: oldErr }).errorVisible);
  check('health: fresh error shown', statusView({ ...base, error: newErr }).errorVisible);
  check('health: stale error still shown while pending', statusView({ ...base, pending: 1, error: oldErr }).errorVisible);
  check('health: stale error still shown while parked', statusView({ ...base, parked: 1, error: oldErr }).errorVisible);
}

// ---- gcal.ts: task -> calendar builders (pure, browser-free) ----
{
  const { gcalRenderUrl, icsContent, foldIcsLine } = await import(join(dirname(self), '../src/lib/gcal.ts'));

  // due pinned to 09:00 local like dates.ts does
  const due = new Date(2026, 8, 15, 9, 0, 0, 0).getTime(); // 2026-09-15 local
  const calItem = { id: 'it-cal', title: 'לקבוע תור לשיננית', due, notes: 'עם ד"ר לוי\nבבוקר', updatedAt: Date.UTC(2026, 8, 1, 12, 30, 45) };

  const url = gcalRenderUrl(calItem, 'https://seder-plum.vercel.app');
  check('gcal: no due -> no url', gcalRenderUrl({ ...calItem, due: null }, '') === null);
  check('gcal: render url targets the template editor', url.startsWith('https://calendar.google.com/calendar/render?'));
  const q = new URL(url).searchParams;
  check('gcal: all-day dates are end-exclusive', q.get('dates') === '20260915/20260916');
  check('gcal: hebrew title round-trips the encoding', q.get('text') === 'לקבוע תור לשיננית');
  check('gcal: details carry notes and the deep link', q.get('details').includes('עם ד"ר לוי') && q.get('details').includes('https://seder-plum.vercel.app/?open=it-cal'));
  // month-end boundary: the exclusive end crosses into the next month
  const eom = new Date(2026, 0, 31, 9, 0, 0, 0).getTime();
  check('gcal: exclusive end crosses month boundary', new URL(gcalRenderUrl({ ...calItem, due: eom }, '')).searchParams.get('dates') === '20260131/20260201');

  const ics = icsContent(calItem);
  check('ics: no due -> no file', icsContent({ ...calItem, due: null }) === null);
  check('ics: all-day DTSTART/DTEND', ics.includes('DTSTART;VALUE=DATE:20260915\r\n') && ics.includes('DTEND;VALUE=DATE:20260916\r\n'));
  check('ics: stable UID and deterministic DTSTAMP', ics.includes('UID:it-cal@seder\r\n') && ics.includes('DTSTAMP:20260901T123045Z\r\n'));
  check('ics: newlines in notes are escaped', ics.includes('DESCRIPTION:עם ד"ר לוי\\nבבוקר'));
  check('ics: commas escaped in summary', icsContent({ ...calItem, title: 'a, b; c' }).includes('SUMMARY:a\\, b\\; c'));
  check('ics: CRLF line endings throughout', !ics.replace(/\r\n/g, '').includes('\n'));

  // folding: 75-OCTET limit, Hebrew is 2 bytes per char
  const longHe = 'א'.repeat(100); // 200 octets unfolded
  const folded = foldIcsLine(`SUMMARY:${longHe}`);
  const foldedLines = folded.split('\r\n');
  check('ics: long hebrew lines fold', foldedLines.length > 1 && foldedLines.slice(1).every((l) => l.startsWith(' ')));
  const enc = new TextEncoder();
  check('ics: every folded line stays under 75 octets', foldedLines.every((l) => enc.encode(l).length <= 75));
  check('ics: folding loses no content', foldedLines.map((l, i) => (i === 0 ? l : l.slice(1))).join('') === `SUMMARY:${longHe}`);
  check('ics: short lines fold to themselves', foldIcsLine('VERSION:2.0') === 'VERSION:2.0');
}

console.log(failures === 0 ? '\nALL SPLIT CHECKS PASSED' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
