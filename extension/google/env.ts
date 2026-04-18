import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface GoogleProfileRegistryEntry {
  path: string;
}

export interface GoogleProfileRegistry {
  activeProfileId: string | null;
  profiles: GoogleProfileRegistryEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isProfileEntry(value: unknown): value is GoogleProfileRegistryEntry {
  return isRecord(value) && typeof value.path === 'string';
}

export function getSeroFixedRoot(homeDir: string = homedir()): string {
  return path.join(homeDir, '.sero-ui');
}

export function getSeroHome(defaultFixedRoot: string = getSeroFixedRoot()): string {
  const envHome = process.env.SERO_HOME?.trim();
  return envHome || defaultFixedRoot;
}

export function getAgentDir(defaultSeroHome: string = getSeroHome()): string {
  const envAgentDir = process.env.PI_CODING_AGENT_DIR?.trim();
  return envAgentDir || path.join(defaultSeroHome, 'agent');
}

export function getProfileRegistryPath(fixedRoot: string = getSeroFixedRoot()): string {
  return path.join(fixedRoot, 'profiles.json');
}

export function readProfileRegistry(
  fixedRoot: string = getSeroFixedRoot(),
): GoogleProfileRegistry {
  const registryPath = getProfileRegistryPath(fixedRoot);
  if (!existsSync(registryPath)) {
    return { activeProfileId: null, profiles: [] };
  }

  try {
    const raw = readFileSync(registryPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { activeProfileId: null, profiles: [] };
    }

    const activeProfileId =
      typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null;
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.filter(isProfileEntry)
      : [];

    return { activeProfileId, profiles };
  } catch {
    return { activeProfileId: null, profiles: [] };
  }
}

export function getActiveProfileId(fixedRoot: string = getSeroFixedRoot()): string | null {
  return readProfileRegistry(fixedRoot).activeProfileId;
}
