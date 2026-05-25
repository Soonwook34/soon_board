import { describe, expect, it } from 'vitest';
import { readSimulatedNowMs } from '../simulatedNow';

const DEV = { dev: true, vercelEnv: '' };
const PREVIEW = { dev: false, vercelEnv: 'preview' };
const PRODUCTION = { dev: false, vercelEnv: 'production' };

describe('readSimulatedNowMs', () => {
  it('returns parsed ms for valid ISO in DEV', () => {
    const out = readSimulatedNowMs('?now=2024-03-02T15:00:00Z', DEV);
    expect(out).toBe(Date.UTC(2024, 2, 2, 15, 0, 0));
  });

  it('returns parsed ms for valid ISO in preview deploy', () => {
    const out = readSimulatedNowMs('?now=2024-03-02T15:00:00Z', PREVIEW);
    expect(out).toBe(Date.UTC(2024, 2, 2, 15, 0, 0));
  });

  it('returns null in production deploy even with valid ?now (인수 17, critic P0-3 gate)', () => {
    const out = readSimulatedNowMs('?now=2024-03-02T15:00:00Z', PRODUCTION);
    expect(out).toBeNull();
  });

  it('returns null for missing ?now param', () => {
    expect(readSimulatedNowMs('', DEV)).toBeNull();
    expect(readSimulatedNowMs('?other=1', DEV)).toBeNull();
  });

  it('returns null for invalid ISO string', () => {
    expect(readSimulatedNowMs('?now=not-a-date', DEV)).toBeNull();
    expect(readSimulatedNowMs('?now=', DEV)).toBeNull();
  });

  it('returns null in production for missing ?now (no leak path)', () => {
    expect(readSimulatedNowMs('', PRODUCTION)).toBeNull();
  });

  it('returns null when vercelEnv is empty string (treated as production-like / unknown)', () => {
    // env.dev:false + vercelEnv:'' (Vite의 define이 누락된 빌드 — fail-closed)
    expect(readSimulatedNowMs('?now=2024-01-01T00:00:00Z', { dev: false, vercelEnv: '' })).toBeNull();
  });

  it('handles ?now with other params present', () => {
    const out = readSimulatedNowMs('?season=2024&now=2024-06-01T00:00:00Z&q=foo', DEV);
    expect(out).toBe(Date.UTC(2024, 5, 1, 0, 0, 0));
  });
});
