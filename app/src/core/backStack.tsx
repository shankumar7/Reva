// The phone's back button. Each screen that has something to close (a search, an editor, a step) registers here;
// the innermost one answers first. If nobody answers, the app handles it (go back a screen, or leave).
import { useEffect, useRef } from 'react';

type Entry = { level: number; fn: () => void };
const stack: Entry[] = [];

/** Returns true if something handled the back press. */
export function handleBack(): boolean {
  if (!stack.length) return false;
  let best = stack[0];
  for (const e of stack) if (e.level >= best.level) best = e; // highest level wins; the newest wins a tie
  best.fn();
  return true;
}

/** While `active`, the back button runs `fn`. Higher `level` = more inside (a dialog beats a screen). */
export function useBackHandler(active: boolean, fn: () => void, level = 1) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry: Entry = { level, fn: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active, level]);
}
