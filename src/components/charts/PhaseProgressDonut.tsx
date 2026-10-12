"use client";

const LOGO_BLUE = "#58a6ff";
/** Muted companion for “at current pace” band (same hue, lower emphasis). */
const PROJECTED_BLUE = "color-mix(in srgb, #58a6ff 42%, var(--bg-muted))";

function ringPoint(cx: number, cy: number, r: number, t: number) {
  const a = 2 * Math.PI * t;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** Donut slice t0→t1 clockwise from top, t in [0, 1]. */
function ringSlicePath(
  cx: number,
  cy: number,
  rOut: number,
  rIn: number,
  t0: number,
  t1: number,
) {
  if (t1 - t0 < 0.0005) return "";
  const p0o = ringPoint(cx, cy, rOut, t0);
  const p1o = ringPoint(cx, cy, rOut, t1);
  const p1i = ringPoint(cx, cy, rIn, t1);
  const p0i = ringPoint(cx, cy, rIn, t0);
  const large = t1 - t0 > 0.5 ? 1 : 0;
  return [
    `M ${p0o.x} ${p0o.y}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${p1o.x} ${p1o.y}`,
    `L ${p1i.x} ${p1i.y}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${p0i.x} ${p0i.y}`,
    "Z",
  ].join(" ");
}

export function PhaseProgressDonut({
  donePercent,
  projectedPercent,
  size = 120,
  label = "Phase progress",
}: {
  donePercent: number;
  projectedPercent: number;
  size?: number;
  label?: string;
}) {
  const done = Math.max(0, Math.min(100, donePercent));
  const projected = Math.max(done, Math.min(100, projectedPercent));
  const cx = size / 2;
  const cy = size / 2;
  const rOut = size * 0.42;
  const rIn = size * 0.32;

  const doneT = done / 100;
  const projectedT = projected / 100;

  const trackPath = ringSlicePath(cx, cy, rOut, rIn, 0, 1);
  const donePath = ringSlicePath(cx, cy, rOut, rIn, 0, doneT);
  const projectedPath = ringSlicePath(cx, cy, rOut, rIn, doneT, projectedT);

  const showEstimate = projected > done;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={
          showEstimate
            ? `${label}: ${done}% complete, about ${projected}% projected at current pace`
            : `${label}: ${done}% complete`
        }
      >
        {trackPath ? <path d={trackPath} fill="var(--bg-muted)" /> : null}
        {projectedPath ? <path d={projectedPath} fill={PROJECTED_BLUE} /> : null}
        {donePath ? <path d={donePath} fill={LOGO_BLUE} /> : null}
        <text
          x={cx}
          y={cy - (showEstimate ? 4 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text)"
          fontSize={size * 0.19}
          fontWeight={600}
          fontFamily="ui-monospace, monospace"
        >
          {done}%
        </text>
        {showEstimate ? (
          <text
            x={cx}
            y={cy + size * 0.12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize={size * 0.09}
            fontFamily="ui-monospace, monospace"
          >
            → {projected}%
          </text>
        ) : null}
      </svg>
      <span className="max-w-[120px] text-center text-[10px] text-[var(--text-muted)]">
        {label}
      </span>
      {showEstimate ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[9px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: LOGO_BLUE }}
              aria-hidden
            />
            Done
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: PROJECTED_BLUE }}
              aria-hidden
            />
            At pace
          </span>
        </div>
      ) : null}
    </div>
  );
}
