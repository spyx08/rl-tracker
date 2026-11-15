const _WEBHOOK_BASE = "https://discord.com/api/webhooks/1513983362463698984/";
const DEFAULT_WEBHOOK = import.meta.env.VITE_DISCORD_WEBHOOK_KEY
  ? `${_WEBHOOK_BASE}${import.meta.env.VITE_DISCORD_WEBHOOK_KEY}`
  : null;

const MODE_LABELS = { duel: "1v1", double: "2v2", standard: "3v3" };
const MODE_ORDER = ["duel", "double", "standard"];

const WIN_COLOR = "#4ade80";
const LOSS_COLOR = "#f87171";

function avg(total, denom) {
  if (!denom) return "0.0";
  return (total / denom).toFixed(1);
}

const fmtNet = (n) => (n > 0 ? `+${n}` : `${n}`);

// Matchs décidés (victoire ou défaite) dans l'ordre de la session
function decidedMatches(matchLog) {
  return (matchLog ?? []).filter((m) => m.result === "win" || m.result === "loss");
}

// ─── Canvas chart (pour pièce jointe Discord) ──────────────────────────────
// Bilan net cumulé de la session : +1 par victoire, −1 par défaite, en partant
// de 0. Chaque point est coloré selon le résultat du match.

function buildChartBlob(matches) {
  if (matches.length < 2) return Promise.resolve(null);

  const curve = [0];
  for (const m of matches) curve.push(curve[curve.length - 1] + (m.result === "win" ? 1 : -1));

  const W = 900,
    H = 220;
  const PAD = { t: 24, r: 20, b: 32, l: 46 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Fond
  ctx.fillStyle = "#0d1126";
  ctx.fillRect(0, 0, W, H);

  // Plage Y : toujours symétrique autour de 0 pour que le signe du bilan se
  // lise d'un coup d'œil (au moins ±3 pour ne pas écraser une petite session)
  const maxAbs = Math.max(3, ...curve.map((v) => Math.abs(v)));
  const yMax = maxAbs + 1;
  const yMin = -yMax;

  const xOf = (i) => PAD.l + (i / (curve.length - 1)) * cW;
  const yOf = (v) => PAD.t + cH - ((v - yMin) / (yMax - yMin)) * cH;
  const y0 = yOf(0);

  // ── Zones positive / négative ──
  ctx.fillStyle = "rgba(74,222,128,0.05)";
  ctx.fillRect(PAD.l, PAD.t, cW, y0 - PAD.t);
  ctx.fillStyle = "rgba(248,113,113,0.05)";
  ctx.fillRect(PAD.l, y0, cW, PAD.t + cH - y0);

  // ── Graduations (entiers) ──
  const tickStep = Math.max(1, Math.ceil(yMax / 4));
  ctx.lineWidth = 0.5;
  ctx.font = "11px monospace";
  ctx.textAlign = "right";
  for (let v = -Math.floor(yMax / tickStep) * tickStep; v <= yMax; v += tickStep) {
    const y = yOf(v);
    ctx.strokeStyle = v === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)";
    ctx.setLineDash(v === 0 ? [] : [3, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.l, y);
    ctx.lineTo(PAD.l + cW, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(fmtNet(v), PAD.l - 6, y + 4);
  }
  ctx.setLineDash([]);

  // ── Zone colorée entre la courbe et 0 ──
  const finalColor = curve[curve.length - 1] >= 0 ? "74,222,128" : "248,113,113";
  ctx.beginPath();
  ctx.moveTo(xOf(0), y0);
  curve.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(curve.length - 1), y0);
  ctx.closePath();
  ctx.fillStyle = `rgba(${finalColor},0.18)`;
  ctx.fill();

  // ── Courbe : chaque segment prend la couleur du match qu'il représente ──
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (let i = 1; i < curve.length; i++) {
    ctx.strokeStyle = matches[i - 1].result === "win" ? WIN_COLOR : LOSS_COLOR;
    ctx.beginPath();
    ctx.moveTo(xOf(i - 1), yOf(curve[i - 1]));
    ctx.lineTo(xOf(i), yOf(curve[i]));
    ctx.stroke();
  }

  // ── Points de match (vert = victoire, rouge = défaite) ──
  curve.forEach((v, i) => {
    const isLast = i === curve.length - 1;
    const color = i === 0 ? "rgba(255,255,255,0.6)" : matches[i - 1].result === "win" ? WIN_COLOR : LOSS_COLOR;
    ctx.beginPath();
    ctx.arc(xOf(i), yOf(v), isLast ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (isLast) {
      // Anneau blanc autour du dernier point pour le mettre en valeur
      ctx.beginPath();
      ctx.arc(xOf(i), yOf(v), 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // ── Axes ──
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t);
  ctx.lineTo(PAD.l, PAD.t + cH);
  ctx.lineTo(PAD.l + cW, PAD.t + cH);
  ctx.stroke();

  // ── Labels X (numéros de match) ──
  const labelStep = Math.max(1, Math.floor((curve.length - 1) / 10));
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  for (let i = 0; i < curve.length; i += labelStep) {
    ctx.fillText(String(i), xOf(i), PAD.t + cH + 20);
  }

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
}

// ─── Envoi du résumé de session ────────────────────────────────────────────

export async function sendSessionSummary(state) {
  const url = localStorage.getItem("rl_discord_webhook") ?? DEFAULT_WEBHOOK;
  const enabled = localStorage.getItem("rl_discord_enabled") !== "false";
  if (!url || !enabled) return;

  const {
    username,
    wins,
    losses,
    streak,
    matchLog,
    totalMatches,
    totalGoals,
    totalAssists,
    totalSaves,
    totalDemolished,
    totalMVPs,
    gameMode,
  } = state;

  if (!username || totalMatches === 0) return;

  const matches = decidedMatches(matchLog);

  // Modes réellement joués pendant la session (repli : mode courant)
  const modes = MODE_ORDER.filter((m) => matches.some((x) => x.mode === m));
  const modesLabel = modes.length
    ? modes.map((m) => MODE_LABELS[m]).join(" · ")
    : MODE_LABELS[gameMode] ?? "3v3";

  const decided = wins + losses;
  const winrate = decided > 0 ? Math.round((wins / decided) * 100) : null;
  const net = wins - losses;

  let bestStreak = 0;
  let cur = 0;
  for (const m of matches) {
    if (m.result === "win") bestStreak = Math.max(bestStreak, ++cur);
    else cur = 0;
  }

  const streakStr =
    streak > 0 ? `+${streak} 🔥` : streak < 0 ? `${streak} 🧊` : "—";

  const resultLines = [
    `**${wins}V** / **${losses}D**${winrate !== null ? `  •  **${winrate}%** de victoires` : ""}  •  Bilan **${fmtNet(net)}**`,
    `Streak actuelle : ${streakStr}${bestStreak >= 2 ? `  •  Meilleure série : **${bestStreak}** 🔥` : ""}`,
  ];
  // Détail par mode quand la session en mélange plusieurs
  if (modes.length > 1) {
    resultLines.push(
      modes
        .map((m) => {
          const w = matches.filter((x) => x.mode === m && x.result === "win").length;
          const l = matches.filter((x) => x.mode === m && x.result === "loss").length;
          return `${MODE_LABELS[m]} **${w}V–${l}D**`;
        })
        .join("  •  "),
    );
  }

  // Le chart sera attaché comme image de l'embed
  const chartBlob = await buildChartBlob(matches).catch(() => null);

  const embed = {
    title: `🎮 Session terminée — ${username} (${modesLabel})`,
    color: net >= 0 ? 0x57f287 : 0xed4245,
    ...(chartBlob ? { image: { url: "attachment://winloss_chart.png" } } : {}),
    fields: [
      {
        name: "📈 Résultats",
        value: resultLines.join("\n"),
        inline: false,
      },
      {
        name: "⚽ Buts",
        value: `${totalGoals} *(${avg(totalGoals, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: "🎯 Passes déc.",
        value: `${totalAssists} *(${avg(totalAssists, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: "🧤 Arrêts",
        value: `${totalSaves} *(${avg(totalSaves, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: "💥 Démos subies",
        value: `${totalDemolished} *(${avg(totalDemolished, totalMatches)}/match)*`,
        inline: true,
      },
      {
        name: "🏆 MVP",
        value: `${totalMVPs} *(${avg(totalMVPs, wins)}/win)*`,
        inline: true,
      },
    ],
    footer: {
      text: `${totalMatches} match${totalMatches > 1 ? "s" : ""} joué${totalMatches > 1 ? "s" : ""}`,
    },
    timestamp: new Date().toISOString(),
  };

  const payload = {
    username: "RL Tracker Bot",
    content: `**${username}**`,
    embeds: [embed],
  };

  if (chartBlob) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", chartBlob, "winloss_chart.png");
    await fetch(url, { method: "POST", body: form });
  } else {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}
