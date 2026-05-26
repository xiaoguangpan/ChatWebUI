import type { FC } from 'react';

type Slice = { value: number; color: string };

type Props = {
  data: Slice[];
  size?: number;
  innerRatio?: number;
};

function describeArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string {
  const startOuter = polar(cx, cy, rOuter, startAngle);
  const endOuter = polar(cx, cy, rOuter, endAngle);
  const startInner = polar(cx, cy, rInner, endAngle);
  const endInner = polar(cx, cy, rInner, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/**
 * SVG 环形图。原型用 Canvas drawDonut,这里用 SVG 描出每段扇形。
 */
export const DonutChart: FC<Props> = ({ data, size = 220, innerRatio = 0.62 }) => {
  const total = data.reduce((s, p) => s + p.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 8;
  const inner = outer * innerRatio;

  let start = -Math.PI / 2;
  const arcs = data.map((p, i) => {
    const angle = (p.value / total) * Math.PI * 2;
    const end = start + angle;
    const d = describeArc(cx, cy, outer, inner, start, end);
    start = end;
    return <path key={i} d={d} fill={p.color} />;
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height={size}
      role="img"
      aria-label="占比环图"
    >
      {arcs}
    </svg>
  );
};
