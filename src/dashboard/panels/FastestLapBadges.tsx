// dashboard §2.8 — 빠른 랩/보라 섹터 배지 ⑧. 4 카드(세션 베스트 랩 · S1·S2·S3 · 최고 스피드트랩).

import { useMemo } from 'react';
import { useDataSource } from '../shared/DataSourceContext';
import { useDisplayTime } from '../shared/useDisplayTime';
import { dashboardColors, MONO, panelStyle } from '../shared/dashboardStyles';
import { useDrivers, teamColorOf } from '../shared/DriversContext';
import { useAggregate } from '../shared/useAggregate';
import { SECTOR_COLORS } from '../shared/sectorColors';
import { formatLapTime, formatSector } from '../shared/formatTime';

interface BadgeCardProps {
  label: string;
  value: string;
  acronym: string | null;
  teamColor: string | null;
  accentColor?: string;
  testId: string;
}

function BadgeCard({ label, value, acronym, teamColor, accentColor, testId }: BadgeCardProps) {
  return (
    <div
      data-testid={testId}
      style={{
        flex: '1 1 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '6px 8px',
        background: dashboardColors.panelBgElevated,
        borderRadius: '4px',
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: accentColor ?? dashboardColors.textMuted,
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '13px',
          fontFamily: MONO,
          color: dashboardColors.text,
        }}
      >
        {value}
      </span>
      {acronym && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: dashboardColors.textMuted }}>
          {teamColor && (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: teamColor,
                flexShrink: 0,
              }}
            />
          )}
          {acronym}
        </span>
      )}
    </div>
  );
}

export function FastestLapBadges() {
  const ds = useDataSource();
  const t = useDisplayTime(1000);
  const drivers = useDrivers();

  const fastest = useAggregate('fastest_lap');
  const purple = useAggregate('purple_sectors');

  const speed = useMemo(() => {
    const laps = ds.getAllBefore('laps', t);
    let best: { driver_number: number; st_speed: number } | null = null;
    for (const l of laps) {
      if (l.st_speed != null && (best === null || l.st_speed > best.st_speed)) {
        best = { driver_number: l.driver_number, st_speed: l.st_speed };
      }
    }
    return best;
  }, [ds, t]);

  const fastestDriver = fastest ? drivers.get(fastest.driver_number) : undefined;
  const s1Driver = purple?.s1 ? drivers.get(purple.s1.driver_number) : undefined;
  const s2Driver = purple?.s2 ? drivers.get(purple.s2.driver_number) : undefined;
  const s3Driver = purple?.s3 ? drivers.get(purple.s3.driver_number) : undefined;
  const speedDriver = speed ? drivers.get(speed.driver_number) : undefined;

  return (
    <section
      aria-label="Fastest Lap Badges"
      data-testid="fastest-badges"
      style={{
        ...panelStyle,
        display: 'flex',
        flexDirection: 'row',
        gap: '6px',
      }}
    >
      <BadgeCard
        testId="badge-fastest-lap"
        label="FASTEST LAP"
        value={fastest ? formatLapTime(fastest.lap_duration) : '—'}
        acronym={fastestDriver?.name_acronym ?? null}
        teamColor={fastest ? teamColorOf(fastestDriver) : null}
        accentColor={SECTOR_COLORS.overall}
      />
      <BadgeCard
        testId="badge-s1"
        label="S1"
        value={purple?.s1 ? formatSector(purple.s1.sector_duration) : '—'}
        acronym={s1Driver?.name_acronym ?? null}
        teamColor={purple?.s1 ? teamColorOf(s1Driver) : null}
        accentColor={SECTOR_COLORS.overall}
      />
      <BadgeCard
        testId="badge-s2"
        label="S2"
        value={purple?.s2 ? formatSector(purple.s2.sector_duration) : '—'}
        acronym={s2Driver?.name_acronym ?? null}
        teamColor={purple?.s2 ? teamColorOf(s2Driver) : null}
        accentColor={SECTOR_COLORS.overall}
      />
      <BadgeCard
        testId="badge-s3"
        label="S3"
        value={purple?.s3 ? formatSector(purple.s3.sector_duration) : '—'}
        acronym={s3Driver?.name_acronym ?? null}
        teamColor={purple?.s3 ? teamColorOf(s3Driver) : null}
        accentColor={SECTOR_COLORS.overall}
      />
      <BadgeCard
        testId="badge-speed"
        label="SPEED"
        value={speed ? `${speed.st_speed} km/h` : '—'}
        acronym={speedDriver?.name_acronym ?? null}
        teamColor={speed ? teamColorOf(speedDriver) : null}
      />
    </section>
  );
}
