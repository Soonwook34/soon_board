// 퀄리파잉 타워 ⑤ (리더보드 변형) — 현재 세그먼트 베스트로 정렬 + 컷라인 음영/구분선.
// qualifying-session-dashboard.md §3.4 / US-007.
// 정렬은 진행중(시간 컷) 베스트(useQualifyingModel.bests) — 미래 누설 zero. 컷라인 순위는 멤버십(포맷 지식).

import { useMemo, type CSSProperties } from 'react';
import { useDrivers, teamColorOf } from '../../shared/DriversContext';
import { selectDriver } from '../../shared/selectionStore';
import { dashboardColors, MONO, panelStyle } from '../../shared/dashboardStyles';
import { PanelHeading } from '../../shared/PanelHeading';
import { formatLapTime, NO_VALUE } from '../../shared/formatTime';
import { resolveSessionKind, segmentPrefix } from '../../../shared/sessionKind';
import { color } from '../../../style/tokens';
import { cutlineFor, knockoutZone, gapToCutline } from '../../derived/knockout';
import { useQualifyingModel } from './useQualifyingModel';
import type { SessionData } from '../../../shared/seasonData';

const headerCellStyle: CSSProperties = {
  color: dashboardColors.textMuted,
  fontSize: '11px',
  fontWeight: 600,
  textAlign: 'left',
  padding: '2px 6px',
};
const cellStyle: CSSProperties = { padding: '2px 6px', verticalAlign: 'middle' };
const monoCellStyle: CSSProperties = { ...cellStyle, fontFamily: MONO, fontSize: '12px' };

export function QualifyingTower({ session }: { session: SessionData }) {
  const drivers = useDrivers();
  const { model, bests, activePart } = useQualifyingModel();
  const prefix = segmentPrefix(resolveSessionKind(session.session_type, session.session_name));

  const rows = useMemo(() => {
    if (activePart == null) return [];
    const members = model.membership.get(activePart);
    const nums = members && members.size > 0 ? [...members] : [...drivers.keys()];
    const built = nums.map((n) => ({ driver_number: n, best: bests.get(n)?.get(activePart) ?? null }));
    built.sort((a, b) => {
      if (a.best == null && b.best == null) return a.driver_number - b.driver_number;
      if (a.best == null) return 1;
      if (b.best == null) return -1;
      return a.best - b.best;
    });
    return built;
  }, [model, bests, activePart, drivers]);

  const cut = activePart != null ? cutlineFor(model, activePart) : null;
  const cutPos = cut?.cutlinePosition ?? null;
  const orderedNums = rows.map((r) => r.driver_number);
  const zone = knockoutZone(orderedNums, cutPos);
  const gaps = gapToCutline(
    rows.filter((r) => r.best != null).map((r) => ({ driver_number: r.driver_number, bestSec: r.best as number })),
    cutPos,
  );

  return (
    <section
      data-testid="qualifying-tower"
      aria-label="Qualifying Tower"
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '6px', overflowX: 'auto' }}
    >
      <PanelHeading>{activePart != null ? `${prefix}${activePart} — TIMING` : 'QUALIFYING'}</PanelHeading>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={headerCellStyle}>P</th>
            <th style={headerCellStyle}>DRV</th>
            <th style={headerCellStyle}>BEST</th>
            <th style={headerCellStyle}>GAP</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ ...cellStyle, color: dashboardColors.textMuted }}>
                세션 대기
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const driver = drivers.get(row.driver_number);
              const inZone = zone.has(row.driver_number);
              const gap = gaps.get(row.driver_number);
              // 컷라인 바로 위 행 하단에 구분선(P{cutPos} 과 P{cutPos+1} 사이).
              const isCutline = cutPos != null && i + 1 === cutPos;
              return (
                <tr
                  key={row.driver_number}
                  data-testid={`qt-row-${row.driver_number}`}
                  data-knockout={inZone ? 'true' : 'false'}
                  role="button"
                  onClick={() => selectDriver(row.driver_number)}
                  style={{
                    cursor: 'pointer',
                    borderTop: `1px solid ${dashboardColors.border}`,
                    borderBottom: isCutline ? `2px solid ${color.accent}` : undefined,
                    borderLeft: inZone ? `3px solid ${color.live}` : '3px solid transparent',
                    opacity: inZone ? 0.85 : 1,
                  }}
                >
                  <td style={monoCellStyle}>{i + 1}</td>
                  <td style={cellStyle}>
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        marginRight: '6px',
                        background: teamColorOf(driver),
                      }}
                    />
                    <span style={{ fontSize: '12px', color: dashboardColors.text }}>
                      {driver?.name_acronym || `#${row.driver_number}`}
                    </span>
                  </td>
                  <td style={monoCellStyle}>{formatLapTime(row.best)}</td>
                  <td style={{ ...monoCellStyle, color: inZone ? color.live : dashboardColors.textSecondary }}>
                    {gap == null || Math.abs(gap) < 1e-9 ? NO_VALUE : `${gap > 0 ? '+' : ''}${gap.toFixed(3)}`}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
