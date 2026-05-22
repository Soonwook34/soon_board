// CORS preflight 실패 안내 — plan main-page-implementation.md §12 단계 11 + critic P0-4.
// pingOpenF1이 false 반환했을 때 라이브맵/대시보드 마운트 대신 표시.
// 사용자가 '다시 시도' 클릭 시 부모(LiveScreen/ReplayScreen)가 ping 재호출.

interface CorsFailedNoticeProps {
  onRetry: () => void;
}

export function CorsFailedNotice({ onRetry }: CorsFailedNoticeProps) {
  return (
    <div
      data-testid="cors-failed-notice"
      role="alert"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-base)',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '32px 40px',
          borderRadius: '12px',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-strong)',
          color: 'var(--color-text-primary)',
          maxWidth: '480px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '16px', lineHeight: 1.5 }}>
          OpenF1 API에 접근할 수 없습니다. 잠시 후 다시 시도하거나 OpenF1 서비스 상태를 확인하세요.
        </div>
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-strong)',
            background: 'var(--color-bg-elevated)',
            color: 'var(--color-text-primary)',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
