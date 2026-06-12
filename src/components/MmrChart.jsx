import { memo } from 'react';
import { RANK_BANDS, TIER_FILLS, TIER_LABEL_COLORS } from '../utils/rankBands.js';

const VW  = 320;          // viewBox width (unités SVG)
// Pas de gouttière latérale : la courbe court d'un bord à l'autre du panel
// (les bandes de rang + le badge MMR portent l'information de l'axe Y)
const PAD = { t: 8, r: 0, b: 14, l: 0 };

const COLOR_LINE = '#f97316';
const COLOR_UP   = '#4ade80';
const COLOR_DOWN = '#f87171';

// Convertit une suite de points en courbe lissée (Catmull-Rom → Bézier cubique).
// La courbe passe exactement par chaque point — aucun MMR n'est déformé.
function smoothPath(pts) {
  if (pts.length < 3) return `M${pts.map(p => `${p.x},${p.y}`).join('L')}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

/**
 * Graphique SVG compact de l'évolution du MMR sur la session.
 * Responsive : prend 100 % de la largeur du conteneur.
 *
 * @param {number[]} mmrHistory  Suite de valeurs MMR
 * @param {number}   height      Hauteur en pixels
 */
function MmrChart({ mmrHistory, height = 88 }) {
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

  // Tracé principal (lissé)
  const pts = mmrHistory.map((v, i) => ({
    x: +xOf(i).toFixed(1),
    y: +yOf(v).toFixed(1),
  }));
  const linePath = smoothPath(pts);
  const bottom   = (PAD.t + cH).toFixed(1);
  const areaPath =
    `M${pts[0].x},${bottom}` +
    linePath.replace(/^M/, 'L') +
    `L${pts[pts.length - 1].x},${bottom}Z`;

  // Graduations Y (3 lignes)
  const rawStep   = mmrRange / 3;
  const tickStep  = Math.ceil(rawStep / 10) * 10;
  const firstTick = Math.ceil(mmrMin / tickStep) * tickStep;
  const ticks     = [];
  for (let v = firstTick; v <= mmrMax; v += tickStep) ticks.push(v);

  // Badge session : MMR actuel + delta depuis le début de session
  const current      = mmrHistory[mmrHistory.length - 1];
  const sessionDelta = current - mmrHistory[0];
  const deltaColor   = sessionDelta >= 0 ? COLOR_UP : COLOR_DOWN;
  const deltaStr     = `${sessionDelta >= 0 ? '+' : ''}${sessionDelta}`;

  const last = pts[pts.length - 1];

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
          <stop offset="0%"   stopColor={COLOR_LINE} stopOpacity="0.32" />
          <stop offset="100%" stopColor={COLOR_LINE} stopOpacity="0"    />
        </linearGradient>
        {/* Halo lumineux autour de la courbe */}
        <filter id="mc-glow" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bandes de rang */}
      {bands.map(b => {
        const fill       = TIER_FILLS[b.tier][b.tierIdx % 2];
        const labelColor = TIER_LABEL_COLORS[b.tier];
        const y1 = Math.max(yOf(b.max), PAD.t);
        const y2 = Math.min(yOf(b.min), PAD.t + cH);
        const bH = y2 - y1;
        if (bH <= 0) return null;
        const labelY = y1 + bH / 2;
        return (
          <g key={b.name}>
            <rect x={PAD.l} y={y1} width={cW} height={bH} fill={fill} clipPath="url(#mc-clip)" />
            {/* Séparateur de rang */}
            <line x1={PAD.l} y1={y1} x2={PAD.l + cW} y2={y1}
              stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" clipPath="url(#mc-clip)" />
            {/* Label nom du rang */}
            {bH > 10 && (
              <text
                x={PAD.l + 5}
                y={labelY + 3.5}
                fontSize="8"
                fontWeight="600"
                fill={labelColor}
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

      {/* Courbe MMR (lissée + glow) */}
      <path
        d={linePath}
        fill="none"
        stroke={COLOR_LINE}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter="url(#mc-glow)"
        clipPath="url(#mc-clip)"
      />

      {/* Points de match — vert si gain, rouge si perte */}
      {pts.map((p, i) => {
        if (i === pts.length - 1) return null; // le dernier point a son propre rendu
        const color = i === 0
          ? COLOR_LINE
          : mmrHistory[i] >= mmrHistory[i - 1] ? COLOR_UP : COLOR_DOWN;
        return (
          <circle key={i} cx={p.x} cy={p.y} r="1.9" fill={color} opacity="0.85" />
        );
      })}

      {/* Dernier point : pulsation continue */}
      <circle cx={last.x} cy={last.y} r="2.8" fill={COLOR_LINE} />
      <circle cx={last.x} cy={last.y} r="2.8" fill="none" stroke={COLOR_LINE} strokeWidth="1">
        <animate attributeName="r"       values="2.8;7"  dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0"  dur="1.6s" repeatCount="indefinite" />
      </circle>

      {/* Badge MMR actuel + delta de session */}
      <text
        x={PAD.l + cW - 4}
        y={PAD.t + 11}
        fontSize="9"
        fontWeight="700"
        textAnchor="end"
        fontFamily="monospace"
        fill="rgba(255,255,255,0.92)"
        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 2 }}
      >
        {current}
        <tspan fill={deltaColor}> {deltaStr}</tspan>
      </text>

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

// memo : le composant ne se re-rend que quand mmrHistory change de référence
// (un nouveau point), pas à chaque UpdateState du jeu (~10/s)
export default memo(MmrChart);
