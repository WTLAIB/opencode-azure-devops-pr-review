// Narrow adapter for Microsoft's unified Azure DevOps MCP comment tools.
import { createHash } from 'node:crypto';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const integer = v => Number.isSafeInteger(v) && v > 0;
const fail = message => { throw new Error(`[AZPR comments] ${message}`); };
const exactKeys = (value, keys) => {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) fail('Unsupported tool arguments or envelope fields.');
};

export function commentTools(prefix) {
  return { pr: `${prefix}_repo_pull_request`, threads: `${prefix}_repo_pull_request_thread`,
    file: `${prefix}_repo_file`, write: `${prefix}_repo_pull_request_thread_write` };
}

function azurePath(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) fail('Use a canonical HTTPS Azure DevOps Services URL.');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  let organization;
  if (url.hostname === 'dev.azure.com') organization = parts.shift();
  else if (/^[a-z0-9-]+\.visualstudio\.com$/i.test(url.hostname)) {
    organization = url.hostname.split('.')[0];
    if (parts[0] === 'DefaultCollection') parts.shift();
  } else fail('Only dev.azure.com and organization.visualstudio.com are supported by the comment adapter.');
  if (!nonempty(organization) || parts[1] !== '_git' || !nonempty(parts[0]) || !nonempty(parts[2])) fail('Use a canonical project/repository URL.');
  return { organization, project: parts[0], repositoryId: parts[2], rest: parts.slice(3) };
}

export function commentTarget(request, snapshot) {
  const target = azurePath(request.trim().split(/\s+/)[0]);
  if (target.rest.length !== 2 || target.rest[0].toLowerCase() !== 'pullrequest' ||
      !/^[1-9][0-9]*$/.test(target.rest[1]) || Number(target.rest[1]) !== snapshot.prId) fail('Review URL and snapshot PR ID do not match.');
  const { rest, ...identity } = target;
  return { ...identity, pullRequestId: snapshot.prId };
}

export function targetKey(target) {
  return JSON.stringify([target.organization.toLowerCase(), target.project.toLowerCase(), target.repositoryId.toLowerCase(), target.pullRequestId]);
}

export function confirmedFindings(review) {
  const confirmed = new Set(review.final.dispositions.filter(d => d.status === 'CONFIRMED').map(d => d.id));
  return [...review.findings.filter(f => confirmed.has(f.id)), ...(review.final.newFindings ?? [])];
}

// Do not scrape a plausible JSON object out of prose. Recognize only the actual
// MCP text wrapper (including the upstream randomized spotlight delimiter).
export function toolText(output) {
  if (!output || output.isError === true || output.metadata?.isError === true || output.metadata?.truncated === true) fail('Tool failed or output was truncated.');
  let value = output.output;
  if (typeof value !== 'string') fail('Unsupported OpenCode tool output; no write is authorized.');
  // Some hosts preserve the MCP envelope, others flatten its text blocks.
  try {
    const envelope = JSON.parse(value);
    if (object(envelope) && Array.isArray(envelope.content)) {
      if (envelope.isError || envelope.content.length !== 1 || envelope.content[0].type !== 'text') fail('Unsupported or failed MCP content envelope.');
      value = envelope.content[0].text;
    }
  } catch (error) { if (error.message.startsWith('[AZPR')) throw error; }
  for (let depth = 0; depth < 3; depth++) {
    const match = /^<<([a-f0-9]{32})>> \[UNTRUSTED [^\n]+\] <<\1>>\r?\n([\s\S]*)\r?\n<<\/\1>>\s*$/.exec(value);
    if (!match) return value;
    value = match[2];
  }
  fail('Unsupported nested tool wrapper.');
}

function toolJSON(output) {
  try { return JSON.parse(toolText(output)); }
  catch { fail('Expected complete structured Azure output; no write is authorized.'); }
}

function marker(review, finding, comment) {
  const fingerprint = createHash('sha256').update(JSON.stringify([
    targetKey(review.target), review.snapshot.head, comment.path, comment.startLine, comment.endLine,
    finding.summary.trim().toLowerCase(), finding.evidence.trim(),
  ])).digest('hex').slice(0, 32);
  return `<!-- azpr-comment:${fingerprint} -->`;
}

export function validateCommentPlan(result, review, gate, maxComments) {
  exactKeys(result, ['status', 'comments', 'skipped']);
  if (result.status !== 'READY' || !Array.isArray(result.comments) || !Array.isArray(result.skipped)) fail('Planner did not return a READY comment plan.');
  if (result.comments.length > maxComments) fail('Comment limit exceeded.');
  gate.requireEvidence();
  const eligible = new Map(confirmedFindings(review).map(f => [f.id, f]));
  const accounted = new Set();
  const markers = new Set();
  const comments = result.comments.map(c => {
    exactKeys(c, ['findingId', 'severity', 'path', 'startLine', 'endLine', 'anchor', 'body']);
    const finding = eligible.get(c.findingId);
    if (!finding || accounted.has(c.findingId)) fail('Only unique confirmed findings may be posted.');
    if ([...review.attempts.values()].some(a => a.findingId === c.findingId)) fail('This finding was already attempted; skip it instead of changing its wording or anchor.');
    accounted.add(c.findingId);
    if (!['high', 'medium'].includes(c.severity) || !nonempty(c.body) || c.body.length > 1200 ||
        !c.body.startsWith(`issue (${c.severity}): `) || /<!--|-->/.test(c.body)) fail('Invalid severity, title, or comment length.');
    if (!review.snapshot.files.includes(c.path) || !c.path.startsWith('/') || /[\r\n\0]/.test(c.path) ||
        !integer(c.startLine) || !integer(c.endLine) || c.endLine < c.startLine || c.endLine - c.startLine > 4) fail('Use a changed HEAD file and a 1-5 line range.');
    gate.requireFile(c);
    const tag = marker(review, finding, c);
    if (markers.has(tag)) fail('Duplicate finding in this plan; select one representative.');
    markers.add(tag);
    if (gate.hasMarker(tag)) fail('A matching AZPR comment already exists; preview again and skip it.');
    return { ...c, marker: tag, content: `${c.body.trim()}\n\n${tag}` };
  });
  for (const s of result.skipped) {
    exactKeys(s, ['findingId', 'reason']);
    if (!eligible.has(s.findingId) || accounted.has(s.findingId) || !nonempty(s.reason)) fail('Every skipped confirmed finding needs a unique ID and reason.');
    accounted.add(s.findingId);
  }
  if (accounted.size !== eligible.size) fail('Planner omitted confirmed findings instead of explaining exclusions.');
  return { comments, skipped: result.skipped };
}

export function createArguments(target, comment) {
  return { action: 'create', repositoryId: target.repositoryId, pullRequestId: target.pullRequestId, project: target.project,
    content: comment.content, status: 'Active', filePath: comment.path,
    rightFileStartLine: comment.startLine, rightFileStartOffset: 1,
    rightFileEndLine: comment.endLine, rightFileEndOffset: 1 };
}

/** A stage-local evidence gate. All evidence comes from observed tool results,
 * never from the model's output envelope. Unrecognized output fails closed. */
export class CommentGate {
  constructor(review, tools, publish = false) {
    this.review = review;
    this.tools = tools;
    this.publish = publish;
    this.pending = new Map();
    this.files = new Map();
    this.head = false;
    this.threads = [];
    this.nextSkip = 0;
    this.threadsComplete = false;
    this.busy = false;
    this.error = '';
  }

  requireEvidence() {
    if (this.error) fail(this.error);
    if (!this.head || !this.threadsComplete || this.pending.size) fail('Read current PR metadata and ALL unfiltered comment pages before proceeding.');
    if (this.publish && Date.now() - this.headReadAt > 60000) fail('PR metadata is older than 60 seconds; read it again immediately before writing.');
  }

  requireFile(comment) {
    const source = this.files.get(comment.path);
    if (typeof source !== 'string' || !nonempty(comment.anchor) || comment.endLine > source.split(/\r?\n/).length ||
        source.split(/\r?\n/).slice(comment.startLine - 1, comment.endLine).join('\n') !== comment.anchor) fail('Read the complete file at the reviewed HEAD and verify the exact anchor text first.');
  }

  hasMarker(tag) {
    return this.threads.some(t => t.comments.some(c => typeof c.content === 'string' && c.content.includes(tag)));
  }

  before(tool, args, callID) {
    if (this.error) fail(this.error);
    if (!nonempty(callID) || this.pending.has(callID) || this.busy) fail('Use sequential tools; a comment write is already pending.');
    const t = this.review.target;
    if (!object(args) || args.repositoryId !== t.repositoryId || args.project !== t.project ||
        (tool !== this.tools.file && args.pullRequestId !== t.pullRequestId)) fail('Tool target differs from the reviewed PR.');
    let comment;
    if (tool === this.tools.write) {
      if (!this.publish) fail('Preview is read-only.');
      this.requireEvidence();
      if ([...this.review.attempts.values()].some(a => a.state !== 'POSTED')) fail('A previous write has an uncertain result. Inspect Azure; do not retry automatically.');
      comment = this.review.plan.comments.find(c => c.content === args.content);
      if (!comment || this.review.attempts.has(comment.marker)) fail('Only an unattempted comment from the saved preview can be created.');
      const expected = createArguments(t, comment);
      exactKeys(args, Object.keys(expected));
      if (Object.keys(expected).some(key => args[key] !== expected[key])) fail('Write arguments differ from the saved preview.');
      this.requireFile(comment);
      if (this.hasMarker(comment.marker)) fail('Duplicate comment detected. Preview again.');
      this.review.attempts.set(comment.marker, { findingId: comment.findingId, state: 'UNKNOWN' });
      this.busy = true;
      // Consume evidence BEFORE dispatch; no concurrent writes or blind retries.
      this.head = false;
      this.threadsComplete = false;
      this.nextSkip = 0;
      this.threads = [];
    } else if (tool === this.tools.pr) {
      exactKeys(args, ['action', 'repositoryId', 'project', 'pullRequestId']);
      if (args.action !== 'get') fail('Only PR get is allowed.');
      this.head = false;
    } else if (tool === this.tools.threads) {
      exactKeys(args, ['action', 'repositoryId', 'project', 'pullRequestId', 'top', 'skip', 'fullResponse']);
      if (args.action !== 'list' || args.fullResponse !== true || args.top !== 100 || args.skip !== this.nextSkip || this.threadsComplete ||
          [...this.pending.values()].some(p => p.tool === tool)) fail('List unfiltered full thread pages in order: top=100, skip=0,100,...');
    } else if (tool === this.tools.file) {
      exactKeys(args, ['action', 'repositoryId', 'project', 'path', 'version', 'versionType']);
      if (args.action !== 'get_content' || args.version !== this.review.snapshot.head || args.versionType !== 'Commit' ||
          !this.review.snapshot.files.includes(args.path)) fail('Only exact-HEAD files in this reviewed snapshot may be read.');
      this.files.delete(args.path);
    } else fail('Unsupported comment-stage tool.');
    this.pending.set(callID, { tool, args: structuredClone(args), comment });
  }

  after(callID, output) {
    const call = this.pending.get(callID);
    if (!call) return;
    this.pending.delete(callID);
    const { tool, args, comment } = call;
    try {
      if (tool === this.tools.file) {
        this.files.set(args.path, toolText(output));
        return;
      }
      const result = toolJSON(output);
      if (tool === this.tools.pr) {
        const t = this.review.target;
        if (!object(result) || result.pullRequestId !== t.pullRequestId || ![1, 'active', 'Active'].includes(result.status) ||
            result.lastMergeSourceCommit?.commitId?.toLowerCase() !== this.review.snapshot.head) fail('PR is stale, inactive, or has unverifiable metadata. Run a new review.');
        const repo = result.repository;
        const identity = azurePath(repo?.webUrl);
        const matches = (expected, name, id) => [name, id].some(v => typeof v === 'string' && v.toLowerCase() === expected.toLowerCase());
        if (identity.rest.length || identity.organization.toLowerCase() !== t.organization.toLowerCase() ||
            !matches(t.repositoryId, repo.name, repo.id) || !matches(t.project, repo.project?.name, repo.project?.id) ||
            !matches(identity.repositoryId, repo.name, repo.id) || !matches(identity.project, repo.project?.name, repo.project?.id)) fail('Azure response identity differs from the reviewed URL.');
        this.head = true;
        this.headReadAt = Date.now();
      } else if (tool === this.tools.threads) {
        if (!Array.isArray(result) || result.length > 100 || result.some(t => !integer(t.id) || !Array.isArray(t.comments))) fail('Incomplete or unsupported thread response.');
        const previous = new Set(this.threads.map(t => t.id));
        if (result.some(t => previous.has(t.id)) || new Set(result.map(t => t.id)).size !== result.length) fail('Thread pagination changed or repeated a page. Preview again.');
        this.threads.push(...result);
        this.nextSkip += 100;
        this.threadsComplete = result.length < 100;
      } else if (tool === this.tools.write) {
        if (!object(result) || !integer(result.id) || result.threadContext?.filePath !== comment.path ||
            result.threadContext?.rightFileStart?.line !== comment.startLine || result.threadContext?.rightFileEnd?.line !== comment.endLine ||
            !result.comments?.some(c => c.content === comment.content)) fail('Create result cannot be verified. Inspect Azure before doing anything else.');
        this.review.attempts.set(comment.marker, { findingId: comment.findingId, state: 'POSTED', threadId: result.id });
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unsupported Azure response.';
    } finally { if (tool === this.tools.write) this.busy = false; }
  }
}
