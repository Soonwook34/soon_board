// critic P0-3 use-site: Vite의 define이 import.meta.env.VITE_VERCEL_ENV를
// 빌드 시점 리터럴로 치환했는지 검증 가능하도록 단일 진입점을 제공한다.
// 본 단계 (Phase 0)에서는 단순 export만. 사용자 코드(?now= 차단 분기 등)는
// 후속 phase에서 이 모듈을 import해 분기한다.

export const VERCEL_ENV: string = import.meta.env.VITE_VERCEL_ENV ?? '';
export const IS_PRODUCTION_DEPLOY: boolean = VERCEL_ENV === 'production';
export const IS_PREVIEW_DEPLOY: boolean = VERCEL_ENV === 'preview';
export const IS_DEV_OR_PREVIEW: boolean = import.meta.env.DEV || IS_PREVIEW_DEPLOY;
