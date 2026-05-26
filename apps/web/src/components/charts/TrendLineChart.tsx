import { useId, useMemo, useState, type CSSProperties, type FC, type PointerEvent } from 'react';

type Props = {
  data: number[];
  labels?: string[];
  color?: string;
  height?: number;
};

type Point = {
  x: number;
  y: number;
  value: number;
  label: string;
};

const WIDTH = 600;
const PAD_X = 18;
const PAD_TOP = 12;
const PAD_BOTTOM = 14;

export const TrendLineChart: FC<Props> = ({ data, labels = [], color = '#10A37F', height = 168 }) => {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const values = data.length > 0 ? data : [0, 0, 0, 0, 0, 0, 0];
  const chartHeight = Math.max(148, height);
  const maxValue = Math.max(...values, 0);
  const scaleMax = niceMax(maxValue);
  const points = useMemo(() => buildPoints(values, labels, chartHeight, scaleMax), [values, labels, chartHeight, scaleMax]);
  const active = activeIndex == null ? null : points[activeIndex];
  const linePath = smoothPath(points);
  const baseline = chartHeight - PAD_BOTTOM;
  const areaPath = `${linePath} L${(WIDTH - PAD_X).toFixed(1)},${baseline.toFixed(1)} L${PAD_X},${baseline.toFixed(1)} Z`;
  const gridLines = [PAD_TOP, PAD_TOP + (chartHeight - PAD_TOP - PAD_BOTTOM) / 2, baseline];
  const axisLabels = [scaleMax, Math.round(scaleMax / 2), 0];
  const total = values.reduce((sum, value) => sum + value, 0);
  const style = { '--trend-height': `${chartHeight}px`, '--trend-color': color } as CSSProperties;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let next = 0;
    let distance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const currentDistance = Math.abs(point.x - x);
      if (currentDistance < distance) {
        distance = currentDistance;
        next = index;
      }
    });
    setActiveIndex(next);
  };

  return (
    <div className="trend-line-chart" style={style}>
      <div className="trend-line-chart__summary">
        <div>
          <span>近 7 天总量</span>
          <strong>{formatCount(total)}</strong>
        </div>
        <div>
          <span>峰值</span>
          <strong>{formatCount(maxValue)}</strong>
        </div>
      </div>

      <div className="trend-line-chart__body">
        <div className="trend-line-chart__axis" aria-hidden="true">
          {axisLabels.map((value) => (
            <span key={value}>{formatCount(value)}</span>
          ))}
        </div>
        <div
          className="trend-line-chart__plot"
          role="img"
          aria-label="对话量趋势折线图"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActiveIndex(null)}
        >
          <svg className="trend-line-chart__svg" viewBox={`0 0 ${WIDTH} ${chartHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {gridLines.map((y, index) => (
              <line key={index} x1={PAD_X} x2={WIDTH - PAD_X} y1={y} y2={y} className="trend-line-chart__grid" />
            ))}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} className="trend-line-chart__line" />
            {active && <line x1={active.x} x2={active.x} y1={PAD_TOP} y2={baseline} className="trend-line-chart__cursor" />}
          </svg>

          {points.map((point, index) => (
            <span
              className={`trend-line-chart__point${activeIndex === index ? ' is-active' : ''}`}
              key={`${point.label}-${index}`}
              style={{ left: `${(point.x / WIDTH) * 100}%`, top: `${point.y}px` }}
            />
          ))}

          {active && (
            <div
              className="trend-line-chart__tooltip"
              style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${active.y}px` }}
            >
              <span>{active.label}</span>
              <strong>{active.value} 次</strong>
            </div>
          )}
        </div>
      </div>

      <div className="trend-line-chart__x-axis" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point, index) => (
          <span key={`${point.label}-label-${index}`}>{point.label}</span>
        ))}
      </div>
    </div>
  );
};

function buildPoints(values: number[], labels: string[], height: number, scaleMax: number): Point[] {
  const innerHeight = height - PAD_TOP - PAD_BOTTOM;
  const step = values.length > 1 ? (WIDTH - PAD_X * 2) / (values.length - 1) : 0;
  return values.map((value, index) => ({
    x: PAD_X + step * index,
    y: PAD_TOP + innerHeight * (1 - value / scaleMax),
    value,
    label: labels[index] ?? `D${index + 1}`,
  }));
}

function smoothPath(points: Point[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  return points.slice(1).reduce((path, point, index) => {
    const prev = points[index];
    const midX = (prev.x + point.x) / 2;
    return `${path} C${midX.toFixed(1)},${prev.y.toFixed(1)} ${midX.toFixed(1)},${point.y.toFixed(1)} ${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }, `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`);
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const ratio = value / base;
  if (ratio <= 2) return 2 * base;
  if (ratio <= 5) return 5 * base;
  return 10 * base;
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}
