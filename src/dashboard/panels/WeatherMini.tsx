// dashboard §2.9 — 날씨 미니 패널 ⑨. getLatestBefore('weather') 최신 1건.
// 강수는 0/1 이진만 (강수 강도 정보 없음 — 안내 안 함). 데이터 없으면 각 값 '—'.

import { useLatestBefore } from '../shared/useLatestBefore';
import { dashboardColors, panelStyle } from '../shared/dashboardStyles';

const WIND_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'] as const;

function windArrow(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return '·';
  // JS % 는 음수 입력 시 음수 index → ((x%8)+8)%8 로 0..7 정규화.
  return WIND_ARROWS[((Math.round(deg / 45) % 8) + 8) % 8];
}

function temp(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)}°`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '56px' }}>
      <span style={{ fontSize: '11px', color: dashboardColors.textMuted }}>{label}</span>
      <span style={{ fontSize: '14px', color: dashboardColors.text, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function WeatherMini() {
  const w = useLatestBefore('weather', { intervalMs: 5000 });
  return (
    <section aria-label="날씨" style={{ ...panelStyle, display: 'flex', gap: '16px', alignItems: 'center' }}>
      <Stat label="AIR" value={temp(w?.air_temperature)} />
      <Stat label="TRACK" value={temp(w?.track_temperature)} />
      <Stat label="RAIN" value={w == null ? '—' : w.rainfall ? '🌧' : '☀'} />
      <Stat
        label="WIND"
        value={w == null ? '—' : `${Math.round(w.wind_speed)} ${windArrow(w.wind_direction)}`}
      />
    </section>
  );
}
