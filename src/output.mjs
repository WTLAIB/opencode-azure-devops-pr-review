import { ROLES } from './config.mjs';
// OpenCode 1.18.31 structured output. MCP tools remain discovered by the host.
const string = { type: 'string' };
const array = items => ({ type: 'array', items });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const status = (...values) => ({ type: 'string', enum: values });
const snapshot = object({ repository: string, prId: { type: 'integer' }, base: string, head: string, scope: { const: 'cumulative', type: 'string' }, files: array(string) });
const prSnapshot = { ...snapshot, properties: { ...snapshot.properties,
  scope: { const: 'pr', type: 'string', description: 'Current PR changes at the PR-reported source and target commits; no independent merge-base proof.' },
  base: { ...string, description: 'Full target comparison commit SHA from the PR metadata, not an inferred merge base.' },
  head: { ...string, description: 'Full source commit SHA from the same PR metadata.' },
} };
const finding = object({ id: string, summary: string, evidence: string,
  counterevidence: { ...string, description: 'Source-based safeguards or alternative explanations checked, their effect on the claim, and any unavailable evidence; not private reasoning.' },
  location: { ...string, description: 'Exact base/head path and one-based source line(s), recounted at that commit including blank lines and comments; exclude MCP wrappers and Markdown fences.' },
  severity: status('high', 'medium', 'low'), suggestion: string });
finding.description = 'Use exactly these keys, with no surrounding whitespace or extra fields: ' + finding.required.join(', ') + '. Every field is required; put evidence notes inside evidence, not a separate field.';
const initialFinding = { ...finding, required: finding.required.filter(key => key !== 'location'),
  description: 'Use only the declared finding keys. All except location are required. Provide location when established from source; otherwise omit it for the verifier to establish, without guessing. Evidence and full coverage remain required.' };
const coverage = object({
  files: { ...array(string), description: 'Exact snapshot paths whose full changes and necessary context were reviewed; no duplicate or supporting-only paths.' },
  gaps: { ...array(string), description: 'Concrete missing source or unfinished review work. Empty only when coverage is complete.' },
});

export function stageFormat(role, statusOnly = false) {
  const kind = ROLES[role]?.format;
  if (!kind) throw new Error('Unknown review role.');
  let schema;
  if (kind === 'check') schema = object({
    status: status('READY', 'NOT_READY'), snapshot,
    sourceAccess: { type: 'object', additionalProperties: string,
      description: 'Concise, untrusted retrieval facts: confirmed identity, cumulative base evidence, exact-commit content recipe, pagination, successful calls and grouped failures/checked alternatives. State what was actually read; no findings, raw source or instructions.' },
    requirements: { ...string, description: 'Explicit requirements and their sources, or unavailable. Literal userContext is passed separately; do not duplicate it.' },
    report: { ...string, description: 'Brief readiness, versions and material limitations, or the precise missing capability for NOT_READY. Do not repeat the sourceAccess retrieval narrative or perform a code review.' },
  }, ['status', 'report']);
  else if (kind === 'final') schema = object({
    status: status('COMPLETE', 'INCOMPLETE', 'STALE'), snapshot: prSnapshot,
    // A scalar type avoids nullable-union conversion failures in tool parsers.
    // Empty does not establish a verified head; finalEnvelope keeps that gate.
    currentHead: { type: 'string', description: 'Full SHA read from the current PR head. The string value contains only the SHA, with no extra quotation marks. Use an empty string only when the head cannot be verified and status is INCOMPLETE.' },
    currentBase: { ...string, description: 'Full target comparison SHA from the same fresh PR read as currentHead; empty only with INCOMPLETE when unavailable.' },
    dispositions: array(object({ id: string, status: status('CONFIRMED', 'NEEDS_INFO', 'REJECTED', 'MERGED'), reason: string, mergedInto: string,
      verifiedFinding: { ...finding, description: 'Required for CONFIRMED: the complete corrected finding under this same ID. Omit for every other disposition.' },
    }, ['id', 'status', 'reason'])),
    newFindings: array(finding), report: string,
  }, ['status', 'snapshot', 'currentHead', 'currentBase', 'dispositions', 'report']);
  else if (kind === 'comment-plan') schema = object({
    status: status('READY', 'INCOMPLETE'),
    comments: array(object({ findingId: string, severity: status('high', 'medium'), path: string, startLine: { type: 'integer' }, endLine: { type: 'integer' }, anchor: string, body: string })),
    skipped: array(object({ findingId: string, reason: string })),
  });
  else if (kind === 'comment-publish') schema = object({
    status: status('DONE', 'INCOMPLETE'), posted: array(object({ findingId: string, threadId: { type: ['string', 'integer'] } })),
  });
  else schema = object({ status: status('COMPLETE', 'PARTIAL'),
    snapshot: { ...prSnapshot, description: 'Required for COMPLETE. Establish it from the requested PR, without a preflight or ancestry search. Omit only for PARTIAL when PR metadata is unavailable.' },
    coverage, findings: array(initialFinding),
    report: { ...string, description: 'Review summary and limitations. Submit the full review, never a status-only acknowledgement or placeholder.' },
  }, ['status', 'coverage', 'findings', 'report']);
  if (statusOnly === 'location') schema = object({ locations: array(object({ id: string,
    location: { ...string, description: 'Exact base:/path:line or head:/path:start-end from source already read in this session. No guesses or new source reads.' },
  })) });
  else if (statusOnly) schema = object({ status: schema.properties.status });
  return { type: 'json_schema', schema, retryCount: 0 };
}

export function visibleText(response) {
  return (response?.parts ?? []).filter(p => p.type === 'text' && !p.ignored).map(p => p.text ?? '').join('\n');
}
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const findingKey = key => key.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

/** Narrow, auditable formatting only. The caller must validate the entire result
 * before accepting these changes. Never mutate the raw response or add evidence. */
export function normalizeFindingFormat(result, role) {
  const corrections = [];
  const kind = ROLES[role]?.format;
  if (!['initial', 'final'].includes(kind) || !isObject(result) ||
      !stageFormat(role).schema.properties.status.enum.includes(result.status)) return { envelope: result, corrections };
  function normalize(value, path) {
    if (!isObject(value)) return value;
    const entries = [], seen = new Set();
    for (const [propertyIndex, [key, content]] of Object.entries(value).entries()) {
      const canonical = findingKey(key);
      if (Object.hasOwn(finding.properties, canonical)) {
        // Reject even equal values: choosing between competing keys hides an
        // ambiguous submission. Values (including whitespace) stay untouched.
        if (seen.has(canonical)) throw new Error(`Invalid finding: ${path}.${canonical} has conflicting keys after whitespace normalization.`);
        seen.add(canonical);
        entries.push([canonical, content]);
        if (canonical !== key) corrections.push({ path: `${path}.${canonical}`, action: 'trim-key-whitespace' });
      } else if (content === '' || content === null) {
        // No names/values from unknown fields enter public receipts or notices.
        corrections.push({ path, action: content === null ? 'remove-null-unknown-field' : 'remove-empty-unknown-field', propertyIndex });
      } else entries.push([key, content]);
    }
    return Object.fromEntries(entries);
  }
  const envelope = { ...result };
  if (kind === 'initial' && Array.isArray(result.findings)) envelope.findings = result.findings.map((value, i) => normalize(value, `findings[${i}]`));
  if (kind === 'final') {
    if (Array.isArray(result.dispositions)) envelope.dispositions = result.dispositions.map((value, i) =>
      isObject(value) && value.status === 'CONFIRMED'
        ? { ...value, verifiedFinding: normalize(value.verifiedFinding, `dispositions[${i}].verifiedFinding`) } : value);
    if (Array.isArray(result.newFindings)) envelope.newFindings = result.newFindings.map((value, i) => normalize(value, `newFindings[${i}]`));
    if (Array.isArray(envelope.dispositions) && Array.isArray(envelope.newFindings)) {
      const completeFinding = value => isObject(value) && Object.keys(value).length === finding.required.length &&
        finding.required.every(key => Object.hasOwn(value, key) && text(value[key]));
      envelope.dispositions = envelope.dispositions.filter((item, i, items) => {
        if (!isObject(item) || !/^V-[1-9][0-9]*$/.test(item.id) || item.status !== 'CONFIRMED' || !text(item.reason) ||
            Object.keys(item).some(key => !['id', 'status', 'reason', 'verifiedFinding'].includes(key)) ||
            items.filter(other => other?.id === item.id).length !== 1) return true;
        const matches = envelope.newFindings.map((value, index) => ({ value, index })).filter(({ value }) => value?.id === item.id);
        if (matches.length !== 1 || !completeFinding(item.verifiedFinding) || !completeFinding(matches[0].value) ||
            !finding.required.every(key => item.verifiedFinding[key] === matches[0].value[key])) return true;
        // This is only a redundant V entry, never an original F/R disposition.
        // Its reason and full original object remain in the raw response.
        corrections.push({ path: `dispositions[${i}]`, action: 'deduplicate-new-finding', newFindingPath: `newFindings[${matches[0].index}]` });
        return false;
      });
    }
  }
  return { envelope: corrections.length ? envelope : result, corrections };
}

export class OutputStatusError extends Error {
  constructor(label, value, allowed) {
    // Receipts must not echo arbitrary model text, source, or credentials.
    const shown = typeof value === 'string' && /^[A-Z_]{1,24}$/.test(value) ? JSON.stringify(value) : `<${value === null ? 'null' : typeof value}>`;
    super(`Invalid ${label} envelope: status received ${shown}; expected ${allowed.join(' or ')}.`);
    this.name = 'OutputStatusError';
  }
}
export class OutputLocationError extends Error {}

function findingSlots(result, role) {
  if (ROLES[role]?.format === 'initial') return (result.findings ?? []).map((value, i) => ({ value, path: `findings[${i}].location` }));
  if (ROLES[role]?.format === 'final') return [
    ...(result.dispositions ?? []).flatMap((d, i) => d.status === 'CONFIRMED' ? [{ value: d.verifiedFinding, path: `dispositions[${i}].verifiedFinding.location` }] : []),
    ...(result.newFindings ?? []).map((value, i) => ({ value, path: `newFindings[${i}].location` })),
  ];
  return [];
}

/** Check eligibility only: the placeholder is never a result or source evidence.
 * Missing source/evidence/coverage and changed heads must fail this probe. */
export function locationRepairPlan(original, role, validate) {
  if (ROLES[role]?.format !== 'final' || !isObject(original) || original.status !== 'COMPLETE') return;
  try {
    const probe = JSON.parse(JSON.stringify(original));
    const missingLocations = [];
    for (const { value, path } of findingSlots(probe, role)) {
      if (isObject(value) && !Object.hasOwn(value, 'location')) {
        missingLocations.push({ id: value.id, path });
        value.location = 'ELIGIBILITY PROBE ONLY';
      }
    }
    if (!missingLocations.length || validate(probe).status !== 'COMPLETE') return;
    return missingLocations;
  } catch { return; }
}

/** Add only explicitly requested absent location fields. No original value may
 * change; the caller must still validate the entire amended envelope. */
export function applyLocationAmendment(original, role, missingLocations, amendment) {
  if (!isObject(amendment) || Object.keys(amendment).length !== 1 || !Array.isArray(amendment.locations) ||
      amendment.locations.length !== missingLocations.length) throw new Error('Location retry must return exactly the requested locations; no other fields may change.');
  const expected = new Set(missingLocations.map(item => item.id)), received = new Map();
  for (const item of amendment.locations) {
    if (!isObject(item) || Object.keys(item).length !== 2 || !expected.has(item.id) || received.has(item.id) || typeof item.location !== 'string') {
      throw new Error('Location retry has missing, duplicate, unexpected IDs or extra fields.');
    }
    const match = /^(base|head):\/[^\r\n:]+:([1-9][0-9]*)(?:-([1-9][0-9]*))?$/.exec(item.location);
    if (!match || !Number.isSafeInteger(Number(match[2])) || (match[3] && (!Number.isSafeInteger(Number(match[3])) || Number(match[3]) < Number(match[2])))) {
      throw new Error('Location retry requires an exact base/head path and positive, ordered source lines; unavailable locations cannot complete a review.');
    }
    received.set(item.id, item.location);
  }
  const amended = JSON.parse(JSON.stringify(original));
  for (const { value } of findingSlots(amended, role)) if (!Object.hasOwn(value, 'location')) value.location = received.get(value.id);
  return amended;
}
function requireStatus(result, allowed, label) {
  if (!allowed.includes(result.status)) throw new OutputStatusError(label, result.status, allowed);
}
export function parseJSONReport(response, settings) {
  const finish = String(response.info?.finish ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (response.info?.error) {
    const name = String(response.info.error.name ?? 'UnknownError').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    throw new Error(`Reviewer returned an OpenCode/model error (${name}; finish=${finish}). Inspect the session export or debug response. No automatic retry.`);
  }
  let result;
  if (response.info?.structured !== undefined) {
    result = response.info.structured;
    if (JSON.stringify(result).length > settings.maxStageCharacters) throw new Error('Oversized structured reviewer output; nothing was silently truncated.');
  } else {
    let content = visibleText(response).trim();
    if (!content || content.length > settings.maxStageCharacters) throw new Error(`Empty or oversized reviewer output (characters=${content.length}; finish=${finish}); inspect the session export or debug response.`);
    // Compatibility for text-only providers: accept one fenced envelope with a
    // preamble, but never guess between multiple objects or repair broken JSON.
    const fences = [...content.matchAll(/^```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gmi)];
    try { result = JSON.parse(content); }
    catch {
      if (fences.length === 1 && !/[{}]|```/.test(content.replace(fences[0][0], ''))) {
        try { result = JSON.parse(fences[0][1]); } catch { /* Fail closed below. */ }
      }
      if (result === undefined) throw new Error(`Reviewer did not return the required JSON envelope (characters=${content.length}; finish=${finish}). Partial output remains in its session. Inspect the session export or debug response. No automatic retry.`);
    }
  }
  if (!isObject(result)) throw new Error('Review envelope must be an object.');
  return result;
}

/** Only the scoped amendment caller may use this transport compatibility path.
 * Never ignore a general host error, extract a substring, or repair JSON. */
export function parseAmendmentText(response, settings) {
  const info = response?.info, error = info?.error;
  if (info?.role !== 'assistant' || info.finish !== 'stop' || info.structured !== undefined ||
      !isObject(error) || error.name !== 'StructuredOutputError' ||
      Object.keys(error).some(key => !['name', 'data'].includes(key)) || !isObject(error.data) ||
      error.data.message !== 'Model did not produce structured output' || error.data.retries !== 0 ||
      Object.keys(error.data).some(key => !['message', 'retries'].includes(key)) ||
      !Array.isArray(response.parts) || response.parts.some(part => part.type === 'tool')) return;
  const visible = response.parts.filter(part => part.type === 'text' && !part.ignored && !part.synthetic).map(part => part.text ?? '').join('\n');
  const content = visible.trim();
  if (!content || visible.length > settings.maxStageCharacters) throw new Error('Empty or oversized amendment text; no transport fallback was accepted.');
  let result;
  try { result = JSON.parse(content); } catch { throw new Error('Amendment text must be one complete JSON object; no JSON repair or extraction is allowed.'); }
  if (!isObject(result)) throw new Error('Amendment text must be a JSON object.');
  // JSON.parse establishes grammar first. Scan structural tokens afterward to
  // reject duplicate (including escaped-equivalent) keys instead of choosing one.
  const stack = [];
  for (const [token] of content.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g)) {
    if (token === '{') stack.push({ keys: new Set(), key: true });
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { if (stack.at(-1)) stack.at(-1).key = true; }
    else if (token.startsWith('"') && stack.at(-1)?.key) {
      const frame = stack.at(-1), key = JSON.parse(token);
      if (frame.keys.has(key)) throw new Error('Amendment text contains duplicate JSON keys; no transport fallback was accepted.');
      frame.keys.add(key); frame.key = false;
    }
  }
  return result;
}

/** Keep supplementary text literal; do not shell-tokenize, unquote, or expand it. */
export function parseReviewRequest(raw) {
  if (typeof raw !== 'string' || raw.length > 16000 || raw.includes('\0')) throw new Error('[AZPR] Supply a PR URL and optional context (maximum 16000 characters).');
  const match = /^\s*(\S+)(?:\s+([\s\S]*))?$/.exec(raw);
  if (!match) throw new Error('[AZPR] Supply a PR URL and optional context.');
  let url;
  try { url = new URL(match[1]); } catch { throw new Error('[AZPR] The first argument must be an absolute HTTPS PR URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !/\/pullrequest\/[1-9][0-9]*\/?$/i.test(url.pathname)) {
    throw new Error('[AZPR] Use an HTTPS Azure PR URL ending in /pullrequest/<id>, without embedded credentials.');
  }
  const urlIdentity = identityFromURL(url);
  return { request: raw, prUrl: match[1], userContext: match[2] ?? '', ...(urlIdentity ? { urlIdentity } : {}) };
}

/** URL-derived hints, not server-verified identity or MCP argument bindings. */
function identityFromURL(url) {
  let match, organization, project, repository;
  if (url.hostname === 'dev.azure.com') {
    match = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/[1-9][0-9]*\/?$/i.exec(url.pathname);
    if (match) [, organization, project, repository] = match;
  } else if (/^[^.]+\.visualstudio\.com$/.test(url.hostname)) {
    match = /^\/([^/]+)\/_git\/([^/]+)\/pullrequest\/[1-9][0-9]*\/?$/i.exec(url.pathname);
    if (match) { organization = url.hostname.split('.')[0]; [, project, repository] = match; }
  }
  if (!match) return; // Preserve custom server/collection URLs without guessing.
  try {
    const values = [organization, project, repository].map(decodeURIComponent);
    if (values.some(value => !value.trim() || /[\x00-\x1f\x7f]/.test(value))) return;
    return Object.fromEntries(['organization', 'project', 'repository'].map((key, i) => [key, values[i]]));
  } catch { /* Malformed encoding remains in the original URL for source checking. */ }
}

const sha = value => typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export function validateSnapshot(s) {
  if (!isObject(s) || !text(s.repository) || !Number.isInteger(s.prId) || s.prId < 1 ||
      !sha(s.base) || !sha(s.head) || !['pr', 'cumulative'].includes(s.scope) || !Array.isArray(s.files) ||
      s.files.length === 0 || !s.files.every(text) || new Set(s.files).size !== s.files.length) {
    throw new Error('Missing full base/head SHA, PR scope or complete unique file list.');
  }
  return { repository: s.repository, prId: s.prId, base: s.base.toLowerCase(), head: s.head.toLowerCase(), scope: s.scope, files: [...s.files] };
}
function snapshotKey(s) { return JSON.stringify(validateSnapshot(s)); }
export function checkEnvelope(result, prUrl) {
  if (!isObject(result) || !text(result.report)) throw new Error('Invalid source-check envelope: a status and report are required.');
  requireStatus(result, ['READY', 'NOT_READY'], 'source-check');
  if (result.requirements !== undefined && typeof result.requirements !== 'string') throw new Error('Source-check requirements must be text.');
  if (result.sourceAccess !== undefined && (!isObject(result.sourceAccess) || Object.values(result.sourceAccess).some(value => typeof value !== 'string'))) throw new Error('Source-check sourceAccess must describe capabilities as text fields.');
  if (result.status !== 'READY') return result;
  const snapshot = validateSnapshot(result.snapshot);
  if (snapshot.scope !== 'cumulative') throw new Error('Standalone source-check requires cumulative scope.');
  if (prUrl && String(snapshot.prId) !== new URL(prUrl).pathname.split('/').filter(Boolean).at(-1)) throw new Error('Source-check snapshot PR ID does not match the requested URL.');
  return { ...result, snapshot };
}
function validateFinding(value, prefix, ids, path, allowMissingLocation = false) {
  if (!isObject(value)) throw new Error(`Invalid finding: ${path} must be an object.`);
  const issues = [];
  for (const key of finding.required) {
    if (key === 'location' && allowMissingLocation && !Object.hasOwn(value, key)) continue;
    if (!Object.hasOwn(value, key)) {
      const whitespace = Object.keys(value).some(raw => raw !== key && findingKey(raw) === key);
      issues.push(`${path}.${key} is missing${whitespace ? ' (a matching key has surrounding ASCII whitespace)' : ''}`);
    } else if (!text(value[key])) issues.push(`${path}.${key} must be nonempty text`);
  }
  if (text(value.id)) {
    if (!new RegExp(`^${prefix}-[1-9][0-9]*$`).test(value.id)) issues.push(`${path}.id has an invalid prefix or number`);
    else if (ids.has(value.id)) issues.push(`${path}.id duplicates an earlier finding`);
  }
  if (text(value.severity) && !finding.properties.severity.enum.includes(value.severity)) issues.push(`${path}.severity must be high, medium, or low`);
  const extra = Object.keys(value).filter(key => !Object.hasOwn(finding.properties, key)).length;
  if (extra) issues.push(`${path} contains ${extra} unexpected field(s); names and values omitted`);
  if (issues.length) {
    const ErrorType = !allowMissingLocation && issues.length === 1 && !Object.hasOwn(value, 'location') ? OutputLocationError : Error;
    throw new ErrorType(`Invalid finding: ${issues.join('; ')}.`);
  }
  ids.add(value.id);
}
function validateFindings(findings, prefix, path = 'findings', allowMissingLocation = false) {
  if (!Array.isArray(findings)) throw new Error('Invalid findings array.');
  const ids = new Set();
  findings.forEach((value, i) => validateFinding(value, prefix, ids, `${path}[${i}]`, allowMissingLocation));
}
export function initialEnvelope(result, expected, prefix, prUrl) {
  if (!isObject(result)) throw new Error('Invalid initial-review envelope: expected an object.');
  const missingSnapshot = result.status === 'PARTIAL' && result.snapshot === undefined && !expected;
  const invalid = [
    !missingSnapshot && !isObject(result.snapshot) && 'snapshot must be an object',
    !isObject(result.coverage) && 'coverage must be an object',
    !Array.isArray(result.findings) && 'findings must be an array',
    !text(result.report) && 'report must be nonempty text',
  ].filter(Boolean);
  if (invalid.length) throw new Error(`Invalid initial-review envelope: ${invalid.join('; ')}.`);
  requireStatus(result, ['COMPLETE', 'PARTIAL'], 'initial-review');
  const selected = missingSnapshot ? null : validateSnapshot(result.snapshot);
  if (expected && snapshotKey(result.snapshot) !== snapshotKey(expected)) throw new Error('Initial reviewer used a different snapshot or file list.');
  if (!expected && selected?.scope !== 'pr' && !missingSnapshot) throw new Error('Direct initial review requires PR scope, not ancestry certification.');
  if (selected && prUrl && String(selected.prId) !== new URL(prUrl).pathname.split('/').filter(Boolean).at(-1)) throw new Error('Initial reviewer snapshot PR ID does not match the requested URL.');
  const files = selected?.files ?? [];
  const coverage = result.coverage;
  if (!isObject(coverage) || !Array.isArray(coverage.files) || !Array.isArray(coverage.gaps) ||
      !coverage.files.every(file => text(file) && files.includes(file)) ||
      new Set(coverage.files).size !== coverage.files.length || !coverage.gaps.every(text)) throw new Error('Invalid coverage ledger: list unique reviewed snapshot files and concrete gaps.');
  if (result.status === 'COMPLETE' && (coverage.files.length !== files.length || coverage.gaps.length)) throw new Error('COMPLETE requires coverage of every snapshot file with no review gaps.');
  if (result.status === 'PARTIAL' && !coverage.gaps.length) throw new Error('PARTIAL requires an explanation of the review gaps.');
  if (missingSnapshot && result.findings.length) throw new Error('An initial review without a snapshot cannot report findings.');
  validateFindings(result.findings, prefix, 'findings', true);
  return result;
}
/** Compare metadata already read by the two initials; no tool/model request. */
export function mergeInitialSnapshots(reviews) {
  const snapshots = reviews.map(review => validateSnapshot(review.snapshot));
  const first = snapshots[0];
  if (!first || first.scope !== 'pr' || snapshots.some(s =>
      ['repository', 'prId', 'base', 'head', 'scope'].some(key => s[key] !== first[key]))) {
    throw new Error('Initial reviewers used different PR identities or source/target commits. Start a new review for a stable PR version.');
  }
  // Preserve both discovery results in reviews. The verifier examines every
  // reported path; ordering or a different file set is not a version mismatch.
  return { ...first, files: [...new Set(snapshots.flatMap(s => s.files))].sort() };
}
export function finalEnvelope(result, expected, originals) {
  if (!isObject(result) || !text(result.report) || !Array.isArray(result.dispositions)) throw new Error('Invalid final-review envelope.');
  requireStatus(result, ['COMPLETE', 'INCOMPLETE', 'STALE'], 'final-review');
  if (snapshotKey(result.snapshot) !== snapshotKey(expected)) throw new Error('Final reviewer used a different snapshot.');
  const ids = new Set(originals.map(f => f.id));
  const accounted = new Set();
  for (const [i, item] of result.dispositions.entries()) {
    if (!isObject(item) || !ids.has(item.id) || accounted.has(item.id) || !['CONFIRMED','NEEDS_INFO','REJECTED','MERGED'].includes(item.status) || !text(item.reason)) {
      throw new Error('Final review has an invalid/missing disposition or silently changed a finding ID.');
    }
    if (item.status === 'MERGED' && (!ids.has(item.mergedInto) || item.mergedInto === item.id)) throw new Error('Merged finding must reference another original finding.');
    if (item.status !== 'MERGED' && item.mergedInto !== undefined) throw new Error('Only a MERGED finding may contain mergedInto.');
    if (item.status === 'CONFIRMED') {
      if (!isObject(item.verifiedFinding) || item.verifiedFinding.id !== item.id) throw new Error('CONFIRMED requires the verifier\'s corrected finding with the same original ID.');
      validateFinding(item.verifiedFinding, '[FR]', new Set(), `dispositions[${i}].verifiedFinding`);
    } else if (item.verifiedFinding !== undefined) throw new Error('Only a CONFIRMED disposition may contain verifiedFinding.');
    accounted.add(item.id);
  }
  if (accounted.size !== ids.size) throw new Error('Final reviewer omitted one or more original findings.');
  const dispositions = new Map(result.dispositions.map(item => [item.id, item]));
  const resolved = new Set();
  for (let item of result.dispositions) {
    const path = new Set();
    while (item.status === 'MERGED' && !resolved.has(item.id)) {
      if (path.has(item.id)) throw new Error('Merged findings form a cycle with no final disposition.');
      path.add(item.id); item = dispositions.get(item.mergedInto);
    }
    for (const id of path) resolved.add(id);
  }
  if (result.newFindings !== undefined) validateFindings(result.newFindings, 'V', 'newFindings');
  if (!sha(result.currentHead) && result.status !== 'INCOMPLETE') throw new Error('Final reviewer did not verify the current PR head.');
  if (expected.scope === 'pr' && !sha(result.currentBase) && result.status !== 'INCOMPLETE') throw new Error('Final reviewer did not verify the current PR target base.');
  const changedHead = sha(result.currentHead) && result.currentHead.toLowerCase() !== expected.head.toLowerCase();
  const changedBase = expected.scope === 'pr' && sha(result.currentBase) && result.currentBase.toLowerCase() !== expected.base.toLowerCase();
  if (changedHead || changedBase) result = { ...result, status: 'STALE' }; // No automatic rerun.
  else if (result.status === 'STALE') throw new Error('STALE verdict contradicts reported versions; require manual verification.');
  return result;
}
