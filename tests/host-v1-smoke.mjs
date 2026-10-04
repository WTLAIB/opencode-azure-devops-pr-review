/** Exact-host fixture using only a local deterministic provider and fake MCP.
 * Usage: node tests/host-v1-smoke.mjs /absolute/path/opencode [--text] [--replace]
 * This exercises the installed V1 adapter, not real model quality or Azure access.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), binary=process.argv[2];
assert.ok(binary?.startsWith('/'),'Supply an absolute path to OpenCode 1.18.31.');
assert.ok(process.argv.slice(3).every(arg=>['--text','--replace'].includes(arg)));
const native=!process.argv.includes('--text'), replace=process.argv.includes('--replace');
await mkdir(join(root,'.local'),{recursive:true});
const fixture=await mkdtemp(join(root,'.local/host-v1-smoke-'));
const paths=Object.fromEntries(['config','data','cache','state','tmp','home','work'].map(key=>[key,join(fixture,key)]));
await Promise.all(Object.values(paths).map(path=>mkdir(path,{recursive:true})));
const settings=JSON.parse(await readFile(join(root,'config/settings.example.json'),'utf8'));
for(const mode of ['review','deep'])for(const role of ['functional','risk','verifier'])settings.models[mode][role]=`fixture/${role}`;
settings.structuredOutput=native;settings.shellToolPermission='ask';
settings.debug={enabled:true,directory:join(fixture,'debug')};
const profile=join(fixture,'settings.json');await writeFile(profile,JSON.stringify(settings));
const install=args=>{
  const result=spawnSync('/bin/sh',[join(root,'install.sh'),'--config-dir',paths.config,...args],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.error?.message??result.stderr);
};
install(['--settings',profile]);
if(replace){const before=await readFile(join(paths.config,'plugins/azpr/settings.json'));install(['--replace']);assert.deepEqual(await readFile(join(paths.config,'plugins/azpr/settings.json')),before);}
const requests=[],receipts=[];let child,logs='';
const snapshot={repository:'fixture/project/repository',prId:123,base:'a'.repeat(40),head:'b'.repeat(40),scope:'pr',files:['/src/fixture.js']};
const finding=id=>({id,summary:'Fixture missing guard',location:'head:/src/fixture.js:1',severity:'medium',evidence:'Fixture source exposes the changed assignment.',counterevidence:'The fixture caller guard does not cover this path.',suggestion:'Retain the guard and test the failing input.'});
const provider=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;
  const body=JSON.parse(raw);requests.push(body);
  if(request.url!=='/v1/chat/completions'){response.writeHead(400).end();return;}
  const content=body.messages?.findLast(message=>message.role==='user')?.content;
  const prompt=typeof content==='string'?content:content?.filter(p=>p.type==='text').map(p=>p.text).join('\n');
  let payload;try{payload=JSON.parse(prompt);}catch{}
  const context=payload?.userContext??'';
  if(context.includes('hang-smoke')){response.writeHead(200,{'content-type':'text/event-stream'});response.write(': waiting for cancellation\n\n');return;}
  const toolResults=body.messages?.filter(message=>message.role==='tool').length??0;
  const tool=body.tools?.find(item=>item.function?.description==='Read-only deterministic smoke fixture.');
  let result;
  if(!payload?.prUrl)result='Fixture parent response.';
  else if(context.includes('smoke-check'))result={status:'READY',snapshot:{...snapshot,scope:'cumulative'},sourceAccess:{diff:'Local fixture MCP only.'},requirements:'Fixture source contract.',report:'Fixture ready.'};
  else if(payload.reviews)result={status:'COMPLETE',snapshot,currentHead:snapshot.head,currentBase:snapshot.base,confirmed:payload.reviews.flatMap(review=>review.findings).map(row=>({...row,reason:'Verified the fixture source.'})),merged:[],rejected:[],needsInfo:[],newFindings:[],report:'Fixture final report.'};
  else result={status:'COMPLETE',snapshot,coverage:{files:snapshot.files,gaps:[]},findings:[finding(body.model==='functional'?'F-1':'R-1')],report:'Fixture initial report.'};
  if(context==='smoke-partial' && body.model==='functional')delete result.coverage;
  const prose=context==='smoke-prose' && (body.model==='functional'||payload.reviews);
  let text=typeof result==='string'?result:JSON.stringify(result);
  if(prose)text=payload.reviews?'Useful final prose with an unresolved evidence gap.':'Useful initial prose about a reachable fixture issue.';
  if(context==='smoke-syntax' && body.model==='functional')text+='}';
  const forced=context.includes('force-bash'), control=prompt==='fixture-shell-positive-control';
  let toolName,args;
  if((forced && toolResults<2)||(control&&!toolResults)){
    toolName='bash';args={command:`touch ${join(fixture,control?'SHELL_CONTROL_EXECUTED':'NATIVE_EXECUTED')}`,description:'Harmless fixture marker'};
  }else if(tool && payload?.prUrl && !toolResults){toolName=tool.function.name;args={value:'fixture-source'};}
  else if(native && payload?.prUrl && !prose && context!=='smoke-syntax') {toolName='StructuredOutput';args=result;}
  const delta=toolName?{tool_calls:[{index:0,id:'call_fixture_'+(toolResults+1),type:'function',function:{name:toolName,arguments:JSON.stringify(args)}}]}:{content:text};
  response.writeHead(200,{'content-type':'text/event-stream'});
  const emit=chunk=>response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  emit({id:'chatcmpl_fixture',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',...delta},finish_reason:null}]});
  emit({id:'chatcmpl_fixture',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{},finish_reason:toolName?'tool_calls':'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
  response.end('data: [DONE]\n\n');
});
provider.listen(0,'127.0.0.1');await once(provider,'listening');
const baseURL=`http://127.0.0.1:${provider.address().port}/v1`;
const mcp=join(fixture,'mcp.mjs');
await writeFile(mcp,`import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
for await(const line of createInterface({input:process.stdin})){
 if(!line.trim())continue;const request=JSON.parse(line);if(request.id===undefined)continue;let result;
 if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'azpr-fixture',version:'1.0.0'}};
 else if(request.method==='tools/list')result={tools:[{name:'read_fixture',description:'Read-only deterministic smoke fixture.',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value']}}]};
 else if(request.method==='tools/call'){appendFileSync(${JSON.stringify(join(fixture,'mcp-calls.jsonl'))},JSON.stringify(request.params)+'\\n');result={content:[{type:'text',text:'fixture-source'}]};}
 else result={};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
}
`);
await writeFile(join(paths.config,'opencode.json'),JSON.stringify({
  autoupdate:false,snapshot:false,share:'disabled',enabled_providers:['fixture'],model:'fixture/fixture',small_model:'fixture/fixture',
  provider:{fixture:{npm:'@ai-sdk/openai-compatible',name:'Fixture',options:{baseURL,apiKey:'fixture-only'},models:Object.fromEntries(['fixture','functional','risk','verifier'].map(id=>[id,{name:id,tool_call:true,limit:{context:100000,output:4000}}]))}},
  permission:{bash:'allow',fixture_read_fixture:'allow'},
  mcp:{fixture:{type:'local',command:[process.execPath,mcp],enabled:true}},
}));
const password=randomUUID();
const env={PATH:'/usr/bin:/bin',LANG:'C.UTF-8',XDG_CONFIG_HOME:join(fixture,'xdg-config'),XDG_DATA_HOME:paths.data,XDG_CACHE_HOME:paths.cache,XDG_STATE_HOME:paths.state,TMPDIR:paths.tmp,
  OPENCODE_TEST_HOME:paths.home,OPENCODE_CONFIG_DIR:paths.config,OPENCODE_SERVER_PASSWORD:password,
  OPENCODE_DISABLE_MODELS_FETCH:'1',OPENCODE_DISABLE_PROJECT_CONFIG:'1',OPENCODE_DISABLE_FILEWATCHER:'1',OPENCODE_DISABLE_FFF:'1'};
const stop=async()=>{
  if(child && child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');let timer;
    try{await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000).unref();})]);}finally{clearTimeout(timer);}}
};
try{
  child=spawn(binary,['serve','--hostname','127.0.0.1','--port','0'],{cwd:paths.work,env,stdio:['ignore','pipe','pipe']});
  let startup='';const url=await Promise.race([new Promise((resolve,reject)=>{
    child.once('error',reject);child.once('exit',code=>reject(new Error(`Host exited before readiness: ${code}`)));
    child.stdout.on('data',chunk=>{logs+=chunk;startup+=chunk;const match=startup.match(/server listening on (http:\/\/127\.0\.0\.1:\d+)/);if(match)resolve(match[1]);});
    child.stderr.on('data',chunk=>logs+=chunk);
  }),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Fixture startup timeout')),30000).unref())]);
  const api=async(path,body)=>{
    const r=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{authorization:`Basic ${Buffer.from('opencode:'+password).toString('base64')}`,'content-type':'application/json','x-opencode-directory':paths.work},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
    const text=await r.text();if(!r.ok)throw new Error(`Fixture API ${path}: ${r.status} ${text}`);return text?JSON.parse(text):undefined;
  };
  assert.equal((await api('/global/health')).version,'1.18.31');
  const catalog=await api('/provider');await writeFile(join(fixture,'provider-catalog.json'),JSON.stringify(catalog,null,2));
  const status=await api('/mcp');assert.equal(status.fixture.status,'connected');
  const commands=await api('/command');for(const name of ['pr-check','pr-review','pr-deep','pr-stop','pr-comment'])assert.ok(commands.some(item=>item.name===name));
  const invoke=async(command,context,expected)=>{
    const origin=await api('/session',{title:'Fixture '+context});
    await api(`/session/${origin.id}/command`,{command,arguments:'https://dev.azure.com/fixture/project/_git/repository/pullrequest/123 '+context,model:'fixture/fixture'});
    const messages=await api(`/session/${origin.id}/message`);
    const receipt=messages.flatMap(row=>row.parts).find(part=>part.type==='text'&&part.text.startsWith('[AZPR '))?.text;
    receipts.push({command,context,receipt});assert.match(receipt??'',expected);
    return receipt;
  };
  await invoke('pr-check','smoke-check',/] READY/);
  await invoke('pr-review','smoke-review',/] COMPLETE/);
  const syntax=await invoke('pr-deep','smoke-syntax',/] COMPLETE/);assert.match(syntax,/output-format-corrections=/);
  const partial=await invoke('pr-review','smoke-partial',/] COMPLETE/);assert.match(partial,/Publication unavailable/);
  const prose=await invoke('pr-review','smoke-prose',/] PARTIAL/);assert.match(prose,/Useful final prose/);assert.match(prose,/Useful initial prose/);assert.match(prose,/UNREVIEWED/);
  const forced=await invoke('pr-check','smoke-check force-bash',/] INCOMPLETE/);assert.match(forced,/blocked-native-tools=2/);
  await assert.rejects(access(join(fixture,'NATIVE_EXECUTED')));
  const control=await api('/session',{title:'Ordinary shell control'});
  await api(`/session/${control.id}/message`,{agent:'build',model:{providerID:'fixture',modelID:'fixture'},parts:[{type:'text',text:'fixture-shell-positive-control'}]});
  await access(join(fixture,'SHELL_CONTROL_EXECUTED'));
  const origin=await api('/session',{title:'Cancellation fixture'}),before=requests.length;
  const pending=api(`/session/${origin.id}/command`,{command:'pr-check',arguments:'https://dev.azure.com/fixture/project/_git/repository/pullrequest/123 smoke-check hang-smoke',model:'fixture/fixture'}).then(value=>({value}),error=>({error}));
  for(let n=0;n<100&&requests.length===before;n++)await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(requests.length,before+1);
  await api(`/session/${origin.id}/command`,{command:'pr-stop',arguments:'',model:'fixture/fixture'});
  const stopped=await pending;assert.equal(stopped.error,undefined,String(stopped.error));
  const history=await api(`/session/${origin.id}/message`);assert.ok(history.flatMap(m=>m.parts).some(p=>p.type==='text'&&/] CANCELLED/.test(p.text)));
  const calls=(await readFile(join(fixture,'mcp-calls.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls.length,13,'One source check and twelve review stage reads.');
  assert.ok(calls.every(c=>c.name==='read_fixture'&&c.arguments.value==='fixture-source'));
  const result={status:'PASS',host:'1.18.31',native,installation:replace?'replace':'fresh',providerRequests:requests.length,mcpToolCalls:calls.length,shellPositiveControl:true,cancellation:true,fixture};
  await writeFile(join(fixture,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){console.error(`Host fixture failed; private evidence: ${fixture}`);throw error;}
finally{await stop();provider.closeAllConnections();provider.close();await Promise.all([writeFile(join(fixture,'host.log'),logs),writeFile(join(fixture,'requests.json'),JSON.stringify(requests,null,2)),writeFile(join(fixture,'receipts.json'),JSON.stringify(receipts,null,2))]);}
