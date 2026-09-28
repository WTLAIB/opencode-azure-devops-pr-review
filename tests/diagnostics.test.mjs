import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createDiagnostics, createStageTiming } from '../src/diagnostics.mjs';

test('stage timing separates overlapping tool intervals from model request windows',()=>{
  let now=0;const timing=createStageTiming(()=>now);
  now=2;timing.promptStarted();now=4;timing.modelRequest();
  now=10;timing.toolStarted('private-call-a','custom_read');
  now=14;timing.toolStarted('private-call-b','custom_read');
  now=20;timing.toolEnded('private-call-a');now=24;timing.toolEnded('private-call-b');
  now=30;timing.modelRequest();now=60;timing.promptSettled('returned');now=65;
  const result=timing.finish();
  assert.equal(result.promptMs,58);assert.equal(result.toolActiveMs,14);
  assert.equal(result.lastToolToResponseMs,36);assert.equal(result.responseProcessingMs,5);
  assert.deepEqual(result.modelRounds.map(r=>[r.durationMs,r.toolActiveMs,r.outsideToolMs,r.endReason]),
    [[26,14,12,'next-request'],[30,0,30,'returned']]);
  assert.deepEqual(result.toolCalls.map(t=>t.durationMs),[10,10]);
  assert.doesNotMatch(JSON.stringify(result),/private-call/);
});
test('stage timing leaves unmatched tools unknown on interruption and ignores late completions',()=>{
  let now=0;const timing=createStageTiming(()=>now);
  timing.promptStarted();timing.modelRequest();
  now=2;timing.toolStarted('read','custom_read');now=12;timing.promptSettled('interrupted');now=20;
  const result=timing.finish();
  assert.equal(result.promptMs,12);assert.equal(result.responseProcessingMs,8);
  assert.equal(result.toolActiveMs,null);assert.equal(result.unfinishedTools,1);
  assert.equal(result.toolCalls[0].durationMs,null);
  assert.equal(result.lastToolToResponseMs,null);
  assert.equal(result.modelRounds[0].outsideToolMs,null);
  assert.equal(result.modelRounds[0].endReason,'interrupted');
  now=30;timing.toolEnded('read');timing.modelRequest();
  assert.deepEqual(timing.finish(),result);
});
test('stage timing counts each tool once and does not invent a last read for tool-free amendments',()=>{
  let now=0;const timing=createStageTiming(()=>now);
  timing.promptStarted();timing.modelRequest();now=2;timing.toolStarted('a','read');
  now=3;timing.toolStarted('a','read');now=7;timing.toolEnded('a');
  now=8;timing.toolEnded('a');now=9;timing.promptSettled('rejected');
  const result=timing.finish();assert.equal(result.toolActiveMs,5);assert.equal(result.toolCalls.length,1);
  const empty=createStageTiming(()=>now);empty.promptStarted();empty.modelRequest();
  now=10;empty.promptSettled('returned');const repaired=empty.finish();
  assert.equal(repaired.toolActiveMs,0);assert.equal(repaired.lastToolToResponseMs,null);
  assert.deepEqual(repaired.toolCalls,[]);assert.equal(repaired.modelRounds.length,1);
});
test('stage timing records an early stage stop without fabricating a prompt response',()=>{
  let now=0;const timing=createStageTiming(()=>now);now=5;
  const result=timing.finish();assert.equal(result.elapsedMs,5);
  assert.equal(result.promptMs,null);assert.equal(result.responseProcessingMs,null);
  assert.equal(result.responseOutcome,null);assert.deepEqual(result.modelRounds,[]);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'azpr-debug-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory };
}
const run = { id: '01234567', mode: 'review', profile: 'review', origin: 'ses_test' };
const settings = { debug: { enabled: true, directory: '.azpr-debug' }, outputLanguage: 'zh-TW', returnReport: 'receipt', structuredOutput: true };
test('debug off makes no files or directories', async t => {
  const context = await fixture(t);
  const log = await createDiagnostics({ ...settings, debug: { enabled: false, directory: '.azpr-debug' } }, context, run);
  await log.write('input.json', { private: 'source' });
  assert.equal(log.directory, ''); assert.deepEqual(await readdir(context.directory), []);
});
test('project diagnostics are private, ignored by Git, unique, and never overwrite files', async t => {
  const context = await fixture(t);
  assert.equal(spawnSync('git', ['init', '-q', context.directory]).status, 0);
  const log = await createDiagnostics(settings, context, run);
  assert.equal(log.warnings.length, 0);
  await log.write('report.md', 'Private report');
  assert.equal((await stat(log.directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(log.directory, 'report.md'))).mode & 0o777, 0o600);
  assert.equal(spawnSync('git', ['check-ignore', join(log.directory, 'report.md')], { cwd: context.directory }).status, 0);
  await log.write('report.md', 'Do not overwrite');
  assert.equal(await readFile(join(log.directory, 'report.md'), 'utf8'), 'Private report');
  assert.match(log.warnings.join(), /Could not save/);
  const next = await createDiagnostics(settings, context, run);
  assert.notEqual(next.directory, log.directory);
  await log.write('../escape.md', 'no');
  assert.match(log.warnings.join(), /escape/);
});
test('symlink paths are refused without writing to their destination', async t => {
  const context = await fixture(t), destination = await fixture(t);
  await symlink(destination.directory, join(context.directory, 'link'));
  const log = await createDiagnostics({ ...settings, debug: { enabled: true, directory: 'link/child' } }, context, run);
  assert.equal(log.directory, ''); assert.ok(log.warnings.length);
  assert.deepEqual(await readdir(destination.directory), []);
});
test('an unwritable debug target produces a warning, not an exception or overwrite', async t => {
  const context = await fixture(t);
  await writeFile(join(context.directory, '.azpr-debug'), 'Existing user file');
  const log = await createDiagnostics(settings, context, run);
  assert.ok(log.warnings.length); assert.equal(log.directory, '');
  assert.equal(await readFile(join(context.directory, '.azpr-debug'), 'utf8'), 'Existing user file');
});
