import { RANK_BANDS, TIER_FILLS } from '../utils/rankBands.js';

const VW  = 320;          // viewBox width (unités SVG)
const PAD = { t: 8, r: 10, b: 18, l: 36 };

/**
 * Graphique SVG compact de l'évolution du MMR sur la session.
 * Responsive : prend 100 % de la largeur du conteneur.
 *
 * @param {number[]} mmrHistory  Suite de valeurs MMR
 * @param {number}   height      Hauteur en pixels
 */
export default function MmrChart({ mmrHistory, height = 88 }) {
  if (!mmrHistory || mmrHistory.length < 2) return null;

  const VH = height;
  const cW = VW - PAD.l - PAD.r;
  const cH = VH - PAD.t - PAD.b;

  const lo   = Math.min(...mmrHistory);
  const hi   = Math.max(...mmrHistory);
  const spread  = Math.max(40, hi - lo);
  const center  = (lo + hi) / 2;
  const mmrMin  = center - spread * 0.65;
  const mmrMax  = center + spread * 0.65;
  const mmrRange = mmrMax - mmrMin;

  const xOf = i  => PAD.l + (i / Math.max(mmrHistory.length - 1, 1)) * cW;
  const yOf = v  => PAD.t + cH - ((v - mmrMin) / mmrRange) * cH;

  const bands = RANK_BANDS.filter(b => b.max >= mmrMin && b.min <= mmrMax);

  // Tracé principal
  const pts      = mmrHistory.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
  const linePath = `M${pts.join('L')}`;
  const areaPath = `M${xOf(0).toFixed(1)},${(PAD.t + cH).toFixed(1)}L${pts.join('L')}L${xOf(mmrHistory.length - 1).toFixed(1)},${(PAD.t + cH).toFixed(1)}Z`;

  // Graduations Y (3 lignes)
  const rawStep   = mmrRange / 3;
  const tickStep  = Math.ceil(rawStep / 10) * 10;
  const firstTick = Math.ceil(mmrMin / tickStep) * tickStep;
  const ticks     = [];
  for (let v = firstTick; v <= mmrMax; v += tickStep) ticks.push(v);

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      height={height}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="mc-clip">
          <rect x={PAD.l} y={PAD.t} width={cW} height={cH} />
        </clipPath>
        <linearGradient id="mc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#f97316" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* Fond du graphique */}
      <rect x={PAD.l} y={PAD.t} width={cW} height={cH} fill="rgba(0,0,0,0.25)" rx="3" />

      {/* Bandes de rang */}
      {bands.map(b => {
        const fill = TIER_FILLS[b.tier][b.tierIdx % 2];
        const y1   = Math.max(yOf(b.max), PAD.t);
        const y2   = Math.min(yOf(b.min), PAD.t + cH);
        const bH   = y2 - y1;
        if (bH <= 0) return null;
        return (
          <g key={b.name}>
            <rect x={PAD.l} y={y1} width={cW} height={bH} fill={fill} clipPath="url(#mc-clip)" />
            {bH > 9 && (
              <text
                x={PAD.l + 3}
                y={y1 + Math.min(bH, 13) / 2 + 3.5}
                fontSize="6.5"
                fill="rgba(255,255,255,0.38)"
                fontFamily="sans-serif"
              >
                {b.short}
              </text>
            )}
          </g>
        );
      })}

      {/* Lignes de graduation (tiretées) */}
      {ticks.map(v => (
        <line
          key={v}
          x1={PAD.l} y1={yOf(v).toFixed(1)}
          x2={PAD.l + cW} y2={yOf(v).toFixed(1)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.5"
          strokeDasharray="2,3"
          clipPath="url(#mc-clip)"
        />
      ))}

      {/* Zone colorée sous la courbe */}
      <path d={areaPath} fill="url(#mc-area)" clipPath="url(#mc-clip)" />

      {/* Courbe MMR */}
      <path
        d={linePath}
        fill="none"
        stroke="#f97316"
        strokeWidth="1.5"
        strokeLinejoin="round"
        clipPath="url(#mc-clip)"
      />

      {/* Points de match */}
      {mmrHistory.map((v, i) => {
        const isLast = i === mmrHistory.length - 1;
        return (
          <circle
            key={i}
            cx={xOf(i).toFixed(1)}
            cy={yOf(v).toFixed(1)}
            r={isLast ? 2.8 : 1.8}
            fill="#f97316"
            opacity={isLast ? 1 : 0.65}
          />
        );
      })}

      {/* Axes */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH}
        stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />
      <line x1={PAD.l} y1={PAD.t + cH} x2={PAD.l + cW} y2={PAD.t + cH}
        stroke="rgba(255,255,255,0.18)" strokeWidth="0.5" />

      {/* Étiquettes Y */}
      {ticks.map(v => (
        <text
          key={`lbl-${v}`}
          x={PAD.l - 3}
          y={yOf(v) + 3.5}
          fontSize="7"
          fill="rgba(255,255,255,0.45)"
          textAnchor="end"
          fontFamily="monospace"
        >
          {v}
        </text>
      ))}

      {/* Étiquette X : nombre de matchs */}
      <text
        x={PAD.l + cW}
        y={PAD.t + cH + 13}
        fontSize="7"
        fill="rgba(255,255,255,0.3)"
        textAnchor="end"
        fontFamily="sans-serif"
      >
        {mmrHistory.length - 1} match{mmrHistory.length - 1 !== 1 ? 's' : ''}
      </text>
    </svg>
  );
}
