export interface BadAnchor { path: string; line: string; reason: 'missing-file' | 'outside-repository'
  | 'line-out-of-range' | 'identifier-not-near'; identifier?: string }

export interface PlanCheckResult {
  anchors: { checked: number; bad: BadAnchor[]; badTotal: number };
  acs: { mapped: number; unmapped: string[]; unmappedTotal: number };
  duplicates: { name: string; declaredAt: string }[];
  /** Why no name was looked up: an empty `duplicates` then means "not checked", not "none". */
  duplicatesSkipped?: string;
}

