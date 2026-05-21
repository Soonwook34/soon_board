import type { CSSProperties } from 'react';

/**
 * SOON BOARD wordmark.
 *
 * Plan v2.3: only the letters "ON" (positions 3–4 within "SOON") are F1 red (#E10600).
 * Everything else is off-white (#F5F5F0). The "ON" tspan also gets an optional red glow
 * to evoke an LED-style "ON" indicator — toggle via the `glow` prop.
 */
export interface LogoProps {
  /** Pixel height (preserves aspect ratio). Default 80px to match the SVG viewBox height. */
  size?: number;
  /** Extra className for layout containers. */
  className?: string;
  /** Apply a red glow filter to the "ON" tspan. Default true. */
  glow?: boolean;
  /** Accessible label. Default "SOON BOARD". */
  ariaLabel?: string;
}

const COLOR_OFF = '#F5F5F0';
const COLOR_ON = '#E10600';

export function Logo({
  size = 80,
  className,
  glow = true,
  ariaLabel = 'SOON BOARD',
}: LogoProps): JSX.Element {
  // viewBox tuned for Orbitron 900 at 64px — width derived from glyph metrics.
  const viewBoxWidth = 480;
  const viewBoxHeight = 80;
  const width = (size * viewBoxWidth) / viewBoxHeight;

  const style: CSSProperties = {
    display: 'inline-block',
  };

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={size}
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <filter id="soonboard-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <text
        x="0"
        y="64"
        fontFamily="Orbitron, sans-serif"
        fontWeight={900}
        fontSize={64}
        letterSpacing="0.02em"
      >
        <tspan fill={COLOR_OFF}>SO</tspan>
        <tspan
          fill={COLOR_ON}
          data-testid="soonboard-on"
          filter={glow ? 'url(#soonboard-glow)' : undefined}
        >
          ON
        </tspan>
        <tspan fill={COLOR_OFF}> BOARD</tspan>
      </text>
    </svg>
  );
}

export default Logo;
