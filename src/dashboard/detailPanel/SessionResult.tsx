// dashboard §3.6 — 세션 결과 (종료 후만). 게이트: display_time < session.date_end → 미표시(인수11/17g).
// session.date_end 는 정적 세션 메타이므로 컴포넌트 비교 허용 (버퍼 record 미래누설 아님).
// 결과 record 는 undated → ds.getSessionResult 전용 접근자(US-8A) 사용.

import { useDisplayTime } from '../shared/useDisplayTime';
import { useDataSource } from '../shared/DataSourceContext';
import { formatLapTime, formatGap } from '../shared/formatTime';
import { dashboardColors } from '../shared/dashboardStyles';
import type { SessionData } from '../../shared/seasonData';

const MONO = 'var(--font-mono, monospace)';

function statusLabel(r: { dnf: boolean; dns: boolean; dsq: boolean }): string | null {
  if (r.dsq) return 'DSQ';
  if (r.dnf) return 'DNF';
  if (r.dns) return 'DNS';
  return null;
}

export function SessionResult({
  driverNumber,
  session,
}: {
  driverNumber: number;
  session: SessionData;
}) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);

  // 종료 게이트 — display_time 이 세션 종료 시각을 넘어야 결과 표시.
  const ended = t.valueOf() >= Date.parse(session.date_end);
  if (!ended) return null;

  const result = ds.getSessionResult(driverNumber);

  const isQualifying = session.session_type.toLowerCase().includes('qualifying');
  const status = result ? statusLabel(result) : null;

  return (
    <section data-testid="session-result" aria-label="세션 결과" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '10px', color: dashboardColors.textMuted }}>RESULT</span>
      {!result ? (
        <span style={{ fontSize: '12px', color: dashboardColors.textMuted }}>결과 없음</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', fontFamily: MONO, color: dashboardColors.text }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline' }}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>
              {result.position != null ? `P${result.position}` : '—'}
            </span>
            {status && (
              <span data-testid="result-status" style={{ color: dashboardColors.textSecondary, fontWeight: 600 }}>
                {status}
              </span>
            )}
          </div>
          {isQualifying && Array.isArray(result.duration) ? (
            <div data-testid="result-quali" style={{ display: 'flex', gap: '10px' }}>
              {result.duration.map((d, i) => (
                <span key={i} style={{ color: dashboardColors.textSecondary }}>
                  Q{i + 1} {formatLapTime(d)}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', color: dashboardColors.textSecondary }}>
              {result.number_of_laps != null && <span>{result.number_of_laps} laps</span>}
              {result.gap_to_leader != null && !Array.isArray(result.gap_to_leader) && (
                <span>{formatGap(result.gap_to_leader)}</span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
