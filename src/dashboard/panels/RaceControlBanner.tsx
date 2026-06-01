// dashboard §2.4 — Race Control 배너 ④. 현재 활성 메시지 1건 (activeFlag still-active 판정).
// 동일 t 로 getAllBefore + activeFlag 호출 (TTL 계산 일관). 미래 메시지 미표시 (date≤t).

import { useMemo } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { activeFlag } from '../derived/activeFlags';
import { flagIcon } from '../shared/flagIcons';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';
import type { FlagKind } from '../shared/flagDecoder';

// flag 종류별 강조색 — F1 방송 표준색이라 raw hex 허용 (인수 19 예외).
const FLAG_ACCENT: Record<FlagKind, string> = {
  chequered: '#e8eaf0',
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#10b981',
  clear: '#10b981',
  safetycar: '#f59e0b',
  other: '#5b6273',
};

export function RaceControlBanner() {
  const ds = useDataSource();
  const t = useDisplayTime(250);
  const messages = useMemo(() => ds.getAllBefore('race_control', t), [ds, t]);
  const active = useMemo(() => activeFlag(messages, t), [messages, t]);

  const accent = active ? FLAG_ACCENT[active.kind] : dashboardColors.border;
  return (
    <section
      aria-label="Race Control"
      style={{
        ...panelStyle,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {active ? (
        <>
          <span aria-hidden style={{ fontSize: '16px' }}>{flagIcon(active.record)}</span>
          <span style={{ fontSize: '13px', color: dashboardColors.text, fontWeight: 600 }}>
            {active.record.message || active.kind.toUpperCase()}
          </span>
        </>
      ) : (
        <span style={{ fontSize: '13px', color: dashboardColors.textMuted }}>TRACK CLEAR</span>
      )}
    </section>
  );
}
