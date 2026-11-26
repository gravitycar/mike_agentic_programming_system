import { GitLab, pid } from './gitlab.js';

export interface MR {
  iid: number;
  title: string;
  description: string | null;
  draft: boolean;
  source_branch: string;
  target_branch: string;
  web_url: string;
  labels: string[];
  sha: string;
  head_pipeline?: { id: number; status: string; sha: string; web_url: string } | null;
}

export interface Job {
  id: number;
  name: string;
  stage: string;
  status: string;
  allow_failure: boolean;
  failure_reason?: string;
  web_url: string;
  created_at: string;
}

export interface Note {
  id: number;
  body: string;
  author: { username: string };
  created_at: string;
  system: boolean;
  resolvable: boolean;
  resolved?: boolean;
  position?: { new_path?: string; new_line?: number; old_path?: string; old_line?: number } | null;
}

export interface Discussion {
  id: string;
  individual_note: boolean;
  notes: Note[];
}

export function openMRs(gl: GitLab, project: string, author: string): MR[] {
  return gl.get<MR[]>(`projects/${pid(project)}/merge_requests?author_username=${encodeURIComponent(author)}&state=opened&per_page=100`, true) ?? [];
}

export function mrDetail(gl: GitLab, project: string, iid: number): MR {
  return gl.get<MR>(`projects/${pid(project)}/merge_requests/${iid}`);
}

/** Every job instance in a pipeline, retried ones included. */
export function pipelineJobs(gl: GitLab, project: string, pipelineId: number): Job[] {
  return gl.get<Job[]>(`projects/${pid(project)}/pipelines/${pipelineId}/jobs?per_page=100&include_retried=true`, true) ?? [];
}

/** The newest instance of each job name. Retrying a job creates a new instance. */
export function newestByName(jobs: Job[]): Map<string, Job> {
  const m = new Map<string, Job>();
  for (const j of jobs) {
    const cur = m.get(j.name);
    if (!cur || j.id > cur.id) m.set(j.name, j);
  }
  return m;
}

export function discussions(gl: GitLab, project: string, iid: number): Discussion[] {
  return gl.get<Discussion[]>(`projects/${pid(project)}/merge_requests/${iid}/discussions?per_page=100`, true) ?? [];
}

export function noteAwards(gl: GitLab, project: string, iid: number, noteId: number): { name: string; user: { username: string } }[] {
  return gl.get(`projects/${pid(project)}/merge_requests/${iid}/notes/${noteId}/award_emoji`) ?? [];
}
