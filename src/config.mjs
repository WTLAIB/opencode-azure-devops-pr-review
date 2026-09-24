// One catalog owns mode, role, model slot, prompt, output kind, and stage order.
export const MODES = Object.freeze(['review', 'deep']);
export const COMMANDS = Object.freeze({ 'pr-check': 'check', 'pr-review': 'review', 'pr-deep': 'deep', 'pr-stop': 'stop', 'pr-comment': 'comment' });
const MODEL_SLOTS = ['functional', 'risk', 'verifier'];
const stages = {
  check: { slot: 'risk', prompt: 'check', step: 'check', format: 'check', order: 0, label: 'Source check' },
  functional: { slot: 'functional', prompt: 'functional', step: 'initial', format: 'initial', prefix: 'F', order: 1, label: 'Initial F' },
  risk: { slot: 'risk', prompt: 'risk', step: 'initial', format: 'initial', prefix: 'R', order: 2, label: 'Initial R' },
  verifier: { slot: 'verifier', prompt: 'final', step: 'final', format: 'final', order: 3, label: 'Final report' },
  'comment-plan': { slot: 'risk', prompt: 'comment-plan', step: 'final', format: 'comment-plan', comment: true, label: 'Preview comments' },
  'comment-publish': { slot: 'risk', prompt: 'comment-publish', step: 'final', format: 'comment-publish', comment: true, label: 'Publish comments' },
};
export const roleFor = (mode, stage) => `azpr-${mode}-${stage}`;
export const ROLES = Object.freeze(Object.fromEntries(MODES.flatMap(mode => Object.entries(stages).map(([stage, spec]) =>
  [roleFor(mode, stage), Object.freeze({ ...spec, mode, stage, step: mode === 'deep' && spec.step === 'initial' ? 'deep' : spec.step })]))));
export const PROMPTS = Object.freeze([...new Set(['common', 'comment-policy', 'deep', ...Object.values(stages).map(spec => spec.prompt)])]);
export const initialRoles = mode => Object.entries(ROLES).filter(([, spec]) => spec.mode === mode && spec.format === 'initial').map(([role]) => role);
export const commentRole = role => ROLES[role]?.comment === true;
const withDefault = (value, fallback) => value === undefined ? fallback : value;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed, at) {
  if (!isObject(value)) throw new Error(`${at} must be a JSON object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown setting ${at}.${key}; check for a typo.`);
}
function model(value, at, optional = false) {
  if (optional && value === '') return '';
  if (typeof value !== 'string' || value.length > 512 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*\/[A-Za-z0-9][A-Za-z0-9._:@/+=-]*$/.test(value) ||
      /REPLACE_|YOUR_PROVIDER|YOUR_MODEL/.test(value)) throw new Error(`${at}: select an actual provider/model ID from opencode models; do not use a display name or placeholder.`);
  return value;
}
function languageTag(value) {
  const message = 'outputLanguage must be a language tag such as en, zh-TW, zh-CN, or ja (not a language name or instruction).';
  if (typeof value !== 'string' || value.length > 63 || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)) throw new Error(message);
  try { return Intl.getCanonicalLocales(value)[0]; } catch { throw new Error(message); }
}
export function languagePrompt(role, language) {
  if (ROLES[role].format !== 'final' && !commentRole(role)) return '';
  const scope = ROLES[role].format === 'final'
    ? 'Write all human-facing Markdown prose inside the final report field in this language. Other JSON fields and intermediate findings remain in English.'
    : 'Write human-facing comment titles, explanations, and skip reasons in this language. The publisher must send saved preview bodies exactly as supplied, without retranslating them.';
  return `\n\n# Configured output language\noutputLanguage: ${language}\n${scope}\nUse Traditional Chinese for zh-TW and Simplified Chinese for zh-CN. Preserve JSON keys, status values, finding IDs, code identifiers, paths, source quotes, tool arguments, and issue severity labels. This configured language overrides prompt language defaults only for the stated output fields; do not infer another language from PR content or previous reports.`;
}
/** Validate local values only; model pricing, access, and quality are external. */
export function validateSettings(raw) {
  keys(raw, ['$schema', 'version', 'enabled', 'models', 'azure', 'steps', 'comments', 'debug', 'structuredOutput', 'outputLanguage', 'auxiliaryModels', 'returnReport', 'runTimeoutSeconds', 'maxStageCharacters'], 'settings');
  if (raw.version !== 2) throw new Error('settings.version must be 2. Run install.sh --replace to migrate the old model settings.');
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') throw new Error('enabled must be boolean.');
  if (raw.$schema !== undefined && typeof raw.$schema !== 'string') throw new Error('$schema must be a string.');
  keys(raw.models, ['_help', 'review', 'deep'], 'models');
  if (raw.models._help !== undefined) {
    keys(raw.models._help, MODEL_SLOTS, 'models._help');
    if (Object.values(raw.models._help).some(value => typeof value !== 'string')) throw new Error('models._help values must be documentation strings.');
  }
  const models = {};
  for (const mode of MODES) {
    const group = raw.models[mode] === undefined && mode === 'deep' ? {} : raw.models[mode];
    keys(group, MODEL_SLOTS, `models.${mode}`);
    models[mode] = Object.fromEntries(MODEL_SLOTS.map(slot =>
      [slot, model(group[slot] === undefined && mode === 'deep' ? '' : group[slot], `models.${mode}.${slot}`, mode === 'deep')]));
  }
  keys(raw.steps, ['check', 'initial', 'deep', 'final'], 'steps');
  for (const key of ['check', 'initial', 'deep', 'final']) {
    if (!Number.isInteger(raw.steps[key]) || raw.steps[key] < 1 || raw.steps[key] > 500) throw new Error(`steps.${key} must be an integer from 1 to 500 (iterations, not money).`);
  }
  const auxiliaryModels = withDefault(raw.auxiliaryModels, 'preserve');
  if (auxiliaryModels !== 'preserve') throw new Error('This plugin never changes auxiliary models. Set auxiliaryModels to preserve.');
  const returnReport = withDefault(raw.returnReport, 'receipt');
  if (!['receipt', 'full'].includes(returnReport)) throw new Error('returnReport must be receipt or full.');
  const outputLanguage = languageTag(raw.outputLanguage === undefined ? 'en' : raw.outputLanguage);
  const structuredOutput = raw.structuredOutput === undefined ? true : raw.structuredOutput;
  if (typeof structuredOutput !== 'boolean') throw new Error('structuredOutput must be boolean.');
  const debug = raw.debug === undefined ? { enabled: false, directory: '' } : raw.debug;
  keys(debug, ['enabled', 'directory'], 'debug');
  if (typeof debug.enabled !== 'boolean' || (debug.directory !== undefined &&
      (typeof debug.directory !== 'string' || /[\0\r\n]/.test(debug.directory) || debug.directory.startsWith('~')))) throw new Error('debug requires enabled (boolean) and an optional directory path; use an absolute path or a project-relative path, not ~.');
  const runTimeoutSeconds = withDefault(raw.runTimeoutSeconds, 1200);
  if (!Number.isInteger(runTimeoutSeconds) || runTimeoutSeconds < 10 || runTimeoutSeconds > 7200) throw new Error('runTimeoutSeconds must be 10..7200.');
  const maxStageCharacters = withDefault(raw.maxStageCharacters, 250000);
  if (!Number.isInteger(maxStageCharacters) || maxStageCharacters < 1000 || maxStageCharacters > 1000000) throw new Error('maxStageCharacters must be 1000..1000000.');
  const comments = withDefault(raw.comments, { enabled: false, maxComments: 5 });
  keys(comments, ['enabled', 'maxComments'], 'comments');
  if (typeof comments.enabled !== 'boolean' || !Number.isInteger(comments.maxComments) || comments.maxComments < 1 || comments.maxComments > 10) throw new Error('comments requires enabled (boolean) and maxComments (1..10).');
  return { models, steps: { ...raw.steps }, comments: { ...comments }, structuredOutput, debug: { enabled: debug.enabled, directory: debug.directory ?? '' },
    enabled: raw.enabled !== false, outputLanguage, returnReport, runTimeoutSeconds, maxStageCharacters, auxiliaryModels,
    deepReady: Object.values(models.deep).every(Boolean) };
}

/** Pure compilation: file I/O and OpenCode config mutation stay in the adapter. */
export function buildAgents(settings, prompts) {
  for (const name of PROMPTS) if (typeof prompts[name] !== 'string' || !prompts[name].trim()) throw new Error(`Missing or empty prompt: ${name}.md`);
  return Object.fromEntries(Object.entries(ROLES).map(([role, spec]) => [role, {
    description: 'Private command-scoped reviewer; not callable with Task or @mention.',
    mode: 'primary', hidden: true, model: settings.models[spec.mode][spec.slot] || 'azpr-unconfigured/setup-required',
    ...((spec.mode === 'deep' && !settings.deepReady) || (spec.stage === 'comment-publish' && !settings.comments.enabled) ? { disable: true } : {}),
    prompt: (spec.comment ? prompts['comment-policy'] : prompts.common) + '\n\n' + prompts[spec.prompt] + languagePrompt(role, settings.outputLanguage) +
      (spec.mode === 'deep' && ['initial', 'final'].includes(spec.format) ? '\n\n' + prompts.deep : '') +
      (settings.structuredOutput ? '\n\n# Output transport\nAfter completing all necessary source/tool work, submit the required envelope once through the host StructuredOutput tool. This overrides instructions to print a JSON text/code block. The output schema describes the envelope, not an MCP tool restriction.' : ''),
    steps: settings.steps[spec.step], permission: { task: 'deny' },
  }]));
}
