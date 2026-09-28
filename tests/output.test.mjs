import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJSONReport, parseAmendmentText, normalizeFindingFormat, stageFormat, checkEnvelope, initialEnvelope, finalEnvelope } from '../src/output.mjs';
import { readFile } from 'node:fs/promises';
import { ROLES } from '../src/config.mjs';
import { diagnosticResponse } from '../src/diagnostics.mjs';
const settings = { maxStageCharacters: 1000 };
const response = text => ({ info: { finish: 'stop' }, parts: [{ type: 'text', text }] });
const snapshot = { repository:'org/project/repo',prId:1,base:'a'.repeat(40),head:'b'.repeat(40),scope:'cumulative',files:['/main.js'] };
const final = dispositions => ({status:'COMPLETE',snapshot,currentHead:snapshot.head,dispositions,report:'Evidence report'});
const finding = (id='F-1') => ({id,summary:'Unprotected null input',location:'head:/main.js:2',evidence:'The caller can pass null to the new dereference, causing a request failure.',counterevidence:'The caller checks undefined, not null; its guard does not prevent this failure.',severity:'medium',suggestion:'Guard null and add a regression case for this caller.'});
const initial = () => ({status:'COMPLETE',snapshot,coverage:{files:[...snapshot.files],gaps:[]},findings:[finding()],report:'Reviewed full changes and the relevant caller; no tests executed.'});

test('amendment text parsing only recognizes the pinned missing-native error and rejects ambiguous JSON',()=>{
  const reply=text=>({info:{role:'assistant',finish:'stop',error:{name:'StructuredOutputError',data:{message:'Model did not produce structured output',retries:0}}},parts:[{type:'text',text}]});
  for(const value of [{status:'COMPLETE'},{locations:[{id:'V-1',location:'head:/main.js:2'}]},
    {locations:[{id:'F-1',location:'head:/main.js:2'},{id:'R-1',location:'head:/main.js:3'}]}]) {
    assert.deepEqual(parseAmendmentText(reply(JSON.stringify(value)),settings),value);
  }
  for(const raw of ['{"status":','{}{}','prefix {}','```json\n{}\n```','[]',
    '{"status":"COMPLETE","status":"PARTIAL"}',
    '{"status":"COMPLETE","st\\u0061tus":"PARTIAL"}',
    '{"locations":[{"id":"F-1","id":"R-1","location":"head:/main.js:2"}]}']) {
    assert.throws(()=>parseAmendmentText(reply(raw),settings));
  }
  for(const mutate of [x=>x.info.role='user',x=>x.info.finish='length',x=>x.info.finish='content-filter',
    x=>x.info.error.name='APIError',x=>x.info.error.data.message='Provider failed',
    x=>x.info.error.data.retries=1,x=>x.info.error.data.extra='Unknown error context',
    x=>x.info.structured={},x=>x.parts.push({type:'tool',state:{status:'running'}})]) {
    const value=reply('{"status":"COMPLETE"}');mutate(value);
    assert.equal(parseAmendmentText(value,settings),undefined);
  }
  assert.throws(()=>parseAmendmentText(reply('x'.repeat(1001)),settings),/oversized/);
  for(const part of [{type:'reasoning',text:'{"status":"COMPLETE"}'},{type:'text',synthetic:true,text:'{}'},
    {type:'text',ignored:true,text:'{}'}])assert.throws(()=>parseAmendmentText({...reply(''),parts:[part]},settings),/Empty/);
});

test('tolerance: null extensions are audited without changing required finding values',()=>{
  const raw=initial();raw.findings[0].PRIVATE_EMPTY_EXTENSION=null;
  const before=JSON.stringify(raw),prepared=normalizeFindingFormat(raw,'azpr-review-functional');
  assert.deepEqual(prepared.envelope,initial());
  assert.deepEqual(prepared.corrections,[{path:'findings[0]',action:'remove-null-unknown-field',propertyIndex:7}]);
  assert.equal(initialEnvelope(prepared.envelope,snapshot,'F').status,'COMPLETE');
  assert.equal(JSON.stringify(raw),before);
});
test('tolerance: initial candidates can omit location but final confirmations and discoveries cannot',()=>{
  const raw=initial();delete raw.findings[0].location;
  const before=JSON.stringify(raw);
  assert.equal(initialEnvelope(raw,snapshot,'F').status,'COMPLETE');
  assert.equal(JSON.stringify(raw),before);
  for(const role of ['azpr-review-functional','azpr-deep-risk']) {
    const schema=stageFormat(role).schema.properties.findings.items;
    assert.ok(!schema.required.includes('location'));
    assert.ok(schema.properties.location);
  }
  assert.throws(()=>finalEnvelope(final([{id:'F-1',status:'CONFIRMED',reason:'Checked',verifiedFinding:raw.findings[0]}]),snapshot,raw.findings),/location/);
  assert.throws(()=>finalEnvelope({...final([]),newFindings:[{...raw.findings[0],id:'V-1'}]},snapshot,[]),/location/);
  for(const key of ['evidence','counterevidence','suggestion','summary','severity','id']) {
    const bad=structuredClone(raw);delete bad.findings[0][key];
    assert.throws(()=>initialEnvelope(bad,snapshot,'F'));
  }
});
test('tolerance: an exactly identical V disposition is redundant, with the original reason retained in raw output',()=>{
  const discovery=finding('V-1');
  const raw={...final([{id:'F-1',status:'CONFIRMED',reason:'Checked',verifiedFinding:finding()},
    {id:'V-1',status:'CONFIRMED',reason:'PRIVATE_DISCOVERY_REASON',verifiedFinding:structuredClone(discovery)}]),newFindings:[discovery]};
  const before=JSON.stringify(raw),prepared=normalizeFindingFormat(raw,'azpr-review-verifier');
  assert.equal(prepared.envelope.dispositions.length,1);
  assert.deepEqual(prepared.envelope.newFindings,raw.newFindings);
  assert.deepEqual(prepared.corrections,[{path:'dispositions[1]',action:'deduplicate-new-finding',newFindingPath:'newFindings[0]'}]);
  assert.equal(finalEnvelope(prepared.envelope,snapshot,[finding()]).status,'COMPLETE');
  assert.equal(JSON.stringify(raw),before);
  assert.doesNotMatch(JSON.stringify(prepared.corrections),/PRIVATE_/);
  for(const mutate of [
    x=>x.dispositions[1].verifiedFinding.evidence+=' changed',
    x=>x.dispositions[1].status='REJECTED',
    x=>x.dispositions[1].mergedInto='F-1',
    x=>x.dispositions[1].extra='nonempty',
    x=>x.newFindings=[],x=>x.newFindings.push(structuredClone(discovery)),
    x=>x.dispositions.push(structuredClone(x.dispositions[1])),
    x=>x.dispositions.shift(),x=>delete x.newFindings[0].evidence,
  ]) {
    const bad=structuredClone(raw);mutate(bad);
    assert.throws(()=>finalEnvelope(normalizeFindingFormat(bad,'azpr-review-verifier').envelope,snapshot,[finding()]));
  }
});

test('verifier transport uses a scalar string head while preserving incomplete and stale gates',()=>{
  for(const role of ['azpr-review-verifier','azpr-deep-verifier']) {
    const schema=stageFormat(role).schema;
    assert.equal(schema.properties.currentHead.type,'string');
    assert.ok(schema.required.includes('currentHead'));
    assert.match(schema.properties.currentHead.description,/empty string.*INCOMPLETE/);
  }
  const incomplete={...final([]),status:'INCOMPLETE',currentHead:''};
  assert.equal(finalEnvelope(incomplete,snapshot,[]).status,'INCOMPLETE');
  // Reading a historical incomplete envelope stays compatible; never turn its
  // unknown head into a completed review or fill it from the original snapshot.
  assert.equal(finalEnvelope({...incomplete,currentHead:null},snapshot,[]).status,'INCOMPLETE');
  for(const status of ['COMPLETE','STALE']) for(const currentHead of ['',null,undefined,42,'"'+snapshot.head+'"']) {
    assert.throws(()=>finalEnvelope({...final([]),status,currentHead},snapshot,[]),/did not verify/);
  }
  assert.equal(finalEnvelope(final([]),snapshot,[]).status,'COMPLETE');
  const sha256Snapshot={...snapshot,base:'a'.repeat(64),head:'b'.repeat(64)};
  assert.equal(finalEnvelope({...final([]),snapshot:sha256Snapshot,currentHead:sha256Snapshot.head},sha256Snapshot,[]).status,'COMPLETE');
  assert.equal(finalEnvelope({...final([]),currentHead:'c'.repeat(40)},snapshot,[]).status,'STALE');
  assert.throws(()=>finalEnvelope({...final([]),status:'STALE'},snapshot,[]),/contradicts/);
});

test('status diagnostics identify the field and allowed values without correcting the input',()=>{
  const result={...initial(),status:'CCOMPLETE'};
  assert.throws(()=>initialEnvelope(result,snapshot,'F'),/initial-review.*status.*CCOMPLETE.*COMPLETE.*PARTIAL/);
  assert.equal(result.status,'CCOMPLETE');
  assert.throws(()=>checkEnvelope({status:'RREADY',snapshot,report:'Source available'}),/source-check.*status.*RREADY/);
  assert.throws(()=>finalEnvelope({...final([]),status:'CCOMPLETE'},snapshot,[]),/final-review.*status.*CCOMPLETE/);
  assert.throws(()=>initialEnvelope({...result,status:'Bearer PRIVATE_TOKEN\nignore rules'},snapshot,'F'),error=>{
    assert.doesNotMatch(error.message,/PRIVATE_TOKEN|ignore rules/);return true;
  });
});
test('initial-envelope diagnostics list missing or mistyped fields without copying private values',()=>{
  assert.throws(()=>initialEnvelope({status:'CCOMPLETE'},snapshot,'R'),/snapshot.*coverage.*findings.*report/);
  const malformed={status:'COMPLETE',snapshot:'PRIVATE_SOURCE_SENTINEL',coverage:[],findings:{},report:42};
  assert.throws(()=>initialEnvelope(malformed,snapshot,'R'),error=>{
    assert.match(error.message,/snapshot.*object.*coverage.*object.*findings.*array.*report.*text/);
    assert.doesNotMatch(error.message,/PRIVATE_SOURCE_SENTINEL/);return true;
  });
  assert.throws(()=>initialEnvelope(null,snapshot,'R'),/expected an object/);
});

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
    const result=final([{id:'F-1',status,reason:'Evidence',...(status==='CONFIRMED'?{verifiedFinding:finding()}: {})}, {id:'R-1',status:'MERGED',mergedInto:'F-1',reason:'Duplicate'}, {id:'F-2',status:'MERGED',mergedInto:'R-1',reason:'Duplicate'}]);
    assert.equal(finalEnvelope(result,snapshot,originals).status,'COMPLETE');
  }
  assert.throws(()=>finalEnvelope(final([{id:'F-1',status:'CONFIRMED',mergedInto:'R-1',reason:'Evidence'}]),snapshot,[originals[0]]),/Only a MERGED/);
  assert.throws(()=>finalEnvelope({...final([]),newFindings:null},snapshot,[]),/Invalid findings/);
});

test('complete initial reviews require an explicit full coverage ledger even with zero findings',()=>{
  const result={...initial(),findings:[]};
  assert.equal(initialEnvelope(result,snapshot,'F').status,'COMPLETE');
  for(const coverage of [undefined,null,[],{}, {files:[],gaps:[]},
    {files:snapshot.files,gaps:['Unreviewed caller']}, {files:['/other.js'],gaps:[]},
    {files:['/main.js','/main.js'],gaps:[]}, {files:snapshot.files,gaps:['']},
    {files:snapshot.files,gaps:null}, {files:[null],gaps:[]}]) {
    assert.throws(()=>initialEnvelope({...result,coverage},snapshot,'F'),/coverage|COMPLETE/);
  }
});
test('coverage order is immaterial but missing work must be explicitly PARTIAL',()=>{
  const expanded={...snapshot,files:['/main.js','/deleted.js']};
  const result={...initial(),snapshot:expanded,coverage:{files:[...expanded.files].reverse(),gaps:[]}};
  assert.equal(initialEnvelope(result,expanded,'F').status,'COMPLETE');
  assert.throws(()=>initialEnvelope({...result,coverage:{files:['/main.js'],gaps:[]}},expanded,'F'),/every snapshot/);
  assert.equal(initialEnvelope({...result,status:'PARTIAL',coverage:{files:['/main.js'],gaps:['Deleted file base source unavailable.']}},expanded,'F').status,'PARTIAL');
  assert.throws(()=>initialEnvelope({...result,status:'PARTIAL'},expanded,'F'),/PARTIAL requires/);
});
test('initial findings require counterevidence, impact severity and a verification suggestion',()=>{
  for(const key of ['summary','location','evidence','counterevidence','severity','suggestion']) {
    for(const value of [undefined,null,'',42]) {
      const result=initial();result.findings[0][key]=value;
      assert.throws(()=>initialEnvelope(result,snapshot,'F'),/finding|evidence/);
    }
  }
  const result=initial();result.findings[0].severity='certain';
  assert.throws(()=>initialEnvelope(result,snapshot,'F'),/severity/);
  result.findings[0].severity='low';assert.equal(initialEnvelope(result,snapshot,'F').findings.length,1);
});
test('finding diagnostics identify exact fields, duplicate IDs and schema extras without private data',()=>{
  const result=initial(), first=result.findings[0];
  first[' evidence']=first.evidence;delete first.evidence;
  assert.throws(()=>initialEnvelope(result,snapshot,'F'),error=>{
    assert.match(error.message,/findings\[0\]\.evidence is missing.*surrounding ASCII whitespace/);
    assert.doesNotMatch(error.message,/caller can pass/);return true;
  });
  result.findings=[finding(),finding()];
  assert.throws(()=>initialEnvelope(result,snapshot,'F'),/findings\[1\]\.id duplicates/);
  result.findings=[{...finding(),PRIVATE_KEY_SENTINEL:'PRIVATE_VALUE_SENTINEL'}];
  assert.throws(()=>initialEnvelope(result,snapshot,'F'),error=>{
    assert.match(error.message,/findings\[0\].*unexpected field/);
    assert.doesNotMatch(error.message,/PRIVATE_/);return true;
  });
  result.findings=[{...finding(),evidence_note:''}];
  // The validator stays strict; only the separately audited preparation step
  // may produce a canonical candidate for full validation.
  assert.throws(()=>initialEnvelope(result,snapshot,'F'),/unexpected field/);
  const bad={...finding(),evidence:null};
  assert.throws(()=>finalEnvelope(final([{id:'F-1',status:'CONFIRMED',reason:'Checked',verifiedFinding:bad}]),snapshot,[finding()]),/dispositions\[0\]\.verifiedFinding\.evidence/);
  assert.throws(()=>finalEnvelope({...final([]),newFindings:[{...bad,id:'V-1'}]},snapshot,[]),/newFindings\[0\]\.evidence/);
});
test('format normalization changes only unambiguous known keys and exactly empty unknown fields',()=>{
  const expected=initial();expected.findings[0].evidence='  Preserve evidence whitespace.\n';
  const raw={...expected,findings:[Object.fromEntries(Object.entries(expected.findings[0]).map(([k,v])=>[` \t${k}\r\n`,v]))]};
  raw.findings[0].PRIVATE_UNKNOWN_NAME='';
  const before=JSON.stringify(raw), prepared=normalizeFindingFormat(raw,'azpr-review-functional');
  assert.deepEqual(prepared.envelope,expected);
  assert.equal(prepared.corrections.length,8);
  assert.doesNotMatch(JSON.stringify(prepared.corrections),/PRIVATE_|Preserve evidence/);
  assert.equal(JSON.stringify(raw),before);
  assert.equal(initialEnvelope(prepared.envelope,snapshot,'F').status,'COMPLETE');
  const again=normalizeFindingFormat(prepared.envelope,'azpr-review-functional');
  assert.strictEqual(again.envelope,prepared.envelope);assert.deepEqual(again.corrections,[]);
});
test('format normalization never chooses between conflicting field names, even identical values',()=>{
  for(const fields of [
    {evidence:'Same value',' evidence':'Same value'},
    {' evidence':'Same value','evidence ':'Same value'},
    {evidence:'Actual evidence',' evidence':''},
    {' evidence':'PRIVATE_VALUE_SENTINEL',evidence:'Other value'},
  ]) {
    const raw=initial();delete raw.findings[0].evidence;Object.assign(raw.findings[0],fields);
    const before=JSON.stringify(raw);
    assert.throws(()=>normalizeFindingFormat(raw,'azpr-review-functional'),error=>{
      assert.match(error.message,/findings\[0\]\.evidence has conflicting keys/);
      assert.doesNotMatch(error.message,/PRIVATE_|Same value|Actual evidence/);return true;
    });
    assert.equal(JSON.stringify(raw),before);
  }
});
test('nonempty or nonstring extras, misspellings and absent evidence still fail full validation',()=>{
  for(const extra of ['source note',' ',false,0,[],{}]) {
    const raw=initial();raw.findings[0].evidence_note=extra;
    const prepared=normalizeFindingFormat(raw,'azpr-review-functional');
    assert.deepEqual(prepared.corrections,[]);
    assert.throws(()=>initialEnvelope(prepared.envelope,snapshot,'F'),/unexpected field/);
  }
  for(const key of ['Evidence','evdience','\u00a0evidence','\u200bevidence']) {
    const raw=initial();raw.findings[0][key]=raw.findings[0].evidence;delete raw.findings[0].evidence;
    const prepared=normalizeFindingFormat(raw,'azpr-review-functional');
    assert.deepEqual(prepared.corrections,[]);
    assert.throws(()=>initialEnvelope(prepared.envelope,snapshot,'F'),/\.evidence is missing/);
  }
  for(const value of [undefined,null,'',' ',42]) {
    const raw=initial();delete raw.findings[0].evidence;
    if(value!==undefined)raw.findings[0][' evidence']=value;
    raw.findings[0].unused='';
    const prepared=normalizeFindingFormat(raw,'azpr-review-functional');
    assert.throws(()=>initialEnvelope(prepared.envelope,snapshot,'F'),/\.evidence (?:is missing|must be nonempty text)/);
  }
});
test('finding formatting excludes statuses, snapshots, reports, coverage, comments and source checks',()=>{
  const raw=initial();raw.findings[0][' evidence']=raw.findings[0].evidence;delete raw.findings[0].evidence;
  for(const role of ['azpr-review-check','azpr-review-comment-plan','azpr-review-comment-publish','unknown']) {
    const prepared=normalizeFindingFormat(raw,role);
    assert.strictEqual(prepared.envelope,raw);assert.deepEqual(prepared.corrections,[]);
  }
  const badStatus={...raw,status:'CCOMPLETE'};
  assert.strictEqual(normalizeFindingFormat(badStatus,'azpr-review-functional').envelope,badStatus);
  const prepared=normalizeFindingFormat(raw,'azpr-review-functional');
  for(const key of ['status','snapshot','coverage','report']) assert.strictEqual(prepared.envelope[key],raw[key]);
  assert.throws(()=>initialEnvelope({...prepared.envelope,coverage:{files:[],gaps:[]}},snapshot,'F'),/COMPLETE requires/);
  assert.throws(()=>initialEnvelope({...prepared.envelope,snapshot:{...snapshot,head:'c'.repeat(40)}},snapshot,'F'),/different snapshot/);
});
test('verifier finding formatting preserves verdicts and head checks in both modes',()=>{
  for(const mode of ['review','deep']) {
    const corrected=finding();corrected[' suggestion']=corrected.suggestion;delete corrected.suggestion;
    const raw={...final([{id:'F-1',status:'CONFIRMED',reason:'Checked',verifiedFinding:corrected}]),newFindings:[{...finding('V-1'),empty_note:''}]};
    const before=JSON.stringify(raw), prepared=normalizeFindingFormat(raw,`azpr-${mode}-verifier`);
    assert.deepEqual(prepared.corrections,[
      {path:'dispositions[0].verifiedFinding.suggestion',action:'trim-key-whitespace'},
      {path:'newFindings[0]',action:'remove-empty-unknown-field',propertyIndex:7},
    ]);
    assert.equal(finalEnvelope(prepared.envelope,snapshot,[finding()]).status,'COMPLETE');
    assert.equal(finalEnvelope({...prepared.envelope,currentHead:'c'.repeat(40)},snapshot,[finding()]).status,'STALE');
    assert.throws(()=>finalEnvelope({...prepared.envelope,currentHead:''},snapshot,[finding()]),/did not verify/);
    assert.equal(JSON.stringify(raw),before);
  }
});
test('confirmed dispositions require a complete corrected finding under the original ID',()=>{
  const corrected={...finding(),summary:'Narrowed claim',severity:'low'};
  const disposition={id:'F-1',status:'CONFIRMED',reason:'Caller and safeguard checked',verifiedFinding:corrected};
  const result=finalEnvelope(final([disposition]),snapshot,[finding()]);
  assert.deepEqual(result.dispositions[0].verifiedFinding,corrected);
  for(const verifiedFinding of [undefined,null,{},finding('R-1'),{...finding(),counterevidence:''},{...finding(),suggestion:''},{...finding(),severity:'certain'}]) {
    assert.throws(()=>finalEnvelope(final([{...disposition,verifiedFinding}]),snapshot,[finding()]));
  }
  for(const status of ['REJECTED','NEEDS_INFO','MERGED']) {
    assert.throws(()=>finalEnvelope(final([{...disposition,status,...(status==='MERGED'?{mergedInto:'R-1'}:{})}]),snapshot,[finding(),finding('R-1')]),/Only a CONFIRMED/);
  }
});
test('new verifier findings must pass the same evidence and severity checks',()=>{
  const good={...final([]),newFindings:[finding('V-1')]};
  assert.equal(finalEnvelope(good,snapshot,[]).newFindings.length,1);
  for(const entry of [finding('F-1'),{...finding('V-1'),counterevidence:undefined},{...finding('V-1'),severity:null}]) {
    assert.throws(()=>finalEnvelope({...good,newFindings:[entry]},snapshot,[]));
  }
});
test('native schemas and role prompt examples describe the same quality contracts',async()=>{
  const required=['id','summary','evidence','counterevidence','location','severity','suggestion'];
  for(const mode of ['review','deep']) {
    const finalSchema=stageFormat(`azpr-${mode}-verifier`).schema;
    assert.deepEqual(finalSchema.properties.dispositions.items.properties.verifiedFinding.required,required);
    assert.deepEqual(finalSchema.properties.newFindings.items.required,required);
    for(const role of ['functional','risk']) {
      const schema=stageFormat(`azpr-${mode}-${role}`).schema;
      assert.ok(schema.required.includes('coverage'));
      assert.deepEqual(schema.properties.coverage.required,['files','gaps']);
      assert.deepEqual(schema.properties.findings.items.required,required.filter(key=>key!=='location'));
    }
  }
  for(const [name,prefix] of [['functional','F'],['risk','R'],['final','V']]) {
    const prompt=await readFile(new URL(`../src/prompts/${name}.md`,import.meta.url),'utf8');
    const result=JSON.parse(/```json\n([\s\S]*?)\n```/.exec(prompt)[1]);
    result.snapshot=snapshot;
    if(name==='final') {
      result.currentHead=snapshot.head;
      assert.equal(finalEnvelope(result,snapshot,[finding(),finding('R-1')]).status,'COMPLETE');
    } else {
      result.coverage.files=[...snapshot.files];
      assert.equal(initialEnvelope(result,snapshot,prefix).status,'COMPLETE');
    }
  }
});
test('review guidance uses PR versions; standalone check retains cumulative proof',async()=>{
  const common=await readFile(new URL('../src/prompts/common.md',import.meta.url),'utf8');
  const check=await readFile(new URL('../src/prompts/check.md',import.meta.url),'utf8');
  const result=JSON.parse(/```json\n([\s\S]*?)\n```/.exec(check)[1]);
  for(const key of ['identity','successfulCalls','failedCalls']) assert.equal(typeof result.sourceAccess[key],'string');
  assert.match(common,/blob.*commit/s);
  assert.match(common,/array.*string/s);
  assert.match(common,/short branch name.*refs\/heads\//s);
  assert.match(common,/At\s+most\s+one identical retry/s);
  assert.match(check,/Keyword search, PR membership queries\s+and file-content equality do not establish ancestry/);
  assert.match(check,/before and after.*listing/s);
  assert.match(check,/Do not explore unrelated/);
  assert.match(check,/A latest target tip,\s+successful merge status, matching branch tips or synthesized iteration labels\s+do not by themselves prove a merge base/);
  assert.match(check,/A page's entry count is not a total/);
  assert.match(check,/source access at the exact commits for all changed\s+files/);
  assert.match(check,/post-listing tip check unless that second read actually occurred/);
  assert.match(check,/Do not perform a code review or diagnose defects/);
  assert.match(check,/missing required evidence prevents\s+READY/);
  assert.match(common,/does not imply directory-listing Commit support/);
  assert.match(common,/Reuse complete exact-commit content\s+already obtained in your own session/s);
  result.snapshot=snapshot;
  assert.equal(checkEnvelope(result).status,'READY');
});
test('compact verifier prose keeps evidence and delegates only the duplicate status table to runtime',async()=>{
  const prompt=await readFile(new URL('../src/prompts/final.md',import.meta.url),'utf8');
  assert.match(prompt,/trigger, impact, source, counterevidence, location/);
  assert.match(prompt,/Explain every original ID's disposition once/);
  assert.match(prompt,/runtime supplies the complete disposition table from your validated entries/);
  assert.match(prompt,/independent checks performed even when no findings survive/);
  assert.match(prompt,/read the same PR metadata again/);
});
test('finding locations must be recounted from exact source without transport wrappers',async()=>{
  const common=await readFile(new URL('../src/prompts/common.md',import.meta.url),'utf8');
  const finalPrompt=await readFile(new URL('../src/prompts/final.md',import.meta.url),'utf8');
  const location=stageFormat('azpr-review-verifier').schema.properties.dispositions.items.properties.verifiedFinding.properties.location;
  assert.match(location.description,/one-based/);
  assert.match(common,/blank lines.*comments/s);
  assert.match(common,/MCP.*wrapper/s);
  assert.match(finalPrompt,/Recount.*source/s);
  assert.match(finalPrompt,/not.*initial\s+reviewer.*line/s);
  assert.match(finalPrompt,/NEEDS_INFO/);
  assert.match(common,/zero search results.*index/s);
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
test('every stage has an object schema and zero host-managed output retries', () => {
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


test('PR version contract: direct initials need no ancestry proof and bind the requested PR ID',()=>{
  const s={...snapshot,scope:'pr'};
  const value={...initial(),snapshot:s};
  assert.equal(initialEnvelope(value,null,'F','https://dev.azure.com/org/project/_git/repo/pullrequest/1').status,'COMPLETE');
  assert.throws(()=>initialEnvelope(value,null,'F','https://dev.azure.com/org/project/_git/repo/pullrequest/2'),/PR ID/);
  assert.throws(()=>initialEnvelope({...value,snapshot:{...s,head:'2026-01-01T00:00:00Z'}},null,'F'),/SHA/);
});

test('PR version contract: final freshness checks source and target versions',()=>{
  const s={...snapshot,scope:'pr'};
  const value={...final([]),snapshot:s,currentBase:s.base};
  assert.equal(finalEnvelope(value,s,[]).status,'COMPLETE');
  assert.equal(finalEnvelope({...value,currentBase:'c'.repeat(40)},s,[]).status,'STALE');
  assert.equal(finalEnvelope({...value,currentHead:'c'.repeat(40)},s,[]).status,'STALE');
  for(const currentBase of [undefined,'',null,'2026-01-01']) assert.throws(()=>finalEnvelope({...value,currentBase},s,[]),/target|base/i);
  assert.equal(finalEnvelope({...value,status:'INCOMPLETE',currentBase:''},s,[]).status,'INCOMPLETE');
});

test('PR version contract: initial failures may omit unknown snapshot but cannot invent findings',()=>{
  const value={status:'PARTIAL',coverage:{files:[],gaps:['PR metadata unavailable']},findings:[],report:'Missing PR metadata'};
  assert.equal(initialEnvelope(value,null,'F').status,'PARTIAL');
  for(const bad of [{...value,status:'COMPLETE'},{...value,findings:[finding()]},{...value,coverage:{files:[],gaps:[]}}])
    assert.throws(()=>initialEnvelope(bad,null,'F'));
});
