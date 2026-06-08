// 세그먼트 진행 ② (퀄리 전용) — Q1/Q2/Q3 핀 + 활성 세그먼트 카운트다운.
// 제한시간은 SEGMENT_DURATIONS_MIN SSOT 참조(Q 18/15/12 vs SQ 12/10/8). red flag 보정은 best-effort.
// qualifying-session-dashboard.md §3.4 / US-007.

import { useMemo } from 'react';
import { useDataSource } from '../../shared/DataSourceContext';
import { useDisplayTime } from '../../shared/useDisplayTime';
import { reconstructSegments, activePartAt } from '../../derived/qualifyingSegments';
import { resolveSessionKind, segmentPrefix, SEGMENT_DURATIONS_MIN } from '../../../shared/sessionKind';
import { dashboardColors, MONO, panelStyle } from '../../shared/dashboardStyles';
import { color, radius, space } from '../../../style/tokens';
import type { SessionData } from '../../../shared/seasonData';

const PARTS = [1, 2, 3] as const;

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function SegmentProgress({ session }: { session: SessionData }) {
  const ds = useDataSource();
  const t = useDisplayTime(1000);

  // 경계만 필요 → race_control 만으로 가볍게 재구성(세그먼트 멤버십 불요).
  const { boundaries, activePart } = useMemo(() => {
    const model = reconstructSegments(ds.getAllBefore('race_control', t), []);
    return { boundaries: model.boundaries, activePart: activePartAt(model.boundaries, t) };
  }, [ds, t]);

  const kind = resolveSessionKind(session.session_type, session.session_name);
  const prefix = segmentPrefix(kind);
  const durations =
    kind === 'sprint_qualifying' ? SEGMENT_DURATIONS_MIN.sprint_qualifying : SEGMENT_DURATIONS_MIN.qualifying;

  // 활성 세그먼트 카운트다운(표준 길이 기준 best-effort).
  let countdown: string | null = null;
  let ended = false;
  if (activePart != null) {
    const b = boundaries.find((x) => x.part === activePart);
    if (b?.startMs != null) {
      const ruleEnd = b.startMs + durations[activePart - 1] * 60_000;
      if (b.endMs != null && t.getTime() > b.endMs) {
        ended = true;
      } else {
        countdown = fmtClock(ruleEnd - t.getTime());
      }
    }
  }

  return (
    <section
      data-testid="segment-progress"
      aria-label="퀄리파잉 세그먼트 진행"
      style={{ ...panelStyle, display: 'flex', alignItems: 'center', gap: space['3'], justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', gap: space['2'] }}>
        {PARTS.map((p) => {
          const active = p === activePart;
          return (
            <span
              key={p}
              data-testid={`seg-pill-${p}`}
              data-active={active ? 'true' : 'false'}
              style={{
                padding: `${space['1']} ${space['3']}`,
                borderRadius: radius.pill,
                fontSize: '12px',
                fontWeight: 700,
                background: active ? color.accent : color.bgElevated,
                color: active ? color.textOnAccent : dashboardColors.textMuted,
                border: `1px solid ${active ? color.accent : dashboardColors.border}`,
              }}
            >
              {prefix}
              {p}
            </span>
          );
        })}
      </div>
      <span style={{ fontFamily: MONO, fontSize: '15px', fontWeight: 700, color: dashboardColors.text }}>
        {activePart == null ? '대기' : ended ? '종료' : `${prefix}${activePart} ${countdown ?? '--:--'}`}
      </span>
    </section>
  );
}
