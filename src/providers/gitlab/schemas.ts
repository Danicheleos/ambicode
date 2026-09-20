import { z } from 'zod';

/**
 * The parts of GitLab's REST responses AMBICODE relies on. Objects are loose
 * because GitLab adds fields between versions and a new one is not an error;
 * every field this code reads is declared here and validated before use, so a
 * missing or retyped one is a diagnostic rather than an `undefined` later.
 */

/** GitLab returns ids as numbers and paths as strings; both identify a project. */
const ProjectId = z.union([z.number().int().positive(), z.string().min(1)]).transform(String);

const Sha = z.string().regex(/^[0-9a-f]{7,64}$/, { error: 'expected a commit sha' });

export const GitLabProject = z.looseObject({
  id: ProjectId,
  path_with_namespace: z.string().min(1),
});
export type GitLabProject = z.infer<typeof GitLabProject>;

export const GitLabDiffRefs = z.looseObject({
  base_sha: Sha.nullable(),
  start_sha: Sha.nullable(),
  head_sha: Sha.nullable(),
});

export const GitLabMergeRequest = z.looseObject({
  iid: z.number().int().positive(),
  project_id: ProjectId,
  source_project_id: ProjectId.nullable(),
  target_project_id: ProjectId,
  web_url: z.string().min(1),
  state: z.string(),
  title: z.string().default(''),
  sha: Sha.nullable().default(null),
  diff_refs: GitLabDiffRefs.nullable().default(null),
});
export type GitLabMergeRequest = z.infer<typeof GitLabMergeRequest>;

export const GitLabVersion = z.looseObject({
  id: z.number().int().positive(),
  head_commit_sha: Sha,
  base_commit_sha: Sha.nullable(),
  start_commit_sha: Sha.nullable(),
  created_at: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
});
export type GitLabVersion = z.infer<typeof GitLabVersion>;

export const GitLabVersionDiff = z.looseObject({
  old_path: z.string(),
  new_path: z.string(),
  a_mode: z.string().nullable().default(null),
  b_mode: z.string().nullable().default(null),
  new_file: z.boolean().default(false),
  renamed_file: z.boolean().default(false),
  deleted_file: z.boolean().default(false),
  /** Absent or empty when GitLab collapsed or capped this file. */
  diff: z.string().default(''),
  /** GitLab sets these when a diff is not delivered in full. */
  too_large: z.boolean().nullable().default(null),
  collapsed: z.boolean().nullable().default(null),
  generated_file: z.boolean().nullable().default(null),
});
export type GitLabVersionDiff = z.infer<typeof GitLabVersionDiff>;

export const GitLabVersionDetail = GitLabVersion.extend({
  diffs: z.array(GitLabVersionDiff).default([]),
  /** True when GitLab itself says the version's diff list is incomplete. */
  real_size: z.string().nullable().default(null),
});
export type GitLabVersionDetail = z.infer<typeof GitLabVersionDetail>;

export const GitLabFile = z.looseObject({
  file_path: z.string(),
  size: z.number().int().nonnegative().nullable().default(null),
  encoding: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
});
export type GitLabFile = z.infer<typeof GitLabFile>;

export const GitLabTreeEntry = z.looseObject({
  name: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(['blob', 'tree', 'commit']),
  mode: z.string().nullable().default(null),
});
export type GitLabTreeEntry = z.infer<typeof GitLabTreeEntry>;

export const GitLabNotePosition = z.looseObject({
  base_sha: z.string().nullable().default(null),
  start_sha: z.string().nullable().default(null),
  head_sha: z.string().nullable().default(null),
  old_path: z.string().nullable().default(null),
  new_path: z.string().nullable().default(null),
  old_line: z.number().int().positive().nullable().default(null),
  new_line: z.number().int().positive().nullable().default(null),
});

export const GitLabNote = z.looseObject({
  id: z.union([z.number().int(), z.string().min(1)]).transform(String),
  body: z.string().default(''),
  author: z.looseObject({ username: z.string().default(''), name: z.string().default('') }).nullable().default(null),
  created_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
  system: z.boolean().default(false),
  resolvable: z.boolean().default(false),
  resolved: z.boolean().nullable().default(null),
  position: GitLabNotePosition.nullable().default(null),
});
export type GitLabNote = z.infer<typeof GitLabNote>;

export const GitLabDiscussion = z.looseObject({
  id: z.string().min(1),
  individual_note: z.boolean().default(false),
  notes: z.array(GitLabNote).default([]),
});
export type GitLabDiscussion = z.infer<typeof GitLabDiscussion>;

export const GitLabCreatedDiscussion = z.looseObject({
  id: z.string().min(1),
  notes: z.array(GitLabNote).default([]),
});
