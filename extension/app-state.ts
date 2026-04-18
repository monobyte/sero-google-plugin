import { promises as fs } from 'node:fs';
import path from 'node:path';

import { DEFAULT_GOOGLE_STATE, type GoogleAppState } from '../shared/types';

export function resolveStatePath(cwd: string): string {
  const seroHome = process.env.SERO_HOME;
  if (seroHome) {
    return path.join(seroHome, 'apps', 'google', 'state.json');
  }
  return path.join(cwd, '.sero', 'apps', 'google', 'state.json');
}

export async function readState(filePath: string): Promise<GoogleAppState> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as GoogleAppState;
  } catch {
    return { ...DEFAULT_GOOGLE_STATE };
  }
}

export async function writeState(filePath: string, state: GoogleAppState): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}
