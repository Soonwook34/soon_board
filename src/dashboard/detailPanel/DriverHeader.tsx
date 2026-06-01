// dashboard §3.1 — 사이드 패널 헤더 (정적 드라이버 메타). 헤드샷·이름·번호+팀컬러칩·팀·국가.
// drivers 는 비-시계열 메타라 useDrivers(DriversContext)에서 join. 없으면 '#번호' graceful.

import { useDrivers, teamColorOf } from '../shared/DriversContext';
import { dashboardColors } from '../shared/dashboardStyles';

export function DriverHeader({ driverNumber }: { driverNumber: number }) {
  const driver = useDrivers().get(driverNumber);
  const teamColor = teamColorOf(driver);
  const name = driver?.full_name || driver?.broadcast_name || `#${driverNumber}`;

  return (
    <header
      data-testid="driver-header"
      style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '8px' }}
    >
      {driver?.headshot_url ? (
        <img
          src={driver.headshot_url}
          alt={name}
          width={48}
          height={48}
          style={{ borderRadius: '50%', objectFit: 'cover', background: dashboardColors.panelBgElevated }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: dashboardColors.panelBgElevated,
          }}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: '4px',
              height: '20px',
              background: teamColor,
              borderRadius: '2px',
            }}
          />
          <span style={{ fontSize: '22px', fontWeight: 700, color: dashboardColors.text }}>
            {driverNumber}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: dashboardColors.text }}>{name}</span>
        </div>
        <span style={{ fontSize: '12px', color: dashboardColors.textSecondary }}>
          {driver?.team_name ?? '—'}
          {driver?.country_code ? ` · ${driver.country_code}` : ''}
        </span>
      </div>
    </header>
  );
}
