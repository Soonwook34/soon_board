// 단일 푸터 — live-map §10 단계 3 + critic M8.
// App 라우터 바깥에 한 번만 마운트되어 모든 페이지 하단에 노출 (deployment-architecture §6.2).
//
// 의무 표기:
//   1. Track maps © julesr0y/f1-circuits-svg (CC BY 4.0) — 라이선스 의무
//   2. Data: OpenF1.org — CC0 자발 표기
//   3. F1 disclaimer — 비공식 fan project
//   4. generated_at — 데이터 신선도 (seasons/index.json 의 일일 갱신 시각)

import { useEffect, type ReactNode } from 'react';
import { color, font, space } from '../style/tokens.js';
import { loadCatalogIndex } from '../main/stores/catalogStore.js';
import { useCatalogIndex } from '../main/stores/hooks.js';

const linkStyle = { color: color.textSecondary, textDecoration: 'underline' } as const;

function AttrLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      {children}
    </a>
  );
}

export function Footer() {
  const index = useCatalogIndex();
  useEffect(() => {
    loadCatalogIndex().catch((err) => console.warn('[Footer] index load failed', err));
  }, []);

  const generatedAt = formatGeneratedAt(index?.generated_at);

  return (
    <footer
      style={{
        marginTop: space['8'],
        padding: `${space['3']} ${space['5']}`,
        borderTop: `1px solid ${color.border}`,
        color: color.textMuted,
        fontFamily: font.family,
        fontSize: font.size.xs,
        lineHeight: font.leading.normal,
        display: 'flex',
        flexWrap: 'wrap',
        gap: space['3'],
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space['3'] }}>
        <span data-testid="footer-track-attr">
          Track maps ©{' '}
          <AttrLink href="https://github.com/julesr0y/f1-circuits-svg">
            julesr0y/f1-circuits-svg
          </AttrLink>{' '}
          (
          <AttrLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</AttrLink>
          )
        </span>
        <span data-testid="footer-data-attr">
          Data: <AttrLink href="https://openf1.org">OpenF1.org</AttrLink>
        </span>
        <span data-testid="footer-disclaimer">
          Unofficial fan project. Not affiliated with Formula 1, FIA, or any F1 team.
        </span>
      </div>
      <span data-testid="footer-generated-at">{generatedAt}</span>
    </footer>
  );
}

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return 'Data: pending…';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'Data: pending…';
  // YYYY-MM-DD HH:MM UTC
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mn = String(d.getUTCMinutes()).padStart(2, '0');
  return `Data refreshed ${yyyy}-${mm}-${dd} ${hh}:${mn} UTC`;
}
