export function Sparkline({
  points,
  width = 120,
  height = 28,
  color,
  invert = false,
  neutral = false,
  label,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  /** For spreads and rates, rising is risk-off. Pass invert so the color flips. */
  invert?: boolean;
  /** Direction has no risk reading (curve, breakeven): draw in dim gray. */
  neutral?: boolean;
  label?: string;
}) {
  if (points.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const rising = points[points.length - 1] >= points[0];
  const stroke = color ?? (neutral ? "var(--fg-dim)" : (rising && !invert) || (!rising && invert) ? "var(--up)" : "var(--down)");
  const text = `${label ?? "Trend"}: ${rising ? "rising" : "falling"} over ${points.length} observations`;
  return (
    <svg width={width} height={height} className="shrink-0" role="img" aria-label={text}>
      <title>{text}</title>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.25} />
    </svg>
  );
}

/** Larger chart with axis labels, used on the company page. */
export function LineChart({ data, height = 300 }: { data: { d: string; c: number }[]; height?: number }) {
  if (data.length < 2) return <div className="text-mute p-4">No price history</div>;
  // Scales uniformly with its container (no preserveAspectRatio="none"), so
  // axis text keeps its proportions on narrow screens.
  const width = 1000;
  const padL = 64;
  const padB = 22;
  const padT = 10;
  const vals = data.map((p) => p.c);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => padL + (i / (data.length - 1)) * (width - padL - 8);
  const y = (v: number) => padT + (1 - (v - min) / span) * (height - padT - padB);
  const path = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1).toFixed(1)},${(height - padB).toFixed(1)} L${padL},${(height - padB).toFixed(1)} Z`;
  const rising = vals[vals.length - 1] >= vals[0];
  const stroke = rising ? "var(--up)" : "var(--down)";
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);
  const xIdx = [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor((3 * data.length) / 4), data.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block" role="img" aria-label={`One year price history, ${data[0].c} to ${data[data.length - 1].c}`}>
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
          <text x={padL - 6} y={y(t) + 4} fill="var(--fg-dim)" fontSize="18" textAnchor="end">
            {t.toFixed(t > 100 ? 0 : 2)}
          </text>
        </g>
      ))}
      {xIdx.map((i) => (
        <text key={i} x={x(i)} y={height - 6} fill="var(--fg-dim)" fontSize="18" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>
          {data[i].d.slice(0, 7)}
        </text>
      ))}
      <path d={area} fill="url(#fill)" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
