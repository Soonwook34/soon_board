// 세그먼트별 베스트랩 보드 ⑧ — Q1/Q2/Q3 3열, 각 열 드라이버 베스트(빠른 순). 1위 = 보라(세션 베스트).
// 진행중(시간 컷) 베스트 사용 → 미래 누설 zero. qualifying-session-dashboard.md §3.4 / US-007.

import { useMemo } from 'react';
import { useDrivers, teamColorOf } from '../../shared/DriversContext';
import { dashboardColors, MONO, panelStyle } from '../../shared/dashboardStyles';
import { PanelHeading } from '../../shared/PanelHeading';
import { formatLapTime } from '../../shared/formatTime';
import { resolveSessionKind, segmentPrefix } from '../../../shared/sessionKind';
import { color, space } from '../../../style/tokens';
import { useQualifyingModel } from './useQualifyingModel';
import type { QualiPart } from '../../derived/qualifyingSegments';
import type { SessionData } from '../../../shared/seasonData';

const PARTS: readonly QualiPart[] = [1, 2, 3];
const TOP_N = 5;

export function SegmentBestBoard({ session }: { session: SessionData }) {
  const drivers = useDrivers();
  const { bests } = useQualifyingModel();
  const prefix = segmentPrefix(resolveSessionKind(session.session_type, session.session_name));

  // part → [{driver_number, best}] 빠른 순.
  const byPart = useMemo(() => {
    const map = new Map<QualiPart, Array<{ driver_number: number; best: number }>>();
    for (const part of PARTS) map.set(part, []);
    for (const [n, perPart] of bests) {
      for (const part of PARTS) {
        const v = perPart.get(part);
        if (v != null) map.get(part)!.push({ driver_number: n, best: v });
      }
    }
    for (const part of PARTS) map.get(part)!.sort((a, b) => a.best - b.best);
    return map;
  }, [bests]);

  return (
    <section
      data-testid="segment-best-board"
      aria-label="세그먼트별 베스트랩"
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '6px' }}
    >
      <PanelHeading>SEGMENT BESTS</PanelHeading>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: space['2'] }}>
        {PARTS.map((part) => {
          const list = byPart.get(part)!;
          return (
            <div key={part} data-testid={`seg-best-col-${part}`} style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: dashboardColors.textMuted, marginBottom: '2px' }}>
                {prefix}
                {part}
              </div>
              {list.length === 0 ? (
                <div style={{ fontSize: '12px', color: dashboardColors.textMuted }}>—</div>
              ) : (
                list.slice(0, TOP_N).map((r, i) => {
                  const driver = drivers.get(r.driver_number);
                  return (
                    <div
                      key={r.driver_number}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', fontSize: '12px' }}
                    >
                      <span style={{ color: dashboardColors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span aria-hidden style={{ display: 'inline-block', width: '6px', height: '6px', marginRight: '4px', background: teamColorOf(driver) }} />
                        {driver?.name_acronym || `#${r.driver_number}`}
                      </span>
                      <span style={{ fontFamily: MONO, color: i === 0 ? color.accent : dashboardColors.textSecondary }}>
                        {formatLapTime(r.best)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
