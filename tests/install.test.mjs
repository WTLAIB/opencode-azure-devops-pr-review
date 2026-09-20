// Real shell operations in disposable directories; no live model or Azure calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync,
  readdirSync, rmSync, chmodSync, statSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const pkg = dirname(dirname(fileURLToPath(import.meta.url)));
const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const temp = mkdtempSync(join(tmpdir(), 'azpr-install-'));
  roots.push(temp);
  const root = join(temp, 'config space', 'opencode');
  mkdirSync(root, { recursive: true });
  const config = JSON.stringify({
    model: 'original/developer',
    agent: { build: { model: 'original/build' }, plan: { model: 'original/plan' } },
    mcp: { ado: { type: 'local', command: ['existing-server'] } },
    permission: { bash: 'ask' },
  });
  writeFileSync(join(root, 'opencode.json'), config);
  mkdirSync(join(root, 'plugins'));
  writeFileSync(join(root, 'plugins/another.js'), 'export const Another = async () => ({});\n');
  mkdirSync(join(root, 'commands'));
  writeFileSync(join(root, 'commands/my-command.md'), 'Original command\n');
  return { temp, root, config };
}

function run(path, args = [], extra = {}) {
  return spawnSync('/bin/sh', [path, ...args], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env }, ...extra,
  });
}
function install(s, args = [], extra = {}) {
  return run(join(pkg, 'install.sh'), ['--config-dir', s.root, ...args], extra);
}
function uninstall(s, args = []) {
  return run(join(s.root, 'azpr/uninstall.sh'), ['--config-dir', s.root, ...args]);
}
function ok(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr + (result.error ?? ''));
}
function bad(result) { assert.notEqual(result.status, 0); }
function original(s) {
  assert.equal(readFileSync(join(s.root, 'opencode.json'), 'utf8'), s.config);
  assert.equal(readFileSync(join(s.root, 'plugins/another.js'), 'utf8'), 'export const Another = async () => ({});\n');
  assert.equal(readFileSync(join(s.root, 'commands/my-command.md'), 'utf8'), 'Original command\n');
}
function clean(s) {
  assert.ok(!readdirSync(s.root).some(name => name.startsWith('.azpr-')));
}
function profile(s) {
  const settings = JSON.parse(readFileSync(join(pkg, 'config/settings.example.json'), 'utf8'));
  Object.assign(settings.models, {
    freeA: 'team/free-a', freeB: 'team/free-b', deep: 'team/deep', final: 'team/final',
  });
  const file = join(s.temp, 'team.json');
  writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  return file;
}
function backups(s, prefix) {
  const root = join(s.root, 'azpr-backups');
  return readdirSync(root).filter(name => name.startsWith(prefix)).map(name => join(root, name));
}

test('fresh installation preserves existing configuration and unrelated files', () => {
  const s = setup();
  ok(install(s));
  original(s);
  clean(s);
  assert.ok(existsSync(join(s.root, 'azpr/runtime.mjs')));
  assert.ok(existsSync(join(s.root, 'azpr/settings.schema.json')));
  assert.ok(!existsSync(join(s.root, 'skills')));
  assert.ok(!existsSync(join(s.root, 'agents')));
  assert.deepEqual(readdirSync(join(s.root, 'commands')).sort(),
    ['my-command.md', 'pr-check.md', 'pr-deep.md', 'pr-review.md', 'pr-stop.md']);
});

test('installed loader resolves the real plugin and registers roles from installed prompts', async () => {
  const s = setup();
  ok(install(s, ['--settings', profile(s)]));
  const module = await import(pathToFileURL(join(s.root, 'plugins/azpr.js')).href);
  const hooks = await module.AzurePrReview({});
  const config = { command: {} };
  for (const name of ['pr-check', 'pr-review', 'pr-deep', 'pr-stop']) {
    config.command[name] = {
      subtask: false,
      template: readFileSync(join(s.root, 'commands', name + '.md'), 'utf8'),
    };
  }
  await hooks.config(config);
  assert.equal(Object.keys(config.agent).length, 6);
  assert.equal(config.agent['azpr-functional'].model, 'team/free-a');
  assert.match(config.agent['azpr-functional'].prompt, /Functional|functional/);
});

test('settings are copied literally with private permissions', () => {
  const s = setup(), file = profile(s);
  ok(install(s, ['--settings', file]));
  assert.equal(readFileSync(join(s.root, 'azpr/settings.json'), 'utf8'), readFileSync(file, 'utf8'));
  assert.equal(statSync(join(s.root, 'azpr/settings.json')).mode & 0o777, 0o600);
  original(s);
});

test('duplicate installation refuses without replace', () => {
  const s = setup();
  ok(install(s));
  const before = readFileSync(join(s.root, 'azpr/settings.json'), 'utf8');
  bad(install(s));
  assert.equal(readFileSync(join(s.root, 'azpr/settings.json'), 'utf8'), before);
  original(s);
  clean(s);
});

test('replacement backs up the integration and preserves chosen settings', () => {
  const s = setup(), file = profile(s);
  ok(install(s, ['--settings', file]));
  ok(install(s, ['--replace']));
  const saved = backups(s, 'replaced.');
  assert.equal(saved.length, 1);
  for (const root of [s.root, saved[0]]) {
    assert.equal(readFileSync(join(root, 'azpr/settings.json'), 'utf8'), readFileSync(file, 'utf8'));
  }
  original(s);
  clean(s);
});

test('explicit settings replace the installed model mapping', () => {
  const s = setup();
  ok(install(s));
  const file = profile(s);
  ok(install(s, ['--replace', '--settings', file]));
  assert.equal(readFileSync(join(s.root, 'azpr/settings.json'), 'utf8'), readFileSync(file, 'utf8'));
  original(s);
});

test('unrelated global skills are never inspected or moved', () => {
  const s = setup();
  mkdirSync(join(s.root, 'skills/azure-pr-review'), { recursive: true });
  writeFileSync(join(s.root, 'skills/azure-pr-review/SKILL.md'), 'Unrelated skill');
  ok(install(s));
  ok(install(s, ['--replace']));
  assert.equal(readFileSync(join(s.root, 'skills/azure-pr-review/SKILL.md'), 'utf8'), 'Unrelated skill');
});

test('reserved JSONC keys stop installation without editing configuration', () => {
  const s = setup(), file = join(s.root, 'opencode.jsonc');
  const content = '// User comment\n{"command":{"pr-review":{"template":"mine"}}}\n';
  writeFileSync(file, content);
  bad(install(s, ['--replace']));
  assert.equal(readFileSync(file, 'utf8'), content);
  original(s);
  clean(s);
});

test('conflicting private agent files are preserved', () => {
  const s = setup();
  mkdirSync(join(s.root, 'agents'));
  writeFileSync(join(s.root, 'agents/azpr-deep.md'), 'Unrelated agent');
  bad(install(s, ['--replace']));
  assert.equal(readFileSync(join(s.root, 'agents/azpr-deep.md'), 'utf8'), 'Unrelated agent');
  clean(s);
});

test('symlinked integration directories are refused', () => {
  const s = setup(), external = join(s.temp, 'external');
  mkdirSync(external);
  rmSync(join(s.root, 'commands'), { recursive: true });
  symlinkSync(external, join(s.root, 'commands'));
  bad(install(s));
  assert.deepEqual(readdirSync(external), []);
  assert.ok(!existsSync(join(s.root, 'azpr')));
  clean(s);
});

test('alternate discovery directory conflicts are preserved even with replace', () => {
  const s = setup();
  mkdirSync(join(s.root, 'command'));
  writeFileSync(join(s.root, 'command/pr-review.md'), 'Unrelated command');
  bad(install(s, ['--replace']));
  assert.equal(readFileSync(join(s.root, 'command/pr-review.md'), 'utf8'), 'Unrelated command');
  assert.ok(!existsSync(join(s.root, 'azpr')));
  clean(s);
});

test('existing install lock prevents concurrent changes', () => {
  const s = setup();
  mkdirSync(join(s.root, '.azpr-install.lock'));
  bad(install(s));
  assert.ok(existsSync(join(s.root, '.azpr-install.lock')));
  assert.ok(!existsSync(join(s.root, 'azpr')));
});

test('invalid command arguments cause no installation', () => {
  const s = setup();
  bad(install(s, ['--settings', join(s.temp, 'missing')]));
  bad(install(s, ['--unknown']));
  assert.ok(!existsSync(join(s.root, 'azpr')));
});

test('XDG paths with spaces work and settings are never executed', () => {
  const s = setup(), xdg = join(s.temp, 'XDG space'), file = join(s.temp, 'data.json');
  writeFileSync(file, '$(touch never-execute)\n');
  ok(run(join(pkg, 'install.sh'), ['--settings', file], {
    cwd: s.temp, env: { ...process.env, XDG_CONFIG_HOME: xdg },
  }));
  assert.equal(readFileSync(join(xdg, 'opencode/azpr/settings.json'), 'utf8'), '$(touch never-execute)\n');
  assert.ok(!existsSync(join(s.temp, 'never-execute')));
});

test('failed replacement restores the original integration and settings', () => {
  const s = setup(), file = profile(s);
  ok(install(s, ['--settings', file]));
  const paths = ['azpr/runtime.mjs', 'azpr/settings.json', 'plugins/azpr.js', 'commands/pr-review.md'];
  const before = paths.map(path => readFileSync(join(s.root, path), 'utf8'));
  const bin = join(s.temp, 'bin');
  mkdirSync(bin);
  const mv = join(bin, 'mv');
  writeFileSync(mv, "#!/bin/sh\ncase \"$*\" in *'/.azpr-stage.'*'/new/commands/pr-review.md'*) exit 71;; esac\nexec /bin/mv \"$@\"\n");
  chmodSync(mv, 0o755);
  bad(install(s, ['--replace'], { env: { ...process.env, PATH: bin + ':' + process.env.PATH } }));
  assert.deepEqual(paths.map(path => readFileSync(join(s.root, path), 'utf8')), before);
  original(s);
  clean(s);
});

test('uninstall preview changes nothing', () => {
  const s = setup();
  ok(install(s));
  ok(uninstall(s));
  assert.ok(existsSync(join(s.root, 'azpr/runtime.mjs')));
  assert.ok(existsSync(join(s.root, 'plugins/azpr.js')));
  original(s);
  clean(s);
});

test('uninstall archives only this integration', () => {
  const s = setup();
  ok(install(s));
  ok(uninstall(s, ['--apply']));
  assert.ok(!existsSync(join(s.root, 'azpr')));
  assert.ok(!existsSync(join(s.root, 'plugins/azpr.js')));
  assert.ok(existsSync(join(backups(s, 'uninstalled.')[0], 'azpr/settings.json')));
  original(s);
  clean(s);
});

test('uninstall refuses a command replaced by another owner', () => {
  const s = setup();
  ok(install(s));
  writeFileSync(join(s.root, 'commands/pr-review.md'), 'Another owner');
  bad(uninstall(s, ['--apply']));
  assert.equal(readFileSync(join(s.root, 'commands/pr-review.md'), 'utf8'), 'Another owner');
  assert.ok(existsSync(join(s.root, 'azpr/runtime.mjs')));
});

test('credentials and main config backups survive install and replacement', () => {
  const s = setup();
  writeFileSync(join(s.root, 'auth.json'), 'DO-NOT-READ-OR-EDIT');
  writeFileSync(join(s.root, 'opencode.json.backup'), 'Original backup');
  ok(install(s));
  ok(install(s, ['--replace']));
  assert.equal(readFileSync(join(s.root, 'auth.json'), 'utf8'), 'DO-NOT-READ-OR-EDIT');
  assert.equal(readFileSync(join(s.root, 'opencode.json.backup'), 'utf8'), 'Original backup');
});

test('installed commands preserve the ordinary agent and model route', () => {
  const s = setup();
  ok(install(s));
  for (const name of ['pr-check', 'pr-review', 'pr-deep', 'pr-stop']) {
    const content = readFileSync(join(s.root, 'commands', name + '.md'), 'utf8');
    assert.doesNotMatch(content, /^\s*(agent|model):/m);
    assert.match(content, /subtask: false/);
    assert.ok(content.includes('azpr-optin:' + name));
  }
});
