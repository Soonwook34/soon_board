// <1024px 안내 배너 — plan main-page-implementation.md §1.3.
// Desktop only(1280px+) 타깃. 1024~1280은 동작 OK·디자인 미보장. <1024는 명시 안내.

export function NarrowScreenBanner() {
  return (
    <div
      className="narrow-screen-banner"
      role="status"
      style={{
        padding: '12px 16px',
        background: 'var(--color-bg-elevated)',
        borderBottom: '1px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
        fontSize: '13px',
        textAlign: 'center',
      }}
    >
      더 큰 화면(1280px 이상)에서 사용하시는 것을 권장합니다.
    </div>
  );
}
