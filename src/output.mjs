import { ROLES } from './config.mjs';
// OpenCode 1.18.31 structured output. MCP tools remain discovered by the host.
const string = { type: 'string' };
const array = items => ({ type: 'array', items });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const status = (...values) => ({ type: 'string', enum: values });
const snapshot = object({ repository: string, prId: { type: 'integer' }, base: string, head: string, scope: { const: 'cumulative', type: 'string' }, files: array(string) });
const finding = object({ id: string, summary: string, evidence: string, location: string, severity: status('high', 'medium', 'low'), suggestion: string }, ['id', 'summary', 'evidence', 'location']);

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
    dispositions: array(object({ id: string, status: status('CONFIRMED', 'NEEDS_INFO', 'REJECTED', 'MERGED'), reason: string, mergedInto: string }, ['id', 'status', 'reason'])),
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
  else schema = object({ status: status('COMPLETE', 'PARTIAL'), snapshot, findings: array(finding), report: string });
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
export function initialEnvelope(result, expected, prefix) {
  if (!['COMPLETE', 'PARTIAL'].includes(result.status) || !Array.isArray(result.findings) || !text(result.report)) throw new Error('Invalid initial-review envelope.');
  if (snapshotKey(result.snapshot) !== snapshotKey(expected)) throw new Error('Initial reviewer used a different snapshot or file list.');
  const ids = new Set();
  for (const finding of result.findings) {
    if (!isObject(finding) || typeof finding.id !== 'string' || !new RegExp(`^${prefix}-[1-9][0-9]*$`).test(finding.id) ||
        ids.has(finding.id) || !text(finding.summary) || !text(finding.evidence) || !text(finding.location)) throw new Error('Invalid/duplicate finding ID or missing evidence/location.');
    ids.add(finding.id);
  }
  return result;
}
export function finalEnvelope(result, expected, originals) {
  if (!['COMPLETE', 'INCOMPLETE', 'STALE'].includes(result.status) || !text(result.report) || !Array.isArray(result.dispositions)) throw new Error('Invalid final-review envelope.');
  if (snapshotKey(result.snapshot) !== snapshotKey(expected)) throw new Error('Final reviewer used a different snapshot.');
  const ids = new Set(originals.map(f => f.id));
  const accounted = new Set();
  for (const item of result.dispositions) {
    if (!isObject(item) || !ids.has(item.id) || accounted.has(item.id) || !['CONFIRMED','NEEDS_INFO','REJECTED','MERGED'].includes(item.status) || !text(item.reason)) {
      throw new Error('Final review has an invalid/missing disposition or silently changed a finding ID.');
    }
    if (item.status === 'MERGED' && (!ids.has(item.mergedInto) || item.mergedInto === item.id)) throw new Error('Merged finding must reference another original finding.');
    accounted.add(item.id);
  }
  if (accounted.size !== ids.size) throw new Error('Final reviewer omitted one or more original findings.');
  if (result.newFindings != null) initialEnvelope({ status: 'COMPLETE', snapshot: result.snapshot, findings: result.newFindings, report: result.report }, expected, 'V');
  if (!sha(result.currentHead)) {
    if (result.status !== 'INCOMPLETE') throw new Error('Final reviewer did not verify the current PR head.');
  } else if (result.currentHead.toLowerCase() !== expected.head) {
    result = { ...result, status: 'STALE' }; // No automatic rerun.
  } else if (result.status === 'STALE') throw new Error('STALE verdict contradicts reported head; require manual verification.');
  return result;
}
