// Real shell operations in disposable directories; no live model or Azure calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync,
  readdirSync, rmSync, chmodSync, statSync, symlinkSync, renameSync,
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
  return run(join(s.root, 'plugins/azpr/uninstall.sh'), ['--config-dir', s.root, ...args]);
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
  Object.assign(settings.models.review, { functional: 'team/functional', risk: 'team/risk', verifier: 'team/verifier' });
  Object.assign(settings.models.deep, { functional: 'team/deep-functional', risk: 'team/deep-risk', verifier: 'team/deep-verifier' });
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
  assert.ok(existsSync(join(s.root, 'plugins/azpr/runtime.mjs')));
  assert.ok(existsSync(join(s.root, 'plugins/azpr/comments.mjs')));
  assert.ok(existsSync(join(s.root, 'plugins/azpr/config.mjs')));
  assert.ok(!existsSync(join(s.root, 'azpr')));
  assert.equal(readFileSync(join(s.root,'plugins/azpr.js'),'utf8').includes('../'),false);
  assert.deepEqual(readdirSync(join(s.root,'plugins')).filter(n=>/\.(js|ts)$/.test(n)).sort(),['another.js','azpr.js']);
  assert.ok(existsSync(join(s.root, 'plugins/azpr/settings.schema.json')));
  assert.ok(!existsSync(join(s.root, 'skills')));
  assert.ok(!existsSync(join(s.root, 'agents')));
  assert.deepEqual(readdirSync(join(s.root, 'commands')).sort(),
    ['my-command.md', 'pr-check.md', 'pr-comment.md', 'pr-deep.md', 'pr-review.md', 'pr-stop.md']);
});

test('replacement migrates sibling layout with byte-identical current settings and no backup',()=>{
  const s=setup(), file=profile(s);
  ok(install(s,['--settings',file]));
  renameSync(join(s.root,'plugins/azpr'),join(s.root,'azpr'));
  writeFileSync(join(s.root,'plugins/azpr.js'),'// azpr-optin:plugin\nexport { AzurePrReview } from "../azpr/plugin.js";\n');
  ok(install(s,['--replace']));
  assert.ok(!existsSync(join(s.root,'azpr')));
  assert.equal(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'),readFileSync(file,'utf8'));
  assert.ok(!existsSync(join(s.root,'azpr-backups')));
  original(s); clean(s);
});
test('failed migration restores the old layout and loader',()=>{
  const s=setup(), file=profile(s);
  ok(install(s,['--settings',file]));
  renameSync(join(s.root,'plugins/azpr'),join(s.root,'azpr'));
  const loader='// azpr-optin:plugin\nexport { AzurePrReview } from "../azpr/plugin.js";\n';
  writeFileSync(join(s.root,'plugins/azpr.js'),loader);
  const bin=join(s.temp,'bin'); mkdirSync(bin);
  writeFileSync(join(bin,'mv'),'#!/bin/sh\ncase "$*" in *\'/new/plugins/azpr\'*) exit 71;; esac\nexec /bin/mv "$@"\n');
  chmodSync(join(bin,'mv'),0o755);
  bad(install(s,['--replace'],{env:{...process.env,PATH:bin+':'+process.env.PATH}}));
  assert.ok(!existsSync(join(s.root,'plugins/azpr')));
  assert.equal(readFileSync(join(s.root,'azpr/settings.json'),'utf8'),readFileSync(file,'utf8'));
  assert.equal(readFileSync(join(s.root,'plugins/azpr.js'),'utf8'),loader);
  original(s); clean(s);
});
test('ambiguous old/new profiles require explicit selection without moving either',()=>{
  const s=setup(); ok(install(s));
  mkdirSync(join(s.root,'azpr')); writeFileSync(join(s.root,'azpr/settings.json'),'old settings');
  bad(install(s,['--replace']));
  assert.equal(readFileSync(join(s.root,'azpr/settings.json'),'utf8'),'old settings');
  assert.ok(existsSync(join(s.root,'plugins/azpr/settings.json')));
  original(s); clean(s);
});
test('nested runtime symlink is refused without touching its destination',()=>{
  const s=setup(), outside=join(s.temp,'outside'); mkdirSync(outside);
  writeFileSync(join(outside,'settings.json'),'private');
  symlinkSync(outside,join(s.root,'plugins/azpr'));
  bad(install(s,['--replace']));
  assert.equal(readFileSync(join(outside,'settings.json'),'utf8'),'private');
  original(s); clean(s);
});

test('installed loader resolves the real plugin and registers roles from installed prompts', async () => {
  const s = setup();
  ok(install(s, ['--settings', profile(s)]));
  const module = await import(pathToFileURL(join(s.root, 'plugins/azpr.js')).href);
  const hooks = await module.AzurePrReview({});
  const config = { command: {} };
  for (const name of ['pr-check', 'pr-review', 'pr-deep', 'pr-stop', 'pr-comment']) {
    config.command[name] = {
      subtask: false,
      template: readFileSync(join(s.root, 'commands', name + '.md'), 'utf8'),
    };
  }
  await hooks.config(config);
  assert.equal(Object.keys(config.agent).length, 12);
  assert.equal(config.agent['azpr-review-functional'].model, 'team/functional');
  assert.match(config.agent['azpr-review-functional'].prompt, /Functional|functional/);
});

test('settings are copied literally with private permissions', () => {
  const s = setup(), file = profile(s);
  ok(install(s, ['--settings', file]));
  assert.equal(readFileSync(join(s.root, 'plugins/azpr/settings.json'), 'utf8'), readFileSync(file, 'utf8'));
  assert.equal(statSync(join(s.root, 'plugins/azpr/settings.json')).mode & 0o777, 0o600);
  original(s);
});

test('duplicate installation refuses without replace', () => {
  const s = setup();
  ok(install(s));
  const before = readFileSync(join(s.root, 'plugins/azpr/settings.json'), 'utf8');
  bad(install(s));
  assert.equal(readFileSync(join(s.root, 'plugins/azpr/settings.json'), 'utf8'), before);
  original(s);
  clean(s);
});

test('replacement preserves chosen settings without retaining a backup', () => {
  const s = setup(), file = profile(s);
  ok(install(s, ['--settings', file]));
  ok(install(s, ['--replace']));
  assert.ok(!existsSync(join(s.root,'azpr-backups')));
  assert.equal(readFileSync(join(s.root, 'plugins/azpr/settings.json'), 'utf8'), readFileSync(file, 'utf8'));
  original(s);
  clean(s);
});

test('explicit settings replace the installed model mapping', () => {
  const s = setup();
  ok(install(s));
  const file = profile(s);
  ok(install(s, ['--replace', '--settings', file]));
  assert.equal(readFileSync(join(s.root, 'plugins/azpr/settings.json'), 'utf8'), readFileSync(file, 'utf8'));
  original(s);
});

test('replacement preserves a personal output language without prompt customizations', () => {
  const s=setup(), file=profile(s);
  const settings=JSON.parse(readFileSync(file,'utf8'));
  settings.outputLanguage='zh-TW';
  writeFileSync(file,JSON.stringify(settings,null,2)+'\n');
  ok(install(s,['--settings',file]));
  ok(install(s,['--replace']));
  assert.equal(JSON.parse(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8')).outputLanguage,'zh-TW');
  assert.ok(!existsSync(join(s.root,'azpr-backups')));
  assert.match(readFileSync(join(s.root,'plugins/azpr/prompts/final.md'),'utf8'),/configured outputLanguage/);
  original(s); clean(s);
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
  assert.ok(!existsSync(join(s.root, 'plugins/azpr')));
  clean(s);
});

test('alternate discovery directory conflicts are preserved even with replace', () => {
  const s = setup();
  mkdirSync(join(s.root, 'command'));
  writeFileSync(join(s.root, 'command/pr-review.md'), 'Unrelated command');
  bad(install(s, ['--replace']));
  assert.equal(readFileSync(join(s.root, 'command/pr-review.md'), 'utf8'), 'Unrelated command');
  assert.ok(!existsSync(join(s.root, 'plugins/azpr')));
  clean(s);
});

test('existing install lock prevents concurrent changes', () => {
  const s = setup();
  mkdirSync(join(s.root, '.azpr-install.lock'));
  bad(install(s));
  assert.ok(existsSync(join(s.root, '.azpr-install.lock')));
  assert.ok(!existsSync(join(s.root, 'plugins/azpr')));
});

test('invalid command arguments cause no installation', () => {
  const s = setup();
  bad(install(s, ['--settings', join(s.temp, 'missing')]));
  bad(install(s, ['--unknown']));
  assert.ok(!existsSync(join(s.root, 'plugins/azpr')));
});

test('XDG paths with spaces work and settings are never executed', () => {
  const s = setup(), xdg = join(s.temp, 'XDG space'), file = join(s.temp, 'data.json');
  writeFileSync(file, JSON.stringify({custom:'$(touch never-execute)'}));
  ok(run(join(pkg, 'install.sh'), ['--settings', file], {
    cwd: s.temp, env: { ...process.env, XDG_CONFIG_HOME: xdg },
  }));
  assert.equal(JSON.parse(readFileSync(join(xdg, 'opencode/plugins/azpr/settings.json'), 'utf8')).custom, '$(touch never-execute)');
  assert.ok(!existsSync(join(s.temp, 'never-execute')));
});

for(const legacy of [false,true]) test(`replacement migrates models and merges missing defaults without backup (${legacy?'legacy':'nested'})`,()=>{
  const s=setup();ok(install(s));
  if(legacy) renameSync(join(s.root,'plugins/azpr'),join(s.root,'azpr'));
  const rel=legacy?'azpr/settings.json':'plugins/azpr/settings.json';
  const old={version:1,models:{freeA:'private/fixture-a',freeB:'private/fixture-b',deep:''},steps:{check:9},outputLanguage:'zh-TW',returnReport:'full',structuredOutput:false,debug:{enabled:true},comments:{enabled:false},custom:{array:[1,2],value:null},enabled:false};
  const raw=JSON.stringify(old);writeFileSync(join(s.root,rel),raw);
  const result=install(s,['--replace']);ok(result);
  assert.doesNotMatch(result.stdout+result.stderr,/private\/fixture/);
  assert.match(result.stdout,/debug.directory/);
  const merged=JSON.parse(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'));
  for(const key of ['outputLanguage','returnReport','structuredOutput','custom','enabled']) assert.deepEqual(merged[key],old[key]);
  assert.equal(merged.version,2);
  assert.deepEqual(merged.models.review,{functional:old.models.freeA,risk:old.models.freeB,verifier:old.models.freeB});
  assert.deepEqual(merged.models.deep,{functional:old.models.freeA,risk:'',verifier:''});
  for(const key of ['freeA','freeB','final']) assert.equal(Object.hasOwn(merged.models,key),false);
  assert.equal(merged.steps.check,9);assert.equal(merged.steps.initial,60);
  assert.deepEqual(merged.debug,{enabled:true,directory:''});assert.deepEqual(merged.comments,{enabled:false,maxComments:5});
  assert.ok(!existsSync(join(s.root,'azpr-backups')));
  const once=readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8');ok(install(s,['--replace']));
  assert.equal(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'),once);
  assert.equal(statSync(join(s.root,'plugins/azpr/settings.json')).mode&0o777,0o600);
  original(s);clean(s);
});
test('explicit partial profiles are merged without modifying the source or retaining the previous profile',()=>{
  const s=setup();ok(install(s));const file=join(s.temp,'partial.json');
  const raw=JSON.stringify({models:{freeA:'team/new'},debug:null,comments:[],outputLanguage:'zh-CN'});writeFileSync(file,raw);
  ok(install(s,['--replace','--settings',file]));
  const merged=JSON.parse(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'));
  assert.equal(merged.models.review.functional,'team/new');assert.equal(merged.debug,null);assert.deepEqual(merged.comments,[]);
  assert.equal(merged.outputLanguage,'zh-CN');assert.equal(merged.structuredOutput,true);
  assert.equal(readFileSync(file,'utf8'),raw);original(s);clean(s);
});
for(const raw of ['{"private":"DO_NOT_PRINT",}', '{"version":1,"version":2}', '[]', 'null', '{"value":NaN}', '{"value":1e999}']) test(`invalid JSON settings stop replacement before overwrite: ${raw}`,()=>{
  const s=setup();ok(install(s));const file=join(s.root,'plugins/azpr/settings.json');writeFileSync(file,raw);
  const before=readFileSync(join(s.root,'plugins/azpr/runtime.mjs'),'utf8');
  const result=install(s,['--replace']);bad(result);assert.match(result.stderr,/valid JSON objects/);assert.doesNotMatch(result.stderr,/DO_NOT_PRINT/);
  assert.equal(readFileSync(file,'utf8'),raw);assert.equal(readFileSync(join(s.root,'plugins/azpr/runtime.mjs'),'utf8'),before);
  assert.ok(!existsSync(join(s.root,'azpr-backups')));original(s);clean(s);
});

test('failed replacement restores the original integration and settings', () => {
  const s = setup(), file = profile(s);
  ok(install(s, ['--settings', file]));
  const old=JSON.parse(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'));
  delete old.debug;delete old.structuredOutput;
  writeFileSync(join(s.root,'plugins/azpr/settings.json'),JSON.stringify(old));
  const paths = ['plugins/azpr/runtime.mjs', 'plugins/azpr/settings.json', 'plugins/azpr.js', 'commands/pr-review.md'];
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

test('missing Python stops installation without modifying existing files',()=>{
  const s=setup();ok(install(s));const before=readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8');
  const bin=join(s.temp,'without-python');mkdirSync(bin);symlinkSync('/usr/bin/dirname',join(bin,'dirname'));
  const result=install(s,['--replace'],{env:{...process.env,PATH:bin}});
  bad(result);assert.match(result.stderr,/Python 3 is required/);
  assert.equal(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'),before);original(s);clean(s);
});

test('all four legacy slots migrate directly to both profiles and load as actual installed roles',async()=>{
  const s=setup();ok(install(s));
  const old=JSON.parse(readFileSync(profile(s),'utf8'));
  old.version=1;old.models={freeA:'team/old-a',freeB:'team/old-b',deep:'team/old-deep',final:'team/old-final'};
  old.outputLanguage='zh-TW';old.steps.deep=88;
  writeFileSync(join(s.root,'plugins/azpr/settings.json'),JSON.stringify(old));
  const result=install(s,['--replace']);ok(result);assert.match(result.stdout,/Settings migrated 1 -> 2/);assert.doesNotMatch(result.stdout,/team\/old/);
  const current=JSON.parse(readFileSync(join(s.root,'plugins/azpr/settings.json'),'utf8'));
  assert.deepEqual(current.models.review,{functional:'team/old-a',risk:'team/old-b',verifier:'team/old-b'});
  assert.deepEqual(current.models.deep,{functional:'team/old-a',risk:'team/old-deep',verifier:'team/old-final'});
  assert.equal(current.outputLanguage,'zh-TW');assert.equal(current.steps.deep,88);
  for(const slot of ['functional','risk','verifier']) assert.equal(typeof current.models._help[slot],'string');
  const module=await import(pathToFileURL(join(s.root,'plugins/azpr.js')).href),hooks=await module.AzurePrReview({}),config={command:{}};
  for(const command of ['pr-check','pr-review','pr-deep','pr-stop','pr-comment']) config.command[command]={subtask:false,template:readFileSync(join(s.root,'commands',command+'.md'),'utf8')};
  await hooks.config(config);
  for(const mode of ['review','deep']) for(const slot of ['functional','risk','verifier']) assert.equal(config.agent[`azpr-${mode}-${slot}`].model,current.models[mode][slot]);
  assert.ok(!existsSync(join(s.root,'azpr-backups')));original(s);clean(s);
});
for(const invalid of [
  {version:3,models:{}},{version:true,models:{}},{version:'1',models:{}},
  {version:2,models:{freeA:'team/old'}},{version:2,models:{deep:'team/old'}},
  {version:1,models:{review:{functional:'team/new'},freeA:'team/old'}},
  {models:{deep:{risk:'team/new'},freeB:'team/old'}},
]) test(`ambiguous or unsupported settings remain untouched: ${JSON.stringify(invalid)}`,()=>{
  const s=setup();ok(install(s));const file=join(s.root,'plugins/azpr/settings.json'),raw=JSON.stringify(invalid);writeFileSync(file,raw);
  const result=install(s,['--replace']);bad(result);assert.match(result.stderr,/unambiguous supported version/);assert.doesNotMatch(result.stderr,/team\//);
  assert.equal(readFileSync(file,'utf8'),raw);assert.ok(existsSync(join(s.root,'plugins/azpr/runtime.mjs')));
  assert.ok(!existsSync(join(s.root,'azpr-backups')));original(s);clean(s);
});
test('installation does not remove or create historical backups',()=>{
  const s=setup(),folder=join(s.root,'azpr-backups/replaced.historical');mkdirSync(folder,{recursive:true});
  writeFileSync(join(folder,'settings.json'),'EXISTING_PRIVATE_BACKUP');
  ok(install(s,['--settings',profile(s)]));ok(install(s,['--replace']));
  assert.deepEqual(readdirSync(join(s.root,'azpr-backups')),['replaced.historical']);
  assert.equal(readFileSync(join(folder,'settings.json'),'utf8'),'EXISTING_PRIVATE_BACKUP');original(s);clean(s);
});
test('failed automatic recovery retains the only remaining original files with a recovery path',()=>{
  const s=setup(),file=profile(s);ok(install(s,['--settings',file]));const raw=readFileSync(file,'utf8');
  const bin=join(s.temp,'recovery-bin');mkdirSync(bin);
  writeFileSync(join(bin,'mv'),'#!/bin/sh\ncase "$1" in --) shift;; esac\ncase "$1" in */new/plugins/azpr|*/previous/plugins/azpr) exit 71;; esac\nexec /bin/mv "$@"\n');
  chmodSync(join(bin,'mv'),0o755);
  const result=install(s,['--replace'],{env:{...process.env,PATH:bin+':'+process.env.PATH}});bad(result);
  const recovery=/emergency files retained: ([^\n]+)/.exec(result.stderr)?.[1];assert.ok(recovery);
  assert.equal(readFileSync(join(recovery,'previous/plugins/azpr/settings.json'),'utf8'),raw);
  assert.ok(!existsSync(join(s.root,'.azpr-install.lock')));assert.ok(!existsSync(join(s.root,'azpr-backups')));original(s);
});

test('uninstall preview changes nothing', () => {
  const s = setup();
  ok(install(s));
  ok(uninstall(s));
  assert.ok(existsSync(join(s.root, 'plugins/azpr/runtime.mjs')));
  assert.ok(existsSync(join(s.root, 'plugins/azpr.js')));
  original(s);
  clean(s);
});

test('uninstall archives only this integration', () => {
  const s = setup();
  ok(install(s));
  ok(uninstall(s, ['--apply']));
  assert.ok(!existsSync(join(s.root, 'plugins/azpr')));
  assert.ok(!existsSync(join(s.root, 'plugins/azpr.js')));
  assert.ok(existsSync(join(backups(s, 'uninstalled.')[0], 'plugins/azpr/settings.json')));
  original(s);
  clean(s);
});

test('uninstall refuses a command replaced by another owner', () => {
  const s = setup();
  ok(install(s));
  writeFileSync(join(s.root, 'commands/pr-review.md'), 'Another owner');
  bad(uninstall(s, ['--apply']));
  assert.equal(readFileSync(join(s.root, 'commands/pr-review.md'), 'utf8'), 'Another owner');
  assert.ok(existsSync(join(s.root, 'plugins/azpr/runtime.mjs')));
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
  for (const name of ['pr-check', 'pr-review', 'pr-deep', 'pr-stop', 'pr-comment']) {
    const content = readFileSync(join(s.root, 'commands', name + '.md'), 'utf8');
    assert.doesNotMatch(content, /^\s*(agent|model):/m);
    assert.match(content, /subtask: false/);
    assert.ok(content.includes('azpr-optin:' + name));
  }
});
