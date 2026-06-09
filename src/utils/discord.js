const DEFAULT_WEBHOOK =
  'https://discord.com/api/webhooks/1513983362463698984/l6Uew877nLgZ_xy9rftE1Aj9mHB1ZZB4aeLMttgLfGTcpELT06IWW6bZryR6e--I8ihN';

function avg(total, matches) {
  if (!matches) return '0.0';
  return (total / matches).toFixed(1);
}

export async function sendSessionSummary(state) {
  const url = localStorage.getItem('rl_discord_webhook') ?? DEFAULT_WEBHOOK;
  const enabled = localStorage.getItem('rl_discord_enabled') !== 'false';
  if (!url || !enabled) return;

  const {
    username, rank, rankImg,
    startMMR, currentMMR, deltaMMR,
    wins, losses, streak, totalMatches,
    totalGoals, totalAssists, totalSaves, totalDemolished, totalMVPs,
  } = state;

  if (!username || totalMatches === 0) return;

  const streakStr = streak > 0 ? `+${streak} 🔥` : streak < 0 ? `${streak} 🧊` : '—';
  const deltaSign = deltaMMR >= 0 ? '+' : '';
  const mmrStr = startMMR
    ? `${startMMR} → **${currentMMR}** (${deltaSign}${deltaMMR})`
    : `${currentMMR}`;

  const embed = {
    title: `🎮 Session terminée — ${username}`,
    color: deltaMMR >= 0 ? 0x57f287 : 0xed4245,
    thumbnail: rankImg ? { url: rankImg } : undefined,
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
        value: `${totalMVPs} *(${avg(totalMVPs, totalMatches)}/match)*`,
        inline: true,
      },
    ],
    footer: { text: `${totalMatches} match${totalMatches > 1 ? 's' : ''} joués` },
    timestamp: new Date().toISOString(),
  };

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'RL Tracker Bot', content: `**${username}**`, embeds: [embed] }),
  });
}
