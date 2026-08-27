// Markdown -> lists and items. Two dialects, both common in real notes:
//   # Heading           -> a list (matched to an existing list by exact
//                          name, otherwise created)
//   - bullet / - [ ]    -> an item ([x] = done); indented bullets become
//                          sub-items of the previous top-level bullet
//   paragraph blocks    -> an item: first line is the title, the rest of
//                          the block becomes the item's notes
// Text before the first heading: a lone title line is ignored; task-like
// blocks go to the Pool. Pure module - unit-checked in split-check.mjs.

export interface MdItem {
  title: string;
  notes: string;
  done: boolean;
  children: { title: string; done: boolean }[];
}

export interface MdList {
  name: string | null; // null = no heading yet -> the Pool
  items: MdItem[];
}

const BULLET = /^(\s*)[-*+]\s+(?:\[( |x|X)\]\s+)?(.+)$/;
const HEADING = /^#{1,4}\s+(.+?)\s*#*\s*$/;

export function parseMarkdownTasks(text: string): MdList[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const lists: MdList[] = [];
  let current: MdList | null = null;
  let block: string[] = [];
  let sawHeading = false;
  let preambleLines = 0;

  const list = (): MdList => {
    if (!current) {
      current = { name: null, items: [] };
      lists.push(current);
    }
    return current;
  };

  const flushBlock = () => {
    if (block.length === 0) return;
    const [title, ...rest] = block;
    block = [];
    // a lone line before any heading is the document's own title - not a task
    if (!sawHeading && rest.length === 0 && preambleLines === 0) {
      preambleLines += 1;
      return;
    }
    list().items.push({ title: title.trim(), notes: rest.join('\n').trim(), done: false, children: [] });
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushBlock();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushBlock();
      sawHeading = true;
      current = { name: h[1].trim(), items: [] };
      lists.push(current);
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      flushBlock();
      const [, indent, check, text] = b;
      const done = check === 'x' || check === 'X';
      const items = list().items;
      const parent = items[items.length - 1];
      if (indent.length >= 2 && parent) {
        parent.children.push({ title: text.trim(), done });
      } else {
        items.push({ title: text.trim(), notes: '', done, children: [] });
      }
      continue;
    }
    block.push(line);
  }
  flushBlock();

  return lists.filter((l) => l.items.length > 0);
}

export function countMdTasks(lists: MdList[]): number {
  return lists.reduce((n, l) => n + l.items.length + l.items.reduce((c, i) => c + i.children.length, 0), 0);
}
