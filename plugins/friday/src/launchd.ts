import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { run } from './exec.js';
import { FRIDAY_BIN, fridayHome, logsDir } from './paths.js';
import { parseDuration } from './spec.js';

export const labelFor = (process: string) => `com.mike.friday.${process}`;
export const plistPath = (process: string) =>
  path.join(process_env_launchAgents(), `${labelFor(process)}.plist`);

function process_env_launchAgents(): string {
  return process.env.FRIDAY_LAUNCH_AGENTS ?? path.join(os.homedir(), 'Library', 'LaunchAgents');
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The PATH a scheduled run needs: Friday, Claude, glab, git, node. */
export function launchPath(): string {
  const home = os.homedir();
  return [path.dirname(FRIDAY_BIN), `${home}/.local/bin`, `${home}/.asdf/shims`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
}

export function renderPlist(processName: string, schedule: string): string {
  const daily = /^daily\s+(\d{1,2}):(\d{2})$/.exec(schedule.trim());
  const when = daily
    ? `<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${Number(daily[1])}</integer><key>Minute</key><integer>${Number(daily[2])}</integer></dict>`
    : `<key>StartInterval</key><integer>${Math.round(parseDuration(schedule) / 1000)}</integer>`;
  const log = path.join(logsDir(), `${processName}.log`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(labelFor(processName))}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(FRIDAY_BIN)}</string><string>run</string><string>${xml(processName)}</string></array>
  ${when}
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(launchPath())}</string>
    <key>HOME</key><string>${xml(os.homedir())}</string>
    <key>FRIDAY_HOME</key><string>${xml(fridayHome())}</string>
  </dict>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;
}

const domain = () => `gui/${os.userInfo().uid}`;

export function install(processName: string, schedule: string): string {
  if (schedule === 'manual') throw new Error(`${processName} has a manual schedule; run it with \`friday run ${processName}\`.`);
  fs.mkdirSync(logsDir(), { recursive: true });
  const file = plistPath(processName);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  unload(processName);
  fs.writeFileSync(file, renderPlist(processName, schedule));
  const r = run('launchctl', ['bootstrap', domain(), file]);
  if (r.code !== 0) throw new Error(`launchctl bootstrap failed: ${r.stderr.trim()}`);
  return file;
}

export function unload(processName: string): void {
  run('launchctl', ['bootout', `${domain()}/${labelFor(processName)}`]);
  // bootout returns before the job is gone; bootstrapping too soon fails with error 5.
  for (let i = 0; i < 50 && isLoaded(processName); i++) run('sleep', ['0.1']);
}

export function uninstall(processName: string): void {
  unload(processName);
  fs.rmSync(plistPath(processName), { force: true });
}

export function isLoaded(processName: string): boolean {
  return run('launchctl', ['print', `${domain()}/${labelFor(processName)}`]).code === 0;
}
