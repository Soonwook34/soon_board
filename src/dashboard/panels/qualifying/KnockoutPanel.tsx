// 녹아웃(DROP ZONE) 패널 ⑦ — 현재 세그먼트 컷라인 아래 드라이버 + 진출에 필요한 갭.
// 컷라인 인원은 멤버십(데이터 파생, 2026 자동 대응). 순위/갭은 진행중 시간 컷 베스트. US-007.

import { useMemo } from 'react';
import { useDrivers, teamColorOf } from '../../shared/DriversContext';
import { dashboardColors, MONO, panelStyle } from '../../shared/dashboardStyles';
import { PanelHeading } from '../../shared/PanelHeading';
import { resolveSessionKind, segmentPrefix } from '../../../shared/sessionKind';
import { color, space } from '../../../style/tokens';
import { cutlineFor, knockoutZone, gapToCutline } from '../../derived/knockout';
import { useQualifyingModel } from './useQualifyingModel';
import type { SessionData } from '../../../shared/seasonData';

export function KnockoutPanel({ session }: { session: SessionData }) {
  const drivers = useDrivers();
  const { model, bests, activePart } = useQualifyingModel();
  const prefix = segmentPrefix(resolveSessionKind(session.session_type, session.session_name));

  const { zoneRows, isFinal } = useMemo(() => {
    if (activePart == null) return { zoneRows: [], isFinal: false };
    const cut = cutlineFor(model, activePart);
    if (cut.cutlinePosition == null) return { zoneRows: [], isFinal: true }; // Q3 — 녹아웃 없음
    const members = model.membership.get(activePart);
    const nums = members && members.size > 0 ? [...members] : [...drivers.keys()];
    const ranked = nums
      .map((n) => ({ driver_number: n, best: bests.get(n)?.get(activePart) ?? null }))
      .sort((a, b) => {
        if (a.best == null && b.best == null) return a.driver_number - b.driver_number;
        if (a.best == null) return 1;
        if (b.best == null) return -1;
        return a.best - b.best;
      });
    const zone = knockoutZone(ranked.map((r) => r.driver_number), cut.cutlinePosition);
    const gaps = gapToCutline(
      ranked.filter((r) => r.best != null).map((r) => ({ driver_number: r.driver_number, bestSec: r.best as number })),
      cut.cutlinePosition,
    );
    const zoneRows = ranked
      .filter((r) => zone.has(r.driver_number))
      .map((r) => ({ driver_number: r.driver_number, gap: gaps.get(r.driver_number) ?? null }));
    return { zoneRows, isFinal: false };
  }, [model, bests, activePart, drivers]);

  return (
    <section
      data-testid="knockout-panel"
      aria-label="녹아웃 존"
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '4px' }}
    >
      <PanelHeading>{isFinal ? `${prefix}3 — POLE SHOOTOUT` : 'DROP ZONE'}</PanelHeading>
      {activePart == null ? (
        <div style={{ fontSize: '12px', color: dashboardColors.textMuted }}>세션 대기</div>
      ) : isFinal ? (
        <div style={{ fontSize: '12px', color: dashboardColors.textMuted }}>최종 세그먼트 — 탈락 없음</div>
      ) : zoneRows.length === 0 ? (
        <div style={{ fontSize: '12px', color: dashboardColors.textMuted }}>—</div>
      ) : (
        zoneRows.map((r) => {
          const driver = drivers.get(r.driver_number);
          return (
            <div
              key={r.driver_number}
              data-testid={`ko-row-${r.driver_number}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: space['2'],
                fontSize: '12px',
                borderLeft: `3px solid ${color.live}`,
                paddingLeft: space['2'],
              }}
            >
              <span style={{ color: dashboardColors.text }}>
                <span aria-hidden style={{ display: 'inline-block', width: '6px', height: '6px', marginRight: '4px', background: teamColorOf(driver) }} />
                {driver?.name_acronym || `#${r.driver_number}`}
              </span>
              <span style={{ fontFamily: MONO, color: color.live }}>
                {r.gap == null ? '—' : `+${r.gap.toFixed(3)}`}
              </span>
            </div>
          );
        })
      )}
    </section>
  );
}
