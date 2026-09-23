// OpenCode 1.18.31 structured output. MCP tools remain discovered by the host.
const string = { type: 'string' };
const array = items => ({ type: 'array', items });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const status = (...values) => ({ type: 'string', enum: values });
const snapshot = object({ repository: string, prId: { type: 'integer' }, base: string, head: string, scope: { const: 'cumulative', type: 'string' }, files: array(string) });
const finding = object({ id: string, summary: string, evidence: string, location: string, severity: status('high', 'medium', 'low'), suggestion: string }, ['id', 'summary', 'evidence', 'location']);

export function stageFormat(role) {
  let schema;
  if (role === 'azpr-check') schema = object({
    status: status('READY', 'NOT_READY'), snapshot,
    sourceAccess: { type: 'object', additionalProperties: string }, requirements: string, report: string,
  }, ['status', 'report']);
  else if (role.startsWith('azpr-verify-')) schema = object({
    status: status('COMPLETE', 'INCOMPLETE', 'STALE'), snapshot,
    currentHead: { type: ['string', 'null'] },
    dispositions: array(object({ id: string, status: status('CONFIRMED', 'NEEDS_INFO', 'REJECTED', 'MERGED'), reason: string, mergedInto: string }, ['id', 'status', 'reason'])),
    newFindings: array(finding), report: string,
  }, ['status', 'snapshot', 'currentHead', 'dispositions', 'report']);
  else if (role === 'azpr-comment-plan') schema = object({
    status: status('READY', 'INCOMPLETE'),
    comments: array(object({ findingId: string, severity: status('high', 'medium'), path: string, startLine: { type: 'integer' }, endLine: { type: 'integer' }, anchor: string, body: string })),
    skipped: array(object({ findingId: string, reason: string })),
  });
  else if (role === 'azpr-comment-publish') schema = object({
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
