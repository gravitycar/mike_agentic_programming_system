import { Actor, GitLab } from './gitlab.js';
import { loadProcess, type Mode } from './spec.js';
import type { Store } from './store.js';

/**
 * A process's mode. The store decides; the environment (FRIDAY_MODE, set by
 * the runner) can only lower it to dry-run, never raise it to live. So neither
 * an agent nor a trial run can promote itself.
 */
export function effectiveMode(processName: string, store: Store, requested?: Mode): Mode {
  const stored = store.mode(processName, loadProcess(processName).defaultMode);
  if (requested === 'dry-run' || process.env.FRIDAY_MODE === 'dry-run') return 'dry-run';
  return stored;
}

/** The Actor for a process: its outward actions, in its effective mode. */
export function actorFor(processName: string, store: Store, gl?: GitLab, requested?: Mode): Actor {
  const spec = loadProcess(processName);
  return new Actor(processName, effectiveMode(processName, store, requested), new Set(spec.outwardActions), store, gl);
}

/** The Actor for the agent calling `friday act`, from the environment the runner set. */
export function agentActor(store: Store): Actor {
  const name = process.env.FRIDAY_PROCESS;
  if (!name) throw new Error('`friday act` runs only inside a Friday agent (FRIDAY_PROCESS is not set).');
  return actorFor(name, store);
}
