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
