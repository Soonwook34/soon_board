// dashboard §2.7 — 이벤트 티커 ⑦. 최근 5건 race_control(최신 위) + 카테고리 아이콘. 미래 미표시.

import { useMemo } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { flagIcon } from '../shared/flagIcons';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';
import { PanelHeading } from '../shared/PanelHeading';

export function EventTicker() {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const events = useMemo(() => ds.getAllBefore('race_control', t, undefined, 5), [ds, t]);

  return (
    <section
      data-testid="event-ticker"
      aria-label="이벤트 티커"
      style={{ ...panelStyle, display: 'flex', flexDirection: 'column', gap: '4px' }}
    >
      <PanelHeading>EVENTS</PanelHeading>
      {events.length === 0 ? (
        <span style={{ fontSize: '12px', color: dashboardColors.textMuted }}>이벤트 없음</span>
      ) : (
        events.map((rc, i) => (
          <div
            key={i}
            data-testid="ticker-item"
            style={{ display: 'flex', alignItems: 'baseline', gap: '6px', fontSize: '12px' }}
          >
            <span aria-hidden style={{ fontSize: '13px' }}>{flagIcon(rc)}</span>
            {/* #5/D1 — 긴 메시지 1줄 클램프(minWidth:0 은 flex item ellipsis 필수), 전체는 hover title. */}
            <span
              title={rc.message}
              style={{
                color: dashboardColors.text,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {rc.message}
            </span>
            {rc.lap_number != null && (
              <span style={{ fontSize: '11px', color: dashboardColors.textMuted }}>
                L{rc.lap_number}
              </span>
            )}
          </div>
        ))
      )}
    </section>
  );
}
