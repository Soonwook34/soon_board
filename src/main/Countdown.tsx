// 1Hz 카운트다운 — plan main-page-implementation.md §4.3.
// 드리프트 누적 방지: 매 tick마다 Date.now()를 직접 읽고 target과 비교. setInterval의 누적 drift는
// state 자체에 영향 없음 — display는 항상 wall-clock 기준 (인수 4: 5분 ±2초).

import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from './derived/countdownFormat';

export interface CountdownProps {
  targetDate: string | Date | number;
  /** remainingMs ≤ 0 도달 시 1회 호출. status 재평가 트리거용. */
  onExpire?: () => void;
  className?: string;
}

export function Countdown({ targetDate, onExpire, className }: CountdownProps) {
  const target =
    typeof targetDate === 'number'
      ? targetDate
      : targetDate instanceof Date
        ? targetDate.getTime()
        : Date.parse(targetDate);

  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = target - now;
  const expired = remaining <= 0;

  useEffect(() => {
    if (expired && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [expired, onExpire]);

  return (
    <span className={className} data-expired={expired}>
      {formatCountdown(remaining)}
    </span>
  );
}
