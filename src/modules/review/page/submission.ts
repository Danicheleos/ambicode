import type { ParsedSubmission } from '../types/page.ts';

/**
 * A form may carry only the checked findings, the human's text and the fields
 * identifying the submission. Anything else is refused rather than ignored,
 * because an ignored field is one somebody will eventually rely on.
 */

/** Longer than this is a paste, not a review comment. */
const MAX_FIELD_BYTES = 16 * 1024;
const SELECT_PREFIX = 'select_';
const BODY_PREFIX = 'body_';
const FIXED_FIELDS = new Set(['_csrf', 'submissionId']);

interface ParseSubmissionOptions {
  body: unknown;
  knownFindingIds: ReadonlySet<string>;
  publishableFindingIds: ReadonlySet<string>;
}

export function parseSubmission(options: ParseSubmissionOptions): ParsedSubmission {
  const errors: string[] = [];
  const drafts = new Map<string, string>();
  const selected = new Set<string>();

  const body = options.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      kind: 'invalid',
      errors: ['The submission was not a readable form body.'],
      drafts,
      selected,
    };
  }

  let submissionId = '';

  for (const [name, value] of Object.entries(body as Record<string, unknown>)) {
    // `fast-querystring` turns a repeated field into an array. A repeated
    // field changes what the form means, so it is refused, not collapsed.
    if (Array.isArray(value)) {
      errors.push(`The field "${name}" was submitted more than once.`);
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`The field "${name}" did not carry text.`);
      continue;
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_FIELD_BYTES) {
      errors.push(`The field "${name}" is longer than the ${MAX_FIELD_BYTES}-byte limit for one field.`);
      continue;
    }
    // A replacement character here means the browser sent bytes that are not
    // valid UTF-8, which a form from this page never does.
    if (value.includes('�')) {
      errors.push(`The field "${name}" contained bytes that are not valid UTF-8.`);
      continue;
    }

    if (name === 'submissionId') {
      submissionId = value;
      continue;
    }
    if (FIXED_FIELDS.has(name)) continue;

    if (name.startsWith(BODY_PREFIX)) {
      const findingId = name.slice(BODY_PREFIX.length);
      if (!options.knownFindingIds.has(findingId)) {
        errors.push(`The submission named a finding this review does not contain: "${findingId}".`);
        continue;
      }
      drafts.set(findingId, value);
      continue;
    }
    if (name.startsWith(SELECT_PREFIX)) {
      const findingId = name.slice(SELECT_PREFIX.length);
      if (!options.knownFindingIds.has(findingId)) {
        errors.push(`The submission selected a finding this review does not contain: "${findingId}".`);
        continue;
      }
      selected.add(findingId);
      continue;
    }

    errors.push(
      `The field "${name}" is not part of this form. Positions, paths, revisions and the merge request are taken from the saved review, never from a submission.`,
    );
  }

  if (submissionId === '') {
    errors.push('The submission carried no submission identifier, so it could not be told apart from a replay.');
  }

  for (const findingId of selected) {
    const body = drafts.get(findingId);
    if (body === undefined) {
      errors.push(`Finding ${findingId} was selected but carried no comment text.`);
      continue;
    }
    if (body.trim() === '') {
      errors.push(`Finding ${findingId} was selected with an empty comment. Write the comment or clear the checkbox.`);
    }
    if (!options.publishableFindingIds.has(findingId)) {
      errors.push(
        `Finding ${findingId} has no exact saved position, so it cannot be published. Clear its checkbox.`,
      );
    }
  }

  if (errors.length > 0) return { kind: 'invalid', errors, drafts, selected };
  return { kind: 'ok', submissionId, drafts, selected };
}
