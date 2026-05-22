// 토스트 알림 — plan main-page-implementation.md §3.3 + 인수 12.
// 본 컴포넌트는 controlled: 부모(MainPage)가 message 상태와 dismiss 결정을 보유.
// 자동 새로고침 금지(plan §3.3) — 사용자가 직접 닫을 때까지 유지.

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-strong)',
        color: 'var(--color-text-primary)',
        fontSize: '14px',
        zIndex: 60,
        maxWidth: '420px',
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text-secondary)',
          fontSize: '18px',
          cursor: 'pointer',
          padding: '2px 6px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
