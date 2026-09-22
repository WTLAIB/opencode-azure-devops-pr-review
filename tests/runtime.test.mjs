import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAzurePrReviewPlugin, ROLES, validateSettings } from '../src/runtime.mjs';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SNAP = { repository:'org/proj/repo',prId:123,base:'a'.repeat(40),head:'b'.repeat(40),scope:'cumulative',files:['/src/Main.java'] };
const jclone = x => JSON.parse(JSON.stringify(x));
async function fixture(t, opts={}) {
  const dir=await mkdtemp(join(tmpdir(),'azpr-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await cp(join(ROOT,'src/prompts'),join(dir,'prompts'),{recursive:true});
  const settings=JSON.parse(await readFile(join(ROOT,'config/settings.example.json'),'utf8'));
  Object.assign(settings.models,{freeA:'fixture/free-a',freeB:'fixture/free-b',deep:'fixture/paid-deep',final:'fixture/paid-final'});
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
      const role=o.body.agent, id=o.path.id, model=o.body.model;
      if (o.body.noReply) {
        await hooks['chat.message']({sessionID:id,agent:role,model},{message:{agent:role,model},parts:jclone(o.body.parts)});
        if(opts.duringDisplay) await opts.duringDisplay({hooks,role,id,model});
        return {data:{info:{role:'user'},parts:o.body.parts}};
      }
      const packet=JSON.parse(o.body.parts[0].text);
      if(opts.beforePrompt) await opts.beforePrompt({hooks,role,id,model,packet,o,calls,cfg,dir});
      if(!opts.skipMessageHook) await hooks['chat.message']({sessionID:id,agent:role,model},{message:{agent:role,model},parts:jclone(o.body.parts)});
      if(!opts.skipParamsHook) await hooks['chat.params']({sessionID:id,agent:role,model:{providerID:model.providerID,id:model.modelID}},{});
      if(opts.duringPrompt) await opts.duringPrompt({hooks,role,id,model,packet,o,calls,cfg,dir});
      if(!opts.skipAzure && !role.startsWith('azpr-comment-')) {
        const tool=opts.readTool ?? 'ado_repo_pull_request'; const callID=`read-${id}`;
        const args = opts.readTool ? {repositoryId:'repo',project:'proj',pullRequestId:123} : {action:'get'};
        await hooks['tool.execute.before']({sessionID:id,tool,callID},{args});
        if(!opts.skipAzureAfter) await hooks['tool.execute.after']({sessionID:id,tool,callID,args},{title:'fixture read',output:'fixture code',metadata:opts.readMetadata ?? {}});
      }
      let result;
      if(role.startsWith('azpr-comment-')) {
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
        if(role==='azpr-comment-plan'){
          const count=Math.min(opts.planCount ?? 1,packet.maxComments);
          result={status:'READY',comments:packet.findings.slice(0,count).map(f=>({findingId:f.id,severity:'high',path:SNAP.files[0],startLine:12,endLine:12,anchor:'fixture code',body:`issue (high): ${f.id} fixture defect\n\nTrigger and impact. Suggested fix and test.`})),skipped:packet.findings.slice(count).map(f=>({findingId:f.id,reason:'Duplicate or comment limit reached.'}))};
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
      else if(role==='azpr-check') result={status:'READY',snapshot:jclone(SNAP),sourceAccess:{diff:'fixture'},requirements:'fixture requirement',report:'SOURCE REPORT'};
      else if(role.startsWith('azpr-verify-')) result={status:'COMPLETE',snapshot:jclone(SNAP),currentHead:SNAP.head,dispositions:packet.reviews.flatMap(r=>r.findings).map(f=>({id:f.id,status:'CONFIRMED',reason:'verified fixture evidence'})),report:'FINAL_MARKDOWN_REPORT_SENTINEL'};
      else {
        const prefix={'azpr-functional':'F','azpr-failure':'R','azpr-deep':'D'}[role];
        result={status:'COMPLETE',snapshot:jclone(SNAP),findings:[{id:`${prefix}-1`,summary:'fixture issue',location:'/src/Main.java:12',evidence:'fixture branch evidence'}],report:`PRIVATE_INITIAL_REPORT_${prefix}`};
      }
      if(opts.result) result=await opts.result({result,role,packet,id,calls});
      const info={role:'assistant',id:`msg_${sequence}`,agent:role,modelID:model.modelID,providerID:model.providerID};
      if(opts.responseError) info.error={name:'APIError'};
      return {data:{info,parts:[{type:'text',text:opts.invalidJSON?'bad envelope':JSON.stringify(result)}]}};
    }
  }};
  hooks=await createAzurePrReviewPlugin({client},dir);
  await hooks.config(cfg);
  const command=async (name='pr-review',args='https://dev.azure.com/org/proj/_git/repo/pullrequest/123',origin='ses_original')=>{
    const out={parts:[{type:'text',text:'placeholder'}]};
    await hooks['command.execute.before']({command:name,sessionID:origin,arguments:args},out);
    return out.parts[0]?.text;
  };
  const prompts=()=>calls.filter(c=>c.kind==='prompt' && !c.body.noReply);
  return {hooks,cfg,baseline,settings,dir,client,calls,logs,toasts,sessions,command,prompts};
}

test('configuration preserves every original model, agent, permission, MCP and command',async t=>{
  const f=await fixture(t);const restored=jclone(f.cfg);for(const name of Object.keys(ROLES)) delete restored.agent[name];
  assert.deepEqual(restored,f.baseline);assert.equal(f.calls.length,0);
});
test('private agents inherit host tool permissions and only disable nested Task delegation',async t=>{
  const f=await fixture(t);
  for(const name of Object.keys(ROLES)){
    assert.equal(f.cfg.agent[name].mode,'primary'); assert.equal(f.cfg.agent[name].hidden,true);
    assert.deepEqual(f.cfg.agent[name].permission,{task:'deny'});
  }
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
  const f=await fixture(t);const slot=ROLES[role][0];const [providerID,modelID]=f.settings.models[slot].split('/');
  await assert.rejects(f.hooks['chat.message']({sessionID:'normal',agent:role,model:{providerID,modelID}},{message:{},parts:[]}),/no active/);
  await assert.rejects(f.hooks['chat.params']({sessionID:'normal',agent:role,model:{providerID,id:modelID}},{}),/no active/);
  await assert.rejects(f.hooks['tool.execute.before']({sessionID:'normal',tool:'task',callID:'x'},{args:{subagent_type:role}}),/only explicit/);
  assert.equal(f.calls.length,0);
});
test('manual @mention cannot grant private reviewer authorization',async t=>{
  const f=await fixture(t);await assert.rejects(f.hooks['chat.message']({sessionID:'normal',agent:'build'},{message:{agent:'build'},parts:[{type:'agent',name:'azpr-deep'}]}),/explicit/);assert.equal(f.calls.length,0);
});
test('economy runs check, two independent initial reviewers, and free verification only',async t=>{
  const f=await fixture(t);const out=await f.command();assert.match(out,/] COMPLETE/);
  const roles=f.prompts().map(p=>p.body.agent);
  assert.equal(roles[0],'azpr-check');
  assert.deepEqual(roles.slice(1,-1).sort(),['azpr-failure','azpr-functional']);
  assert.equal(roles.at(-1),'azpr-verify-free');
  assert.ok(f.prompts().every(p=>!p.body.model.modelID.startsWith('paid')));
  assert.equal(new Set(f.prompts().map(p=>p.path.id)).size,4);
  for(const p of f.prompts()) assert.notEqual(p.path.id,'ses_original');
  assert.doesNotMatch(out,/FINAL_MARKDOWN_REPORT_SENTINEL|PRIVATE_INITIAL_REPORT/);
});
test('deep runs three independent initial sessions and exactly one paid final stage',async t=>{
  const f=await fixture(t);const out=await f.command('pr-deep');assert.match(out,/] COMPLETE/);
  const roles=f.prompts().map(p=>p.body.agent);
  assert.equal(roles[0],'azpr-check');
  assert.deepEqual(roles.slice(1,-1).sort(),['azpr-deep','azpr-failure','azpr-functional']);
  assert.equal(roles.at(-1),'azpr-verify-paid');
  const initial=f.prompts().slice(1,4);assert.equal(new Set(initial.map(p=>p.body.parts[0].text)).size,1);assert.ok(initial.every(p=>!p.body.parts[0].text.includes('PRIVATE_INITIAL_REPORT')));
});
test('check-only never enters an initial review stage',async t=>{
  const f=await fixture(t);assert.match(await f.command('pr-check'),/] READY/);assert.equal(f.prompts().length,1);
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
  assert.equal(f.prompts().at(-1).body.model.modelID,'free-b');
});
for(const tool of ['company_mcp_inspect_change','renamed_custom_reader','ado_repo_get_pull_request_by_id']) test(`host-supplied ${tool} needs no plugin mapping`,async t=>{
  const f=await fixture(t,{readTool:tool});
  assert.match(await f.command('pr-check'),/] READY/);
  assert.equal(f.cfg.agent['azpr-check'].permission[tool],undefined);
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
  const f=await fixture(t,{skipAzure:true,result:({role,result})=>role==='azpr-check'?{status:'NOT_READY',report:'Required source access is missing.'}:result});
  assert.match(await f.command('pr-deep'),/NOT_READY/); assert.equal(f.prompts().length,1);
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
test('paid reviewer remains blocked in other sessions while deep review is active',async t=>{
  let checked=false;const f=await fixture(t,{duringPrompt:async ({hooks,role})=>{if(role!=='azpr-deep')return;await assert.rejects(hooks['chat.params']({agent:role,sessionID:'unrelated',model:{providerID:'fixture',id:'paid-deep'}},{}),/no active/);checked=true;}});
  await f.command('pr-deep');assert.equal(checked,true);
});
test('review rules say not to modify; nested model orchestration remains blocked in code',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,id})=>{
    await assert.rejects(hooks['tool.execute.before']({sessionID:id,tool:'task',callID:'nested'},{args:{subagent_type:'explore'}}),/Nested Task/);
  }});
  await f.command();
  for(const name of Object.keys(ROLES).filter(r=>!r.startsWith('azpr-comment-'))) assert.match(f.cfg.agent[name].prompt,/review-only task: read and analyze, do not modify anything/);
});

test('a model change during the authorized session is rejected',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,role,id})=>{await assert.rejects(hooks['chat.params']({sessionID:id,agent:role,model:{providerID:'other',id:'expensive'}},{}),/Model mismatch/);}});await f.command();
});
test('second user message in the same active private session is rejected',async t=>{
  const f=await fixture(t,{duringPrompt:async({hooks,role,id,model})=>{await assert.rejects(hooks['chat.message']({sessionID:id,agent:role,model},{message:{},parts:[]}),/exactly one/);}});await f.command();
});
test('missing paid models stop deep before even the free preflight',async t=>{
  const f=await fixture(t,{settings:s=>{s.models.deep='';s.models.final='';}});await assert.rejects(f.command('pr-deep'),/Both paid/);assert.equal(f.calls.length,0);assert.match(await f.command(),/] COMPLETE/);
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
  const f=await fixture(t,{config:c=>c.agent['azpr-deep']={model:'original/protected'}});assert.deepEqual(f.cfg,f.baseline);await assert.rejects(f.command(),/conflict/);
});
test('settings edit requires restart, while ordinary chat continues',async t=>{
  const f=await fixture(t);await writeFile(join(f.dir,'settings.json'),JSON.stringify({...f.settings,returnReport:'full'}));await assert.rejects(f.command(),/changed/);await f.hooks['chat.params']({agent:'plan',sessionID:'normal',model:{providerID:'x',id:'y'}},{});assert.equal(f.calls.length,0);
});
test('post-load role override is caught before a model request',async t=>{
  const f=await fixture(t);f.cfg.agent['azpr-check'].model='attacker/paid';const out=await f.command();assert.match(out,/INCOMPLETE/);assert.equal(f.prompts().length,0);
});
test('post-load command override is rejected before creating sessions',async t=>{
  const f=await fixture(t);f.cfg.command['pr-review'].model='other/paid';await assert.rejects(f.command(),/routing changed/);assert.equal(f.calls.length,0);
});
test('NOT_READY never spends paid model calls',async t=>{
  const f=await fixture(t,{result:({result,role})=>role==='azpr-check'?{status:'NOT_READY',report:'Diff missing'}:result});assert.match(await f.command('pr-deep'),/] NOT_READY/);assert.equal(f.prompts().length,1);
});
for(const [label,opts] of [['missing message hook',{skipMessageHook:true}],['missing params hook',{skipParamsHook:true}],['malformed JSON',{invalidJSON:true}],['model error',{responseError:true}]]) test(`${label} cannot pass preflight and spend paid calls`,async t=>{
  const f=await fixture(t,opts);assert.match(await f.command('pr-deep'),/INCOMPLETE/);assert.equal(f.prompts().length,1);
});
test('PARTIAL initial reviewer prevents paid final stage',async t=>{
  const f=await fixture(t,{result:({result,role})=>role==='azpr-failure'?{...result,status:'PARTIAL'}:result});assert.match(await f.command('pr-deep'),/INCOMPLETE/);assert.ok(!f.prompts().some(p=>p.body.agent==='azpr-verify-paid'));
});
test('snapshot mismatch prevents final stage',async t=>{
  const f=await fixture(t,{result:({result,role})=>role==='azpr-functional'?{...result,snapshot:{...result.snapshot,head:'c'.repeat(40)}}:result});assert.match(await f.command('pr-deep'),/INCOMPLETE/);assert.equal(f.prompts().length,4);
});
test('final missing original finding is not accepted as COMPLETE',async t=>{
  const f=await fixture(t,{result:({result,role})=>role.startsWith('azpr-verify')?{...result,dispositions:[]}:result});const out=await f.command();assert.match(out,/] INCOMPLETE/);assert.match(out,/omitted/);
});
test('changed current PR head yields STALE and does not rerun',async t=>{
  const f=await fixture(t,{result:({result,role})=>role.startsWith('azpr-verify')?{...result,currentHead:'c'.repeat(40)}:result});assert.match(await f.command('pr-deep'),/] STALE/);assert.equal(f.prompts().length,5);
});
test('explicit full report return includes final text only, not intermediate reports',async t=>{
  const f=await fixture(t,{settings:s=>s.returnReport='full'});const out=await f.command();assert.match(out,/FINAL_MARKDOWN_REPORT_SENTINEL/);assert.doesNotMatch(out,/PRIVATE_INITIAL_REPORT/);
});
test('cancellation aborts only review sessions and revokes authorization',async t=>{
  let release,started;const wait=new Promise(r=>release=r);const ready=new Promise(r=>started=r);
  const f=await fixture(t,{duringPrompt:async({role})=>{if(role==='azpr-check'){started();await wait;}}});
  const running=f.command('pr-deep');await ready;
  assert.match(await f.command('pr-stop',''),/cancellation requested/);release();const out=await running;assert.match(out,/] CANCELLED/);assert.ok(f.calls.some(c=>c.kind==='abort'));assert.ok(f.calls.filter(c=>c.kind==='abort').every(c=>c.path.id!=='ses_original'));assert.equal(f.prompts().length,1);
});
test('second review from the same origin is rejected rather than double billed',async t=>{
  let release,started;const wait=new Promise(r=>release=r);const ready=new Promise(r=>started=r);
  const f=await fixture(t,{duringPrompt:async({role})=>{if(role==='azpr-check'){started();await wait;}}});const running=f.command();await ready;await assert.rejects(f.command('pr-deep'),/already running/);await f.command('pr-stop','');release();await running;
});
test('global asks, denies and nested patterns are left intact for the host to enforce',async t=>{
  const f=await fixture(t,{config:c=>c.permission={'*':'deny','custom_*':'ask',specific_tool:{'*':'deny',safe:'ask'}}});
  assert.deepEqual(f.cfg.permission,f.baseline.permission);
  for(const role of Object.keys(ROLES)) assert.deepEqual(f.cfg.agent[role].permission,{task:'deny'});
});
test('SDK create failure cannot prompt a model or grant a reviewer',async t=>{
  const f=await fixture(t,{createError:true});assert.match(await f.command(),/INCOMPLETE/);assert.equal(f.prompts().length,0);
});
test('model mappings can be replaced without prompt or workflow edits',async t=>{
  const f=await fixture(t,{settings:s=>s.models.freeA='new-provider/new-model-v99'});assert.equal(f.cfg.agent['azpr-functional'].model,'new-provider/new-model-v99');
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
  await f.command();assert.equal(checked,true);assert.equal(f.prompts().length,4);
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
  await assert.rejects(f.hooks['chat.params']({agent:'azpr-check',sessionID:failedSession,model:{providerID:'fixture',id:'free-b'}},{}),/no active/);
});

const reviewId = receipt => /\[AZPR ([a-f0-9]{8})\]/.exec(receipt)[1];
const enableComments = s => { s.comments.enabled = true; };
const writes = f => f.calls.filter(c => c.kind === 'tool' && c.tool==='custom_mcp_annotate');

test('comment preview is visible, read-only, and uses freeB even after deep review', async t => {
  const f=await fixture(t), id=reviewId(await f.command('pr-deep'));
  const out=await f.command('pr-comment',id);
  assert.match(out,/] PREVIEW/); assert.match(out,/issue \(high\)/); assert.match(out,/--publish/);
  assert.equal(writes(f).length,0);
  assert.equal(f.prompts().at(-1).body.agent,'azpr-comment-plan');
  assert.equal(f.prompts().at(-1).body.model.modelID,'free-b');
  await assert.rejects(f.command('pr-comment',id+' --publish'),/comments.enabled/);
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
  assert.equal(f.cfg.agent['azpr-comment-publish'].permission.custom_mcp_annotate,undefined);
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
  opts.result=({role,result,packet})=>role==='azpr-comment-publish'?{status:'DONE',posted:packet.comments.map(c=>({findingId:c.findingId,threadId:'invented'}))}:result;
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
    if(['azpr-functional','azpr-failure'].includes(role)) return {...result,findings:result.findings.map(f=>({...f,summary:f.id+' distinct cause'}))};
    if(role==='azpr-comment-publish') return {status:'INCOMPLETE',posted:result.posted.slice(0,1)};
    return result;
  }});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  const out=await f.command('pr-comment',id+' --publish');
  assert.match(out,/] INCOMPLETE/); assert.match(out,/F-1: MODEL_REPORTED_POSTED/); assert.match(out,/R-1: UNKNOWN/);
});
test('confirmed verifier discoveries are eligible; unconfirmed findings are excluded', async t => {
  const f=await fixture(t,{result:({role,result})=>role.startsWith('azpr-verify-')?{...result,dispositions:result.dispositions.map(d=>({...d,status:'NEEDS_INFO'})),newFindings:[{id:'V-1',summary:'New confirmed defect',evidence:'Verified code',location:'/src/Main.java:12'}]}:result});
  const id=reviewId(await f.command()), out=await f.command('pr-comment',id);
  assert.match(out,/] PREVIEW/); assert.match(out,/V-1/); assert.doesNotMatch(out,/### F-1/);
});
test('empty preview never writes a summary thread', async t => {
  const f=await fixture(t,{settings:enableComments,result:({role,result})=>role.startsWith('azpr-verify-')?{...result,dispositions:result.dispositions.map(d=>({...d,status:'REJECTED'}))}:result});
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
  const report='LOCAL_REPORT_LANGUAGE_SENTINEL', f=await fixture(t,{settings:s=>{enableComments(s);s.outputLanguage='zh-TW';},result:({role,result})=>role.startsWith('azpr-verify-')?{...result,report}:result});
  const id=reviewId(await f.command()); await f.command('pr-comment',id);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).report,report);
  assert.equal(JSON.parse(f.prompts().at(-1).body.parts[0].text).outputLanguage,'zh-TW');
  assert.match(f.cfg.agent['azpr-comment-plan'].prompt,/outputLanguage: zh-TW/);
  assert.match(f.cfg.agent['azpr-comment-publish'].prompt,/outputLanguage: zh-TW/);
  assert.match(f.cfg.agent['azpr-comment-publish'].prompt,/Do not paraphrase, translate/);
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
  assert.match(f.cfg.agent['azpr-verify-free'].prompt,/outputLanguage: en/);
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

for (const [command,language] of [['pr-review','zh-TW'],['pr-deep','zh-CN']]) test(`${command} localizes only the final report using ${language}`, async t => {
  const f=await fixture(t,{settings:s=>{s.outputLanguage=language;}});
  assert.match(await f.command(command),/] COMPLETE/);
  for (const p of f.prompts()) {
    const packet=JSON.parse(p.body.parts[0].text), localized=p.body.agent.startsWith('azpr-verify-');
    assert.equal(packet.outputLanguage,localized?language:undefined);
    if (localized) {
      assert.ok(f.cfg.agent[p.body.agent].prompt.includes(`outputLanguage: ${language}`));
      assert.match(f.cfg.agent[p.body.agent].prompt,/Other JSON fields and intermediate findings remain in English/);
    } else {
      assert.doesNotMatch(f.cfg.agent[p.body.agent].prompt,/# Configured output language/);
      assert.match(f.cfg.agent[p.body.agent].prompt,/intermediate reports and structured finding explanations in English/);
    }
  }
});

test('full receipts preserve the final report language without a translation model', async t => {
  const report='FINAL_LANGUAGE_REPORT_SENTINEL';
  const f=await fixture(t,{settings:s=>{s.outputLanguage='zh-TW';s.returnReport='full';},result:({role,result})=>role.startsWith('azpr-verify-')?{...result,report}:result});
  const out=await f.command(); assert.ok(out.includes(report));
  assert.match(out,/preserve any enclosed report in its original language without translating it/);
  assert.equal(f.prompts().length,4);
  assert.ok(f.calls.filter(c=>c.kind==='prompt' && c.body.noReply).every(c=>c.body.parts[0].text.includes(report)));
});

test('changing outputLanguage after preview requires a restart before publishing', async t => {
  const f=await fixture(t,{settings:enableComments}), id=reviewId(await f.command());
  await f.command('pr-comment',id);
  await writeFile(join(f.dir,'settings.json'),JSON.stringify({...f.settings,outputLanguage:'zh-TW'}));
  await assert.rejects(f.command('pr-comment',id+' --publish'),/changed.*Restart/);
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
  assert.deepEqual(f.cfg.agent['azpr-comment-publish'].permission,{task:'deny'});
  for(const patch of [{maxComments:0},{maxComments:11},{maxComments:1.5},{enabled:'true'},{permission:'allow'}]) assert.throws(()=>validateSettings({...f.settings,comments:{...f.settings.comments,...patch}}));
});
