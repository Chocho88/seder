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

const { PERSONAL_FIELDS, splitPatch, composeItem, prefsFromItem, neutralizeShared, prefsId } = await import(
  join(dirname(self), '../src/lib/shareSplit.ts')
);

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

console.log(failures === 0 ? '\nALL SPLIT CHECKS PASSED' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
