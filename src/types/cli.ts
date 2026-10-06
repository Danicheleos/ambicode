export const PREPARE_OPTIONS = {
  values: ['activity', 'project', 'evidence', 'task-open'],
  repeated: ['requirement', 'term'],
  flags: ['json', 'verbose', 'with-contract'],
  positionals: true,
} as const;

export const ROUTE_START_OPTIONS = { values: ['task', 'project', 'plan', 'from-draft', 'base', 'mr'], repeated: ['answer', 'requirement'], flags: ['json', 'headless', 'fresh', 'adopt', 'branch'], positionals: true } as const;
