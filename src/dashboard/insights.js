// Analyse des sessions : tranches horaires, jours, records, fun facts.
// Tout est calculé à partir du matchLog horodaté (victoires / défaites) :
// le MMR n'est plus récupéré.

const SLOTS = [
  { id: 'night',     label: 'Nuit',       hours: '0h–6h',   from: 0,  to: 6 },
  { id: 'morning',   label: 'Matin',      hours: '6h–12h',  from: 6,  to: 12 },
  { id: 'afternoon', label: 'Après-midi', hours: '12h–18h', from: 12, to: 18 },
  { id: 'evening',   label: 'Soirée',     hours: '18h–24h', from: 18, to: 24 },
];

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Créneaux / jours : il faut assez de parties décidées pour qu'un winrate
// veuille dire quelque chose
const MIN_MATCHES_PER_BUCKET = 5;
// Poids du prior (≈ parties fictives à 50%) du winrate ajusté, comme pour les
// coéquipiers : un créneau à 4/5 ne doit pas battre un créneau à 30/45
const PRIOR_GAMES = 4;

function slotOf(ts) {
  const h = new Date(ts).getHours();
  return SLOTS.find((s) => h >= s.from && h < s.to);
}

// Liste plate de tous les matchs, dans l'ordre chronologique
function flattenMatches(sessions) {
  return sessions.flatMap((s) => s.matchLog ?? []).sort((a, b) => a.ts - b.ts);
}

function bucketStats(matches, keyFn) {
  const buckets = new Map();
  for (const m of matches) {
    if (m.result !== 'win' && m.result !== 'loss') continue;
    const key = keyFn(m);
    if (key == null) continue;
    const b = buckets.get(key) ?? { wins: 0, losses: 0, count: 0 };
    if (m.result === 'win') b.wins++;
    else b.losses++;
    b.count++;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([key, b]) => ({
      key,
      ...b,
      adj: (b.wins + PRIOR_GAMES * 0.5) / (b.count + PRIOR_GAMES),
    }))
    .filter((b) => b.count >= MIN_MATCHES_PER_BUCKET);
}

// Meilleur bucket au-dessus de 50% ajusté, pire en dessous (jamais le même)
function bestAndWorst(buckets) {
  const best = [...buckets]
    .filter((b) => b.adj > 0.5)
    .sort((a, b) => b.adj - a.adj || b.count - a.count)[0];
  const worst = [...buckets]
    .filter((b) => b.adj < 0.5 && b.key !== best?.key)
    .sort((a, b) => a.adj - b.adj || b.count - a.count)[0];
  return { best, worst };
}

function winrate(b) {
  const played = b.wins + b.losses;
  return played > 0 ? Math.round((b.wins / played) * 100) : null;
}

const fmtNet = (n) => (n > 0 ? `+${n}` : `${n}`);
const fmtRecord = (b) => `${b.wins}V–${b.losses}D`;
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

// Retourne une liste de cartes { icon, title, value, detail, tone } —
// seules celles pour lesquelles il y a assez de données sont présentes.
export function computeInsights(sessions) {
  const matches = flattenMatches(sessions);
  if (matches.length < 5) return null; // pas assez de données pour analyser

  const insights = [];

  // ── Tranches horaires ──
  {
    const { best, worst } = bestAndWorst(bucketStats(matches, (m) => slotOf(m.ts)?.id));
    const slotMeta = (id) => SLOTS.find((s) => s.id === id);
    if (best) {
      const meta = slotMeta(best.key);
      insights.push({
        icon: '⏰', tone: 'up',
        title: 'Tranche horaire en or',
        value: `${meta.label} (${meta.hours})`,
        detail: `${winrate(best)}% de wins · ${fmtRecord(best)}`,
      });
    }
    if (worst) {
      const meta = slotMeta(worst.key);
      insights.push({
        icon: '😴', tone: 'down',
        title: 'Tranche à éviter',
        value: `${meta.label} (${meta.hours})`,
        detail: `${winrate(worst)}% de wins · ${fmtRecord(worst)}`,
      });
    }
  }

  // ── Jours de la semaine ──
  {
    const { best, worst } = bestAndWorst(bucketStats(matches, (m) => new Date(m.ts).getDay()));
    if (best) {
      insights.push({
        icon: '📅', tone: 'up',
        title: 'Ton meilleur jour',
        value: DAYS[best.key],
        detail: `${winrate(best)}% de wins · ${fmtRecord(best)}`,
      });
    }
    if (worst) {
      insights.push({
        icon: '🙃', tone: 'down',
        title: 'Jour maudit',
        value: DAYS[worst.key],
        detail: `${winrate(worst)}% de wins · ${fmtRecord(worst)}`,
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

  // ── Meilleure / pire session (bilan net victoires − défaites) ──
  const withNet = sessions
    .filter((s) => (s.wins ?? 0) + (s.losses ?? 0) > 0)
    .map((s) => ({ s, net: (s.wins ?? 0) - (s.losses ?? 0) }));
  if (withNet.length >= 2) {
    const best = [...withNet].sort((a, b) => b.net - a.net)[0];
    const worst = [...withNet].sort((a, b) => a.net - b.net)[0];
    if (best.net > 0) {
      insights.push({
        icon: '🚀', tone: 'up',
        title: 'Meilleure session',
        value: `${fmtNet(best.net)} (${best.s.wins}V–${best.s.losses}D)`,
        detail: `Le ${fmtDate(best.s.startedAt)} · ${winrate(best.s)}% de wins`,
      });
    }
    if (worst.s.id !== best.s.id && worst.net < 0) {
      insights.push({
        icon: '💀', tone: 'down',
        title: 'Session cauchemar',
        value: `${fmtNet(worst.net)} (${worst.s.wins}V–${worst.s.losses}D)`,
        detail: `Le ${fmtDate(worst.s.startedAt)} · ${winrate(worst.s)}% de wins`,
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
  // On classe par winrate AJUSTÉ (shrinkage bayésien vers 50%) plutôt que par
  // nombre brut de wins/défaites : un mate croisé 2-3 fois est ramené vers la
  // moyenne et ne peut pas dominer, alors qu'un mate à fort volume garde son
  // vrai winrate. Il faut aussi un minimum de parties décidées ensemble.
  const MIN_GAMES_WITH_MATE = 4;
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
  const mateList = [...mates.entries()]
    .map(([name, b]) => {
      const decided = b.wins + b.losses; // parties avec un résultat connu
      const adj = (b.wins + PRIOR_GAMES * 0.5) / (decided + PRIOR_GAMES);
      return { name, ...b, decided, adj };
    })
    .filter((b) => b.decided >= MIN_GAMES_WITH_MATE);

  // Meilleur : meilleur winrate ajusté au-dessus de 50% (à égalité, le plus de
  // parties l'emporte — winrate plus fiable)
  const bestMate = [...mateList]
    .filter((b) => b.adj > 0.5)
    .sort((a, b) => b.adj - a.adj || b.decided - a.decided)[0];
  if (bestMate) {
    insights.push({
      icon: '🤝', tone: 'up',
      title: 'Meilleur coéquipier',
      value: bestMate.name,
      detail: `${winrate(bestMate)}% de wins · ${bestMate.wins}V–${bestMate.losses}D ensemble`,
    });
  }
  // Pire : pire winrate ajusté en dessous de 50%
  const worstMate = [...mateList]
    .filter((b) => b.adj < 0.5 && b.name !== bestMate?.name)
    .sort((a, b) => a.adj - b.adj || b.decided - a.decided)[0];
  if (worstMate) {
    insights.push({
      icon: '🫠', tone: 'down',
      title: 'Coéquipier maudit',
      value: worstMate.name,
      detail: `${winrate(worstMate)}% de wins · ${worstMate.wins}V–${worstMate.losses}D ensemble`,
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
