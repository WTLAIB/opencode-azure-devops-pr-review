import { ROLES } from './config.mjs';
// OpenCode 1.18.31 structured output. MCP tools remain discovered by the host.
const string = { type: 'string' };
const array = items => ({ type: 'array', items });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const status = (...values) => ({ type: 'string', enum: values });
const snapshot = object({ repository: string, prId: { type: 'integer' }, base: string, head: string, scope: { const: 'cumulative', type: 'string' }, files: array(string) });
const finding = object({ id: string, summary: string, evidence: string,
  counterevidence: { ...string, description: 'Source-based safeguards or alternative explanations checked, their effect on the claim, and any unavailable evidence; not private reasoning.' },
  location: string, severity: status('high', 'medium', 'low'), suggestion: string });
const coverage = object({
  files: { ...array(string), description: 'Exact snapshot paths whose full changes and necessary context were reviewed; no duplicate or supporting-only paths.' },
  gaps: { ...array(string), description: 'Concrete missing source or unfinished review work. Empty only when coverage is complete.' },
});

export function stageFormat(role) {
  const kind = ROLES[role]?.format;
  if (!kind) throw new Error('Unknown review role.');
  let schema;
  if (kind === 'check') schema = object({
    status: status('READY', 'NOT_READY'), snapshot,
    sourceAccess: { type: 'object', additionalProperties: string }, requirements: string, report: string,
  }, ['status', 'report']);
  else if (kind === 'final') schema = object({
    status: status('COMPLETE', 'INCOMPLETE', 'STALE'), snapshot,
    currentHead: { type: ['string', 'null'] },
    dispositions: array(object({ id: string, status: status('CONFIRMED', 'NEEDS_INFO', 'REJECTED', 'MERGED'), reason: string, mergedInto: string,
      verifiedFinding: { ...finding, description: 'Required for CONFIRMED: the complete corrected finding under this same ID. Omit for every other disposition.' },
    }, ['id', 'status', 'reason'])),
    newFindings: array(finding), report: string,
  }, ['status', 'snapshot', 'currentHead', 'dispositions', 'report']);
  else if (kind === 'comment-plan') schema = object({
    status: status('READY', 'INCOMPLETE'),
    comments: array(object({ findingId: string, severity: status('high', 'medium'), path: string, startLine: { type: 'integer' }, endLine: { type: 'integer' }, anchor: string, body: string })),
    skipped: array(object({ findingId: string, reason: string })),
  });
  else if (kind === 'comment-publish') schema = object({
    status: status('DONE', 'INCOMPLETE'), posted: array(object({ findingId: string, threadId: { type: ['string', 'integer'] } })),
  });
  else schema = object({ status: status('COMPLETE', 'PARTIAL'), snapshot, coverage, findings: array(finding), report: string });
  return { type: 'json_schema', schema, retryCount: 0 };
}

export function visibleText(response) {
  return (response?.parts ?? []).filter(p => p.type === 'text' && !p.ignored).map(p => p.text ?? '').join('\n');
}
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
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
  return { request: raw, prUrl: match[1], userContext: match[2] ?? '' };
}

const sha = value => typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export function validateSnapshot(s) {
  if (!isObject(s) || !text(s.repository) || !Number.isInteger(s.prId) || s.prId < 1 ||
      !sha(s.base) || !sha(s.head) || s.scope !== 'cumulative' || !Array.isArray(s.files) ||
      s.files.length === 0 || !s.files.every(text) || new Set(s.files).size !== s.files.length) {
    throw new Error('Missing full base/head SHA, cumulative PR scope or complete unique file list.');
  }
  return { repository: s.repository, prId: s.prId, base: s.base.toLowerCase(), head: s.head.toLowerCase(), scope: s.scope, files: [...s.files] };
}
function snapshotKey(s) { return JSON.stringify(validateSnapshot(s)); }
export function checkEnvelope(result, prUrl) {
  if (!isObject(result) || !['READY', 'NOT_READY'].includes(result.status) || !text(result.report)) throw new Error('Invalid source-check envelope: a status and report are required.');
  if (result.requirements !== undefined && typeof result.requirements !== 'string') throw new Error('Source-check requirements must be text.');
  if (result.sourceAccess !== undefined && (!isObject(result.sourceAccess) || Object.values(result.sourceAccess).some(value => typeof value !== 'string'))) throw new Error('Source-check sourceAccess must describe capabilities as text fields.');
  if (result.status !== 'READY') return result;
  const snapshot = validateSnapshot(result.snapshot);
  if (prUrl && String(snapshot.prId) !== new URL(prUrl).pathname.split('/').filter(Boolean).at(-1)) throw new Error('Source-check snapshot PR ID does not match the requested URL.');
  return { ...result, snapshot };
}
function validateFindings(findings, prefix) {
  if (!Array.isArray(findings)) throw new Error('Invalid findings array.');
  const ids = new Set();
  for (const finding of findings) {
    if (!isObject(finding) || typeof finding.id !== 'string' || !new RegExp(`^${prefix}-[1-9][0-9]*$`).test(finding.id) ||
        ids.has(finding.id) || !text(finding.summary) || !text(finding.evidence) || !text(finding.location)) throw new Error('Invalid/duplicate finding ID or missing evidence/location.');
    if (!text(finding.counterevidence) || !text(finding.suggestion) || !['high', 'medium', 'low'].includes(finding.severity)) throw new Error('Every finding requires counterevidence checks, severity, and a correction/verification suggestion.');
    ids.add(finding.id);
  }
}
export function initialEnvelope(result, expected, prefix) {
  if (!isObject(result) || !['COMPLETE', 'PARTIAL'].includes(result.status) || !Array.isArray(result.findings) || !text(result.report)) throw new Error('Invalid initial-review envelope.');
  if (snapshotKey(result.snapshot) !== snapshotKey(expected)) throw new Error('Initial reviewer used a different snapshot or file list.');
  const coverage = result.coverage;
  if (!isObject(coverage) || !Array.isArray(coverage.files) || !Array.isArray(coverage.gaps) ||
      !coverage.files.every(file => text(file) && expected.files.includes(file)) ||
      new Set(coverage.files).size !== coverage.files.length || !coverage.gaps.every(text)) throw new Error('Invalid coverage ledger: list unique reviewed snapshot files and concrete gaps.');
  if (result.status === 'COMPLETE' && (coverage.files.length !== expected.files.length || coverage.gaps.length)) throw new Error('COMPLETE requires coverage of every snapshot file with no review gaps.');
  if (result.status === 'PARTIAL' && !coverage.gaps.length) throw new Error('PARTIAL requires an explanation of the review gaps.');
  validateFindings(result.findings, prefix);
  return result;
}
export function finalEnvelope(result, expected, originals) {
  if (!isObject(result) || !['COMPLETE', 'INCOMPLETE', 'STALE'].includes(result.status) || !text(result.report) || !Array.isArray(result.dispositions)) throw new Error('Invalid final-review envelope.');
  if (snapshotKey(result.snapshot) !== snapshotKey(expected)) throw new Error('Final reviewer used a different snapshot.');
  const ids = new Set(originals.map(f => f.id));
  const accounted = new Set();
  for (const item of result.dispositions) {
    if (!isObject(item) || !ids.has(item.id) || accounted.has(item.id) || !['CONFIRMED','NEEDS_INFO','REJECTED','MERGED'].includes(item.status) || !text(item.reason)) {
      throw new Error('Final review has an invalid/missing disposition or silently changed a finding ID.');
    }
    if (item.status === 'MERGED' && (!ids.has(item.mergedInto) || item.mergedInto === item.id)) throw new Error('Merged finding must reference another original finding.');
    if (item.status !== 'MERGED' && item.mergedInto !== undefined) throw new Error('Only a MERGED finding may contain mergedInto.');
    if (item.status === 'CONFIRMED') {
      if (!isObject(item.verifiedFinding) || item.verifiedFinding.id !== item.id) throw new Error('CONFIRMED requires the verifier\'s corrected finding with the same original ID.');
      validateFindings([item.verifiedFinding], '[FR]');
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
  if (result.newFindings !== undefined) validateFindings(result.newFindings, 'V');
  if (!sha(result.currentHead)) {
    if (result.status !== 'INCOMPLETE') throw new Error('Final reviewer did not verify the current PR head.');
  } else if (result.currentHead.toLowerCase() !== expected.head) {
    result = { ...result, status: 'STALE' }; // No automatic rerun.
  } else if (result.status === 'STALE') throw new Error('STALE verdict contradicts reported head; require manual verification.');
  return result;
}
