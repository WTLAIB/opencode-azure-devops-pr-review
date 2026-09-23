import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONReport, stageFormat } from '../src/output.mjs';
import { diagnosticResponse } from '../src/diagnostics.mjs';
const settings = { maxStageCharacters: 1000 };
const response = text => ({ info: { finish: 'stop' }, parts: [{ type: 'text', text }] });

test('structured results are read from info.structured without text and still reject errors', () => {
  assert.deepEqual(parseJSONReport({ info: { structured: { status: 'READY' } }, parts: [] }, settings), { status: 'READY' });
  assert.throws(() => parseJSONReport({ info: { error: { name: 'StructuredOutputError' }, structured: { status: 'READY' } } }, settings), /StructuredOutputError/);
  for (const structured of [[], null, 'text', 1]) assert.throws(() => parseJSONReport({ info: { structured } }, settings), /must be an object/);
  assert.throws(() => parseJSONReport({ info: { structured: { report: 'x'.repeat(1001) } } }, settings), /Oversized/);
});
test('text compatibility accepts JSON or one fenced object, not broken or ambiguous envelopes', () => {
  for (const raw of ['{"status":"READY"}', '```json\n{"status":"READY"}\n```', 'Result:\n```json\n{"status":"READY"}\n```\nEnd.', '```json\r\n{"status":"READY"}\r\n```']) {
    assert.equal(parseJSONReport(response(raw), settings).status, 'READY');
  }
  for (const raw of ['Missing source', '{"status":"READY"', '```json\n{}\n```\n```json\n{}\n```', '{"a":1}\n{"b":2}', '{"a":1}\n```json\n{}\n```']) {
    assert.throws(() => parseJSONReport(response(raw), settings), /required JSON envelope.*finish=stop/);
  }
  assert.throws(() => parseJSONReport(response('x'.repeat(1001)), settings), /oversized/);
  assert.throws(() => parseJSONReport(response(''), settings), /Empty/);
  assert.throws(() => parseJSONReport({ info: {}, parts: [{ type: 'reasoning', text: '{"status":"READY"}' }] }, settings), /Empty/);
});
test('every stage has an object schema and zero automatic output retries', () => {
  for (const role of ['azpr-check','azpr-functional','azpr-failure','azpr-deep','azpr-verify-free','azpr-verify-paid','azpr-comment-plan','azpr-comment-publish']) {
    const format = stageFormat(role);
    assert.equal(format.type, 'json_schema'); assert.equal(format.retryCount, 0);
    assert.equal(format.schema.type, 'object'); assert.ok(format.schema.required.includes('status'));
    assert.equal(format.schema.additionalProperties, false);
  }
  assert.ok(stageFormat('azpr-functional').schema.properties.findings.items.properties.severity);
  assert.ok(stageFormat('azpr-verify-free').schema.properties.dispositions.items.properties.mergedInto);
  assert.ok(stageFormat('azpr-check').schema.properties.status.enum.includes('NOT_READY'));
});
test('diagnostic projection excludes reasoning, tool payloads, headers, and unknown metadata', () => {
  const value = diagnosticResponse({ info: { id: 'msg_1', finish: 'length', error: { name: 'APIError', data: { message: 'actual error', responseHeaders: { authorization: 'SECRET_HEADER' }, responseBody: 'SECRET_BODY' } }, metadata: 'SECRET_METADATA' }, parts: [
    { type: 'text', text: 'Visible reply' }, { type: 'reasoning', text: 'PRIVATE_REASONING' }, { type: 'tool', state: { input: 'PRIVATE_TOOL' } }, { type: 'text', ignored: true, text: 'IGNORED_TEXT' },
  ] }, 1000);
  assert.equal(value.error.message, 'actual error'); assert.equal(value.text, 'Visible reply');
  assert.doesNotMatch(JSON.stringify(value), /SECRET_|PRIVATE_|IGNORED_/);
  const large = diagnosticResponse({ info: { structured: { report: 'x'.repeat(100) } }, parts: [{ type: 'text', text: 'y'.repeat(100) }] }, 10);
  assert.equal(large.text.length, 10); assert.equal(large.textCharacters, 100); assert.equal(large.textTruncated, true);
  assert.equal(large.structured, undefined); assert.equal(large.structuredTruncated, true); assert.equal(large.structuredPreview.length, 10);
});
