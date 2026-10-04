import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAzurePrReviewPlugin } from '../src/runtime.mjs';
import { ROLES, PROMPTS, COMMANDS, MODES, buildAgents, validateSettings, roleFor } from '../src/config.mjs';
import { stageFormat } from '../src/output.mjs';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PRIVATE_PERMISSIONS = {task:'deny',bash:'deny',edit:'deny',skill:'deny',webfetch:'deny',websearch:'deny'};
const SNAP = { repository:'org/proj/repo',prId:123,base:'a'.repeat(40),head:'b'.repeat(40),scope:'pr',files:['/src/Main.java'] };
const jclone = x => JSON.parse(JSON.stringify(x));
const candidate = id => ({id,summary:'fixture issue',location:'head:/src/Main.java:12',evidence:'fixture branch evidence, reachable trigger and impact',counterevidence:'fixture caller guard does not cover the failing path',severity:'high',suggestion:'Add the missing guard and a regression test for the failing input.'});
const categories = result => {
  const {dispositions,...rest}=result;
  return {...rest,confirmed:dispositions.filter(d=>d.status==='CONFIRMED').map(d=>({...d.verifiedFinding,reason:d.reason})),
    merged:dispositions.filter(d=>d.status==='MERGED').map(({id,mergedInto,reason})=>({id,mergedInto,reason})),
    rejected:dispositions.filter(d=>d.status==='REJECTED').map(({id,reason})=>({id,reason})),
    needsInfo:dispositions.filter(d=>d.status==='NEEDS_INFO').map(({id,reason})=>({id,reason})),newFindings:result.newFindings??[]};
};
test('removed review limits are absent from settings, schemas and every role', async t => {
  const f = await fixture(t);
  const schema = JSON.parse(await readFile(join(ROOT, 'config/settings.schema.json'), 'utf8'));
  const raw = { ...f.settings };
  delete raw.steps; delete raw.maxStageCharacters;
  const normalized = validateSettings(raw);
  for (const key of ['steps', 'maxStageCharacters']) {
    assert.equal(Object.hasOwn(f.settings, key), false);
    assert.equal(Object.hasOwn(normalized, key), false);
    assert.equal(Object.hasOwn(schema.properties, key), false);
    assert.throws(() => validateSettings({ ...raw, [key]: null }), /Unknown setting/);
  }
  for (const [role, spec] of Object.entries(ROLES)) {
    assert.equal(Object.hasOwn(spec, 'step'), false);
    assert.equal(Object.hasOwn(f.cfg.agent[role], 'steps'), false);
  }
});

for (const native of [true, false]) test(`large review evidence survives output, verifier handoff and diagnostics: native=${native}`, async t => {
  // Exceed both the former maximum output setting and its fourfold input gate.
  const evidence = 'Evidence start\n' + 'x'.repeat(2100000) + '\nEvidence end';
  let handoff;
  const f = await fixture(t, {
    settings(s) { s.structuredOutput = native; s.debug = { enabled: true, directory: 'debug' }; },
    result({ role, result, packet }) {
      if (ROLES[role].format === 'initial') result.findings[0].evidence = evidence;
      if (ROLES[role].format === 'final') {
        handoff = packet;
        result = categories(result);
        assert.ok(JSON.stringify(packet).length > 4000000);
        assert.ok(packet.reviews.every(review => review.findings[0].evidence === evidence));
      }
      return result;
    },
    answer({ answer, result }) {
      answer.info.finish = 'stop';
      if (native) { answer.info.structured = result; answer.parts = []; }
      return { data: answer };
    },
  });
  const out = await f.command();
  assert.match(out, /] COMPLETE/);
  assert.ok(handoff);
  assert.equal(f.prompts().length, 3);
  const dir = /Private debug directory: ([^\n]+)/.exec(out)[1];
  const saved = JSON.parse(await readFile(join(dir, '03-azpr-review-verifier.response.json'), 'utf8'));
  const envelope = native ? saved.structured : JSON.parse(saved.text);
  assert.equal(envelope.confirmed.length, 2);
  assert.ok(envelope.confirmed.every(finding => finding.evidence === evidence));
  assert.equal(Object.hasOwn(saved, 'structuredPreview'), false);
  const report = await readFile(join(dir, 'report.md'), 'utf8');
  assert.ok(report.includes(evidence));
  const displayed = f.calls.find(call => call.kind === 'prompt' && call.body.noReply);
  assert.ok(displayed.body.parts.some(part => part.text.includes('\n\n' + report + '\n\n---\n')));
});

test('timeout defaults off and accepts only explicit finite seconds or null', async t => {
  const f = await fixture(t);
  assert.equal(f.settings.runTimeoutSeconds, null);
  const absent = jclone(f.settings);
  delete absent.runTimeoutSeconds;
  assert.equal(validateSettings(absent).runTimeoutSeconds, null);
  for (const seconds of [null, 10, 3600, 7200]) {
    assert.equal(validateSettings({ ...absent, runTimeoutSeconds: seconds }).runTimeoutSeconds, seconds);
  }
  const schema = JSON.parse(await readFile(join(ROOT, 'config/settings.schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.runTimeoutSeconds.type, ['integer', 'null']);
  assert.equal(schema.properties.runTimeoutSeconds.default, null);
  for (const value of [0, -1, 9, 10.5, 7201, '1200', false, Infinity, NaN]) {
    assert.throws(() => validateSettings({ ...f.settings, runTimeoutSeconds: value }), /runTimeoutSeconds/);
  }
});

for (const stop of ['complete', 'cancel', 'dispose']) test(`disabled timeout survives elapsed time and still supports ${stop}`, { timeout: 3000 }, async t => {
  let started, release;
  const ready = new Promise(r => started = r), wait = new Promise(r => release = r);
  const f = await fixture(t, {
    settings(s) { s.debug = { enabled: true, directory: 'debug' }; },
    async duringPrompt() { started(); await wait; },
  });
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let settled = false;
  const running = f.command('pr-check').then(out => { settled = true; return out; });
  await ready;
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(f.calls.filter(c => c.kind === 'abort').length, 0);
  if (stop === 'cancel') await f.command('pr-stop', '');
  if (stop === 'dispose') await f.hooks.dispose();
  release();
  const out = await running;
  assert.match(out, stop === 'complete' ? /] READY/ : /] CANCELLED/);
  assert.doesNotMatch(out, /TIMED_OUT/);
  const dir = /Private debug directory: ([^\n]+)/.exec(out)[1];
  const meta = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8'));
  const result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'));
  assert.equal(meta.runTimeoutSeconds, null);
  assert.equal(Object.hasOwn(meta, 'steps'), false);
  assert.equal(Object.hasOwn(result.stages[0], 'stepLimit'), false);
  assert.equal(result.stages[0].remainingRunMsAtStart, null);
  assert.equal(result.stages[0].remainingRunMsAtEnd, null);
  assert.ok(f.calls.filter(c => c.kind === 'abort').every(c => c.path.id !== 'ses_original'));
});

for (const afterFirst of [true, false]) test(`host truncation after MCP return stays visible without certifying source; afterFirst=${afterFirst}`, async t => {
  let terminal;
  const f = await fixture(t, {
    skipAzure: true,
    settings(s) { s.debug = { enabled: true, directory: 'debug' }; },
    async duringPrompt({ hooks, role, id }) {
      if (!role.endsWith('-check')) return;
      const input = { sessionID: id, tool: 'any_mcp_read', callID: 'private-call' };
      await hooks['tool.execute.before'](input, { args: { secret: 'PRIVATE_ARGUMENT' } });
      const stamp = Date.now();
      terminal = { type: 'tool', ...input, state: {
        status: 'completed', time: { start: stamp, end: stamp },
        metadata: { truncated: true, outputPath: '/PRIVATE_PATH/tool_output' }, output: 'PRIVATE_SOURCE',
      } };
      const emit = part => hooks.event({ event: { type: 'message.part.updated', properties: { part } } });
      const after = () => hooks['tool.execute.after'](input, { content: [{ type: 'text', text: 'PRIVATE_SOURCE' }] });
      await emit({ ...terminal, sessionID: 'unrelated' });
      await emit({ ...terminal, callID: 'unknown' });
      await emit({ ...terminal, state: { ...terminal.state, status: 'running' } });
      if (afterFirst) { await after(); await emit(terminal); }
      else { await emit(terminal); await after(); }
      await emit(terminal); await after();
    },
  });
  const out = await f.command('pr-check');
  assert.match(out, /truncated-tool-results=1/);
  const dir = /Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8')).stages[0];
  assert.equal(stage.completedTools, 0);
  assert.equal(stage.toolObservations.truncated, 1);
  assert.equal(stage.toolObservations.unverifiedResults, 0);
  assert.equal(stage.toolObservations.evidenceValidity, 'not-assessed');
  assert.doesNotMatch(JSON.stringify(stage), /PRIVATE_|private-call/);
  await f.hooks.event({ event: { type: 'message.part.updated', properties: { part: terminal } } });
});

test('terminal flags require boolean values and exclude unrelated or nonterminal events', async t => {
  const f = await fixture(t, {
    skipAzure: true,
    settings(s) { s.debug = { enabled: true, directory: 'debug' }; },
    async duringPrompt({ hooks, id }) {
      const stamp = Date.now();
      for (const [callID, metadata] of Object.entries({ flagged: { isError: true }, text: { isError: 'true', truncated: 'true' }, clean: {} })) {
        const input = { sessionID: id, tool: 'custom_read', callID };
        await hooks['tool.execute.before'](input, { args: {} });
        await hooks['tool.execute.after'](input, { metadata: {} });
        const part = { type: 'tool', ...input, state: { status: 'completed', metadata, time: { start: stamp, end: stamp } } };
        await hooks.event({ event: { type: 'message.part.updated', properties: { part } } });
        await hooks['tool.execute.after'](input, { metadata: {} });
      }
      await hooks['tool.execute.before']({ sessionID: id, tool: 'custom_read', callID: 'pending' }, { args: {} });
      const state = { status: 'completed', metadata: { isError: true, truncated: true }, time: { start: stamp, end: stamp } };
      for (const changes of [{ sessionID: 'other' }, { callID: 'unknown' }, { state: { ...state, status: 'running' } },
        { state: { ...state, time: { start: stamp, end: stamp + 1000000 } } }]) {
        const part = { type: 'tool', sessionID: id, tool: 'custom_read', callID: 'pending',
          state, ...changes };
        await hooks.event({ event: { type: 'message.part.updated', properties: { part } } });
      }
    },
  });
  const out = await f.command('pr-check');
  const dir = /Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8')).stages[0];
  assert.equal(stage.completedTools, 2);
  assert.equal(stage.toolObservations.hostErrors, 0);
  assert.equal(stage.toolObservations.reportedErrors, 1);
  assert.equal(stage.toolObservations.truncated, 0);
  assert.equal(stage.toolObservations.withoutOutcome, 1);
});

test('saved-output policy is shared by all roles without adding file permissions or dropping coverage', async t => {
  const f = await fixture(t);
  for (const role of Object.keys(ROLES)) {
    const agent = f.cfg.agent[role];
    assert.match(agent.prompt, /host-saved tool output/);
    assert.match(agent.prompt, /same session/);
    assert.match(agent.prompt, /offset\/limit/);
    assert.match(agent.prompt, /not.*complete.*server response/s);
    assert.match(agent.prompt, /not source-file line numbers/);
    assert.deepEqual(agent.permission, PRIVATE_PERMISSIONS);
  }
  for (const role of ['azpr-review-functional', 'azpr-review-risk', 'azpr-deep-functional', 'azpr-deep-risk']) {
    assert.match(f.cfg.agent[role].prompt, /Once established, keep your snapshot fixed/);
    assert.match(f.cfg.agent[role].prompt, /An initial candidate may omit only the separate location field/);
  }
  assert.match(f.cfg.agent['azpr-review-verifier'].prompt, /read the same PR metadata again/);
  assert.deepEqual(f.cfg.permission, f.baseline.permission);
});

async function fixture(t, opts={}) {
  const dir=await mkdtemp(join(tmpdir(),'azpr-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(join(ROOT,'src/prompts'),join(dir,'prompts'),{recursive:true});
  const settings=JSON.parse(await readFile(join(ROOT,'config/settings.example.json'),'utf8'));
  Object.assign(settings.models.review,{functional:'fixture/review-functional',risk:'fixture/review-risk',verifier:'fixture/review-verifier'});
  Object.assign(settings.models.deep,{functional:'fixture/deep-functional',risk:'fixture/deep-risk',verifier:'fixture/deep-verifier'});
  if(opts.settings) opts.settings(settings);
  await writeFile(join(dir,'settings.json'), opts.raw ?? JSON.stringify(settings));
  const cfg={model:'original/developer-choice',small_model:'original/helper',default_agent:'build',subagent_depth:1,
    permission:{edit:'allow',bash:'ask',task:{'*':'allow',restricted:'deny'},skill:{'*':'ask'},ado_repo_pull_request:'ask'},
    mcp:{ado:{type:'remote',url:'https://example.invalid/existing'}},provider:{original:{options:{baseURL:'https://provider.invalid'}}},
    agent:{build:{model:'original/build-user-choice',prompt:'Original build',permission:{edit:'allow'}},plan:{model:'original/plan-user-choice',prompt:'Original plan',permission:{edit:'deny'}},
      title:{model:'original/title'},summary:{model:'original/summary'},compaction:{model:'original/compaction'},teamHelper:{mode:'subagent',model:'original/team'}},
    command:{existing:{template:'Original command',agent:'build'}}};
  for(const name of ['pr-check','pr-review','pr-deep','pr-stop','pr-comment']) {
    cfg.command[name]={description:name,subtask:false,template:`<!-- azpr-optin:${name} -->\n$9007199254740991`};
  }
  if(opts.config) opts.config(cfg);
  const baseline=jclone(cfg);
  let hooks;
  let sequence=0;
  const calls=[], logs=[], toasts=[], sessions=new Map();
  const client={app:{log:async o=>{logs.push(o);return {data:true};}},tui:{showToast:async o=>{toasts.push(o);return {data:true};}},session:{
    create:async o=>{
      calls.push({kind:'create',...o});
      if(opts.createError) return {error:{message:'fixture'}};
      const id=`ses_fixture_${++sequence}`;sessions.set(id,o.body);
      return {data:{id,...o.body}};
    },
    abort:async o=>{calls.push({kind:'abort',...o});return {data:true};},
    prompt:async o=>{
      calls.push({kind:'prompt',...o});
      const role=o.body.agent, spec=ROLES[role], id=o.path.id, model=o.body.model;
      if (o.body.noReply) {
        await hooks['chat.message']({sessionID:id,agent:role,model},{message:{agent:role,model},parts:jclone(o.body.parts)});
        if(opts.duringDisplay) await opts.duringDisplay({hooks,role,id,model});
        return {data:{info:{role:'user'},parts:o.body.parts}};
      }
      const packet=JSON.parse(o.body.parts[0].text);
      if(opts.beforePrompt) await opts.beforePrompt({hooks,role,id,model,packet,o,calls,cfg,dir});
      if(!opts.skipMessageHook) await hooks['chat.message']({sessionID:id,agent:role,model},{message:{agent:role,model},parts:jclone(o.body.parts)});
      // Pinned llm/request.ts combines the agent and host system text before
      // system.transform, then runs chat.params before provider execution.
      const system={system:[cfg.agent[role].prompt+'\nHOST_SYSTEM_SENTINEL','OTHER_PLUGIN_SYSTEM_SENTINEL']};
      const systemArray=system.system;
      if(opts.beforeSystem)await opts.beforeSystem({hooks,role,id,model,packet,system});
      if(!opts.skipSystemHook&&hooks['experimental.chat.system.transform'])await hooks['experimental.chat.system.transform']({sessionID:id,model:{providerID:model.providerID,id:model.modelID}},system);
      assert.equal(system.system,systemArray,'The host retains the original system array.');
      if(opts.afterSystem)await opts.afterSystem({hooks,role,id,model,packet,system,cfg});
      if(!opts.skipParamsHook) await hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{});
      if(opts.duringPrompt) await opts.duringPrompt({hooks,role,id,model,packet,o,calls,cfg,dir});
      if(!opts.skipAzure && !spec.comment && !['output-status-repair','output-location-repair','output-disposition-repair','output-final-resubmission'].includes(packet.operation)) {
        const tool=opts.readTool ?? 'ado_repo_pull_request'; const callID=`read-${id}`;
        const args = opts.readTool ? {repositoryId:'repo',project:'proj',pullRequestId:123} : {action:'get'};
        await hooks['tool.execute.before']({sessionID:id,tool,callID},{args});
        if(!opts.skipAzureAfter) await hooks['tool.execute.after']({sessionID:id,tool,callID,args},{title:'fixture read',output:'fixture code',metadata:opts.readMetadata ?? {}});
      }
      let result;
      if(packet.operation === 'output-status-repair') result={status:spec.stage==='check'?'READY':'COMPLETE'};
      else if(packet.operation === 'output-location-repair') result={locations:packet.missingLocations.map(({id})=>({id,location:candidate(id).location}))};
      else if(packet.operation === 'output-disposition-repair') result={dispositions:packet.missingDispositionIds.map(id=>({id,status:'MERGED',mergedInto:packet.mergeTargets[0],reason:'Same previously checked root cause and correction.'}))};
      else if(packet.operation === 'output-final-resubmission') result={status:'COMPLETE',...jclone(packet.frozen),
        confirmed:packet.expectedFindingIds.map(id=>({...candidate(id),reason:'Rechecked retained source context.'})),merged:[],rejected:[],needsInfo:[],newFindings:[],report:'Corrected final submission.'};
      else if(spec.comment) {
        let seq=0;
        const invoke=async(tool,args,result,response={})=>{
          const input={sessionID:id,tool,callID:`${id}-comment-${++seq}`,args};
          await hooks['tool.execute.before'](input,{args});
          if(opts.hostDeny===tool) throw new Error('Mock OpenCode host permission denied.');
          calls.push({kind:'tool',tool,args});
          await hooks['tool.execute.after'](input,{output:JSON.stringify(result),metadata:{},...response});
          return seq+100;
        };
        if (!opts.noCommentTools) await invoke('custom_mcp_inspect',{url:packet.target,at:packet.snapshot.head},{source:'fixture code',threads:[]});
        if(spec.stage==='comment-plan'){
          const count=Math.min(opts.planCount ?? 1,packet.maxComments);
          result={status:'READY',comments:packet.findings.slice(0,count).map(f=>({findingId:f.id,severity:f.severity,path:SNAP.files[0],startLine:12,endLine:12,anchor:'fixture code',body:`issue (${f.severity}): ${f.id} fixture defect\n\nTrigger and impact. Suggested fix and test.`})),skipped:packet.findings.slice(count).map(f=>({findingId:f.id,reason:'Duplicate or comment limit reached.'}))};
        } else {
          const posted=[];
          for(const comment of packet.comments){
            if(opts.beforeWrite) await opts.beforeWrite({hooks,role,id,model,packet,invoke,calls});
            if(!opts.skipWrite && !opts.noCommentTools){
              const threadId=await invoke('custom_mcp_annotate',{target:packet.target,text:comment.content,line:comment.startLine},{id:seq+101},opts.writeError?{isError:true}:{});
              if(!opts.writeError) posted.push({findingId:comment.findingId,threadId});
            }
          }
          result={status:opts.writeError?'INCOMPLETE':'DONE',posted};
        }
      }
      else if(spec.stage==='check') result={status:'READY',snapshot:{...jclone(SNAP),scope:'cumulative'},sourceAccess:{diff:'fixture'},requirements:'fixture requirement',report:'SOURCE REPORT'};
      else if(role.endsWith('-verifier')) result={status:'COMPLETE',snapshot:jclone(SNAP),currentHead:SNAP.head,currentBase:SNAP.base,dispositions:packet.reviews.flatMap(r=>r.findings).map(f=>({id:f.id,status:'CONFIRMED',reason:'verified fixture evidence',verifiedFinding:jclone(f)})),report:'FINAL_MARKDOWN_REPORT_SENTINEL'};
      else {
        const prefix=spec.prefix;
        result={status:'COMPLETE',snapshot:jclone(SNAP),coverage:{files:[...SNAP.files],gaps:[]},findings:[candidate(`${prefix}-1`)],report:`PRIVATE_INITIAL_REPORT_${prefix}`};
      }
      if(opts.result) result=await opts.result({result,role,packet,id,calls});
      const info={role:'assistant',finish:'stop',id:`msg_${sequence}`,sessionID:id,agent:role,modelID:model.modelID,providerID:model.providerID};
      if(opts.responseError) info.error={name:'APIError'};
      const answer={info,parts:[{type:'text',text:opts.invalidJSON?'bad envelope':JSON.stringify(result)}]};
      return opts.answer ? opts.answer({answer,result,role,o}) : {data:answer};
    }
  }};
  client.provider = { list: async () => ({ data: { connected: ['fixture'], all: [{ id: 'fixture', models: Object.fromEntries(Object.values(settings.models.review).concat(Object.values(settings.models.deep)).filter(Boolean).map(id => { const modelID = id.split('/')[1]; return [modelID, { id: modelID, capabilities: {toolcall: true} }]; })) }] } }) };
  client.mcp = { status: async () => ({ data: { fixture: { status: 'connected' } } }) };
  if(opts.client) opts.client(client,calls);
  hooks=await createAzurePrReviewPlugin({client,directory:dir},dir);
  await hooks.config(cfg);
  const command=async (name='pr-review',args='https://dev.azure.com/org/proj/_git/repo/pullrequest/123',origin='ses_original')=>{
    const out={parts:[{type:'text',text:'placeholder'}]};
    await hooks['command.execute.before']({command:name,sessionID:origin,arguments:args},out);
    return out.parts[0]?.text;
  };
  const prompts=()=>calls.filter(c=>c.kind==='prompt' && !c.body.noReply);
  return {hooks,cfg,baseline,settings,dir,client,calls,logs,toasts,sessions,command,prompts};
}

for(const shellToolPermission of ['deny','ask']) for(const mode of MODES) for(const tool of ['bash','edit','write','apply_patch','skill','webfetch','websearch']) test(`private native tool denied before execution: ${shellToolPermission}/${mode}/${tool}`,async t=>{
  const f=await fixture(t,{settings:s=>{s.shellToolPermission=shellToolPermission;s.debug={enabled:true,directory:'.azpr-debug'};},duringPrompt:async({hooks,role,id})=>{
    assert.equal(f.cfg.agent[role].permission.bash,shellToolPermission);
    await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool,callID:'blocked-private-call'},
      {args:{command:'PRIVATE_COMMAND_MUST_NOT_EXECUTE'}}),/Native tool.*denied/);
  }});
  const out=await f.command(mode==='deep'?'pr-deep':'pr-review');
  assert.match(out,/] COMPLETE/);assert.match(out,/Native tool notice/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  for(const stage of JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages){
    assert.equal(stage.blockedNativeToolCalls,1);assert.deepEqual(stage.blockedNativeTools,[tool]);
    assert.equal(stage.completedTools,1);assert.equal(stage.modelRequests,1);
    assert.doesNotMatch(JSON.stringify(stage),/PRIVATE_COMMAND|blocked-private-call/);
  }
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
});

for(const shellToolPermission of ['deny','ask']) test(`hidden native-tool submissions stop at two distinct attempts and revoke the run (${shellToolPermission})`,async t=>{
  let verifierID;
  const f=await fixture(t,{settings:s=>{s.shellToolPermission=shellToolPermission;s.debug={enabled:true,directory:'.azpr-debug'};},duringPrompt:async({hooks,role,id,model})=>{
    if(!role.endsWith('-verifier'))return;verifierID=id;
    const input={sessionID:id,tool:'invalid',callID:'first'};
    for(let n=0;n<2;n++)await assert.rejects(hooks['tool.execute.before'](input,{args:{tool:'bash',error:'PRIVATE_REJECTED_ARGS'}}),/Native tool.*denied/);
    await assert.rejects(hooks['tool.execute.before']({...input,callID:'second'},{args:{tool:'write'}}),/2\/2/);
    await assert.rejects(hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{}),/authorization/);
  }});
  const out=await f.command();assert.match(out,/] INCOMPLETE/);assert.match(out,/blocked-native-tools=2/);
  assert.doesNotMatch(out,/PRIVATE_REJECTED_ARGS/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages.at(-1);
  assert.equal(stage.blockedNativeToolCalls,2);assert.equal(stage.completedTools,0);
  assert.deepEqual(stage.blockedNativeTools,['bash','write']);
  await assert.rejects(f.hooks['tool.execute.before']({sessionID:verifierID,tool:'custom_read',callID:'late'},{args:{}}),/expired/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});

test('tool terminal events settle error diagnostics without adding successful evidence or leaking content',async t=>{
  const f=await fixture(t,{settings:s=>s.debug={enabled:true,directory:'.azpr-debug'},duringPrompt:async({hooks,role,id})=>{
    if(!role.endsWith('-verifier'))return;
    const input={sessionID:id,tool:'arbitrary_read',callID:'private-event-call'};
    await hooks['tool.execute.before'](input,{args:{secret:'PRIVATE_ARGUMENT'}});
    const stamp=Date.now();
    const part={type:'tool',sessionID:id,callID:input.callID,tool:input.tool,state:{status:'error',error:'PRIVATE_ERROR',time:{start:stamp,end:stamp}}};
    const emit=p=>hooks.event({event:{type:'message.part.updated',properties:{part:p}}});
    await emit({...part,sessionID:'unrelated'});await emit({...part,tool:'wrong_tool'});
    await emit({...part,callID:'unknown'});await emit({...part,state:{status:'running'}});
    await emit(part);await emit(part);
    await emit({...part,state:{...part.state,status:'completed',output:'PRIVATE_OUTPUT'}});
  }});
  const out=await f.command();assert.match(out,/] COMPLETE/);assert.match(out,/observed-tool-errors=1/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages.at(-1);
  assert.equal(stage.toolFailures,1);assert.equal(stage.completedTools,1);
  assert.equal(stage.timing.unfinishedTools,0);assert.notEqual(stage.timing.toolActiveMs,null);
  assert.equal(stage.timing.toolCalls.find(c=>c.tool==='arbitrary_read').outcome,'error');
  assert.doesNotMatch(JSON.stringify(stage),/PRIVATE_|private-event-call/);
  await f.hooks.event({event:{type:'message.part.updated',properties:{part:{type:'tool',sessionID:stage.sessionID,tool:'arbitrary_read',callID:'private-event-call',state:{status:'completed'}}}}});
  assert.equal(JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages.at(-1).toolFailures,1);
});

for(const mode of MODES) for(const native of [true,false]) test(`role instructions agree with category schemas and bounded reads: ${mode}/${native}`,async t=>{
  const f=await fixture(t,{settings:s=>s.structuredOutput=native});
  for(const stage of ['check','functional','risk','verifier','comment-plan','comment-publish']){
    const prompt=f.cfg.agent[roleFor(mode,stage)].prompt;
    assert.match(prompt,/at most one unknown-cause read retry[\s\S]*?entire\s+stage|at most one unknown-cause read retry[\s\S]*?stage/);
    assert.match(prompt,/idempotent read/);assert.match(prompt,/original\s+deadline/);
    assert.match(prompt,/success(?:ful repeat)? does\s+not establish a transient cause/);
    assert.match(prompt,/not a plugin-managed MCP\s+retry mechanism|not a plugin-managed MCP retry mechanism/);
  }
  const prompt=f.cfg.agent[roleFor(mode,'verifier')].prompt;
  assert.doesNotMatch(prompt,/every finding object uses only these seven keys/);
  assert.match(prompt,/confirmed final rows also include reason/);
  const fields=stageFormat(roleFor(mode,'verifier')).schema.properties;
  assert.equal(fields.confirmed.items.required.length,8);assert.ok(fields.confirmed.items.required.includes('reason'));
  assert.equal(fields.newFindings.items.required.length,7);assert.ok(!fields.newFindings.items.required.includes('reason'));
  assert.match(prompt,/static predictions/);assert.match(prompt,/assertion order/);
  assert.match(prompt,/negative claims bounded to inspected paths/);assert.match(prompt,/Quote source exactly/);
  assert.match(prompt,/high: substantial security-boundary/);assert.match(prompt,/same first read\s+round/);
});

for(const mode of MODES) for(const native of [true,false]) test(`submission checks reach both initials and final output without another stage: ${mode}/${native}`,async t=>{
  const f=await fixture(t,{settings:s=>s.structuredOutput=native});
  for(const stage of ['functional','risk','verifier']) {
    const prompt=f.cfg.agent[roleFor(mode,stage)].prompt;
    assert.equal((prompt.match(/^## Submission check$/gm)||[]).length,1);
    assert.match(prompt,/expected state, resulting state and their difference/);
    assert.match(prompt,/first failing assertion/);
    assert.match(prompt,/later state differences.*static predictions/s);
    assert.match(prompt,/inspected paths, functions and versions/);
    assert.match(prompt,/unknown deployment impact/);
    assert.match(prompt,/authorization keyword/);
    assert.match(prompt,/already-read evidence.*existing fields/s);
  }
  const final=f.cfg.agent[roleFor(mode,'verifier')].prompt;
  assert.match(final,/Apply the shared submission check to the final localized/);
  assert.match(final,/Explain a changed severity.*decisive.*scope.*recovery/s);
  assert.match(final,/Correct locations in the finding once/);
  for(const stage of ['check','comment-plan','comment-publish'])
    assert.doesNotMatch(f.cfg.agent[roleFor(mode,stage)].prompt,/^## Submission check$/m);
  assert.match(await f.command(`pr-${mode}`),/] COMPLETE/);
  assert.equal(f.prompts().length,3);
  assert.equal(new Set(f.prompts().map(p=>p.path.id)).size,3);
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
  assert.deepEqual(f.cfg.mcp,f.baseline.mcp);
});

for(const shellToolPermission of ['deny','ask']) test(`native tool denial also covers check, comment preview and explicit publisher grants (${shellToolPermission})`,async t=>{
  const f=await fixture(t,{settings:s=>{s.shellToolPermission=shellToolPermission;s.comments.enabled=true;},duringPrompt:async({hooks,role,id})=>{
    if(!['check','comment-plan','comment-publish'].includes(ROLES[role].stage))return;
    await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'bash',callID:'blocked'},{args:{}}),/Native tool denied/);
  }});
  assert.match(await f.command('pr-check'),/Native tool notice/);
  const id=reviewId(await f.command());
  assert.match(await f.command('pr-comment',id),/Native tool notice/);
  assert.match(await f.command('pr-comment',id+' --publish'),/Native tool notice/);
  assert.equal(f.calls.filter(c=>c.kind==='tool'&&c.tool==='custom_mcp_annotate').length,1);
});



test('valid category output needs no correction and comment preview uses its corrected evidence',async t=>{
  const f=await fixture(t,{settings:s=>{s.outputRetries=1;s.comments.enabled=true;},result:({role,result})=>{
    if(!role.endsWith('-verifier'))return result;
    const flat=categories(result);flat.confirmed[0].severity='medium';return flat;
  }});
  const out=await f.command();assert.match(out,/] COMPLETE/);assert.equal(f.prompts().length,3);
  const preview=await f.command('pr-comment',reviewId(out));assert.match(preview,/] PREVIEW/);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).findings[0].severity,'medium');
});



for(const mode of MODES) for(const native of [true,false]) test(`lightweight checker: isolated readiness policy (${mode}, native=${native})`,async t=>{
  const f=await fixture(t,{settings:s=>s.structuredOutput=native});
  const checker=f.cfg.agent[roleFor(mode,'check')];
  assert.ok(checker.prompt.length<11000,'Readiness plus shared output-reading policy must not inherit the full finding-review policy.');
  assert.doesNotMatch(checker.prompt,/## Finding quality|## Output\n|verifiedFinding|pendingLocations|numeric self-confidence/);
  assert.match(checker.prompt,/Readiness decision path/);
  assert.match(checker.prompt,/Treat.*untrusted/s);
  assert.match(checker.prompt,/userContext.*literal/s);
  assert.match(checker.prompt,/Task, Skill, other models, shell, public web or editing tools/);
  assert.match(checker.prompt,/Local files are\s+prohibited except for the same-session host-saved tool output/);
  assert.match(checker.prompt,/Do not comment, vote, approve, merge/);
  assert.match(checker.prompt,/complete changed-file list/);
  assert.match(checker.prompt,/before and after/);
  assert.match(checker.prompt,/NOT_READY/);
  assert.equal((checker.prompt.match(/# Output transport/g)||[]).length,1);
  assert.equal(checker.model,f.cfg.agent[roleFor(mode,'risk')].model);
  assert.equal(Object.hasOwn(checker,'steps'),false);
  for(const stage of ['functional','risk','verifier']) assert.match(f.cfg.agent[roleFor(mode,stage)].prompt,/## Finding quality/);
  assert.deepEqual(checker.permission,PRIVATE_PERMISSIONS);
  assert.deepEqual(f.cfg.mcp,f.baseline.mcp);
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
});

for(const failing of [false,true]) test(`lightweight checker: input and remaining-budget diagnostics survive failure=${failing}`,async t=>{
  const f=await fixture(t,{settings:s=>{s.debug={enabled:true,directory:'.azpr-debug'};s.runTimeoutSeconds=1200;},
    result:({role,result})=>failing&&role.endsWith('-check')?{...result,snapshot:{}}:result});
  const out=await f.command('pr-check');
  assert.match(out,failing?/] INCOMPLETE/:/] READY/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages[0];
  const request=JSON.parse(await readFile(join(dir,'01-azpr-review-check.request.json'),'utf8'));
  assert.equal(stage.inputCharacters,JSON.stringify(request.payload).length);
  assert.equal(stage.instructionCharacters,request.instructions.length);
  assert.equal(Object.hasOwn(stage,'stepLimit'),false);
  assert.equal(Object.hasOwn(request,'stepLimit'),false);
  assert.ok(stage.remainingRunMsAtStart>0&&stage.remainingRunMsAtStart<=f.settings.runTimeoutSeconds*1000);
  assert.ok(stage.remainingRunMsAtEnd>=0&&stage.remainingRunMsAtEnd<=stage.remainingRunMsAtStart);
  assert.equal(stage.modelRequests,1);assert.equal(f.prompts().length,1);
  assert.equal(stage.status,failing?'FAILED':'READY');
});

test('receipt and full use identical stage requests, schemas, and role instructions', async t => {
  const receipt=await fixture(t), full=await fixture(t,{settings:s=>s.returnReport='full'});
  await receipt.command('pr-deep'); await full.command('pr-deep');
  const bodies=f=>f.prompts().map(p=>p.body).sort((a,b)=>a.agent.localeCompare(b.agent));
  assert.deepEqual(bodies(receipt),bodies(full));
  for(const role of Object.keys(ROLES)) assert.equal(receipt.cfg.agent[role].prompt,full.cfg.agent[role].prompt);
});
for(const native of [true,false]) test(`timing diagnostics preserve requests and use only observed metadata (native=${native})`,async t=>{
  const settings=s=>s.structuredOutput=native;
  const plain=await fixture(t,{settings}),timed=await fixture(t,{settings:s=>{settings(s);s.debug={enabled:true,directory:'.azpr-debug'};}});
  assert.match(await plain.command(),/] COMPLETE/);const out=await timed.command();assert.match(out,/] COMPLETE/);
  const bodies=f=>f.prompts().map(p=>p.body).sort((a,b)=>a.agent.localeCompare(b.agent));
  assert.deepEqual(bodies(timed),bodies(plain));assert.equal(timed.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const result=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  for(const key of ['renderMs','displayMs','cleanupMs']) assert.ok(Number.isFinite(result.timing[key])&&result.timing[key]>=0);
  for(const stage of result.stages){
    const timing=stage.timing;
    assert.equal(timing.responseOutcome,'returned');assert.equal(timing.unfinishedTools,0);
    assert.equal(timing.toolCalls.length,1);assert.equal(timing.modelRounds.length,stage.modelRequests);
    assert.equal(timing.toolCalls[0].tool,'ado_repo_pull_request');
    assert.ok(timing.lastToolToResponseMs>=0);assert.ok(timing.promptMs>=timing.toolActiveMs);
    assert.ok(timing.responseProcessingMs>=0);
    assert.doesNotMatch(JSON.stringify(timing),/ses_fixture|repositoryId|arguments|fixture code|PRIVATE_INITIAL_REPORT/);
  }
});
test('timing diagnostics expose a missing tool after-hook without treating it as zero latency',async t=>{
  const f=await fixture(t,{skipAzureAfter:true,settings:s=>s.debug={enabled:true,directory:'.azpr-debug'}});
  const out=await f.command('pr-check');assert.match(out,/] READY/); // Timing gaps do not change validation.
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages[0];
  assert.equal(stage.timing.responseOutcome,'returned');assert.equal(stage.timing.unfinishedTools,1);
  assert.equal(stage.timing.toolActiveMs,null);assert.equal(stage.timing.lastToolToResponseMs,null);
  assert.equal(stage.timing.modelRounds[0].outsideToolMs,null);
});
test('timing diagnostics stop at cancellation and cannot be completed by a late tool hook',async t=>{
  let f;
  f=await fixture(t,{settings:s=>s.debug={enabled:true,directory:'.azpr-debug'},duringPrompt:async({hooks,id})=>{
    await hooks['tool.execute.before']({sessionID:id,tool:'custom_read',callID:'pending-read'},{args:{private:'DO_NOT_LOG'}});
    await f.command('pr-stop','');
    await hooks['tool.execute.after']({sessionID:id,tool:'custom_read',callID:'pending-read'},{output:'DO_NOT_LOG'});
  }});
  const out=await f.command('pr-check');assert.match(out,/] CANCELLED/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages[0];
  assert.equal(stage.timing.responseOutcome,'interrupted');assert.equal(stage.timing.unfinishedTools,1);
  assert.equal(stage.timing.toolCalls[0].endMs,null);
  assert.doesNotMatch(JSON.stringify(stage.timing),/DO_NOT_LOG|pending-read/);
});
test('receipts explain readiness and do not instruct the caller to resume reviewers',async t=>{
  const f=await fixture(t),out=await f.command();
  assert.match(out,/COMPLETE means a usable structured verifier result was returned/);
  assert.doesNotMatch(out,/check READY|azpr-review-check/);
  assert.match(out,/human.*read-only.*navigation/i);
  assert.match(out,/Do not use Task or send a prompt/);
  assert.match(out,/If navigation is unavailable, present this receipt/);
  assert.doesNotMatch(out,/Open it using child-session navigation/);
  assert.doesNotMatch(out,/FINAL_MARKDOWN_REPORT_SENTINEL|PRIVATE_INITIAL_REPORT/);
  assert.equal(f.prompts().length,3);
});
for(const mode of ['review','deep']) test(`${mode} starts independent discovery without a checker handoff`,async t=>{
  const f=await fixture(t);
  await f.command(`pr-${mode}`);
  for(const p of f.prompts()) {
    const packet=JSON.parse(p.body.parts[0].text);
    assert.deepEqual(packet.urlIdentity,{organization:'org',project:'proj',repository:'repo'});
    assert.equal(packet.sourceAccess,undefined);
    if(!p.body.agent.endsWith('-verifier')) {
      assert.equal(packet.snapshot,undefined);assert.equal(packet.reviews,undefined);
    }
    const prompt=f.cfg.agent[p.body.agent].prompt;
    assert.match(prompt,/no preliminary check/);
    assert.match(prompt,/not proof that your own reads succeeded/);
    assert.match(prompt,/Do not repeat an identical failed request/);
    assert.match(prompt,/includeChangedFiles/);
  }
  assert.deepEqual(f.cfg.mcp,f.baseline.mcp);
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
  assert.equal(f.prompts().length,3);
});
test('native structured results work for review, comment preview, and publication without extra model calls', async t => {
  const f=await fixture(t,{settings:enableComments,answer:({answer,result,o})=>{
    assert.equal(o.body.format.type,'json_schema'); assert.equal(o.body.format.retryCount,0);
    return {data:{...answer,info:{...answer.info,structured:result},parts:[]}};
  }});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  assert.match(await f.command('pr-comment',id+' --publish'),/] MODEL_REPORTED_POSTED/);
  assert.equal(f.prompts().length,5);
});
test('text-only compatibility is explicit and never selects a fallback model', async t => {
  const f=await fixture(t,{settings:s=>s.structuredOutput=false,answer:({answer})=>({data:{...answer,parts:[{type:'text',text:`Result:\n\`\`\`json\n${answer.parts[0].text}\n\`\`\``}]}})});
  assert.match(await f.command(),/] COMPLETE/);
  assert.equal(f.prompts().length,3);
  assert.ok(f.prompts().every(p=>p.body.format===undefined));
  assert.match(f.cfg.agent['azpr-review-check'].prompt,/# Output transport\nReturn one valid JSON object/);
});

for(const mode of ['review','deep']) for(const native of [true,false]) test(`tolerance: absent initial locations advance with an explicit verifier obligation (${mode}, native=${native})`,async t=>{
  let raw;
  const f=await fixture(t,{settings:s=>{s.outputRetries=1;s.structuredOutput=native;s.debug={enabled:true,directory:'.azpr-debug'};},
    result:({result,role,packet})=>{
      if(role.endsWith('-functional')){delete result.findings[0].location;raw=jclone(result);}
      if(role.endsWith('-verifier')) {
        assert.deepEqual(packet.pendingLocations,['F-1']);
        for(const key of Object.keys(raw)) assert.deepEqual(packet.reviews[0][key],raw[key]);
        result.dispositions[0].verifiedFinding.location=candidate('F-1').location;
      }
      return result;
    },answer:({answer,result})=>({data:native?{...answer,info:{...answer.info,structured:result},parts:[]}:answer})});
  const out=await f.command(`pr-${mode}`);
  assert.match(out,/] COMPLETE/);assert.match(out,/pending-locations=1/);assert.match(out,/Pending location notice:/);
  assert.doesNotMatch(out,/output-retry=/);assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const record=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages.find(s=>s.role.endsWith('-functional'));
  assert.deepEqual(record.pendingLocations,['F-1']);for(const key of Object.keys(raw)) assert.deepEqual(record.result[key],raw[key]);
});
test('an unlocated initial candidate can be explicitly unresolved without becoming a comment',async t=>{
  const f=await fixture(t,{settings:enableComments,result:({role,result})=>{
    if(role.endsWith('-functional'))delete result.findings[0].location;
    if(role.endsWith('-verifier'))result.dispositions[0]={id:'F-1',status:'NEEDS_INFO',reason:'The exact source location could not be established; do not publish this candidate.'};
    return result;
  }});
  const id=reviewId(await f.command());assert.match(await f.command('pr-comment',id),/] PREVIEW/);
  const packet=JSON.parse(f.prompts().find(p=>p.body.agent.endsWith('-comment-plan')).body.parts[0].text);
  assert.deepEqual(packet.findings.map(f=>f.id),['R-1']);
});


for(const mode of ['review','deep']) for(const slot of ['risk','verifier']) test(`audited trailing-comma tolerance retains the raw ${mode}/${slot} output without another request`,async t=>{
  let raw;
  const f=await fixture(t,{settings:s=>{s.structuredOutput=false;s.outputRetries=1;s.debug={enabled:true,directory:'.azpr-debug'};},
    answer:({answer,role,result})=>{
      if(role.endsWith('-'+slot)) {
        const json=JSON.stringify(result);raw=json.slice(0,-1)+',}';
        if(mode==='deep')raw='```json\n'+raw+'\n```';
        return {data:{...answer,info:{...answer.info,finish:'stop'},parts:[{type:'text',text:raw}]}};
      }
      return {data:answer};
    }});
  const out=await f.command('pr-'+mode);
  assert.match(out,/] COMPLETE/);assert.match(out,/output-format-corrections=1/);
  assert.match(out,/syntax was normalized locally/);assert.doesNotMatch(out,/output-retry=/);
  assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const files=await readdir(dir);
  const saved=JSON.parse(await readFile(join(dir,files.find(n=>n.endsWith('-'+slot+'.response.json'))),'utf8'));
  assert.equal(saved.text,raw);
  const record=JSON.parse(await readFile(join(dir,files.find(n=>n.endsWith('-'+slot+'.result.json'))),'utf8'));
  assert.equal(record.outputFormatCorrections.length,1);
  assert.equal(record.outputFormatCorrections[0].action,'remove-trailing-comma');
  assert.equal(record.attempt,1);assert.equal(record.retryOf,undefined);
  const finalPacket=JSON.parse(f.prompts().find(p=>p.body.agent.endsWith('-verifier')).body.parts[0].text);
  assert.deepEqual(finalPacket.reviews.flatMap(r=>r.findings),[candidate('F-1'),candidate('R-1')]);
});



for(const native of [true,false]) test(`normal role prompts contain only their configured output transport (native=${native})`,async t=>{
  const f=await fixture(t,{settings:s=>s.structuredOutput=native});
  for(const role of Object.keys(ROLES)) {
    const prompt=f.cfg.agent[role].prompt;
    assert.equal(prompt.match(/# Output transport/g)?.length,1);
    if(native) {
      assert.match(prompt,/submit the required envelope once through the host StructuredOutput tool/);
      assert.doesNotMatch(prompt,/optionally in a single JSON code fence|This overrides instructions/);
    } else {
      assert.match(prompt, ['initial','final'].includes(ROLES[role].format) ? /# Output transport\nPrefer one JSON object/ : /# Output transport\nReturn one valid JSON object, optionally in a single JSON code fence/);
      assert.doesNotMatch(prompt,/host StructuredOutput tool/);
    }
  }
});


// v1.18.31/1.18.32 llm.ts routes failed tool arguments to the built-in
// `invalid` tool; session/tools.ts dispatches it through ordinary tool hooks.
// Successful native StructuredOutput calls bypass those hooks.
async function invalidSubmission(hooks, id, callID, tool = 'StructuredOutput') {
  const input={sessionID:id,tool:'invalid',callID};
  const args={tool,error:'JSON parsing failed: {"currentHead": 11abcdef, "report": "PRIVATE_ERROR_SENTINEL"}'};
  await hooks['tool.execute.before'](input,{args});
  await hooks['tool.execute.after']({...input,args},{title:'Invalid',output:args.error,metadata:{}});
}
for(const mode of ['review','deep']) test(`repeated invalid structured submissions stop the host loop (${mode})`,async t=>{
  let nextRequestAllowed=false, finished;
  const observed=new Promise(r=>finished=r);
  const f=await fixture(t,{settings:s=>{s.outputRetries=1;s.debug={enabled:true,directory:'.azpr-debug'};},
    duringPrompt:async({hooks,role,id,model})=>{
      if(!role.endsWith('-verifier'))return;
      const read={sessionID:id,tool:'arbitrary_mcp_read',callID:'real-read'};
      await hooks['tool.execute.before'](read,{args:{}});
      await hooks['tool.execute.after']({...read,args:{}},{title:'Source',output:'source',metadata:{}});
      // The host may catch a hook error as a tool error. It must still be
      // impossible to start a third model turn after the second rejection.
      try {
        await invalidSubmission(hooks,id,'invalid-1');
        await invalidSubmission(hooks,id,'invalid-1'); // Duplicate hook delivery.
        await invalidSubmission(hooks,id,'invalid-2');
      } catch { /* Emulate host tool-error handling. */ }
      try {
        await hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{});
        nextRequestAllowed=true;
      } catch { /* Expected grant revocation. */ }
      finished();
    }});
  const out=await f.command(mode==='deep'?'pr-deep':'pr-review');await observed;
  assert.match(out,/] INCOMPLETE/);assert.match(out,/StructuredOutput.*2\/2/);
  assert.doesNotMatch(out,/CANCELLED|PRIVATE_ERROR_SENTINEL|output-retry=|FINAL_MARKDOWN_REPORT_SENTINEL/);
  assert.equal(nextRequestAllowed,false);assert.equal(f.prompts().length,3);
  const verifier=f.prompts().find(p=>p.body.agent.endsWith('-verifier'));
  assert.ok(f.calls.some(c=>c.kind==='abort'&&c.path.id===verifier.path.id));
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const saved=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  const stage=saved.stages.find(s=>s.stage==='verifier');
  assert.equal(stage.status,'FAILED');assert.equal(stage.invalidStructuredOutputs,2);
  assert.equal(stage.completedTools,1);assert.match(stage.error,/StructuredOutput.*2\/2/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
  assert.match(await f.command('pr-check'),/] READY/);
});
test('one invalid submission per independent stage can still finish without a plugin retry',async t=>{
  const f=await fixture(t,{settings:s=>{s.outputRetries=0;s.debug={enabled:true,directory:'.azpr-debug'};},
    duringPrompt:({hooks,id})=>invalidSubmission(hooks,id,'invalid-1'),
    answer:({answer,result})=>({data:{...answer,info:{...answer.info,structured:result},parts:[]}})});
  const out=await f.command();assert.match(out,/] COMPLETE/);assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const saved=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  for(const stage of saved.stages){assert.equal(stage.invalidStructuredOutputs,1);assert.equal(stage.completedTools,1);}
});
test('invalid initial submissions revoke both concurrent grants even if the sibling SDK hangs', {timeout:3000},async t=>{
  let started;const ready=new Promise(r=>started=r);
  const f=await fixture(t,{duringPrompt:async({hooks,role,id})=>{
    if(role.endsWith('-functional')){started();await new Promise(()=>{});}
    if(role.endsWith('-risk')){
      await ready;
      await invalidSubmission(hooks,id,'invalid-1');
      await invalidSubmission(hooks,id,'invalid-2');
    }
  }});
  const out=await f.command();
  assert.match(out,/] INCOMPLETE/);assert.match(out,/StructuredOutput.*2\/2/);
  assert.equal(f.prompts().length,2);assert.doesNotMatch(out,/azpr-review-verifier/);
  for(const p of f.prompts().filter(p=>!p.body.agent.endsWith('-check'))){
    assert.ok(f.calls.some(c=>c.kind==='abort'&&c.path.id===p.path.id));
    await assert.rejects(f.hooks['tool.execute.before']({sessionID:p.path.id,tool:'arbitrary_tool',callID:'late'},{args:{}}),/expired/);
  }
  assert.match(await f.command('pr-check'),/] READY/);
});
test('invalid-tool results cannot satisfy the completed-source-call gate for status recovery',async t=>{
  const f=await fixture(t,{skipAzure:true,settings:s=>s.outputRetries=1,
    duringPrompt:({hooks,id})=>invalidSubmission(hooks,id,'invalid-1'),
    result:({result})=>({...result,status:'RREADY'})});
  const out=await f.command('pr-check');
  assert.match(out,/] INCOMPLETE/);assert.doesNotMatch(out,/output-retry=/);assert.equal(f.prompts().length,1);
});
test('the structured-submission guard leaves ordinary chat, unrelated tool errors and text transport alone',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,id})=>{
    for(let n=0;n<3;n++)await invalidSubmission(hooks,id,'bad-mcp-'+n,'custom_mcp_read');
  }});
  for(let n=0;n<3;n++)await invalidSubmission(f.hooks,'ordinary-session','normal-'+n);
  assert.match(await f.command(),/] COMPLETE/);
  const textOnly=await fixture(t,{settings:s=>s.structuredOutput=false,duringPrompt:async({hooks,id})=>{
    for(let n=0;n<3;n++)await invalidSubmission(hooks,id,'text-'+n);
  }});
  assert.match(await textOnly.command(),/] COMPLETE/);
});
for(const publish of [false,true]) test(`invalid structured comment ${publish?'publication':'preview'} stops immediately`,async t=>{
  const f=await fixture(t,{settings:enableComments,result:async({role,result,id})=>{
    if(role.endsWith(publish?'-comment-publish':'-comment-plan'))await invalidSubmission(f.hooks,id,'bad-comment');
    return result;
  }});
  const id=reviewId(await f.command());
  if(publish)assert.match(await f.command('pr-comment',id),/] PREVIEW/);
  const before=f.prompts().length;
  const out=await f.command('pr-comment',id+(publish?' --publish':''));
  assert.match(out,/] INCOMPLETE/);assert.match(out,/StructuredOutput.*1\/1/);
  assert.equal(f.prompts().length,before+1);
  await assert.rejects(f.command('pr-comment',id+' --publish'),publish?/already had a publication attempt/:/Preview first/);
});
test('retry settings are opt-in and capped at one extra submission',async t=>{
  const f=await fixture(t,{settings:s=>delete s.outputRetries});
  assert.equal(validateSettings(f.settings).outputRetries,0);
  for(const outputRetries of [-1,2,99,0.5,'1',true,null])assert.throws(()=>validateSettings({...f.settings,outputRetries}),/outputRetries/);
  for(const outputRetries of [0,1])assert.equal(validateSettings({...f.settings,outputRetries}).outputRetries,outputRetries);
  const schema=JSON.parse(await readFile(join(ROOT,'config/settings.schema.json'),'utf8'));
  const example=JSON.parse(await readFile(join(ROOT,'config/settings.example.json'),'utf8'));
  assert.equal(example.outputRetries,0);assert.equal(schema.properties.outputRetries.default,0);assert.equal(schema.properties.outputRetries.maximum,1);
});
for(const status of ['STALE','CCOMPLETE']) test(`changed final HEAD is not retried (${status})`,async t=>{
  const f=await fixture(t,{settings:s=>s.outputRetries=1,result:({role,result})=>role.endsWith('-verifier')?{...result,status,currentHead:'c'.repeat(40)}:result});
  const out=await f.command();
  assert.match(out,/] STALE/);assert.equal(f.prompts().length,3);
});
for(const publish of [false,true]) test(`comment ${publish?'publication':'preview'} is never retried`,async t=>{
  const f=await fixture(t,{settings:s=>{enableComments(s);s.outputRetries=1;},result:({role,result})=>role.endsWith(publish?'-comment-publish':'-comment-plan')?{...result,status:publish?'DDONE':'RREADY'}:result});
  const id=reviewId(await f.command());
  if(publish)assert.match(await f.command('pr-comment',id),/] PREVIEW/);
  const before=f.prompts().length;
  assert.match(await f.command('pr-comment',id+(publish?' --publish':'')),/] INCOMPLETE/);
  assert.equal(f.prompts().length,before+1);
});
for(const mode of ['receipt','full']) test(`unstructured ${mode} source output remains readable with limitations and no model retry`, async t => {
  const f=await fixture(t,{invalidJSON:true,settings:s=>s.returnReport=mode});
  const out=await f.command('pr-deep');
  assert.match(out,/] PARTIAL/); assert.match(out,/bad envelope/); assert.match(out,/unstructured/);
  assert.match(out,/session=ses_fixture_1/); assert.match(out,/Publication unavailable/);
  assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('debug captures every stage, final report, and failures in both return modes', async t => {
  for(const returnReport of ['receipt','full']) {
    const f=await fixture(t,{settings:s=>{s.debug={enabled:true,directory:'.azpr-debug'};s.returnReport=returnReport;s.outputLanguage='zh-TW';}});
    const out=await f.command('pr-deep');
    const path=/Private debug directory: ([^\n]+)/.exec(out)[1];
    assert.ok(path.startsWith(join(f.dir,'.azpr-debug')));
    const names=await readdir(path);
    assert.equal(names.filter(n=>n.endsWith('.request.json')).length,3);
    assert.equal(names.filter(n=>n.endsWith('.response.json')).length,3);
    assert.equal(names.filter(n=>n.endsWith('.result.json')).length,3);
    const result=JSON.parse(await readFile(join(path,'result.json'),'utf8'));
    assert.equal(result.status,'COMPLETE'); assert.equal(result.stages.length,3);
    assert.ok(result.stages.every(s=>s.startedAt && s.endedAt && s.sessionID && s.model));
    assert.match(await readFile(join(path,'report.md'),'utf8'),/AI 審查來源/);
    assert.match(await readFile(join(path,'report.md'),'utf8'),/fixture\/deep-risk/);
    assert.match(await readFile(join(path,names.find(n=>n.endsWith('-azpr-deep-functional.response.json'))),'utf8'),/PRIVATE_INITIAL_REPORT_F/);
    assert.equal(JSON.parse(await readFile(join(path,'run.json'),'utf8')).profile,'deep');
  }
  const bad=await fixture(t,{invalidJSON:true,settings:s=>s.debug={enabled:true,directory:'.azpr-debug'}});
  const path=/Private debug directory: ([^\n]+)/.exec(await bad.command('pr-check'))[1];
  const response=JSON.parse(await readFile(join(path,'01-azpr-review-check.response.json'),'utf8'));
  assert.equal(response.text,'bad envelope');
  const result=JSON.parse(await readFile(join(path,'01-azpr-review-check.result.json'),'utf8'));
  assert.equal(result.status,'FAILED'); assert.match(result.error,/required JSON/);
});
test('transport errors recover the last visible session message using read-only SDK calls', async t => {
  const f=await fixture(t,{settings:s=>s.debug={enabled:true,directory:'.azpr-debug'},answer:()=>({error:{name:'APIError',message:'Connection ended'}}),client:(client,calls)=>{
    client.session.messages=async o=>{calls.push({kind:'messages',...o});return {data:[{info:{role:'assistant',id:'msg_last',error:{name:'MessageOutputLengthError'},finish:'length'},parts:[{type:'text',text:'partial last response'},{type:'reasoning',text:'DO_NOT_SAVE_REASONING'}]}]};};
  }});
  const out=await f.command('pr-check'), path=/Private debug directory: ([^\n]+)/.exec(out)[1];
  assert.match(out,/] INCOMPLETE/); assert.equal(f.prompts().length,1);
  const reads=f.calls.filter(c=>c.kind==='messages');assert.equal(reads.length,1);assert.equal(reads[0].path.id,'ses_fixture_1');assert.equal(reads[0].query.limit,10);
  const last=await readFile(join(path,'01-azpr-review-check.last-message.json'),'utf8');
  assert.match(last,/partial last response/);assert.doesNotMatch(last,/DO_NOT_SAVE_REASONING/);
  assert.match(await readFile(join(path,'01-azpr-review-check.transport-error.json'),'utf8'),/Connection ended/);
});
test('full provenance is derived from used stages and exposes merges without private initial reports', async t => {
  const f=await fixture(t,{settings:s=>{s.returnReport='full';s.outputLanguage='zh-TW';},result:({role,result})=>role.endsWith('-verifier')?{...result,dispositions:[{id:'F-1',status:'CONFIRMED',reason:'checked',verifiedFinding:candidate('F-1')},{id:'R-1',status:'MERGED',mergedInto:'F-1',reason:'duplicate'}]}:result});
  const out=await f.command();
  assert.match(out,/AI 審查來源 \(review\)/);assert.match(out,/功能初審.*fixture\/review-functional.*1/);assert.match(out,/最終驗證.*fixture\/review-verifier/);
  assert.match(out,/R-1 \| MERGED \| F-1/);assert.match(out,/不是多數決/);assert.match(out,/不代表人工核准/);
  assert.doesNotMatch(out,/fixture\/deep-|PRIVATE_INITIAL_REPORT/);
  assert.match(out,/outputLanguage=zh-TW/);assert.doesNotMatch(out,/Present only this status receipt in English/);
});
test('saved preview and posted content include the same runtime AI/model attribution', async t => {
  const f=await fixture(t,{settings:s=>{enableComments(s);s.outputLanguage='zh-TW';}});
  const id=reviewId(await f.command('pr-deep')), preview=await f.command('pr-comment',id);
  assert.match(preview,/AI 輔助審查 \(deep\)/);assert.match(preview,/不代表人工核准/);
  for(const id of Object.values(f.settings.models.deep)) assert.ok(preview.includes(id));
  assert.doesNotMatch(preview,/fixture\/review-/);
  assert.match(preview,/留言整理／發佈/);
  await f.command('pr-comment',id+' --publish');
  const saved=JSON.parse(f.prompts().at(-1).body.parts[0].text).comments[0].content;
  assert.ok(preview.includes(saved));assert.equal(writes(f)[0].args.text,saved);
});
test('invalid debug and structured-output settings fail before model invocation', async t => {
  const f=await fixture(t);
  for(const debug of [null,true,{enabled:'true'},{enabled:true,directory:'~/debug'},{enabled:true,directory:'bad\npath'},{enabled:true,unknown:true}]) assert.throws(()=>validateSettings({...f.settings,debug}),/debug/);
  for(const structuredOutput of [null,'yes',1]) assert.throws(()=>validateSettings({...f.settings,structuredOutput}),/structuredOutput/);
  const legacy={...f.settings}; delete legacy.debug; delete legacy.structuredOutput;
  assert.equal(validateSettings(legacy).debug.enabled,false);assert.equal(validateSettings(legacy).structuredOutput,true);
});
test('debug path failure is visible but does not invalidate a successful review', async t => {
  const f=await fixture(t,{settings:s=>s.debug={enabled:true,directory:'settings.json'}});
  const out=await f.command();
  assert.match(out,/] COMPLETE/);assert.match(out,/Debug warning:/);assert.equal(f.prompts().length,3);
  assert.equal(JSON.parse(await readFile(join(f.dir,'settings.json'),'utf8')).version,2);
});

test('configuration preserves every original model, agent, permission, MCP and command',async t=>{
  const f=await fixture(t);const restored=jclone(f.cfg);for(const name of Object.keys(ROLES)) delete restored.agent[name];
  assert.deepEqual(restored,f.baseline);assert.equal(f.calls.length,0);
});
test('private agents deny native execution while inheriting MCP and resource permissions',async t=>{
  const f=await fixture(t);
  for(const name of Object.keys(ROLES)){
    assert.equal(f.cfg.agent[name].mode,'primary'); assert.equal(f.cfg.agent[name].hidden,true);
    assert.deepEqual(f.cfg.agent[name].permission,PRIVATE_PERMISSIONS);
  }
});
test('shell permission compatibility is explicit, private-role-only and defaults to deny',async t=>{
  const f=await fixture(t),legacy={...f.settings};delete legacy.shellToolPermission;
  assert.equal(validateSettings(legacy).shellToolPermission,'deny');
  for(const shellToolPermission of ['deny','ask']){
    const configured=await fixture(t,{settings:s=>s.shellToolPermission=shellToolPermission});
    const restored=jclone(configured.cfg);
    for(const name of Object.keys(ROLES)){
      assert.deepEqual(restored.agent[name].permission,{...PRIVATE_PERMISSIONS,bash:shellToolPermission});
      delete restored.agent[name];
    }
    assert.deepEqual(restored,configured.baseline);
    const normalized=validateSettings(configured.settings);
    assert.deepEqual({...normalized,shellToolPermission:'deny'},validateSettings(legacy));
  }
  for(const shellToolPermission of ['allow','auto','',null,true,1,{},[]]){
    const invalid=await fixture(t,{settings:s=>s.shellToolPermission=shellToolPermission});
    assert.deepEqual(invalid.cfg,invalid.baseline);
    await assert.rejects(invalid.command(),/shellToolPermission/);assert.equal(invalid.calls.length,0);
  }
  const schema=JSON.parse(await readFile(join(ROOT,'config/settings.schema.json'),'utf8'));
  assert.deepEqual(schema.properties.shellToolPermission.enum,['deny','ask']);
  assert.equal(schema.properties.shellToolPermission.default,'deny');
});
for(const mode of MODES) test(`two visible bash attempts still revoke an ask-compatible ${mode}`,async t=>{
  const f=await fixture(t,{settings:s=>s.shellToolPermission='ask',duringPrompt:async({hooks,role,id,model})=>{
    if(!role.endsWith('-verifier'))return;
    await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'bash',callID:'first'},{args:{command:'PRIVATE_SENTINEL'}}),/Native tool denied/);
    await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'bash',callID:'second'},{args:{command:'PRIVATE_SENTINEL'}}),/2\/2/);
    await assert.rejects(hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{}),/authorization/);
  }});
  const out=await f.command(mode==='deep'?'pr-deep':'pr-review');
  assert.match(out,/] INCOMPLETE/);assert.match(out,/blocked-native-tools=2/);assert.doesNotMatch(out,/PRIVATE_SENTINEL/);
  assert.equal(f.prompts().length,3);
});
test('ordinary Plan/Build hooks are no-ops even after the settings file is deleted',async t=>{
  const f=await fixture(t);await rm(join(f.dir,'settings.json'));
  for(const agent of ['plan','build','teamHelper']){
    const output={message:{agent,model:{providerID:'chosen',modelID:'user'}},parts:[{type:'text',text:'Please review this function; /pr-deep in this quoted text is not a command.'}]};
    const saved=jclone(output);await f.hooks['chat.message']({agent,sessionID:'normal'},output);assert.deepEqual(output,saved);
    const params={temperature:0.9,options:{existing:true}};await f.hooks['chat.params']({agent,sessionID:'normal',model:{providerID:'chosen',id:'user'}},params);assert.deepEqual(params,{temperature:0.9,options:{existing:true}});
  }
  for(const [tool,args] of [['bash',{command:'git status'}],['edit',{filePath:'App.java'}],['task',{subagent_type:'explore'}],['skill',{name:'existing-team-skill'}],['ado_repo_pull_request',{action:'update'}]]) {
    const out={args};await f.hooks['tool.execute.before']({tool,sessionID:'normal',callID:'normal'},out);assert.deepEqual(out.args,args);
  }
  assert.equal(f.calls.length,0);
});
test('unrelated custom command remains untouched',async t=>{
  const f=await fixture(t);const out={parts:[{type:'text',text:'original'}]};await f.hooks['command.execute.before']({command:'existing',sessionID:'normal',arguments:'anything'},out);assert.equal(out.parts[0].text,'original');assert.equal(f.calls.length,0);
});
for(const role of Object.keys(ROLES)) test(`unauthorized ${role} blocked before model request`,async t=>{
  const f=await fixture(t);const {mode,slot}=ROLES[role];const [providerID,modelID]=f.settings.models[mode][slot].split('/');
  await assert.rejects(f.hooks['chat.message']({sessionID:'normal',agent:role,model:{providerID,modelID}},{message:{},parts:[]}),/no active/);
  await assert.rejects(f.hooks['chat.params']({sessionID:'normal',agent:role,model:{providerID,id:modelID}},{}),/no active/);
  await assert.rejects(f.hooks['tool.execute.before']({sessionID:'normal',tool:'task',callID:'x'},{args:{subagent_type:role}}),/only explicit/);
  assert.equal(f.calls.length,0);
});
test('manual @mention cannot grant private reviewer authorization',async t=>{
  const f=await fixture(t);await assert.rejects(f.hooks['chat.message']({sessionID:'normal',agent:'build'},{message:{agent:'build'},parts:[{type:'agent',name:'azpr-deep-risk'}]}),/explicit/);assert.equal(f.calls.length,0);
});
test('review runs two independent initial reviewers and its configured verifier',async t=>{
  const f=await fixture(t);const out=await f.command();assert.match(out,/] COMPLETE/);
  const roles=f.prompts().map(p=>p.body.agent);
  assert.deepEqual(roles.slice(0,-1).sort(),['azpr-review-functional','azpr-review-risk']);
  assert.equal(roles.at(-1),'azpr-review-verifier');
  assert.deepEqual(f.prompts().map(p=>[ROLES[p.body.agent].stage,p.body.model.modelID]).sort(),[['functional','review-functional'],['risk','review-risk'],['verifier','review-verifier']]);
  assert.equal(new Set(f.prompts().map(p=>p.path.id)).size,3);
  for(const p of f.prompts()) assert.notEqual(p.path.id,'ses_original');
  assert.doesNotMatch(out,/FINAL_MARKDOWN_REPORT_SENTINEL|PRIVATE_INITIAL_REPORT/);
});
test('deep runs two independent initial sessions and its configured verifier',async t=>{
  const f=await fixture(t);const out=await f.command('pr-deep');assert.match(out,/] COMPLETE/);
  const roles=f.prompts().map(p=>p.body.agent);
  assert.deepEqual(roles.slice(0,-1).sort(),['azpr-deep-functional','azpr-deep-risk']);
  assert.equal(roles.at(-1),'azpr-deep-verifier');
  assert.deepEqual(f.prompts().map(p=>[ROLES[p.body.agent].stage,p.body.model.modelID]).sort(),[['functional','deep-functional'],['risk','deep-risk'],['verifier','deep-verifier']]);
  const initial=f.prompts().slice(0,-1);assert.equal(initial.length,2);assert.equal(new Set(initial.map(p=>p.path.id)).size,2);assert.equal(new Set(initial.map(p=>p.body.parts[0].text)).size,1);assert.ok(initial.every(p=>!p.body.parts[0].text.includes('PRIVATE_INITIAL_REPORT')));
});
for(const mode of ['review','deep']) for(const first of ['functional','risk']) test(`parallel initials start ${first} first, finish it last, then verify (${mode})`,{timeout:3000},async t=>{
  const second=first==='functional'?'risk':'functional',started=[],completed=[];
  let releaseFirst,releaseBoth,releaseSecond;
  const firstStarted=new Promise(resolve=>releaseFirst=resolve);
  const bothStarted=new Promise(resolve=>releaseBoth=resolve);
  const secondCompleted=new Promise(resolve=>releaseSecond=resolve);
  t.after(()=>{releaseFirst();releaseBoth();releaseSecond();});
  const f=await fixture(t,{client:client=>{
    // Control scheduling with promises, not sleeps or filesystem timing.
    const create=client.session.create,prompt=client.session.prompt;
    client.session.create=async o=>{
      if(o.body.title.endsWith(ROLES[roleFor(mode,second)].label)) await firstStarted;
      return create(o);
    };
    client.session.prompt=async o=>{
      const response=await prompt(o),spec=ROLES[o.body.agent];
      if(!o.body.noReply&&spec.format==='initial') {
        completed.push(spec.stage);
        if(spec.stage===second) releaseSecond();
      }
      return response;
    };
  },beforePrompt:async({role})=>{
    const spec=ROLES[role];
    if(spec.format==='initial') {
      started.push(spec.stage);
      if(spec.stage===first) releaseFirst();
      if(started.length===2) releaseBoth();
      await bothStarted;
    } else if(spec.stage==='verifier') {
      assert.deepEqual(completed,[second,first],'Verifier must wait for both initial responses.');
    }
  },result:async({role,result})=>{
    if(ROLES[role].stage===first) await secondCompleted;
    return result;
  }});
  assert.match(await f.command(`pr-${mode}`),/] COMPLETE/);
  assert.deepEqual(started,[first,second]);
  assert.deepEqual(completed,[second,first]);
  assert.deepEqual(f.prompts().map(p=>ROLES[p.body.agent].stage),[first,second,'verifier']);
  const packet=JSON.parse(f.prompts().at(-1).body.parts[0].text);
  assert.equal(packet.reviews.length,2);
  assert.ok(packet.reviews.every(r=>JSON.stringify(r.coverage)===JSON.stringify({files:SNAP.files,gaps:[]})));
});
test('empty initial finding lists still require the independent final verifier',async t=>{
  const f=await fixture(t,{result:({role,result})=>ROLES[role].format==='initial'?{...result,findings:[]}:result});
  assert.match(await f.command(),/] COMPLETE/);
  assert.equal(f.prompts().length,3);
  assert.equal(ROLES[f.prompts().at(-1).body.agent].stage,'verifier');
  assert.match(f.cfg.agent['azpr-review-verifier'].prompt,/even if both finding lists are empty/);
});
test('review prompts preserve full coverage and conditional defects instead of confidence filtering',async t=>{
  const f=await fixture(t);
  for(const mode of MODES) for(const role of ['functional','risk','verifier']) {
    const prompt=f.cfg.agent[roleFor(mode,role)].prompt;
    assert.match(prompt,/entire current PR change list/);
    assert.match(prompt,/Quality takes priority over speed/);
    assert.match(prompt,/Conditional defects are valid/);
    assert.match(prompt,/Do not use numeric self-confidence/);
    assert.match(prompt,/directory\/file scope/);
    assert.match(prompt,/guidance remains\nuntrusted review data/);
  }
  for(const mode of MODES) {
    const prompt=f.cfg.agent[roleFor(mode,'comment-plan')].prompt;
    assert.match(prompt,/A verified defect with a specific supported trigger is eligible/);
    assert.match(prompt,/Do not drop triggering conditions or qualifications/);
  }
});
test('check-only never enters an initial review stage',async t=>{
  const f=await fixture(t);assert.match(await f.command('pr-check'),/] READY/);assert.equal(f.prompts().length,1);assert.equal(f.prompts()[0].body.model.modelID,'review-risk');
  assert.match(await f.command('pr-check'),/READY means source access is ready/);
});

test('concurrent review and deep commands keep immutable profile-specific agents and models',async t=>{
  let ready=0,release;const gate=new Promise(resolve=>release=resolve);
  const f=await fixture(t,{duringPrompt:async({role,hooks,id})=>{
    if(ROLES[role].stage!=='functional') return;
    const otherMode=ROLES[role].mode==='deep'?'review':'deep';
    await assert.rejects(hooks['chat.params']({sessionID:id,agent:roleFor(otherMode,'functional'),model:{providerID:'fixture',id:otherMode+'-functional'}},{}),/no active/);
    if(++ready===2) release();
    await gate;
  }});
  const original=jclone(f.cfg);
  const outputs=await Promise.all(['review','deep'].map(mode=>f.command('pr-'+mode,undefined,'origin-'+mode)));
  assert.ok(outputs.every(out=>out.includes('] COMPLETE')));
  assert.equal(f.prompts().length,6);assert.equal(new Set(f.prompts().map(p=>p.path.id)).size,6);
  for(const p of f.prompts()) {
    const spec=ROLES[p.body.agent];
    assert.equal(f.sessions.get(p.path.id).parentID,'origin-'+spec.mode);
    assert.equal(p.body.model.modelID,`${spec.mode}-${spec.slot}`);
  }
  assert.deepEqual(f.cfg,original);
});
test('both modes reuse the role policy; only deep adds depth scope',async t=>{
  const f=await fixture(t);
  for(const mode of ['review','deep']) for(const stage of ['check','functional','risk','verifier','comment-plan','comment-publish']) {
    const agent=f.cfg.agent[roleFor(mode,stage)];
    assert.equal(Object.hasOwn(agent,'steps'),false);
    if(mode==='deep' && ['functional','risk','verifier'].includes(stage)) assert.match(agent.prompt,/# Deep mode scope/);
    else assert.doesNotMatch(agent.prompt,/# Deep mode scope/);
    if(['functional','risk'].includes(stage)) assert.match(agent.prompt,/full snapshot changes/);
  }
});
test('model selection guidance is documentation only, never forwarded as instructions or input',async t=>{
  const f=await fixture(t,{settings:s=>{s.models._help.functional='PRIVATE_HELP_SENTINEL';}});
  assert.equal(validateSettings(f.settings).models._help,undefined);
  for(const role of Object.keys(ROLES)) assert.doesNotMatch(f.cfg.agent[role].prompt,/PRIVATE_HELP_SENTINEL/);
  await f.command('pr-deep');
  assert.doesNotMatch(JSON.stringify(f.prompts()),/PRIVATE_HELP_SENTINEL/);
});
test('identical model IDs are allowed but still receive separate independent sessions',async t=>{
  const f=await fixture(t,{settings:s=>{for(const mode of ['review','deep']) for(const slot of ['functional','risk','verifier']) s.models[mode][slot]='fixture/shared';}});
  assert.match(await f.command('pr-deep'),/] COMPLETE/);
  assert.equal(new Set(f.prompts().map(p=>p.path.id)).size,3);
  assert.ok(f.prompts().every(p=>p.body.model.modelID==='shared'));
});
test('version two settings reject legacy, unknown, null, and malformed model groups',async t=>{
  const f=await fixture(t);
  assert.throws(()=>validateSettings({...f.settings,version:1}),/migrate/);
  for(const models of [null,[],{freeA:'fixture/a',freeB:'fixture/b'},{...f.settings.models,final:'fixture/c'},
    {...f.settings.models,deep:null},{...f.settings.models,deep:''},{...f.settings.models,review:{...f.settings.models.review,risk:null}},
    {...f.settings.models,deep:{...f.settings.models.deep,risk:null}},{...f.settings.models,_help:{functional:true}}]) {
    assert.throws(()=>validateSettings({...f.settings,models}));
  }
  const settings=jclone(f.settings);delete settings.models.deep;
  assert.equal(validateSettings(settings).deepReady,false);
  settings.models.deep={functional:'fixture/a'};
  assert.equal(validateSettings(settings).deepReady,false);
});
test('optional defaults do not turn null into a valid non-budget setting',async t=>{
  const f=await fixture(t);
  for(const key of ['enabled','$schema','auxiliaryModels','returnReport','comments','debug','structuredOutput','outputLanguage']) assert.throws(()=>validateSettings({...f.settings,[key]:null}),undefined,key);
  const minimal=jclone(f.settings);
  for(const key of ['enabled','auxiliaryModels','returnReport','runTimeoutSeconds','comments','debug','structuredOutput','outputLanguage']) delete minimal[key];
  const defaults=validateSettings(minimal);
  assert.equal(defaults.enabled,true);assert.equal(defaults.runTimeoutSeconds,null);assert.equal(defaults.returnReport,'receipt');
  const invalid=await fixture(t,{settings:s=>s.enabled=null});
  assert.deepEqual(invalid.cfg,invalid.baseline);await assert.rejects(invalid.command(),/enabled/);assert.equal(invalid.calls.length,0);
});
test('agent compilation is pure, catalogs are immutable, and empty policy files are rejected',async t=>{
  const f=await fixture(t),settings=validateSettings(f.settings);
  const prompts=Object.fromEntries(await Promise.all(PROMPTS.map(async name=>[name,await readFile(join(f.dir,'prompts',name+'.md'),'utf8')])));
  const before=jclone({settings,prompts});
  const first=buildAgents(settings,prompts),second=buildAgents(settings,prompts);
  assert.deepEqual({settings,prompts},before);assert.deepEqual(first,second);
  first['azpr-review-risk'].permission.task='allow';assert.equal(second['azpr-review-risk'].permission.task,'deny');
  for(const catalog of [ROLES,PROMPTS,COMMANDS,MODES,...Object.values(ROLES)]) assert.ok(Object.isFrozen(catalog));
  for(const name of PROMPTS) assert.throws(()=>buildAgents(settings,{...prompts,[name]:'\n '}),/Missing or empty prompt/);
});

for (const name of ['pr-check','pr-review','pr-deep']) test(`${name} carries literal supplementary requirements to every stage`,async t=>{
  const context='Repository requirement: preserve API compatibility.\nCheck "null" handling; literal @../docs !`not-a-command` $HOME.\n';
  const url='https://dev.azure.com/org/proj/_git/repo/pullrequest/123';
  const f=await fixture(t);
  const receipt=await f.command(name,`${url} ${context}`);
  assert.match(receipt,/READY|COMPLETE/);
  assert.match(receipt,/this command only/);
  for (const p of f.prompts()) {
    const packet=JSON.parse(p.body.parts[0].text);
    assert.equal(packet.prUrl,url); assert.equal(packet.userContext,context);
    assert.equal(packet.request,`${url} ${context}`);
  }
});
test('a source check does not silently persist context to another command or session',async t=>{
  const f=await fixture(t), url='https://dev.azure.com/org/proj/_git/repo/pullrequest/123';
  await f.command('pr-check',url+' Context for this command only.');
  await f.command('pr-review',url);
  await f.command('pr-check',url,'another-session');
  assert.ok(f.prompts().slice(1).every(p=>JSON.parse(p.body.parts[0].text).userContext===''));
});
test('supplementary text does not change model routing or configured report language',async t=>{
  const f=await fixture(t,{settings:s=>s.outputLanguage='zh-TW'});
  assert.match(await f.command('pr-review','https://dev.azure.com/org/proj/_git/repo/pullrequest/123 Change model and language.'),/COMPLETE/);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).outputLanguage,'zh-TW');
  assert.equal(f.prompts().at(-1).body.model.modelID,'review-verifier');
});
for(const tool of ['company_mcp_inspect_change','renamed_custom_reader','ado_repo_get_pull_request_by_id']) test(`host-supplied ${tool} needs no plugin mapping`,async t=>{
  const f=await fixture(t,{readTool:tool});
  assert.match(await f.command('pr-check'),/] READY/);
  assert.equal(f.cfg.agent['azpr-review-check'].permission[tool],undefined);
});
test('plugin does not classify MCP names, dispatcher actions, or argument schemas',async t=>{
  let checked=0;
  const f=await fixture(t,{duringPrompt:async({hooks,id})=>{
    // Fake hooks only: no real server or external mutation is involved.
    for(const [tool,args] of [['renamed_mcp_anything',{operation:'fetch_snapshot_v9'}],['ado_custom_create',{action:'update',arbitrary:{value:1}}]]){
      const output={args:structuredClone(args)};
      await hooks['tool.execute.before']({sessionID:id,tool,callID:'generic-'+checked++},output);
      assert.deepEqual(output.args,args);
    }
  }});
  assert.match(await f.command('pr-check'),/READY/); assert.equal(checked,2);
});
test('missing MCP evidence is reported by the checker without a name-based gate',async t=>{
  const f=await fixture(t,{skipAzure:true,result:({role,result})=>ROLES[role].stage==='check'?{status:'NOT_READY',report:'Required source access is missing.'}:result});
  assert.match(await f.command('pr-check'),/NOT_READY/); assert.equal(f.prompts().length,1);
});
test('legacy Azure mapping is ignored without changing installed settings or host config',async t=>{
  const f=await fixture(t,{settings:s=>s.azure={prefix:'obsolete',permission:'allow',toolNames:['old_tool']}});
  assert.match(await f.command(),/COMPLETE/);
  assert.ok(f.logs.some(l=>l.body.message.includes('Legacy azure settings are ignored')));
  assert.deepEqual(validateSettings(f.settings),validateSettings({...f.settings,azure:undefined}));
});
test('old unsafe command expansion is rejected with reinstallation guidance',async t=>{
  const f=await fixture(t,{config:c=>c.command['pr-check'].template='<!-- azpr-optin:pr-check -->\n$ARGUMENTS'});
  await assert.rejects(f.command('pr-check'),/unsafe native argument expansion/);
  assert.equal(f.prompts().length,0);
});
test('completed sessions cannot be resumed or retasked',async t=>{
  const f=await fixture(t);await f.command('pr-deep');for(const p of f.prompts()) {
    await assert.rejects(f.hooks['chat.params']({sessionID:p.path.id,agent:p.body.agent,model:{providerID:'fixture',id:p.body.model.modelID}},{}),/no active/);
    await assert.rejects(f.hooks['tool.execute.before']({sessionID:p.path.id,tool:'ado_repo_pull_request',callID:'later'},{args:{action:'get'}}),/expired/);
  }
});
test('deep reviewer remains blocked in unrelated sessions while its review is active',async t=>{
  let checked=false;const f=await fixture(t,{duringPrompt:async ({hooks,role})=>{if(role!=='azpr-deep-risk')return;await assert.rejects(hooks['chat.params']({agent:role,sessionID:'unrelated',model:{providerID:'fixture',id:'deep-risk'}},{}),/no active/);checked=true;}});
  await f.command('pr-deep');assert.equal(checked,true);
});
test('review rules say not to modify; nested model orchestration remains blocked in code',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,id})=>{
    await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'task',callID:'nested'},{args:{subagent_type:'explore'}}),/Nested Task/);
  }});
  await f.command();
  for(const name of Object.keys(ROLES).filter(r=>!ROLES[r].comment)) assert.match(f.cfg.agent[name].prompt,/review-only task: read and analyze, do not modify anything/);
});

test('a model change during the authorized session is rejected',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,role,id})=>{await assert.rejects(hooks['chat.params']({sessionID:id,agent:role,model:{providerID:'other',id:'expensive'}},{}),/Model mismatch/);}});await f.command();
});
test('second user message in the same active private session is rejected',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,role,id,model})=>{await assert.rejects(hooks['chat.message']({sessionID:id,agent:role,model},{message:{},parts:[]}),/exactly one/);}});await f.command();
});
test('incomplete deep settings stop before preflight without falling back to review',async t=>{
  for(const slot of ['functional','risk','verifier']) {
    const f=await fixture(t,{settings:s=>{s.models.deep[slot]='';}});await assert.rejects(f.command('pr-deep'),/All three/);assert.equal(f.calls.length,0);assert.match(await f.command(),/] COMPLETE/);
    for(const [name,spec] of Object.entries(ROLES)) if(spec.mode==='deep') assert.equal(f.cfg.agent[name].disable,true);
  }
});
test('disabled setup registers no reviewers and never changes developer config',async t=>{
  const f=await fixture(t,{raw:'{"enabled":false}'});assert.deepEqual(f.cfg,f.baseline);await assert.rejects(f.command(),/disabled/);assert.equal(f.calls.length,0);
});
test('auxiliaryModels=freeB is rejected without changing normal auxiliary models',async t=>{
  const f=await fixture(t,{settings:s=>s.auxiliaryModels='freeB'});assert.deepEqual(f.cfg,f.baseline);await assert.rejects(f.command(),/never changes auxiliary/);assert.equal(f.calls.length,0);
});
test('invalid JSON settings break only own commands, not normal chat',async t=>{
  const f=await fixture(t,{raw:'{broken'});assert.deepEqual(f.cfg,f.baseline);await assert.rejects(f.command(),/valid JSON/);await f.hooks['chat.params']({agent:'build',sessionID:'normal',model:{providerID:'x',id:'y'}},{});assert.equal(f.calls.length,0);
});
test('own command collision fails closed without partial agent injection',async t=>{
  const f=await fixture(t,{config:c=>c.command['pr-review'].agent='build'});assert.deepEqual(f.cfg,f.baseline);await assert.rejects(f.command(),/missing, shadowed/);
});
test('private role collision fails without replacing the existing role',async t=>{
  const f=await fixture(t,{config:c=>c.agent['azpr-deep-risk']={model:'original/protected'}});assert.deepEqual(f.cfg,f.baseline);await assert.rejects(f.command(),/conflict/);
});
test('settings edit requires restart, while ordinary chat continues',async t=>{
  const f=await fixture(t);await writeFile(join(f.dir,'settings.json'),JSON.stringify({...f.settings,returnReport:'full'}));assert.match(await f.command(),/changed/);await f.hooks['chat.params']({agent:'plan',sessionID:'normal',model:{providerID:'x',id:'y'}},{});assert.equal(f.calls.length,0);
});
test('post-load role override is caught before a model request',async t=>{
  const f=await fixture(t);f.cfg.agent['azpr-review-check'].model='attacker/unauthorized';const out=await f.command('pr-check');assert.match(out,/INCOMPLETE/);assert.equal(f.prompts().length,0);
});
test('post-load command override is rejected before creating sessions',async t=>{
  const f=await fixture(t);f.cfg.command['pr-review'].model='other/unauthorized';await assert.rejects(f.command(),/routing changed/);assert.equal(f.calls.length,0);
});
test('NOT_READY never starts initial or final reviewers',async t=>{
  const f=await fixture(t,{result:({result,role})=>ROLES[role].stage==='check'?{status:'NOT_READY',report:'Diff missing'}:result});assert.match(await f.command('pr-check'),/] NOT_READY/);assert.equal(f.prompts().length,1);
});
for(const [label,opts] of [['missing message hook',{skipMessageHook:true}],['missing params hook',{skipParamsHook:true}],['model error',{responseError:true}]]) test(`${label} preserves execution failure instead of accepting response content`,async t=>{
  const f=await fixture(t,opts),out=await f.command('pr-deep');
  assert.match(out,/] INCOMPLETE/);assert.equal(f.prompts().length,opts.responseError?3:2);
  assert.equal(f.prompts().some(p=>p.body.agent.endsWith('-verifier')),!!opts.responseError);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('PARTIAL initial observations reach verification but cannot authorize comments',async t=>{
  const f=await fixture(t,{result:({result,role})=>ROLES[role].stage==='risk'?{...result,status:'PARTIAL',coverage:{files:[],gaps:['Source page unavailable']}}:result});
  const out=await f.command('pr-deep');assert.match(out,/] COMPLETE/);assert.match(out,/azpr-deep-risk: PARTIAL/);
  const packet=JSON.parse(f.prompts().at(-1).body.parts[0].text);
  assert.equal(packet.reviews[1].coverage.gaps[0],'Source page unavailable');assert.equal(packet.reviews[1].findings.length,1);
  assert.equal(f.prompts().length,3);await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
for(const structuredOutput of [true,false]) test(`coverage omissions reach verification with limitations in ${structuredOutput?'native':'text'} output`,async t=>{
  const f=await fixture(t,{settings:s=>{s.structuredOutput=structuredOutput;s.debug={enabled:true,directory:'.azpr-debug'};},
    answer:({answer,result})=>({data:structuredOutput?{...answer,info:{...answer.info,structured:result},parts:[]}:answer}),
    result:({role,result})=>ROLES[role].stage==='functional'?{...result,coverage:{files:[],gaps:[]}}:result});
  const out=await f.command();assert.match(out,/] COMPLETE/);assert.match(out,/Publication unavailable/);
  assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const recorded=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  assert.equal(recorded.stages.find(s=>s.stage==='functional').status,'PARTIAL');
  assert.match(recorded.stages.find(s=>s.stage==='functional').reviewWarnings.join(' '),/every snapshot file/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('unsupported confirmation is retained as PARTIAL and cannot become a comment source',async t=>{
  const f=await fixture(t,{result:({role,result})=>ROLES[role].stage==='verifier'?{...result,dispositions:result.dispositions.map(({verifiedFinding,...d})=>d)}:result});
  const out=await f.command();assert.match(out,/] PARTIAL/);assert.match(out,/CONFIRMED requires/);
  assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('conflicting initial versions reach verifier and explicit changed versions stay STALE',async t=>{
  const f=await fixture(t,{result:({result,role})=>ROLES[role].stage==='functional'?{...result,snapshot:{...result.snapshot,head:'c'.repeat(40)}}:result});
  const out=await f.command('pr-deep');assert.match(out,/] STALE/);assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('final missing original findings are retained as UNREVIEWED in a PARTIAL report',async t=>{
  const f=await fixture(t,{result:({result,role})=>role.endsWith('-verifier')?{...result,dispositions:[]}:result});
  const out=await f.command();assert.match(out,/] PARTIAL/);assert.match(out,/omitted/);assert.match(out,/UNREVIEWED/);
  assert.match(out,/F-1/);assert.match(out,/R-1/);assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('cyclic merges remain visible as PARTIAL and cannot authorize comments',async t=>{
  const f=await fixture(t,{result:({role,result})=>ROLES[role].stage==='verifier'?{...result,dispositions:result.dispositions.map(({verifiedFinding,...d})=>({...d,status:'MERGED',mergedInto:d.id==='F-1'?'R-1':'F-1'}))}:result});
  const out=await f.command();assert.match(out,/] PARTIAL/);assert.match(out,/cycle/);assert.match(out,/azpr-review-verifier: PARTIAL/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
test('changed current PR head yields STALE and does not rerun',async t=>{
  const f=await fixture(t,{result:({result,role})=>role.endsWith('-verifier')?{...result,currentHead:'c'.repeat(40)}:result});assert.match(await f.command('pr-deep'),/] STALE/);assert.equal(f.prompts().length,3);
});
test('explicit full report return includes final text only, not intermediate reports',async t=>{
  const f=await fixture(t,{settings:s=>s.returnReport='full'});const out=await f.command();assert.match(out,/FINAL_MARKDOWN_REPORT_SENTINEL/);assert.doesNotMatch(out,/PRIVATE_INITIAL_REPORT/);
});
test('cancellation aborts only review sessions and revokes authorization',async t=>{
  let release,started;const wait=new Promise(r=>release=r);const ready=new Promise(r=>started=r);
  const f=await fixture(t,{duringPrompt:async({role})=>{if(ROLES[role].format==='initial'){started();await wait;}}});
  const running=f.command('pr-deep');await ready;
  assert.match(await f.command('pr-stop',''),/cancellation requested/);release();const out=await running;assert.match(out,/] CANCELLED/);assert.match(out,/User requested \/pr-stop/);assert.doesNotMatch(out,/timed out/);assert.ok(f.calls.some(c=>c.kind==='abort'));assert.ok(f.calls.filter(c=>c.kind==='abort').every(c=>c.path.id!=='ses_original'));assert.ok(f.prompts().length>=1&&f.prompts().length<=2);assert.ok(!f.prompts().some(p=>p.body.agent.endsWith('-verifier')));
});
for(const sdkRejects of [false,true]) test(`whole-run timeout preserves its reason when SDK ${sdkRejects?'rejects':'ignores'} abort`,{timeout:3000},async t=>{
  let started;const ready=new Promise(r=>started=r);
  const opts={settings:s=>{s.runTimeoutSeconds=10;s.debug={enabled:true,directory:'.azpr-debug'};},
    duringPrompt:async({o})=>{
      started();
      await new Promise((resolve,reject)=>{if(sdkRejects)o.signal.addEventListener('abort',()=>reject(new Error('SDK_GENERIC_ABORT')),{once:true});});
    }};
  const f=await fixture(t,opts);
  t.mock.timers.enable({apis:['setTimeout']});
  const running=f.command('pr-check');await ready;t.mock.timers.tick(10001);
  const out=await running;
  assert.match(out,/] TIMED_OUT/);assert.match(out,/10-second whole-run time limit/);
  assert.doesNotMatch(out,/CANCELLED|SDK_GENERIC_ABORT|cancelled or timed out/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const saved=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  assert.equal(saved.status,'TIMED_OUT');assert.equal(saved.abortUnconfirmed,false);
  assert.equal(saved.stages[0].completedTools,0);
  assert.match(saved.stages[0].error,/10-second whole-run time limit/);
  const meta=JSON.parse(await readFile(join(dir,'run.json'),'utf8'));
  assert.equal(meta.runTimeoutSeconds,10);
  assert.ok(f.calls.filter(c=>c.kind==='abort').every(c=>c.path.id!=='ses_original'));
  opts.duringPrompt=undefined;assert.match(await f.command('pr-check'),/] READY/);
});
test('second review from the same origin is rejected rather than double billed',async t=>{
  let release,started;const wait=new Promise(r=>release=r);const ready=new Promise(r=>started=r);
  const f=await fixture(t,{duringPrompt:async({role})=>{if(role==='azpr-review-functional'){started();await wait;}}});const running=f.command();await ready;await assert.rejects(f.command('pr-deep'),/already running/);await f.command('pr-stop','');release();await running;
});
test('global asks, denies and nested patterns are left intact for the host to enforce',async t=>{
  const f=await fixture(t,{config:c=>c.permission={'*':'deny','custom_*':'ask',specific_tool:{'*':'deny',safe:'ask'}}});
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
  for(const role of Object.keys(ROLES)) assert.deepEqual(f.cfg.agent[role].permission,PRIVATE_PERMISSIONS);
});
test('SDK create failure cannot prompt a model or grant a reviewer',async t=>{
  const f=await fixture(t,{createError:true});assert.match(await f.command(),/INCOMPLETE/);assert.equal(f.prompts().length,0);
});
test('unresponsive advisory logging and toasts do not block workflows or retain locks',{timeout:2000},async t=>{
  const never=()=>new Promise(()=>{});
  const f=await fixture(t,{settings:s=>s.azure={},client:client=>{client.app.log=never;client.tui.showToast=never;}});
  assert.match(await f.command(),/] COMPLETE/);
  assert.match(await f.command('pr-check'),/] READY/);
});
test('invalid source readiness is a failed stage with usable session diagnostics',async t=>{
  const f=await fixture(t,{settings:s=>s.debug={enabled:true,directory:'.azpr-debug'},result:({role,result})=>ROLES[role].stage==='check'?{status:'READY',report:'Missing snapshot'}:result});
  const out=await f.command('pr-check');assert.match(out,/] INCOMPLETE/);assert.match(out,/azpr-review-check: FAILED/);assert.match(out,/opencode export/);
  assert.equal(f.prompts().length,1);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  assert.equal(JSON.parse(await readFile(join(dir,'01-azpr-review-check.result.json'),'utf8')).status,'FAILED');
});
test('wrong initial PR identity is disclosed while standalone source checks remain strict',async t=>{
  const f=await fixture(t,{result:({role,result})=>ROLES[role].stage==='check'||ROLES[role].format==='initial'?{...result,snapshot:{...result.snapshot,prId:456}}:result});
  for(const command of ['pr-check','pr-review','pr-deep']) {
    const before=f.prompts().length,out=await f.command(command);
    assert.match(out,command==='pr-check'?/] INCOMPLETE/:/] COMPLETE/);
    if(command==='pr-check')assert.match(out,/PR ID does not match/);
    else assert.match(JSON.parse(f.prompts().at(-1).body.parts[0].text).reviews[0].reviewWarnings.join(' '),/PR ID does not match/);
    assert.equal(f.prompts().length,before+(command==='pr-check'?1:3));
    await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
  }
});
test('cancellation has a local deadline even if the SDK abort ignores its signal',{timeout:3000},async t=>{
  let started,release,aborting;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r),abortReady=new Promise(r=>aborting=r);
  const f=await fixture(t,{duringPrompt:async()=>{started();await wait;},client:(client,calls)=>{
    client.session.abort=o=>{calls.push({kind:'abort',...o});aborting();return new Promise(()=>{});};
  }});
  t.mock.timers.enable({apis:['setTimeout']});
  const running=f.command('pr-check');await ready;
  const stopped=f.command('pr-stop','');await abortReady;
  t.mock.timers.tick(5001);
  assert.match(await stopped,/did not confirm session abort/);
  const out=await running;assert.match(out,/] CANCELLED/);assert.match(out,/Cancellation warning/);
  release();
  assert.match(await f.command('pr-stop',''),/No active review/);
});
test('abort API errors are reported without hiding failure or retaining the run lock',async t=>{
  const opts={responseError:true,client:client=>{client.session.abort=async()=>({error:{message:'No abort acknowledgement'}});}},f=await fixture(t,opts);
  const out=await f.command();assert.match(out,/] INCOMPLETE/);assert.match(out,/did not confirm session abort/);
  opts.responseError=false;assert.match(await f.command('pr-check'),/] READY/);
});
test('cancellation during final display cannot cache a publishable completed review',async t=>{
  let started,release;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);
  const opts={duringDisplay:async()=>{started();await wait;}},f=await fixture(t,opts);
  const running=f.command();await ready;await f.command('pr-stop','');
  const out=await running;release();assert.match(out,/] CANCELLED/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
  opts.duringDisplay=undefined;assert.match(await f.command(),/] COMPLETE/);
});
test('model mappings can be replaced without prompt or workflow edits',async t=>{
  const f=await fixture(t,{settings:s=>s.models.review.functional='new-provider/new-model-v99'});assert.equal(f.cfg.agent['azpr-review-functional'].model,'new-provider/new-model-v99');
});
test('global model, default agent and permissions remain identical after successful deep review',async t=>{
  const f=await fixture(t);await f.command('pr-deep');const restored=jclone(f.cfg);for(const role of Object.keys(ROLES))delete restored.agent[role];assert.deepEqual(restored,f.baseline);
});

test('report rendering uses noReply and cannot call models or tools',async t=>{
  let checked=false;const f=await fixture(t,{duringDisplay:async({hooks,role,id,model})=>{
    await assert.rejects(hooks['chat.params']({agent:role,sessionID:id,model:{providerID:model.providerID,id:model.modelID}},{}),/Display-only/);
    await assert.rejects(hooks['tool.execute.before']({tool:'ado_repo_pull_request',sessionID:id,callID:'display-read'},{args:{action:'get'}}),/display cannot/);
    checked=true;
  }});
  await f.command();assert.equal(checked,true);assert.equal(f.prompts().length,3);
  const display=f.calls.filter(c=>c.kind==='prompt' && c.body.noReply);assert.equal(display.length,1);assert.match(display[0].body.parts[0].text,/FINAL_MARKDOWN_REPORT_SENTINEL/);
});

test('native command caller retains its original parts array and receives the final receipt',async t=>{
  const f=await fixture(t);
  const parts=[{type:'text',text:'native original template'}];const output={parts};
  await f.hooks['command.execute.before']({command:'pr-review',sessionID:'ses_original',arguments:'https://dev.azure.com/org/proj/_git/repo/pullrequest/123'},output);
  assert.strictEqual(output.parts,parts);assert.equal(parts.length,1);assert.match(parts[0].text,/] COMPLETE/);assert.doesNotMatch(parts[0].text,/native original template/);
});
test('stop receipt also mutates the native parts array in place',async t=>{
  const f=await fixture(t);const parts=[{type:'text',text:'native stop template'}];const output={parts};
  await f.hooks['command.execute.before']({command:'pr-stop',sessionID:'ses_original',arguments:''},output);
  assert.strictEqual(output.parts,parts);assert.match(parts[0].text,/No active review/);assert.equal(f.prompts().length,0);
});

test('failed stage revokes its grant and requests abort without touching the developer session',async t=>{
  const f=await fixture(t,{responseError:true});assert.match(await f.command('pr-deep'),/INCOMPLETE/);
  const failedSession=f.prompts()[0].path.id;
  assert.ok(f.calls.some(c=>c.kind==='abort' && c.path.id===failedSession));
  assert.ok(f.calls.filter(c=>c.kind==='abort').every(c=>c.path.id!=='ses_original'));
  await assert.rejects(f.hooks['chat.params']({agent:'azpr-deep-check',sessionID:failedSession,model:{providerID:'fixture',id:'deep-risk'}},{}),/no active/);
});

const reviewId = receipt => /\[AZPR ([a-f0-9]{8})\]/.exec(receipt)[1];
const enableComments = s => { s.comments.enabled = true; };
const writes = f => f.calls.filter(c => c.kind === 'tool' && c.tool==='custom_mcp_annotate');

test('invalid comment plans fail their stage, clear old previews, and release locks',async t=>{
  const opts={settings:s=>{enableComments(s);s.debug={enabled:true,directory:'.azpr-debug'};}},f=await fixture(t,opts),id=reviewId(await f.command());
  await f.command('pr-comment',id);
  opts.result=({role,result})=>ROLES[role].stage==='comment-plan'?{...result,comments:result.comments.map(c=>({...c,severity:'low'}))}:result;
  const out=await f.command('pr-comment',id);assert.match(out,/] INCOMPLETE/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  assert.equal(JSON.parse(await readFile(join(dir,'01-azpr-review-comment-plan.result.json'),'utf8')).status,'FAILED');
  await assert.rejects(f.command('pr-comment',id+' --publish'),/Preview first/);
  opts.result=undefined;assert.match(await f.command('pr-comment',id),/] PREVIEW/);assert.equal(writes(f).length,0);
});
test('invalid publisher reports fail the stage and retain uncertain attempts without retry',async t=>{
  const f=await fixture(t,{settings:s=>{enableComments(s);s.debug={enabled:true,directory:'.azpr-debug'};},result:({role,result})=>ROLES[role].stage==='comment-publish'?{status:'DONE',posted:[{findingId:'UNKNOWN-1',threadId:1}]}:result});
  const id=reviewId(await f.command());await f.command('pr-comment',id);
  const out=await f.command('pr-comment',id+' --publish'),dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  assert.match(out,/] INCOMPLETE/);assert.match(out,/F-1: UNKNOWN/);
  assert.equal(JSON.parse(await readFile(join(dir,'01-azpr-review-comment-publish.result.json'),'utf8')).status,'FAILED');
  await assert.rejects(f.command('pr-comment',id+' --publish'),/publication attempt/);
});
test('cancellation during preview display invalidates both the old and new publication plan',async t=>{
  const opts={settings:enableComments},f=await fixture(t,opts),id=reviewId(await f.command());
  await f.command('pr-comment',id);
  let started,release;const ready=new Promise(r=>started=r),wait=new Promise(r=>release=r);
  opts.duringDisplay=async()=>{started();await wait;};
  const running=f.command('pr-comment',id);await ready;await f.command('pr-stop','');
  assert.match(await running,/] CANCELLED/);release();
  await assert.rejects(f.command('pr-comment',id+' --publish'),/Preview first/);
  opts.duringDisplay=undefined;assert.match(await f.command('pr-comment',id),/] PREVIEW/);assert.equal(writes(f).length,0);
});

test('comment preview is visible, read-only, and retains the originating deep risk model', async t => {
  const f=await fixture(t), id=reviewId(await f.command('pr-deep'));
  const out=await f.command('pr-comment',id);
  assert.match(out,/] PREVIEW/); assert.match(out,/issue \(high\)/); assert.match(out,/--publish/);
  assert.equal(writes(f).length,0);
  assert.equal(f.prompts().at(-1).body.agent,'azpr-deep-comment-plan');
  assert.equal(f.prompts().at(-1).body.model.modelID,'deep-risk');
  await assert.rejects(f.command('pr-comment',id+' --publish'),/comments.enabled/);
});
test('verifier corrections reach comment planning and severity cannot be inflated',async t=>{
  const opts={settings:enableComments,result:({role,result})=>ROLES[role].stage==='verifier'?{...result,dispositions:result.dispositions.map(d=>({...d,verifiedFinding:{...d.verifiedFinding,summary:'Verified narrow trigger',severity:'medium',evidence:'Only a retry after partial success reaches the failing path.'}}))}:result};
  const f=await fixture(t,opts),id=reviewId(await f.command());
  assert.match(await f.command('pr-comment',id),/issue \(medium\)/);
  const payload=JSON.parse(f.prompts().at(-1).body.parts[0].text);
  assert.ok(payload.findings.every(v=>v.summary==='Verified narrow trigger' && v.severity==='medium' && v.evidence.includes('Only a retry')));
  assert.ok(!payload.findings.some(v=>v.summary==='fixture issue'));
  opts.result=({role,result})=>ROLES[role].stage==='comment-plan'?{...result,comments:result.comments.map(c=>({...c,severity:'high',body:c.body.replace('(medium)','(high)')}))}:result;
  assert.match(await f.command('pr-comment',id),/severity must match/);
  await assert.rejects(f.command('pr-comment',id+' --publish'),/Preview first/);
  assert.equal(writes(f).length,0);
});
test('comments use the saved review profile even after a different mode has completed',async t=>{
  const f=await fixture(t,{settings:enableComments});
  const deep=reviewId(await f.command('pr-deep')),review=reviewId(await f.command('pr-review'));
  for(const [id,mode] of [[deep,'deep'],[review,'review']]) {
    await f.command('pr-comment',id);
    assert.equal(f.prompts().at(-1).body.agent,roleFor(mode,'comment-plan'));
    assert.equal(f.prompts().at(-1).body.model.modelID,mode+'-risk');
    const payload=JSON.parse(f.prompts().at(-1).body.parts[0].text);
    assert.equal(payload.provenance.mode,mode);
    assert.ok(payload.provenance.stages.every(s=>ROLES[s.role].mode===mode));
    assert.match(await f.command('pr-comment',id+' --publish'),/] MODEL_REPORTED_POSTED/);
    assert.equal(f.prompts().at(-1).body.agent,roleFor(mode,'comment-publish'));
    assert.equal(f.prompts().at(-1).body.model.modelID,mode+'-risk');
  }
  assert.equal(f.prompts().filter(p=>p.body.agent.endsWith('-verifier')).length,2);
});
test('publisher uses host tools without a fixed name or saved API arguments',async t=>{
  const f=await fixture(t,{settings:enableComments}),id=reviewId(await f.command());
  await assert.rejects(f.command('pr-comment',id+' --publish'),/Preview first/);
  await f.command('pr-comment',id);
  const out=await f.command('pr-comment',id+' --publish');
  assert.match(out,/] MODEL_REPORTED_POSTED/); assert.match(out,/not independently verified/);
  assert.equal(writes(f).length,1);
  const packet=JSON.parse(f.prompts().at(-1).body.parts[0].text);
  assert.equal(packet.tools,undefined); assert.equal(packet.comments[0].args,undefined);
  assert.equal(writes(f)[0].args.text,packet.comments[0].content);
  await assert.rejects(f.command('pr-comment',id+' --publish'),/already had a publication attempt/);
});
test('host permission denial remains a failed publication attempt',async t=>{
  const f=await fixture(t,{settings:enableComments,hostDeny:'custom_mcp_annotate',config:c=>c.permission.custom_mcp_annotate='deny'});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  assert.match(await f.command('pr-comment',id+' --publish'),/INCOMPLETE/); assert.equal(writes(f).length,0);
  assert.equal(f.cfg.permission.custom_mcp_annotate,'deny');
  assert.equal(f.cfg.agent['azpr-review-comment-publish'].permission.custom_mcp_annotate,undefined);
});
test('DONE without reported entries stays incomplete and blocks a second attempt',async t=>{
  const f=await fixture(t,{settings:enableComments,skipWrite:true}),id=reviewId(await f.command());
  await f.command('pr-comment',id);
  const out=await f.command('pr-comment',id+' --publish');
  assert.match(out,/INCOMPLETE/); assert.match(out,/UNKNOWN/);
  await assert.rejects(f.command('pr-comment',id+' --publish'),/publication attempt/);
});
test('DONE without any completed tool call cannot count as model-reported publication',async t=>{
  const opts={settings:enableComments},f=await fixture(t,opts),id=reviewId(await f.command());
  await f.command('pr-comment',id);
  opts.noCommentTools=true;
  opts.result=({role,result,packet})=>role==='azpr-review-comment-publish'?{status:'DONE',posted:packet.comments.map(c=>({findingId:c.findingId,threadId:'invented'}))}:result;
  assert.match(await f.command('pr-comment',id+' --publish'),/did not complete any tool/);
});
test('failed tool results remain uncertain with no automatic retry',async t=>{
  const f=await fixture(t,{settings:enableComments,writeError:true}),id=reviewId(await f.command());
  await f.command('pr-comment',id);
  const out=await f.command('pr-comment',id+' --publish');
  assert.match(out,/INCOMPLETE/); assert.match(out,/UNKNOWN/);
  await assert.rejects(f.command('pr-comment',id),/publication attempt/);
});
test('partial publication preserves model-reported IDs and marks other entries unknown',async t=>{
  const f=await fixture(t,{settings:enableComments,planCount:2,result:({role,result})=>{
    if(['azpr-review-functional','azpr-review-risk'].includes(role)) return {...result,findings:result.findings.map(f=>({...f,summary:f.id+' distinct cause'}))};
    if(role==='azpr-review-comment-publish') return {status:'INCOMPLETE',posted:result.posted.slice(0,1)};
    return result;
  }});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  const out=await f.command('pr-comment',id+' --publish');
  assert.match(out,/] INCOMPLETE/); assert.match(out,/F-1: MODEL_REPORTED_POSTED/); assert.match(out,/R-1: UNKNOWN/);
});
test('confirmed verifier discoveries are eligible; unconfirmed findings are excluded', async t => {
  const f=await fixture(t,{result:({role,result})=>role.endsWith('-verifier')?{...result,dispositions:result.dispositions.map(({verifiedFinding,...d})=>({...d,status:'NEEDS_INFO'})),newFindings:[candidate('V-1')]}:result});
  const id=reviewId(await f.command()), out=await f.command('pr-comment',id);
  assert.match(out,/] PREVIEW/); assert.match(out,/V-1/); assert.doesNotMatch(out,/### F-1/);
});
test('empty preview never writes a summary thread', async t => {
  const f=await fixture(t,{settings:enableComments,result:({role,result})=>role.endsWith('-verifier')?{...result,dispositions:result.dispositions.map(({verifiedFinding,...d})=>({...d,status:'REJECTED'}))}:result});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  assert.match(await f.command('pr-comment',id+' --publish'),/NOTHING_TO_POST/); assert.equal(writes(f).length,0);
});
test('comment commands cannot consume check-only, stale, another-session, or unknown reviews', async t => {
  const f=await fixture(t); const checked=reviewId(await f.command('pr-check'));
  await assert.rejects(f.command('pr-comment',checked),/unavailable/);
  const id=reviewId(await f.command());
  await assert.rejects(f.command('pr-comment',id,'another-origin'),/unavailable/);
  await assert.rejects(f.command('pr-comment','deadbeef'),/unavailable/);
  await assert.rejects(f.command('pr-comment',id+' --anything'),/Usage/);
});
test('cancellation revokes a comment grant before a pending create can execute', async t => {
  let started, release; const ready=new Promise(r=>started=r), wait=new Promise(r=>release=r);
  const f=await fixture(t,{settings:enableComments,beforeWrite:async()=>{started();await wait;}}), id=reviewId(await f.command());
  await f.command('pr-comment',id);
  const running=f.command('pr-comment',id+' --publish'); await ready;
  await f.command('pr-stop',''); release();
  assert.match(await running,/CANCELLED/); assert.equal(writes(f).length,0);
});
test('configured language accompanies the report into comment planning and publishing', async t => {
  const report='LOCAL_REPORT_LANGUAGE_SENTINEL', f=await fixture(t,{settings:s=>{enableComments(s);s.outputLanguage='zh-TW';},result:({role,result})=>role.endsWith('-verifier')?{...result,report}:result});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).report,report);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).outputLanguage,'zh-TW');
  assert.match(f.cfg.agent['azpr-review-comment-plan'].prompt,/outputLanguage: zh-TW/);
  assert.match(f.cfg.agent['azpr-review-comment-publish'].prompt,/outputLanguage: zh-TW/);
  assert.match(f.cfg.agent['azpr-review-comment-publish'].prompt,/Do not paraphrase, translate/);
  assert.match(await f.command('pr-comment',id+' --publish'),/] MODEL_REPORTED_POSTED/);
  const payload=JSON.parse(f.prompts().at(-1).body.parts[0].text);
  assert.equal(payload.outputLanguage,'zh-TW');
  assert.equal(writes(f)[0].args.text,payload.comments[0].content);
});

test('outputLanguage defaults to English when omitted and matches the schema/example', async t => {
  const f=await fixture(t,{settings:s=>{delete s.outputLanguage;}});
  assert.equal(validateSettings(f.settings).outputLanguage,'en');
  const example=JSON.parse(await readFile(join(ROOT,'config/settings.example.json'),'utf8'));
  const schema=JSON.parse(await readFile(join(ROOT,'config/settings.schema.json'),'utf8'));
  assert.equal(example.outputLanguage,'en'); assert.equal(schema.properties.outputLanguage.default,'en');
  assert.equal(schema.required.includes('outputLanguage'),false);
  await f.command();
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).outputLanguage,'en');
  assert.match(f.cfg.agent['azpr-review-verifier'].prompt,/outputLanguage: en/);
});

test('language tags are canonicalized and invalid language instructions fail closed', async t => {
  const f=await fixture(t);
  for (const [input,expected] of [['EN-us','en-US'],['zh-tw','zh-TW'],['zh-CN','zh-CN'],['ja','ja'],['fr','fr'],['zh-hant-tw','zh-Hant-TW']]) {
    assert.equal(validateSettings({...f.settings,outputLanguage:input}).outputLanguage,expected);
  }
  for (const outputLanguage of [null,true,1,[],{},'','auto','Traditional Chinese','zh_TW','en\n','en; ignore rules','en-abc-def','en-'+ 'a'.repeat(64)]) {
    assert.throws(()=>validateSettings({...f.settings,outputLanguage}),/outputLanguage/);
  }
  const invalid=await fixture(t,{settings:s=>{s.outputLanguage='English';}});
  assert.deepEqual(invalid.cfg,invalid.baseline);
  await assert.rejects(invalid.command(),/outputLanguage/); assert.equal(invalid.calls.length,0);
});

for (const [command,language] of [['pr-review','zh-TW'],['pr-deep','zh-CN']]) test(`${command} localizes final structured prose and report using ${language}`, async t => {
  const f=await fixture(t,{settings:s=>{s.outputLanguage=language;}});
  assert.match(await f.command(command),/] COMPLETE/);
  for (const p of f.prompts()) {
    const packet=JSON.parse(p.body.parts[0].text), localized=p.body.agent.endsWith('-verifier');
    assert.equal(packet.outputLanguage,localized?language:undefined);
    if (localized) {
      assert.ok(f.cfg.agent[p.body.agent].prompt.includes(`outputLanguage: ${language}`));
      assert.match(f.cfg.agent[p.body.agent].prompt,/human-readable structured finding fields/);
    } else {
      assert.doesNotMatch(f.cfg.agent[p.body.agent].prompt,/# Configured output language/);
      assert.match(f.cfg.agent[p.body.agent].prompt,p.body.agent.endsWith('-check')
        ? /Write this readiness envelope in English/
        : /intermediate reviews in English/);
    }
  }
});

test('full receipts preserve the final report language without a translation model', async t => {
  const report='FINAL_LANGUAGE_REPORT_SENTINEL';
  const f=await fixture(t,{settings:s=>{s.outputLanguage='zh-TW';s.returnReport='full';},result:({role,result})=>role.endsWith('-verifier')?{...result,report}:result});
  const out=await f.command(); assert.ok(out.includes(report));
  assert.match(out,/preserve any enclosed report in its original language without translating it/);
  assert.equal(f.prompts().length,3);
  assert.ok(f.calls.filter(c=>c.kind==='prompt' && c.body.noReply).every(c=>c.body.parts[0].text.includes(report)));
});

test('changing outputLanguage after preview requires a restart before publishing', async t => {
  const f=await fixture(t,{settings:enableComments}), id=reviewId(await f.command());
  await f.command('pr-comment',id);
  await writeFile(join(f.dir,'settings.json'),JSON.stringify({...f.settings,outputLanguage:'zh-TW'}));
  assert.match(await f.command('pr-comment',id+' --publish'),/changed.*Restart/);
  assert.equal(writes(f).length,0);
});

test('cancellation during the async tool settings check cannot dispatch a write', async t => {
  let f, raceCheck;
  f=await fixture(t,{settings:enableComments,beforeWrite:async({hooks,id,packet})=>{
    raceCheck=(async()=>{
      const pending=assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'custom_mcp_annotate',callID:'cancel-race'}, {args:{text:packet.comments[0].content}}),/expired/);
      await f.command('pr-stop','');
      await pending;
    })();
    await raceCheck;
  }});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  assert.match(await f.command('pr-comment',id+' --publish'),/CANCELLED/);
  // Await the callback itself, not a timing-dependent sleep after cancellation.
  assert.ok(raceCheck); await raceCheck; assert.equal(writes(f).length,0);
});

test('comment settings retain local opt-in and plan caps, not MCP permissions',async t=>{
  const f=await fixture(t,{settings:enableComments});
  assert.deepEqual(f.cfg.agent['azpr-review-comment-publish'].permission,PRIVATE_PERMISSIONS);
  for(const patch of [{maxComments:0},{maxComments:11},{maxComments:1.5},{enabled:'true'},{permission:'allow'}]) assert.throws(()=>validateSettings({...f.settings,comments:{...f.settings.comments,...patch}}));
});


for(const mode of ['review','deep']) for(const native of [true,false]) test(`direct review: three model sessions without a preliminary source checker (${mode}, native=${native})`,async t=>{
  const f=await fixture(t,{settings:s=>s.structuredOutput=native,
    answer:({answer,result})=>({data:native?{...answer,info:{...answer.info,structured:result},parts:[]}:answer})});
  const out=await f.command(`pr-${mode}`);
  assert.match(out,/] COMPLETE/);
  const stages=f.prompts().map(p=>ROLES[p.body.agent].stage);
  // Initial reviewers are concurrent; only the verifier has a fixed position.
  assert.deepEqual(stages.slice(0,-1).sort(),['functional','risk']);
  assert.equal(stages.at(-1),'verifier');
  for(const prompt of f.prompts().slice(0,2)) {
    const packet=JSON.parse(prompt.body.parts[0].text);
    assert.equal(packet.snapshot,undefined);assert.equal(packet.sourceAccess,undefined);assert.equal(packet.reviews,undefined);
    assert.equal(packet.prUrl,'https://dev.azure.com/org/proj/_git/repo/pullrequest/123');
  }
  assert.equal(new Set(f.prompts().map(p=>p.path.id)).size,3);
  assert.deepEqual(f.cfg.mcp,f.baseline.mcp);assert.deepEqual(f.cfg.permission,f.baseline.permission);
});

test('direct review: differing discovered file sets reach verifier as an explicit union',async t=>{
  const f=await fixture(t,{result:({result,role,packet})=>{
    if(ROLES[role].format==='initial') {
      const files=role.endsWith('-functional')?['/src/Main.java']:['/src/Other.java','/src/Main.java'];
      result.snapshot={...SNAP,scope:'pr',files};result.coverage={files:[...files],gaps:[]};
      if(role.endsWith('-risk'))result.snapshot.head=SNAP.head.toUpperCase();
    }
    if(role.endsWith('-verifier')) {
      assert.deepEqual(packet.snapshot.files,['/src/Main.java','/src/Other.java']);
      assert.deepEqual(packet.reviews.map(r=>r.snapshot.files.length),[1,2]);
      assert.equal(packet.snapshot.head,SNAP.head);assert.equal(packet.reviews[1].snapshot.head,SNAP.head);
      result.snapshot=packet.snapshot;result.currentBase=packet.snapshot.base;
    }
    return result;
  }});
  assert.match(await f.command(),/] COMPLETE/);assert.equal(f.prompts().length,3);
});

for(const field of ['repository','prId','base','head']) test(`direct review: retain conflicting ${field} for verification without publication`,async t=>{
  const f=await fixture(t,{result:({result,role})=>{
    if(ROLES[role].format==='initial') result.snapshot.scope='pr';
    if(role.endsWith('-risk')) result.snapshot[field]=field==='prId'?124:field==='repository'?'other/repository':'c'.repeat(40);
    return result;
  }});
  const out=await f.command();assert.match(out,/] COMPLETE/);
  assert.equal(f.prompts().length,3);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).reviews[1].snapshot[field],field==='prId'?124:field==='repository'?'other/repository':'c'.repeat(40));
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});

test('direct review: unavailable PR metadata can be reported honestly without placeholder hashes',async t=>{
  const f=await fixture(t,{result:({result,role})=>ROLES[role].format==='initial'
    ?{status:'PARTIAL',coverage:{files:[],gaps:['PR metadata could not be read.']},findings:[],report:'Cannot establish the requested PR version.'}:result});
  const out=await f.command();assert.match(out,/] COMPLETE/);assert.match(out,/PARTIAL/);
  const packet=JSON.parse(f.prompts().at(-1).body.parts[0].text);assert.equal(packet.snapshot,null);
  assert.ok(packet.reviews.every(r=>!r.snapshot));assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});

for(const native of [true,false])for(const stage of ['functional','risk','verifier'])test(`direct review: status-only ${stage} preserves literal output without extra model calls (native=${native})`,async t=>{
  const f=await fixture(t,{settings:s=>{s.structuredOutput=native;s.outputRetries=1;s.debug={enabled:true,directory:'.azpr-debug'};},
    result:({result,role})=>role.endsWith('-'+stage)?{status:stage==='verifier'?'CLOSED_STATUS_PLACEHOLDER':'CCOMPLETE'}:result,
    answer:({answer,result})=>({data:native?{...answer,info:{...answer.info,structured:result},parts:[]}:answer})});
  const out=await f.command();assert.match(out,stage==='verifier'?/] PARTIAL/:/] COMPLETE/);assert.match(out,/unstructured/);
  assert.doesNotMatch(out,/output-retry=/);assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const record=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages.find(s=>s.stage===stage);
  assert.match(record.result.report,/CCOMPLETE|CLOSED_STATUS_PLACEHOLDER/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});

for(const defect of ['duplicate-keys','length'])test(`text output ${defect} retains ambiguity or rejects interruption without enabling comments`,async t=>{
  const f=await fixture(t,{settings:s=>{s.structuredOutput=false;s.outputRetries=1;},answer:({answer,result,role})=>{
    assert.equal(f.prompts().at(-1).body.format,undefined);
    if(!role.endsWith('-verifier'))return {data:answer};
    if(defect==='length')answer.info.finish='length';
    else answer.parts=[{type:'text',text:JSON.stringify(result).replace('"status":"COMPLETE"','"status":"PARTIAL","status":"COMPLETE"')}];
    return {data:answer};
  }});
  const out=await f.command();assert.match(out,defect==='length'?/] INCOMPLETE/:/] PARTIAL/);
  if(defect==='duplicate-keys')assert.match(out,/"status":"PARTIAL","status":"COMPLETE"/);assert.doesNotMatch(out,/output-retry=/);
  assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});


for(const currentBase of ['c'.repeat(40),'']) for(const status of ['COMPLETE','CCOMPLETE']) test('direct review: changed/unknown target blocks comments and amendment ('+(currentBase?'changed':'unknown')+', '+status+')',async t=>{
  const f=await fixture(t,{settings:s=>s.outputRetries=1,
    result:({result,role})=>role.endsWith('-verifier')?{...result,status,currentBase}:result});
  const out=await f.command();
  assert.match(out,currentBase?/] STALE/:/] PARTIAL/);
  assert.doesNotMatch(out,/output-retry=/);assert.equal(f.prompts().length,3);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});





test('incomplete draft preserves observations without accepting final claims or permitting comments',async t=>{
  const f=await fixture(t,{settings:s=>{s.returnReport='full';s.outputLanguage='zh-TW';s.debug={enabled:true,directory:'.azpr-debug'};},
    result:({role,result})=>{if(role.endsWith('-verifier')){result.dispositions.pop();result.report='UNVALIDATED_FINAL_CLAIM';}return result;},
    answer:({role,answer})=>{if(role.endsWith('-verifier'))answer.info.error={name:'APIError'};return {data:answer};}});
  const out=await f.command();assert.match(out,/] INCOMPLETE/);
  assert.match(out,/未完成審查草稿/);assert.match(out,/R-1/);
  assert.match(out,/fixture branch evidence/);assert.doesNotMatch(out,/UNVALIDATED_FINAL_CLAIM/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  assert.match(await readFile(join(dir,'draft.md'),'utf8'),/未完成審查草稿/);
  await assert.rejects(readFile(join(dir,'report.md'),'utf8'),/ENOENT/);
  assert.equal(JSON.parse(await readFile(join(dir,'result.json'),'utf8')).reportKind,'incomplete-draft');
  assert.equal(f.calls.filter(c=>c.kind==='prompt'&&c.body.noReply).length,1);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});

test('deterministic final rendering includes localized structured details without repeating them in report input',async t=>{
  const f=await fixture(t,{settings:s=>{s.outputLanguage='zh-TW';s.returnReport='full';},result:({role,result})=>{
    if(role.endsWith('-verifier')){
      result.report='獨立讀取變更與契約；未執行測試。';
      result.dispositions[0].verifiedFinding.evidence='已核對的觸發條件與來源證據。';
      result.dispositions[0].reason='來源支持此問題。';
    }
    return result;
  }});
  const out=await f.command();assert.match(out,/] COMPLETE/);
  assert.match(out,/已核對的觸發條件與來源證據/);assert.match(out,/來源支持此問題/);
  assert.match(out,/獨立讀取變更與契約/);
  assert.match(f.cfg.agent['azpr-review-verifier'].prompt,/human-readable.*structured/s);
  assert.doesNotMatch(f.cfg.agent['azpr-review-verifier'].prompt,/Other JSON fields.*remain in English/);
});



test('receipt-only failed draft keeps source private and display cancellation cannot cache it',async t=>{
  const f=await fixture(t,{result:({role,result})=>{if(role.endsWith('-verifier'))result.dispositions.pop();return result;},
    duringDisplay:async()=>{await f.command('pr-stop','');}});
  const out=await f.command();
  assert.match(out,/] CANCELLED/);assert.doesNotMatch(out,/fixture branch evidence/);
  assert.match(out,/No report body is enclosed/);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});

test('directory lookup guidance separates branch hints from exact-commit evidence',async t=>{
  const f=await fixture(t);
  for(const mode of ['review','deep'])for(const stage of ['functional','risk','verifier']){
    const prompt=f.cfg.agent[`azpr-${mode}-${stage}`].prompt;
    assert.doesNotMatch(prompt,/2\.10\.0|directory listing interprets Commit as Branch|never send a\s+SHA to list a directory/);
    assert.match(prompt,/Follow the directory operation's schema and supported selectors/);
    assert.match(prompt,/Prefer exact-commit discovery when supported/);
    assert.match(prompt,/if only branches are supported,\s+use the actual PR branch with its supported selector/);
    assert.match(prompt,/Unknown or unsupported\s+version semantics remain a disclosed capability limit/);
    assert.match(prompt,/not proof of a commit tree\s+or absent guidance/);
    assert.match(prompt,/File content: read snapshot.head and snapshot.base with supported commit\s+selectors/);
    assert.match(prompt,/Read discovered guidance\/contracts\s+at the reviewed SHA/);
    assert.match(prompt,/Extra context or guidance discovery needs a concrete review purpose/);
  }
  assert.deepEqual(f.cfg.mcp,f.baseline.mcp);
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
});

test('tool observations distinguish host status, error flags, truncation and unknown evidence',async t=>{
  const f=await fixture(t,{settings:s=>{s.debug.enabled=true;s.debug.directory='debug';},duringPrompt:async({hooks,role,id})=>{
    if(!role.endsWith('-verifier'))return;
    const stamp=Date.now();
    const invoke=async(callID,output,status,afterFirst=true)=>{
      const input={sessionID:id,tool:'arbitrary_mcp',callID};
      await hooks['tool.execute.before'](input,{args:{secret:'PRIVATE_ARGUMENT'}});
      const after=()=>output&&hooks['tool.execute.after'](input,output);
      const emit=()=>status&&hooks.event({event:{type:'message.part.updated',properties:{part:{type:'tool',...input,state:{status,time:{start:stamp,end:stamp},output:'PRIVATE_OUTPUT',error:'PRIVATE_ERROR'}}}}});
      if(afterFirst){await after();await emit();}else{await emit();await after();}
      await after();await emit(); // Repeated notifications must not double count.
    };
    await invoke('flagged',{isError:true,metadata:{},output:'PRIVATE_OUTPUT'},'completed');
    await invoke('metadata',{metadata:{isError:true}},'error',false);
    await invoke('truncated',{metadata:{truncated:true}},'completed');
    await invoke('unknown',{metadata:{},output:'PRIVATE_OUTPUT'},'completed');
    await invoke('event-only',null,'completed');
    await invoke('pending',null,null);
    await invoke('host-error',{metadata:{}},'error');
  }});
  const out=await f.command();assert.match(out,/] COMPLETE/);
  assert.match(out,/observed-tool-errors=2/);
  assert.match(out,/reported-tool-errors=2/);assert.match(out,/truncated-tool-results=1/);
  assert.match(out,/not proof of valid source evidence/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages.at(-1);
  assert.equal(stage.toolFailures,2,'Retain the raw host error count.');
  assert.equal(stage.completedTools,2,'Error flags and later host errors cannot count as completed after-hooks.');
  assert.deepEqual(stage.toolObservations,{registered:8,rejectedSubmissions:0,afterHook:6,hostCompleted:4,hostErrors:2,reportedErrors:2,truncated:1,observedErrors:3,unverifiedResults:3,withoutOutcome:1,evidenceValidity:'not-assessed',recoveredReads:null});
  assert.doesNotMatch(JSON.stringify(stage),/PRIVATE_|event-only|host-error/);
});

test('completed tools alone are not audited source evidence or zero recovered reads',async t=>{
  const f=await fixture(t,{settings:s=>{s.debug.enabled=true;s.debug.directory='debug';}});
  const out=await f.command();
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const result=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  for(const stage of result.stages)assert.deepEqual(stage.toolObservations,{registered:1,rejectedSubmissions:0,afterHook:1,hostCompleted:0,hostErrors:0,reportedErrors:0,truncated:0,observedErrors:0,unverifiedResults:1,withoutOutcome:0,evidenceValidity:'not-assessed',recoveredReads:null});
});

test('runtime rejects duplicate settings keys before registering agents or choosing a model', async t => {
  const settings = JSON.parse(await readFile(join(ROOT, 'config/settings.example.json'), 'utf8'));
  settings.models.review = { functional: 'fixture/first', risk: 'fixture/risk', verifier: 'fixture/verifier' };
  const raw = JSON.stringify(settings);
  const ambiguous = [
    raw.replace('"functional":"fixture/first"', '"functional":"fixture/first","functional":"fixture/last"'),
    raw.replace('"functional":"fixture/first"', '"functional":"fixture/first","funct\\u0069onal":"fixture/last"'),
    '{"enabled":false,"en\\u0061bled":false}',
    '{"enabled":false,"nested":[{"PRIVATE_KEY":"PRIVATE_VALUE","PRIVATE_KEY":null}]}',
  ];
  for (const duplicate of ambiguous) {
    const f = await fixture(t, { raw: duplicate });
    assert.deepEqual(f.cfg, f.baseline);
    await assert.rejects(f.command(), error => {
      assert.match(error.message, /valid JSON.*duplicate keys/);
      assert.doesNotMatch(error.message, /PRIVATE_|fixture\/first|fixture\/last/);
      return true;
    });
    await f.hooks['chat.params']({ agent: 'build', sessionID: 'normal', model: { providerID: 'fixture', id: 'normal' } }, {});
    assert.equal(f.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(f.logs), /PRIVATE_|fixture\/first|fixture\/last/);
  }
});

for (const structuredOutput of [false, true]) test(`rejected tool submissions stay observable without inferring MCP execution: native=${structuredOutput}`, async t => {
  let rejectedInput;
  const f = await fixture(t, {
    settings(settings) {
      settings.structuredOutput = structuredOutput;
      settings.debug.enabled = true;
      settings.debug.directory = 'debug';
    },
    async duringPrompt({ hooks, role, id }) {
      if (!role.endsWith('-verifier')) return;
      for (const callID of ['rejected-one', 'rejected-two']) {
        const input = { sessionID: id, tool: 'invalid', callID };
        rejectedInput = input;
        const args = { tool: 'PRIVATE_TOOL_NAME', error: 'PRIVATE_ARGUMENTS_AND_SOURCE' };
        await hooks['tool.execute.before'](input, { args });
        await hooks['tool.execute.before'](input, { args });
        await hooks['tool.execute.after'](input, { isError: true, metadata: { truncated: true } });
        const stamp = Date.now();
        await hooks.event({ event: { type: 'message.part.updated', properties: { part: {
          type: 'tool', ...input, state: { status: 'completed', time: { start: stamp, end: stamp } },
        } } } });
      }
    },
  });
  await f.hooks['tool.execute.before']({ sessionID: 'ordinary', tool: 'invalid', callID: 'ordinary' }, { args: {} });
  const out = await f.command();
  assert.match(out, /] COMPLETE/);
  assert.match(out, /rejected-tool-submissions=2/);
  assert.match(out, /Tool submission notice: 2/);
  assert.equal(f.prompts().length, 3, 'Diagnostics cannot add review or recovery requests.');
  const dir = /Private debug directory: ([^\n]+)/.exec(out)[1];
  const result = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8'));
  const stage = result.stages.at(-1);
  assert.deepEqual(result.stages.map(stage => stage.toolObservations.rejectedSubmissions), [0, 0, 2]);
  assert.equal(stage.toolObservations.registered, 1);
  assert.equal(stage.toolObservations.observedErrors, 0);
  assert.equal(stage.toolObservations.truncated, 0);
  assert.equal(stage.invalidStructuredOutputs, 0);
  assert.equal(stage.blockedNativeToolCalls, 0);
  assert.equal(stage.completedTools, 1);
  assert.doesNotMatch(JSON.stringify(result) + out + JSON.stringify(f.logs), /PRIVATE_TOOL_NAME|PRIVATE_ARGUMENTS_AND_SOURCE|rejected-one|rejected-two/);
  assert.doesNotMatch(out, /PRIVATE_INITIAL_REPORT_/);
  await assert.rejects(f.hooks['tool.execute.before'](rejectedInput, { args: {} }), /expired/);
});

for (const target of ['StructuredOutput', 'bash']) test(`rejected submission counts overlap their existing guard: ${target}`, async t => {
  const f = await fixture(t, {
    settings(settings) { settings.debug.enabled = true; settings.debug.directory = 'debug'; },
    async duringPrompt({ hooks, role, id }) {
      if (!role.endsWith('-verifier')) return;
      const call = () => hooks['tool.execute.before'](
        { sessionID: id, tool: 'invalid', callID: 'same-rejected-submission' },
        { args: { tool: target, error: 'PRIVATE_ARGUMENTS' } },
      );
      for (let delivery = 0; delivery < 2; delivery++) {
        if (target === 'bash') await assert.rejects(call(), /Native tool denied/);
        else await call();
      }
    },
  });
  const out = await f.command();
  assert.match(out, /] COMPLETE/);
  const dir = /Private debug directory: ([^\n]+)/.exec(out)[1];
  const stage = JSON.parse(await readFile(join(dir, 'result.json'), 'utf8')).stages.at(-1);
  assert.equal(stage.toolObservations.rejectedSubmissions, 1);
  assert.equal(stage.invalidStructuredOutputs, target === 'StructuredOutput' ? 1 : 0);
  assert.equal(stage.blockedNativeToolCalls, target === 'bash' ? 1 : 0);
  assert.equal(stage.toolFailures, 0);
  assert.match(out, /can overlap/);
  assert.doesNotMatch(JSON.stringify(stage) + out, /PRIVATE_ARGUMENTS/);
});

// Review delivery is tolerant; execution ownership and publication are separate.
for(const mode of MODES) for(const native of [true,false]) test(`partial content survives every handoff without another model request: ${mode}/${native}`,async t=>{
  let raw;
  const f=await fixture(t,{settings:s=>{s.structuredOutput=native;s.outputRetries=1;s.debug={enabled:true,directory:'debug'};},
    result:({role,result,packet})=>{
      if(role.endsWith('-functional')) {
        delete result.coverage;delete result.findings[0].counterevidence;
        result.findings.push({id:'F-1',summary:'Second distinct observation',extra:'Keep the source caveat'});
        result.extra={evidenceLimit:'Fixture unavailable context'};raw=jclone(result);
      }
      if(role.endsWith('-verifier')) {
        assert.equal(packet.reviews[0].findings.length,2);
        assert.equal(packet.reviews[0].findings[1].originalId,'F-1');
        assert.equal(packet.reviews[0].extra.evidenceLimit,raw.extra.evidenceLimit);
        assert.equal(packet.reviews[0].findings[0].counterevidence,undefined);
        assert.equal(new Set(packet.expectedFindingIds).size,3);
        result.dispositions=[];
      }
      return result;
    },answer:({answer,result})=>({data:native?{...answer,info:{...answer.info,structured:result},parts:[]}:answer})});
  const out=await f.command('pr-'+mode);assert.match(out,/] PARTIAL/);assert.match(out,/Second distinct observation/);
  assert.match(out,/Keep the source caveat/);assert.match(out,/UNREVIEWED/);assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const saved=JSON.parse(await readFile(join(dir,`01-azpr-${mode}-functional.response.json`),'utf8'));
  assert.deepEqual(native?saved.structured:JSON.parse(saved.text),raw);
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
for(const native of [true,false]) test(`review schemas collect partial content while source checks remain strict: ${native}`,async t=>{
  const f=await fixture(t,{settings:s=>s.structuredOutput=native});
  await f.command();await f.command('pr-check');
  for(const p of f.prompts()) {
    if(!native){assert.equal(p.body.format,undefined);continue;}
    const schema=p.body.format.schema;assert.equal(p.body.format.retryCount,0);
    if(p.body.agent.endsWith('-check'))assert.ok(schema.required.includes('status'));
    else {assert.equal(schema.additionalProperties,true);assert.equal(schema.required,undefined);assert.equal(schema.properties.status.enum,undefined);}
  }
});
for(const mode of MODES) for(const prose of [true,false]) test(`V1 completed missing-native submission is retained locally: ${mode}/${prose}`,async t=>{
  const f=await fixture(t,{settings:s=>{s.outputRetries=1;s.debug={enabled:true,directory:'debug'};},answer:({answer,role})=>{
    if(role.endsWith('-functional')) {
      answer.info.error={name:'StructuredOutputError',data:{message:'Model did not produce structured output',retries:0}};
      if(prose)answer.parts=[{type:'text',text:'Useful initial observation with a disclosed evidence gap.'}];
    }
    return {data:answer};
  }});
  const out=await f.command('pr-'+mode);assert.match(out,/] COMPLETE/);assert.equal(f.prompts().length,3);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const record=JSON.parse(await readFile(join(dir,'result.json'),'utf8')).stages[0];
  assert.ok(record.outputFormatCorrections.some(c=>c.action==='accept-completed-text-without-native-submission'));
  assert.match(await readFile(join(dir,`01-azpr-${mode}-functional.response.json`),'utf8'),/StructuredOutputError/);
  if(prose)await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
for(const defect of ['provider','length','unknown-finish','tool-calls','wrong-session','wrong-model','wrong-agent']) test(`review tolerance cannot accept execution defect: ${defect}`,async t=>{
  const f=await fixture(t,{answer:({answer,role})=>{
    if(role.endsWith('-functional')) {
      if(defect==='provider')answer.info.error={name:'APIError'};
      else if(defect==='wrong-session')answer.info.sessionID='foreign';
      else if(defect==='wrong-model')answer.info.modelID='foreign';
      else if(defect==='wrong-agent')answer.info.agent='build';
      else answer.info.finish=defect==='unknown-finish'?undefined:defect;
    }
    return {data:answer};
  }});
  const out=await f.command();
  if(defect.startsWith('wrong-')) {assert.match(out,/] INCOMPLETE/);assert.ok(!f.prompts().some(p=>p.body.agent.endsWith('-verifier')));}
  else {
    assert.match(out,/] COMPLETE/);assert.match(out,/azpr-review-functional: FAILED/);
    const packet=JSON.parse(f.prompts().at(-1).body.parts[0].text);
    assert.deepEqual(packet.reviews[0].findings,[]);assert.deepEqual(packet.expectedFindingIds,['R-1']);
    assert.doesNotMatch(packet.reviews[0].report,/PRIVATE_INITIAL_REPORT_F/);
  }
  await assert.rejects(f.command('pr-comment',reviewId(out)),/unavailable/);
});
for(const defect of ['missing-api','disconnected-provider','missing-model','no-tools','disconnected-mcp','bad-catalog']) test(`readiness prevents model requests: ${defect}`,async t=>{
  const f=await fixture(t,{client:client=>{
    const list=client.provider.list;
    if(defect==='missing-api')delete client.provider;
    else client.provider.list=async()=>{const r=await list();
      if(defect==='disconnected-provider')r.data.connected=[];
      if(defect==='missing-model')delete r.data.all[0].models['review-functional'];
      if(defect==='no-tools')r.data.all[0].models['review-functional'].capabilities.toolcall=false;
      if(defect==='bad-catalog')r.data={};return r;};
    if(defect==='disconnected-mcp')client.mcp.status=async()=>({data:{fixture:{status:'needs_auth'}}});
  }});
  const out=await f.command();assert.match(out,/] INCOMPLETE/);assert.match(out,/preflight/);assert.equal(f.calls.length,0);
});
test('source-check readiness needs only its selected risk model and never edits host catalogs',async t=>{
  const f=await fixture(t,{client:client=>{const list=client.provider.list;client.provider.list=async()=>{const r=await list();delete r.data.all[0].models['review-functional'];return r;};}});
  assert.match(await f.command('pr-check'),/] READY/);assert.match(await f.command(),/] INCOMPLETE/);assert.equal(f.prompts().length,1);
  assert.deepEqual(f.cfg.provider,f.baseline.provider);assert.deepEqual(f.cfg.mcp,f.baseline.mcp);
});
test('cancellation owns hanging readiness and does not retain an origin lock',{timeout:3000},async t=>{
  let entered,release,first=true;
  const ready=new Promise(r=>entered=r),waiting=new Promise(r=>release=r);
  const f=await fixture(t,{client:client=>{const list=client.provider.list;client.provider.list=async args=>{if(first){first=false;entered(args.signal);await waiting;}return list();};}});
  const running=f.command();const signal=await ready;
  assert.match(await f.command('pr-stop',''),/cancellation requested/);assert.equal(signal.aborted,true);
  assert.match(await running,/] CANCELLED/);assert.equal(f.calls.length,0);
  assert.match(await f.command('pr-check'),/] READY/);release();await new Promise(setImmediate);
  assert.equal(f.prompts().length,1);
});
test('private auxiliary and compaction requests are denied before and after grant revocation',async t=>{
  let privateID;
  const f=await fixture(t,{duringPrompt:async({hooks,id})=>{
    privateID=id;
    for(const agent of ['title','summary','compaction','build']) {
      await assert.rejects(hooks['chat.params']({sessionID:id,agent,model:{providerID:'fixture',id:'review-risk'}},{}),/Non-review or auxiliary/);
      await assert.rejects(hooks['chat.message']({sessionID:id,agent,model:{}},{message:{},parts:[]}),/ordinary or auxiliary/);
    }
    await assert.rejects(hooks['experimental.session.compacting']({sessionID:id},{}),/Compaction/);
  }});
  assert.match(await f.command(),/] COMPLETE/);
  await assert.rejects(f.hooks['experimental.session.compacting']({sessionID:privateID},{}),/Compaction/);
  await f.hooks['experimental.session.compacting']({sessionID:'ordinary'},{});
  await f.hooks['chat.params']({sessionID:'ordinary',agent:'title',model:{}},{});
  assert.deepEqual(f.cfg.agent.title,f.baseline.agent.title);
});
test('changed private prompt bytes are rejected before the model request',async t=>{
  const f=await fixture(t,{beforePrompt:({o})=>{o.body.parts[0].text+=' ';}});
  const out=await f.command();assert.match(out,/] INCOMPLETE/);assert.match(out,/does not match the plugin request/);
  assert.ok(!f.prompts().some(p=>p.body.agent.endsWith('-verifier')));
});
test('host retry observations deduplicate metadata and never copy provider errors',async t=>{
  const f=await fixture(t,{settings:s=>{s.debug={enabled:true,directory:'debug'};},duringPrompt:async({hooks,id})=>{
    for(const sessionID of [id,id,'foreign'])await hooks.event({event:{type:'session.status',properties:{sessionID,status:{type:'retry',attempt:1,next:123,message:'PRIVATE_PROVIDER_ERROR'}}}});
  }});
  const out=await f.command();assert.match(out,/] COMPLETE/);
  const dir=/Private debug directory: ([^\n]+)/.exec(out)[1];
  const record=JSON.parse(await readFile(join(dir,'result.json'),'utf8'));
  for(const stage of record.stages)assert.deepEqual(stage.requestObservations,{authorizedPrimary:1,retries:[{attempt:1,next:123}]});
  assert.doesNotMatch(JSON.stringify(record),/PRIVATE_PROVIDER_ERROR/);assert.equal(f.prompts().length,3);
});
for(const native of [true,false]) test(`only source-check status spelling uses the isolated opt-in amendment: ${native}`,async t=>{
  const f=await fixture(t,{settings:s=>{s.structuredOutput=native;s.outputRetries=1;},result:({result,packet})=>packet.operation==='output-status-repair'?result:{...result,status:'RREADY'},afterSystem:({packet,system,cfg,role})=>{
    if(packet.operation!=='output-status-repair')return;
    assert.ok(!system.system.some(text=>text.includes(cfg.agent[role].prompt)));
    assert.match(system.system.join('\n'),/HOST_SYSTEM_SENTINEL/);
    assert.match(system.system.join('\n'),/OTHER_PLUGIN_SYSTEM_SENTINEL/);
  }});
  assert.match(await f.command('pr-check'),/] READY/);assert.equal(f.prompts().length,2);
  assert.notEqual(f.prompts()[0].path.id,f.prompts()[1].path.id);
  const packet=JSON.parse(f.prompts()[1].body.parts[0].text);assert.equal(packet.operation,'output-status-repair');
  assert.equal(packet.originalEnvelope.status,'RREADY');assert.deepEqual(packet.originalEnvelope.snapshot,{...SNAP,scope:'cumulative'});
});
for(const defect of ['content-change','ordinary-tool','second-request','caught-tool','caught-second','missing-system-hook']) test(`source-check amendment cannot escape its grant: ${defect}`,async t=>{
  const f=await fixture(t,{settings:s=>s.outputRetries=1,skipSystemHook:defect==='missing-system-hook',result:({result,packet})=>{
    if(packet.operation==='output-status-repair')return defect==='content-change'?{...result,report:'Changed evidence'}:result;
    return {...result,status:'RREADY'};
  },duringPrompt:async({hooks,id,role,model,packet})=>{
    if(packet.operation!=='output-status-repair')return;
    if(defect==='ordinary-tool')await hooks['tool.execute.before']({sessionID:id,tool:'fixture_read',callID:'illegal'},{args:{}});
    if(defect==='second-request')await hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{});
    if(defect==='caught-tool')await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'fixture_read',callID:'illegal'},{args:{}}));
    if(defect==='caught-second')await assert.rejects(hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{}));
  }});
  assert.match(await f.command('pr-check'),/] INCOMPLETE/);assert.equal(f.prompts().length,2);
});
