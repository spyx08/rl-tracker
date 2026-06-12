// Analyse des sessions : tranches horaires, jours, records, fun facts.
// Tout est calculé à partir du matchLog horodaté et des historiques MMR.

const SLOTS = [
  { id: 'night',     label: 'Nuit',       hours: '0h–6h',   from: 0,  to: 6 },
  { id: 'morning',   label: 'Matin',      hours: '6h–12h',  from: 6,  to: 12 },
  { id: 'afternoon', label: 'Après-midi', hours: '12h–18h', from: 12, to: 18 },
  { id: 'evening',   label: 'Soirée',     hours: '18h–24h', from: 18, to: 24 },
];

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const MIN_MATCHES_PER_BUCKET = 3;

function slotOf(ts) {
  const h = new Date(ts).getHours();
  return SLOTS.find((s) => h >= s.from && h < s.to);
}

function sessionMmrDelta(s) {
  let total = 0;
  for (const entry of Object.values(s.mmrByMode ?? {})) {
    if (!entry?.history?.length) continue;
    total += entry.history[entry.history.length - 1] - (entry.start ?? entry.history[0]);
  }
  return total;
}

// Liste plate de tous les matchs avec un delta MMR approximé : pour chaque
// mode d'une session, les écarts successifs de l'historique MMR sont associés
// dans l'ordre aux matchs de ce mode dans le matchLog.
function flattenMatches(sessions) {
  const matches = [];
  for (const s of sessions) {
    const log = s.matchLog ?? [];
    const diffsByMode = {};
    for (const [mode, entry] of Object.entries(s.mmrByMode ?? {})) {
      const h = entry?.history ?? [];
      diffsByMode[mode] = h.slice(1).map((v, i) => v - h[i]);
    }
    const usedByMode = {};
    for (const m of log) {
      const diffs = diffsByMode[m.mode] ?? [];
      const idx = usedByMode[m.mode] ?? 0;
      usedByMode[m.mode] = idx + 1;
      matches.push({ ...m, delta: idx < diffs.length ? diffs[idx] : null });
    }
  }
  return matches.sort((a, b) => a.ts - b.ts);
}

function bucketStats(matches, keyFn) {
  const buckets = new Map();
  for (const m of matches) {
    const key = keyFn(m);
    if (key == null) continue;
    const b = buckets.get(key) ?? { mmr: 0, wins: 0, losses: 0, count: 0 };
    if (m.delta != null) b.mmr += m.delta;
    if (m.result === 'win') b.wins++;
    if (m.result === 'loss') b.losses++;
    b.count++;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({ key, ...b }))
    .filter((b) => b.count >= MIN_MATCHES_PER_BUCKET);
}

function winrate(b) {
  const played = b.wins + b.losses;
  return played > 0 ? Math.round((b.wins / played) * 100) : null;
}

const fmtMmr = (n) => `${n >= 0 ? '+' : ''}${Math.round(n)} MMR`;
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

// Retourne une liste de cartes { icon, title, value, detail, tone } —
// seules celles pour lesquelles il y a assez de données sont présentes.
export function computeInsights(sessions) {
  const matches = flattenMatches(sessions);
  if (matches.length < 5) return null; // pas assez de données pour analyser

  const insights = [];

  // ── Tranches horaires ──
  const slots = bucketStats(matches, (m) => slotOf(m.ts)?.id);
  if (slots.length > 0) {
    const best = [...slots].sort((a, b) => b.mmr - a.mmr)[0];
    const worst = [...slots].sort((a, b) => a.mmr - b.mmr)[0];
    const slotMeta = (id) => SLOTS.find((s) => s.id === id);

    if (best.mmr > 0) {
      const meta = slotMeta(best.key);
      insights.push({
        icon: '⏰', tone: 'up',
        title: 'Tranche horaire en or',
        value: `${meta.label} (${meta.hours})`,
        detail: `${fmtMmr(best.mmr)} · ${best.count} matchs · ${winrate(best)}% de wins`,
      });
    }
    if (worst.key !== best.key && worst.mmr < 0) {
      const meta = slotMeta(worst.key);
      insights.push({
        icon: '😴', tone: 'down',
        title: 'Tranche à éviter',
        value: `${meta.label} (${meta.hours})`,
        detail: `${fmtMmr(worst.mmr)} · ${worst.count} matchs · ${winrate(worst)}% de wins`,
      });
    }
  }

  // ── Jours de la semaine ──
  const days = bucketStats(matches, (m) => new Date(m.ts).getDay());
  if (days.length > 0) {
    const best = [...days].sort((a, b) => b.mmr - a.mmr)[0];
    const worst = [...days].sort((a, b) => a.mmr - b.mmr)[0];

    if (best.mmr > 0) {
      insights.push({
        icon: '📅', tone: 'up',
        title: 'Ton meilleur jour',
        value: DAYS[best.key],
        detail: `${fmtMmr(best.mmr)} · ${winrate(best)}% de wins sur ${best.count} matchs`,
      });
    }
    if (worst.key !== best.key && worst.mmr < 0) {
      insights.push({
        icon: '🙃', tone: 'down',
        title: 'Jour maudit',
        value: DAYS[worst.key],
        detail: `${fmtMmr(worst.mmr)} · ${winrate(worst)}% de wins sur ${worst.count} matchs`,
      });
    }
  }

  // ── Série de victoires record ──
  let bestStreak = 0, cur = 0, bestStreakEnd = null;
  for (const m of matches) {
    if (m.result === 'win') {
      cur++;
      if (cur > bestStreak) { bestStreak = cur; bestStreakEnd = m.ts; }
    } else if (m.result === 'loss') {
      cur = 0;
    }
  }
  if (bestStreak >= 3) {
    insights.push({
      icon: '🔥', tone: 'up',
      title: 'Série record',
      value: `${bestStreak} wins d'affilée`,
      detail: `Réalisée le ${fmtDate(bestStreakEnd)}`,
    });
  }

  // ── Meilleure / pire session ──
  const withDelta = sessions
    .map((s) => ({ s, delta: sessionMmrDelta(s) }))
    .filter(({ s }) => (s.totalMatches ?? 0) > 0);
  if (withDelta.length >= 2) {
    const best = [...withDelta].sort((a, b) => b.delta - a.delta)[0];
    const worst = [...withDelta].sort((a, b) => a.delta - b.delta)[0];
    if (best.delta > 0) {
      insights.push({
        icon: '🚀', tone: 'up',
        title: 'Meilleure session',
        value: fmtMmr(best.delta),
        detail: `Le ${fmtDate(best.s.startedAt)} · ${best.s.wins}V–${best.s.losses}D`,
      });
    }
    if (worst.s.id !== best.s.id && worst.delta < 0) {
      insights.push({
        icon: '💀', tone: 'down',
        title: 'Session cauchemar',
        value: fmtMmr(worst.delta),
        detail: `Le ${fmtDate(worst.s.startedAt)} · ${worst.s.wins}V–${worst.s.losses}D`,
      });
    }
  }

  // ── Records en une session ──
  const maxGoals = [...sessions].sort((a, b) => (b.totalGoals ?? 0) - (a.totalGoals ?? 0))[0];
  if ((maxGoals?.totalGoals ?? 0) >= 5) {
    insights.push({
      icon: '⚽', tone: 'neutral',
      title: 'Record de buts (session)',
      value: `${maxGoals.totalGoals} buts`,
      detail: `Le ${fmtDate(maxGoals.startedAt)} en ${maxGoals.totalMatches} matchs`,
    });
  }

  const marathon = [...sessions].sort(
    (a, b) => (b.endedAt - b.startedAt) - (a.endedAt - a.startedAt),
  )[0];
  if (marathon && marathon.endedAt - marathon.startedAt >= 90 * 60000) {
    const min = Math.round((marathon.endedAt - marathon.startedAt) / 60000);
    insights.push({
      icon: '🏟️', tone: 'neutral',
      title: 'Session marathon',
      value: `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`,
      detail: `Le ${fmtDate(marathon.startedAt)} · ${marathon.totalMatches} matchs`,
    });
  }

  // ── Meilleur / pire coéquipier ──
  // (matchLog.teammates — présent sur les sessions enregistrées depuis la v2.2)
  const mates = new Map();
  for (const m of matches) {
    for (const name of m.teammates ?? []) {
      const b = mates.get(name) ?? { wins: 0, losses: 0, count: 0 };
      if (m.result === 'win') b.wins++;
      else if (m.result === 'loss') b.losses++;
      b.count++;
      mates.set(name, b);
    }
  }
  const mateList = [...mates.entries()].map(([name, b]) => ({ name, ...b }));
  const bestMate = mateList
    .filter((b) => b.wins >= 2)
    .sort((a, b) => b.wins - a.wins || winrate(b) - winrate(a))[0];
  if (bestMate) {
    insights.push({
      icon: '🤝', tone: 'up',
      title: 'Meilleur coéquipier',
      value: bestMate.name,
      detail: `${bestMate.wins} wins ensemble · ${winrate(bestMate)}% de wins sur ${bestMate.count} matchs`,
    });
  }
  const worstMate = mateList
    .filter((b) => b.losses >= 2 && b.name !== bestMate?.name)
    .sort((a, b) => b.losses - a.losses || winrate(a) - winrate(b))[0];
  if (worstMate) {
    insights.push({
      icon: '🫠', tone: 'down',
      title: 'Coéquipier maudit',
      value: worstMate.name,
      detail: `${worstMate.losses} défaites ensemble · ${winrate(worstMate)}% de wins sur ${worstMate.count} matchs`,
    });
  }

  // ── Mental après défaite (détecteur de tilt) ──
  let afterLoss = 0, afterLossWins = 0;
  let prev = null;
  for (const m of matches) {
    if (prev === 'loss' && (m.result === 'win' || m.result === 'loss')) {
      afterLoss++;
      if (m.result === 'win') afterLossWins++;
    }
    if (m.result) prev = m.result;
  }
  if (afterLoss >= 5) {
    const wr = Math.round((afterLossWins / afterLoss) * 100);
    insights.push({
      icon: '🧠', tone: wr >= 50 ? 'up' : 'down',
      title: 'Mental après défaite',
      value: `${wr}% de wins`,
      detail: wr >= 50
        ? `Tu remontes bien après une défaite (${afterLoss} cas)`
        : `Le tilt te guette — pense à faire une pause (${afterLoss} cas)`,
    });
  }

  return insights;
}
