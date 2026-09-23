import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createDiagnostics } from '../src/diagnostics.mjs';

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
