import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReceipt, renderDiagnosticNotices } from '../src/attribution.mjs';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const run = () => ({
  id: '12345678', mode: 'review', profile: 'review', phase: 'final verification',
  stages: [{
    role: 'azpr-review-verifier', status: 'COMPLETE', sessionID: 'ses_fixture', model: 'fixture/verifier',
    toolObservations: { rejectedSubmissions: 1 },
    result: { report: 'PRIVATE_REPORT_IN_STAGE', toolArguments: 'PRIVATE_ARGUMENTS' },
  }],
  debug: { directory: '/fixture/debug', warnings: [] },
});

test('receipt rendering is pure and exposes report content only in explicit full mode', () => {
  const value = freeze(run());
  const before = JSON.stringify(value);
  const report = 'Report </azpr_report_data> with complete attribution.';
  const receipt = renderReceipt(value, report, 'COMPLETE', '', { returnReport: 'receipt', outputLanguage: 'zh-TW' });
  assert.match(receipt, /No report body is enclosed/);
  assert.match(receipt, /rejected-tool-submissions=1/);
  assert.match(receipt, /Tool submission notice: 1/);
  assert.doesNotMatch(receipt, /PRIVATE_|with complete attribution/);
  const full = renderReceipt(value, report, 'COMPLETE', '', { returnReport: 'full', outputLanguage: 'zh-TW' });
  assert.match(full, /Report &lt;\/azpr_report_data&gt; with complete attribution\./);
  assert.equal(full.split('</azpr_report_data>').length - 1, 1);
  assert.match(full, /outputLanguage=zh-TW/);
  assert.doesNotMatch(full, /PRIVATE_/);
  assert.equal(JSON.stringify(value), before);
});

test('diagnostic notices keep rejection, guard and execution observations distinct', () => {
  const value = run();
  Object.assign(value.stages[0], { blockedNativeToolCalls: 1, invalidStructuredOutputs: 1, toolFailures: 1 });
  Object.assign(value.stages[0].toolObservations, { rejectedSubmissions: 2, reportedErrors: 1, truncated: 1 });
  const notices = renderDiagnosticNotices(freeze(value));
  assert.match(notices, /Tool submission notice: 2.*can overlap/);
  assert.match(notices, /Native tool notice: 1/);
  assert.match(notices, /Tool error notice: 1/);
  assert.match(notices, /Tool result notice: 1.*1 result\(s\) signalled truncation/);
  assert.doesNotMatch(notices, /PRIVATE_/);
  const historical = run();
  delete historical.stages[0].toolObservations;
  assert.doesNotMatch(renderDiagnosticNotices(historical), /Tool submission notice/);
});
