// Opt-in local evidence, NOT a transcript of private reasoning or tool traffic.
import { mkdir, mkdtemp, lstat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, parse, relative, isAbsolute } from 'node:path';
import { visibleText } from './output.mjs';

async function ensureDirectory(path) {
  const root = parse(path).root;
  let current = root;
  for (const segment of relative(root, path).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe debug directory.');
  }
}

export async function createDiagnostics(settings, context, run) {
  const log = { directory: '', warnings: [], write: async () => {} };
  if (!settings.debug.enabled) return log;
  try {
    const stateHome = isAbsolute(process.env.XDG_STATE_HOME ?? '') ? process.env.XDG_STATE_HOME : join(homedir(), '.local', 'state');
    const requested = settings.debug.directory;
    if (requested && !isAbsolute(requested) && !context.directory) throw new Error('Project directory unavailable.');
    const root = requested ? resolve(context.directory ?? '.', requested) : join(stateHome, 'opencode', 'azpr-debug');
    await ensureDirectory(root);
    // Unique directory and exclusive files: never overwrite existing user data.
    const directory = await mkdtemp(join(root, `${run.id}-`));
    await writeFile(join(directory, '.gitignore'), '*\n', { flag: 'wx', mode: 0o600 });
    log.directory = directory;
    log.write = async (name, value) => {
      try {
        if (!/^[a-zA-Z0-9.-]+$/.test(name)) throw new Error('Invalid diagnostic filename.');
        await writeFile(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      } catch { log.warnings.push(`Could not save ${name}; inspect the OpenCode session instead.`); }
    };
    await log.write('run.json', { id: run.id, origin: run.origin, mode: run.mode, profile: run.profile, sourceReview: run.review?.id,
      startedAt: new Date().toISOString(), project: context.directory, outputLanguage: settings.outputLanguage,
      returnReport: settings.returnReport, structuredOutput: settings.structuredOutput,
      privacy: 'Private review data. May contain source, PR details, model IDs, or secrets echoed by the model. Do not upload or commit. No automatic retention cleanup.' });
  } catch { log.warnings.push('Debug logging could not start; no diagnostic data was intentionally written. Inspect the OpenCode session instead.'); }
  return log;
}

export function diagnosticResponse(response, maxCharacters) {
  const raw = visibleText(response);
  // Only select public answer/error fields; omit reasoning, tool inputs/outputs,
  // HTTP headers, provider options, and environment/configuration contents.
  const error = response?.info?.error;
  const structured = response?.info?.structured;
  const encoded = structured === undefined ? '' : JSON.stringify(structured);
  return {
    messageID: response?.info?.id, model: response?.info?.modelID, provider: response?.info?.providerID,
    finish: response?.info?.finish,
    error: error ? { name: error.name, message: String(error.data?.message ?? error.message ?? '').slice(0, maxCharacters) } : undefined,
    text: raw.slice(0, maxCharacters), textCharacters: raw.length, textTruncated: raw.length > maxCharacters,
    structured: encoded.length <= maxCharacters ? structured : undefined,
    structuredPreview: encoded.length > maxCharacters ? encoded.slice(0, maxCharacters) : undefined,
    structuredTruncated: encoded.length > maxCharacters,
  };
}
