const OPENF1_TEST_URL = 'https://api.openf1.org/v1/sessions?year=2024';
const USER_AGENT = 'SOON-BOARD/fan-project +https://soon-board.pages.dev';
const TIMEOUT_MS = 10_000;

interface ProbeResult {
  reachable: boolean;
  status?: number;
  sample_session_key?: number;
  total_records?: number;
  error?: string;
  elapsed_ms: number;
}

export async function probeOpenF1(url: string = OPENF1_TEST_URL): Promise<ProbeResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        reachable: false,
        status: response.status,
        error: `non-OK status ${response.status}`,
        elapsed_ms: performance.now() - started,
      };
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return {
        reachable: false,
        status: response.status,
        error: 'empty array — OpenF1 returned no sessions for year=2024',
        elapsed_ms: performance.now() - started,
      };
    }

    const first = data[0] as { session_key?: number };
    return {
      reachable: true,
      status: response.status,
      sample_session_key: first.session_key,
      total_records: data.length,
      elapsed_ms: performance.now() - started,
    };
  } catch (err) {
    return {
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
      elapsed_ms: performance.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  console.info('[probe-openf1] LOCAL probe — checks OpenF1 reachability from this machine.');
  console.info('[probe-openf1] Prod CF egress probe is deferred to Phase 6.1 (after deploy).');
  console.info(`[probe-openf1] GET ${OPENF1_TEST_URL}`);
  console.info(`[probe-openf1] User-Agent: ${USER_AGENT}`);
  console.info('');

  const result = await probeOpenF1();
  const elapsed = result.elapsed_ms.toFixed(0);

  if (result.reachable) {
    console.info(`[probe-openf1] OK — HTTP ${result.status} in ${elapsed}ms`);
    console.info(`[probe-openf1] sample session_key: ${result.sample_session_key}`);
    console.info(`[probe-openf1] total records: ${result.total_records}`);
    console.info('[probe-openf1] Local network can reach OpenF1. Cloudflare egress probe still required in Phase 6.1.');
    process.exit(0);
  } else {
    console.error(`[probe-openf1] BLOCKED — ${result.error ?? 'unknown'} (${elapsed}ms)`);
    console.error('');
    console.error('Investigation steps:');
    console.error('  1. Confirm internet connectivity.');
    console.error('  2. Try `curl -A "SOON-BOARD/fan-project" https://api.openf1.org/v1/sessions?year=2024`');
    console.error('  3. Check OpenF1 status: https://openf1.org/ or https://github.com/br-g/openf1/issues');
    console.error('  4. If User-Agent appears blocked, retry with a fallback UA before raising with maintainer.');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[probe-openf1] unexpected error:', err);
    process.exit(2);
  });
}
