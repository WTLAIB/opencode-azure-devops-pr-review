import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseReviewRequest } from '../src/output.mjs';
import { validateSettings } from '../src/config.mjs';

// Pure transcription of v1.18.31 command() argument substitution, BEFORE shell
// expansion/resolvePromptParts and command.execute.before. No shell is invoked.
// Source: packages/opencode/src/session/prompt.ts at tag v1.18.31.
function nativeTemplate(templateCommand, argumentsText) {
  const raw = argumentsText.match(/(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi) ?? [];
  const args = raw.map(arg => arg.replace(/^["']|["']$/g, ''));
  const placeholders = templateCommand.match(/\$(\d+)/g) ?? [];
  const last = Math.max(0, ...placeholders.map(item=>Number(item.slice(1))));
  const withArgs = templateCommand.replaceAll(/\$(\d+)/g, (_, index) => {
    const position=Number(index), argIndex=position-1;
    if (argIndex>=args.length) return '';
    if (position===last) return args.slice(argIndex).join(' ');
    return args[argIndex];
  });
  let template=withArgs.replaceAll('$ARGUMENTS',argumentsText);
  if (!placeholders.length && !templateCommand.includes('$ARGUMENTS') && argumentsText.trim()) template+='\n\n'+argumentsText;
  return template.trim();
}

test('1.18.31 command templates keep raw text out of native shell and file parsing',async()=>{
  const raw='https://dev.azure.com/org/project/_git/repo/pullrequest/12 Literal !`must-not-run` @../../private $HOME\nsecond line';
  // Positive controls detect the unsafe old template AND simply deleting it.
  assert.ok(nativeTemplate('$ARGUMENTS',raw).includes('must-not-run'));
  assert.ok(nativeTemplate('no placeholder',raw).includes('must-not-run'));
  for(const command of ['pr-check','pr-review','pr-deep','pr-comment','pr-stop']) {
    const template=await readFile(new URL(`../commands/${command}.md`,import.meta.url),'utf8');
    const result=nativeTemplate(template,raw);
    assert.doesNotMatch(result,/must-not-run|@\.\.\/|\$HOME|second line|dev\.azure/);
    assert.ok(result.includes(`azpr-optin:${command}`));
  }
});
test('request parser preserves Unicode, multiline text, quotes, and literal metacharacters',()=>{
  const url='https://dev.azure.com/org/project/_git/repo/pullrequest/12';
  const context='\u91cd\u9ede\u6aa2\u67e5 API "compatibility"\n@../doc !`literal` ${value} \'single quotes\'\n';
  assert.deepEqual(parseReviewRequest(`${url} ${context}`),{request:`${url} ${context}`,prUrl:url,userContext:context});
  assert.equal(parseReviewRequest(url).userContext,'');
  for(const raw of ['', 'not-a-url instructions',url.replace('https:','http:'),url.replace('https://','https://user:password@'),url+'\0',url+' '+'x'.repeat(16000)]) assert.throws(()=>parseReviewRequest(raw));
});
test('MCP mapping is absent from new settings and obsolete profiles are ignored',async()=>{
  const s=JSON.parse(await readFile(new URL('../config/settings.example.json',import.meta.url),'utf8'));
  s.models={review:{functional:'fixture/a',risk:'fixture/b',verifier:'fixture/c'}};
  assert.equal(Object.hasOwn(s,'azure'),false);
  const normalized=validateSettings(s);
  assert.equal(Object.hasOwn(normalized,'tools'),false);
  assert.equal(Object.hasOwn(normalized.comments,'tools'),false);
  assert.deepEqual(validateSettings({...s,azure:{prefix:'unused',toolNames:['no_longer_checked'],permission:'deny'}}),normalized);
  const schema=JSON.parse(await readFile(new URL('../config/settings.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.required.includes('azure'),false);
  assert.equal(schema.properties.azure.deprecated,true);
});
test('production source contains no fixed MCP tool names or dispatcher whitelist',async()=>{
  for(const file of ['runtime.mjs','comments.mjs','config.mjs','output.mjs']){
    const source=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/SUPPORTED_READ_TOOLS|READ_ACTIONS|repo_get_pull_request|repo_pull_request_thread|commentTools|CommentGate/);
  }
});
