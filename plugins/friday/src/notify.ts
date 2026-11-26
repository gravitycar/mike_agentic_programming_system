import { run } from './exec.js';

/** Posts a macOS notification. FRIDAY_NO_NOTIFY=1 turns it off, for tests. */
export function notify(title: string, message: string): void {
  if (process.env.FRIDAY_NO_NOTIFY === '1') return;
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  run('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`]);
}
