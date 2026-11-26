import * as fs from 'fs';
import * as path from 'path';
import { configPath, expandHome } from './paths.js';

export interface ProjectConfig {
  /** GitLab path, such as metarouter/ion. */
  project: string;
  /** Local clone, such as ~/metarouter/ion. */
  clone: string;
  /** The review env UI URL, with {slug} for the branch's namespace. Optional. */
  reviewEnvUrl?: string;
}

export interface FridayConfig {
  gitlabUser: string;
  projects: ProjectConfig[];
  /** Days 1-7 (Monday = 1) and hours during which scheduled runs may start. */
  hours: { days: number[]; start: string; end: string };
  /** Text every automated reply starts with. Colleagues see it. */
  replyHeader: string;
  labels: { needsMike: string; gaveUp: string };
}

export const DEFAULT_CONFIG: FridayConfig = {
  gitlabUser: 'mike.andersen',
  projects: [
    {
      project: 'metarouter/ion',
      clone: '~/metarouter/ion',
      reviewEnvUrl: 'https://{slug}-ui.mr-ui-review1.gcp-us-west4.metarouter.io',
    },
    { project: 'metarouter/roost', clone: '~/metarouter/roost' },
  ],
  hours: { days: [1, 2, 3, 4, 5], start: '07:00', end: '18:00' },
  replyHeader: "🤖 Automated reply from Friday, Mike's review assistant",
  labels: { needsMike: 'needs-mike', gaveUp: 'bot-gave-up' },
};

export function loadConfig(): FridayConfig {
  const p = configPath();
  if (!fs.existsSync(p)) return DEFAULT_CONFIG;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<FridayConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    hours: { ...DEFAULT_CONFIG.hours, ...(raw.hours ?? {}) },
    labels: { ...DEFAULT_CONFIG.labels, ...(raw.labels ?? {}) },
  };
}

export function writeDefaultConfig(): string {
  const p = configPath();
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  }
  return p;
}

export function projectConfig(cfg: FridayConfig, project: string): ProjectConfig {
  const pc = cfg.projects.find((p) => p.project === project);
  if (!pc) throw new Error(`Project ${project} is not in Friday's config.`);
  return { ...pc, clone: expandHome(pc.clone) };
}

/** True when `now` falls in the configured working hours. */
export function inWorkingHours(cfg: FridayConfig, now = new Date()): boolean {
  const day = now.getDay() === 0 ? 7 : now.getDay();
  if (!cfg.hours.days.includes(day)) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const toMins = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  return mins >= toMins(cfg.hours.start) && mins < toMins(cfg.hours.end);
}

/** GitLab's CI_COMMIT_REF_SLUG for a branch name. */
export function refSlug(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 63)
    .replace(/^-+|-+$/g, '');
}
