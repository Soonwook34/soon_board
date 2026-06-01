// dashboard §2.7 — race_control 카테고리 → 아이콘. message 자유텍스트가 아니라
// category/flag 필드 기반 (plan §10 위험: 텍스트 파싱 부정확 → 필드만 사용).

export type FlagIconCategory = 'flag' | 'safetycar' | 'drs' | 'other';

export const FLAG_ICONS: Record<FlagIconCategory, string> = {
  flag: '🚩',
  safetycar: '🚨',
  drs: '🔵',
  other: '📋',
};

export function flagIconCategory(rc: { category?: string | null; flag?: string | null }): FlagIconCategory {
  const cat = (rc.category ?? '').toLowerCase();
  const flag = (rc.flag ?? '').toLowerCase();
  if (cat.includes('safetycar') || cat.includes('safety car')) return 'safetycar';
  if (cat.includes('drs')) return 'drs';
  if (flag && flag !== 'clear') return 'flag';
  if (cat.includes('flag')) return 'flag';
  return 'other';
}

export function flagIcon(rc: { category?: string | null; flag?: string | null }): string {
  return FLAG_ICONS[flagIconCategory(rc)];
}
