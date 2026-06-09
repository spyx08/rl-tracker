import { RANK_BANDS, TIER_FILLS, TIER_LABEL_COLORS } from './rankBands.js';

const DEFAULT_WEBHOOK =
  'https://discord.com/api/webhooks/1513983362463698984/l6Uew877nLgZ_xy9rftE1Aj9mHB1ZZB4aeLMttgLfGTcpELT06IWW6bZryR6e--I8ihN';

function avg(total, denom) {
  if (!denom) return '0.0';
  return (total / denom).toFixed(1);
}

// ─── Canvas chart (pour pièce jointe Discord) ──────────────────────────────

function buildChartBlob(mmrHistory) {
  if (!mmrHistory || mmrHistory.length < 2) return Promise.resolve(null);

  const W = 900, H = 220;
  const PAD = { t: 24, r: 20, b: 32, l: 58 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fond
  ctx.fillStyle = '#0d1126';
  ctx.fillRect(0, 0, W, H);

  // Plage MMR
  const lo  = Math.min(...mmrHistory);
  const hi  = Math.max(...mmrHistory);
  const spread  = Math.max(40, hi - lo);
  const center  = (lo + hi) / 2;
  const mmrMin  = center - spread * 0.65;
  const mmrMax  = center + spread * 0.65;
  const mmrRange = mmrMax - mmrMin;

  const xOf = i => PAD.l + (i / Math.max(mmrHistory.length - 1, 1)) * cW;
  const yOf = v => PAD.t + cH - ((v - mmrMin) / mmrRange) * cH;

  const clampY = y => Math.max(PAD.t, Math.min(PAD.t + cH, y));

  // ── Bandes de rang ──
  const bands = RANK_BANDS.filter(b => b.max >= mmrMin && b.min <= mmrMax);
  for (const b of bands) {
    const y1 = clampY(yOf(b.max));
    const y2 = clampY(yOf(b.min));
    const bH = y2 - y1;
    if (bH <= 0) continue;
    ctx.fillStyle = TIER_FILLS[b.tier][b.tierIdx % 2];
    ctx.fillRect(PAD.l, y1, cW, bH);
    // Séparateur de rang
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y1);
    ctx.lineTo(PAD.l + cW, y1);
    ctx.stroke();
    if (bH > 13) {
      ctx.fillStyle = TIER_LABEL_COLORS[b.tier];
      ctx.font      = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(b.short, PAD.l + 8, y1 + bH / 2 + 4);
    }
  }

  // ── Lignes de graduation ──
  const rawStep  = mmrRange / 4;
  const tickStep = Math.ceil(rawStep / 10) * 10;
  const firstTick = Math.ceil(mmrMin / tickStep) * tickStep;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 0.5;
  ctx.setLineDash([3, 4]);
  for (let v = firstTick; v <= mmrMax; v += tickStep) {
    const y = yOf(v);
    if (y < PAD.t || y > PAD.t + cH) continue;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + cW, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(v)), PAD.l - 6, y + 4);
  }
  ctx.setLineDash([]);

  // ── Zone colorée sous la courbe ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD.l, PAD.t, cW, cH);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(xOf(0), PAD.t + cH);
  mmrHistory.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(mmrHistory.length - 1), PAD.t + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
  grad.addColorStop(0,   'rgba(249,115,22,0.30)');
  grad.addColorStop(1,   'rgba(249,115,22,0)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // ── Courbe MMR ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD.l, PAD.t, cW, cH);
  ctx.clip();
  ctx.beginPath();
  mmrHistory.forEach((v, i) => {
    if (i === 0) ctx.moveTo(xOf(0), yOf(v));
    else         ctx.lineTo(xOf(i), yOf(v));
  });
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();
  ctx.restore();

  // ── Points de match ──
  mmrHistory.forEach((v, i) => {
    const isLast = i === mmrHistory.length - 1;
    ctx.beginPath();
    ctx.arc(xOf(i), clampY(yOf(v)), isLast ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle   = '#f97316';
    ctx.globalAlpha = isLast ? 1 : 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // ── Axes ──
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t);
  ctx.lineTo(PAD.l, PAD.t + cH);
  ctx.lineTo(PAD.l + cW, PAD.t + cH);
  ctx.stroke();

  // ── Labels X (numéros de match) ──
  const labelStep = Math.max(1, Math.floor((mmrHistory.length - 1) / 10));
  ctx.fillStyle  = 'rgba(255,255,255,0.35)';
  ctx.font       = '10px sans-serif';
  ctx.textAlign  = 'center';
  for (let i = 0; i < mmrHistory.length; i += labelStep) {
    ctx.fillText(String(i), xOf(i), PAD.t + cH + 20);
  }

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
}

// ─── Envoi du résumé de session ────────────────────────────────────────────

export async function sendSessionSummary(state) {
  const url     = localStorage.getItem('rl_discord_webhook') ?? DEFAULT_WEBHOOK;
  const enabled = localStorage.getItem('rl_discord_enabled') !== 'false';
  if (!url || !enabled) return;

  const {
    username, rank, rankImg,
    startMMR, currentMMR,
    wins, losses, streak, totalMatches,
    totalGoals, totalAssists, totalSaves, totalDemolished, totalMVPs,
    mmrHistory,
  } = state;

  if (!username || totalMatches === 0) return;

  // Delta de session = MMR final − MMR de départ (pas le delta du dernier match)
  const sessionDelta = startMMR != null ? currentMMR - startMMR : 0;
  const deltaSign    = sessionDelta >= 0 ? '+' : '';
  const mmrStr       = startMMR != null
    ? `${startMMR} → **${currentMMR}** (${deltaSign}${sessionDelta})`
    : `${currentMMR}`;

  const streakStr = streak > 0 ? `+${streak} 🔥` : streak < 0 ? `${streak} 🧊` : '—';

  // Le chart sera attaché comme image de l'embed
  const chartBlob = await buildChartBlob(mmrHistory).catch(() => null);

  const embed = {
    title: `🎮 Session terminée — ${username}`,
    color: sessionDelta >= 0 ? 0x57f287 : 0xed4245,
    thumbnail: rankImg ? { url: rankImg } : undefined,
    ...(chartBlob ? { image: { url: 'attachment://mmr_chart.png' } } : {}),
    fields: [
      {
        name: '📊 MMR',
        value: `${mmrStr}\n${rank ?? ''}`,
        inline: false,
      },
      {
        name: '📈 Résultats',
        value: `**${wins}V** / **${losses}D**  •  Streak : ${streakStr}`,
        inline: false,
      },
      {
        name: '⚽ Buts',
        value: `${totalGoals} *(${avg(totalGoals, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: '🎯 Passes déc.',
        value: `${totalAssists} *(${avg(totalAssists, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: '🧤 Arrêts',
        value: `${totalSaves} *(${avg(totalSaves, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: '💥 Démos',
        value: `${totalDemolished} *(${avg(totalDemolished, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: '🏆 MVP',
        value: `${totalMVPs} *(${avg(totalMVPs, wins)}/win)*`,
        inline: true,
      },
    ],
    footer: { text: `${totalMatches} match${totalMatches > 1 ? 's' : ''} joués` },
    timestamp: new Date().toISOString(),
  };

  const payload = { username: 'RL Tracker Bot', content: `**${username}**`, embeds: [embed] };

  if (chartBlob) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', chartBlob, 'mmr_chart.png');
    await fetch(url, { method: 'POST', body: form });
  } else {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}
