import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONReport, stageFormat, checkEnvelope, finalEnvelope } from '../src/output.mjs';
import { ROLES } from '../src/config.mjs';
import { diagnosticResponse } from '../src/diagnostics.mjs';
const settings = { maxStageCharacters: 1000 };
const response = text => ({ info: { finish: 'stop' }, parts: [{ type: 'text', text }] });
const snapshot = { repository:'org/project/repo',prId:1,base:'a'.repeat(40),head:'b'.repeat(40),scope:'cumulative',files:['/main.js'] };
const final = dispositions => ({status:'COMPLETE',snapshot,currentHead:snapshot.head,dispositions,report:'Evidence report'});

test('source-check contracts reject malformed readiness before starting initial reviews',()=>{
  assert.equal(checkEnvelope({status:'READY',snapshot,report:'Source available'}).snapshot.head,snapshot.head);
  assert.equal(checkEnvelope({status:'NOT_READY',report:'No source access'}).status,'NOT_READY');
  for(const value of [null,{}, {status:'READY',report:'No snapshot'}, {status:'READY',snapshot,report:''},
    {status:'NOT_READY'}, {status:'READY',snapshot,report:'Source',sourceAccess:[]},
    {status:'READY',snapshot,report:'Source',sourceAccess:{diff:[]}}, {status:'READY',snapshot,report:'Source',requirements:null}]) assert.throws(()=>checkEnvelope(value));
});
test('final merge graph rejects cycles instead of silently losing all findings',()=>{
  const originals=['F-1','R-1','F-2'].map(id=>({id}));
  for(const targets of [['R-1','F-1','F-1'],['R-1','F-2','F-1']]) {
    const dispositions=originals.map((f,index)=>({...f,status:'MERGED',mergedInto:targets[index],reason:'Duplicate'}));
    assert.throws(()=>finalEnvelope(final(dispositions),snapshot,originals),/cycle/);
  }
});
test('merge chains must terminate at a real disposition and only merges may name a target',()=>{
  const originals=['F-1','R-1','F-2'].map(id=>({id}));
  for(const status of ['CONFIRMED','NEEDS_INFO','REJECTED']) {
    const result=final([{id:'F-1',status,reason:'Evidence'}, {id:'R-1',status:'MERGED',mergedInto:'F-1',reason:'Duplicate'}, {id:'F-2',status:'MERGED',mergedInto:'R-1',reason:'Duplicate'}]);
    assert.equal(finalEnvelope(result,snapshot,originals).status,'COMPLETE');
  }
  assert.throws(()=>finalEnvelope(final([{id:'F-1',status:'CONFIRMED',mergedInto:'R-1',reason:'Evidence'}]),snapshot,[originals[0]]),/Only a MERGED/);
  assert.throws(()=>finalEnvelope({...final([]),newFindings:null},snapshot,[]),/Invalid initial/);
});

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
  for (const role of Object.keys(ROLES)) {
    const format = stageFormat(role);
    assert.equal(format.type, 'json_schema'); assert.equal(format.retryCount, 0);
    assert.equal(format.schema.type, 'object'); assert.ok(format.schema.required.includes('status'));
    assert.equal(format.schema.additionalProperties, false);
  }
  assert.ok(stageFormat('azpr-review-functional').schema.properties.findings.items.properties.severity);
  assert.ok(stageFormat('azpr-review-verifier').schema.properties.dispositions.items.properties.mergedInto);
  assert.ok(stageFormat('azpr-review-check').schema.properties.status.enum.includes('NOT_READY'));
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
