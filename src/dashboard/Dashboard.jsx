import { useEffect, useMemo, useState } from 'react';
import { computeInsights } from './insights.js';
import './dashboard.css';

const MODE_META = {
  duel:     { label: '1v1 Duel',     short: '1v1', color: '#60a5fa' },
  double:   { label: '2v2 Doubles',  short: '2v2', color: '#34d399' },
  standard: { label: '3v3 Standard', short: '3v3', color: '#f472b6' },
};
const MODE_ORDER = ['duel', 'double', 'standard'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mmrDelta(modeEntry) {
  if (!modeEntry?.history?.length) return 0;
  const start = modeEntry.start ?? modeEntry.history[0];
  return modeEntry.history[modeEntry.history.length - 1] - start;
}

function sessionDuration(s) {
  const ms = (s.endedAt ?? s.startedAt) - s.startedAt;
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

function sessionModes(s) {
  const modes = new Set((s.matchLog ?? []).map((m) => m.mode).filter(Boolean));
  Object.keys(s.mmrByMode ?? {}).forEach((m) => modes.add(m));
  return MODE_ORDER.filter((m) => modes.has(m));
}

function fmtDelta(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

// Restreint les sessions aux modes sélectionnés : matchLog et mmrByMode
// filtrés, W/L et nombre de matchs recalculés. Les sessions sans aucun match
// dans les modes choisis disparaissent. (Les totaux buts/arrêts/etc. restent
// ceux de la session entière — ils ne sont pas ventilés par mode.)
function restrictSessions(sessions, selectedModes) {
  if (selectedModes.size === MODE_ORDER.length) return sessions;
  return sessions
    .map((s) => {
      const matchLog = (s.matchLog ?? []).filter((m) => selectedModes.has(m.mode));
      if (matchLog.length === 0) return null;
      const mmrByMode = Object.fromEntries(
        Object.entries(s.mmrByMode ?? {}).filter(([m]) => selectedModes.has(m)),
      );
      return {
        ...s,
        matchLog,
        mmrByMode,
        wins: matchLog.filter((m) => m.result === 'win').length,
        losses: matchLog.filter((m) => m.result === 'loss').length,
        totalMatches: matchLog.length,
      };
    })
    .filter(Boolean);
}

function fmtMonth(date) {
  const label = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtDay(ts) {
  const label = new Date(ts).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ─── Partage Discord ──────────────────────────────────────────────────────────
// Chaque carte expose un bouton (au survol) qui copie un message formaté en
// markdown Discord, prêt à coller dans n'importe quel salon.

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// Copie avec replis : le presse-papiers Electron (toujours fiable) en priorité,
// sinon l'API navigateur (peut être refusée dans un renderer Electron),
// sinon execCommand. Retourne true si la copie a réussi.
async function copyToClipboard(text) {
  if (window.electronAPI?.copyText) {
    window.electronAPI.copyText(text);
    return true;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* on tente le repli execCommand */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

const CARD_SELECTOR = '.dash-mode-card, .dash-insight, .dash-session-card';

// Capture le panneau en image dans le presse-papiers via Electron
// (capturePage sur le rect de la carte — rendu identique à l'écran).
// Le bouton copier est masqué le temps de la capture.
async function copyCardImage(card) {
  if (!window.electronAPI?.copyPanelImage) return false;
  card.classList.add('dash-capturing');
  // Deux frames pour que le masquage du bouton soit peint avant la capture —
  // avec timeout de secours (rAF est suspendu si la fenêtre n'est pas visible)
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 80);
  });
  try {
    const { x, y, width, height } = card.getBoundingClientRect();
    return await window.electronAPI.copyPanelImage({ x, y, width, height });
  } finally {
    card.classList.remove('dash-capturing');
  }
}

function ShareButton({ buildText, inline = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    const card = e.currentTarget.closest(CARD_SELECTOR);
    // Image du panneau dans l'app Electron ; texte formaté en repli (dev navigateur)
    const ok = card && window.electronAPI?.copyPanelImage
      ? await copyCardImage(card)
      : await copyToClipboard(buildText());
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      className={[
        'dash-share-btn',
        inline ? 'dash-share-btn--inline' : 'dash-share-btn--abs',
        copied ? 'dash-share-btn--copied' : '',
      ].join(' ')}
      onClick={copy}
      title="Copier l'image du panneau (à coller dans Discord)"
    >
      {copied ? '✓ Copié !' : <CopyIcon />}
    </button>
  );
}

function shareModeText(mode, stats) {
  const meta = MODE_META[mode];
  const winrate = stats.wins + stats.losses > 0
    ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
    : null;
  return [
    `🎮 **${meta.label}** — stats RL Tracker`,
    `📊 MMR cumulé : **${fmtDelta(stats.mmr)}**`,
    `⚔️ ${stats.matches} matchs · **${stats.wins}V** / **${stats.losses}D**${winrate !== null ? ` · ${winrate}% de winrate` : ''}`,
    `📅 ${stats.sessions} session${stats.sessions > 1 ? 's' : ''}`,
  ].join('\n');
}

function shareInsightText(ins) {
  return [
    `${ins.icon} **${ins.title}** — analyse RL Tracker`,
    `> **${ins.value}**`,
    `> ${ins.detail}`,
  ].join('\n');
}

function shareSessionText(session) {
  const modes = sessionModes(session);
  const winrate = session.wins + session.losses > 0
    ? Math.round((session.wins / (session.wins + session.losses)) * 100)
    : null;
  const day = fmtDay(session.startedAt);
  const lines = [
    `🚀 **Session RL — ${day}**${session.username ? ` (${session.username})` : ''}`,
    `🕐 ${fmtTime(session.startedAt)} → ${fmtTime(session.endedAt)} · ${sessionDuration(session)}`,
    `🏁 **${session.wins}V – ${session.losses}D**${winrate !== null ? ` (${winrate}% de winrate)` : ''}`,
  ];
  const modeLine = modes
    .map((m) => `${MODE_META[m].short} **${fmtDelta(mmrDelta(session.mmrByMode?.[m]))} MMR**`)
    .join(' · ');
  if (modeLine) lines.push(`📊 ${modeLine}`);
  lines.push(
    `⚽ ${session.totalGoals} buts · 🅰️ ${session.totalAssists} passes · 🧤 ${session.totalSaves} arrêts · ★ ${session.totalMVPs} MVP`,
  );
  return lines.join('\n');
}

// ─── Sparkline MMR (SVG inline) ───────────────────────────────────────────────

function Sparkline({ history, color }) {
  if (!history || history.length < 2) return null;
  const w = 120, h = 32, pad = 3;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const pts = history.map((v, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="dash-sparkline" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Stats globales par mode ──────────────────────────────────────────────────

function computeModeStats(sessions) {
  const stats = {};
  for (const mode of MODE_ORDER) {
    stats[mode] = { matches: 0, wins: 0, losses: 0, mmr: 0, sessions: 0 };
  }
  for (const s of sessions) {
    const seen = new Set();
    for (const m of s.matchLog ?? []) {
      const st = stats[m.mode];
      if (!st) continue;
      st.matches += 1;
      if (m.result === 'win') st.wins += 1;
      if (m.result === 'loss') st.losses += 1;
      seen.add(m.mode);
    }
    for (const [mode, entry] of Object.entries(s.mmrByMode ?? {})) {
      if (!stats[mode]) continue;
      stats[mode].mmr += mmrDelta(entry);
      seen.add(mode);
    }
    seen.forEach((mode) => { stats[mode].sessions += 1; });
  }
  return stats;
}

function ModeStatCard({ mode, stats, selected, onToggle }) {
  const meta = MODE_META[mode];
  const winrate = stats.wins + stats.losses > 0
    ? Math.round((stats.wins / (stats.wins + stats.losses)) * 100)
    : null;
  const empty = stats.matches === 0 && stats.mmr === 0;

  return (
    <div
      className={[
        'dash-mode-card',
        empty ? 'dash-mode-card--empty' : '',
        selected ? '' : 'dash-mode-card--off',
      ].join(' ')}
      style={{ '--mode-color': meta.color }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={selected
        ? `Masquer le ${meta.label} de l'historique et de l'analyse`
        : `Réafficher le ${meta.label}`}
      onClick={() => onToggle(mode)}
      onKeyDown={(e) => {
        // e.target === e.currentTarget : ignore les Enter/Espace venant du
        // bouton copier interne
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onToggle(mode);
        }
      }}
    >
      {!empty && <ShareButton buildText={() => shareModeText(mode, stats)} />}
      <div className="dash-mode-card-head">
        <span className="dash-mode-chip">{meta.short}</span>
        <span className="dash-mode-name">{meta.label}</span>
      </div>
      {empty ? (
        <div className="dash-mode-empty">Aucune donnée</div>
      ) : (
        <>
          <div className="dash-mode-mmr">
            <span className={stats.mmr >= 0 ? 'text-up' : 'text-down'}>
              {fmtDelta(stats.mmr)}
            </span>
            <span className="dash-mode-mmr-label">MMR cumulé</span>
          </div>
          <div className="dash-mode-row">
            <span>{stats.matches} matchs</span>
            <span className="dash-dot">·</span>
            <span><b className="text-up">{stats.wins}</b> V</span>
            <span className="dash-dot">·</span>
            <span><b className="text-down">{stats.losses}</b> D</span>
          </div>
          {winrate !== null && (
            <div className="dash-winrate">
              <div className="dash-winrate-bar">
                <div className="dash-winrate-fill" style={{ width: `${winrate}%` }} />
              </div>
              <span className="dash-winrate-label">{winrate}% winrate</span>
            </div>
          )}
          <div className="dash-mode-sessions">{stats.sessions} session{stats.sessions > 1 ? 's' : ''}</div>
        </>
      )}
    </div>
  );
}

// ─── Carte session de la timeline ────────────────────────────────────────────

function SessionCard({ session }) {
  const modes = sessionModes(session);
  const winrate = session.wins + session.losses > 0
    ? Math.round((session.wins / (session.wins + session.losses)) * 100)
    : null;

  // Mode dominant (le plus joué) — pour la sparkline
  const mainMode = useMemo(() => {
    const counts = {};
    (session.matchLog ?? []).forEach((m) => {
      if (m.mode) counts[m.mode] = (counts[m.mode] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? modes[0];
  }, [session, modes]);

  const mainHistory = session.mmrByMode?.[mainMode]?.history;

  return (
    <div className="dash-session-card">
      <div className="dash-session-head">
        <div className="dash-session-when">
          <span className="dash-session-time">
            {fmtTime(session.startedAt)} → {fmtTime(session.endedAt)}
          </span>
          <span className="dash-session-duration">{sessionDuration(session)}</span>
          {session.username && (
            <span className="dash-session-user">{session.username}</span>
          )}
        </div>
        <div className="dash-session-score">
          <span className="text-up">{session.wins}V</span>
          <span className="dash-score-sep">–</span>
          <span className="text-down">{session.losses}D</span>
          {winrate !== null && <span className="dash-session-wr">{winrate}%</span>}
          <ShareButton inline buildText={() => shareSessionText(session)} />
        </div>
      </div>

      <div className="dash-session-modes">
        {modes.map((mode) => {
          const meta = MODE_META[mode];
          const delta = mmrDelta(session.mmrByMode?.[mode]);
          return (
            <span key={mode} className="dash-mode-tag" style={{ '--mode-color': meta.color }}>
              {meta.short}
              <b className={delta >= 0 ? 'text-up' : 'text-down'}>{fmtDelta(delta)}</b>
            </span>
          );
        })}
        {mainHistory && (
          <Sparkline history={mainHistory} color={MODE_META[mainMode]?.color ?? '#60a5fa'} />
        )}
      </div>

      <div className="dash-session-stats">
        <span title="Matchs joués">🎮 {session.totalMatches}</span>
        <span title="Buts">⚽ {session.totalGoals}</span>
        <span title="Passes décisives">🅰️ {session.totalAssists}</span>
        <span title="Arrêts">🧤 {session.totalSaves}</span>
        <span title="MVP" className="text-gold">★ {session.totalMVPs}</span>
        <span title="Démolitions subies" className="text-down">💥 {session.totalDemolished}</span>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [sessions, setSessions] = useState(null); // null = chargement
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [search, setSearch] = useState('');
  // Modes affichés dans l'historique et l'analyse — tous par défaut,
  // toujours au moins un de sélectionné
  const [selectedModes, setSelectedModes] = useState(() => new Set(MODE_ORDER));

  const toggleMode = (mode) =>
    setSelectedModes((prev) => {
      const next = new Set(prev);
      if (next.has(mode)) {
        if (next.size > 1) next.delete(mode); // jamais moins de 1
      } else {
        next.add(mode);
      }
      return next;
    });

  const loadSessions = async () => {
    let list = (await window.electronAPI?.getSessions()) ?? null;
    if (list === null) {
      // Mode navigateur (vite sans Electron) : données de dev éventuelles
      try {
        list = JSON.parse(localStorage.getItem('rl_dev_sessions')) ?? [];
      } catch {
        list = [];
      }
    }
    setSessions(list);
  };

  useEffect(() => {
    document.title = 'RL Overlay — Dashboard';
    loadSessions();
    // Rafraîchissement live quand l'overlay enregistre un match
    const cleanup = window.electronAPI?.onSessionsUpdated(loadSessions);
    return () => cleanup?.();
  }, []);

  const allSessions = sessions ?? [];
  // Les cartes par mode affichent toujours les stats complètes (ce sont les
  // sélecteurs) ; historique et analyse suivent les modes sélectionnés
  const globalStats = useMemo(() => computeModeStats(allSessions), [allSessions]);
  const visibleSessions = useMemo(
    () => restrictSessions(allSessions, selectedModes),
    [allSessions, selectedModes],
  );
  const insights = useMemo(() => computeInsights(visibleSessions), [visibleSessions]);

  // Sessions du mois affiché, filtrées par recherche, les plus récentes en premier
  const monthSessions = useMemo(() => {
    const start = monthCursor.getTime();
    const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1).getTime();
    let list = visibleSessions.filter((s) => s.startedAt >= start && s.startedAt < end);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const modes = sessionModes(s)
          .map((m) => `${MODE_META[m].short} ${MODE_META[m].label}`)
          .join(' ');
        const day = new Date(s.startedAt)
          .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        return `${s.username ?? ''} ${modes} ${day}`.toLowerCase().includes(q);
      });
    }
    return [...list].sort((a, b) => b.startedAt - a.startedAt);
  }, [visibleSessions, monthCursor, search]);

  // Groupement par jour pour la timeline
  const days = useMemo(() => {
    const map = new Map();
    for (const s of monthSessions) {
      const d = new Date(s.startedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, { ts: s.startedAt, sessions: [] });
      map.get(key).sessions.push(s);
    }
    return [...map.values()];
  }, [monthSessions]);

  const now = new Date();
  const isCurrentMonth =
    monthCursor.getFullYear() === now.getFullYear() &&
    monthCursor.getMonth() === now.getMonth();

  const shiftMonth = (delta) =>
    setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  const hasWindowControls = !!window.electronAPI?.dashWindowControl;

  return (
    <div className="dashboard">
      {/* Fenêtre sans frame Windows : zone de drag + boutons agrandir/fermer */}
      {hasWindowControls && (
        <>
          <div className="dash-drag-strip" aria-hidden="true" />
          <div className="dash-window-controls">
            <button
              title="Agrandir / restaurer"
              onClick={() => window.electronAPI.dashWindowControl('maximize')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="1.4">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
              </svg>
            </button>
            <button
              className="dash-wc-close"
              title="Fermer"
              onClick={() => window.electronAPI.dashWindowControl('close')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}

      <header className="dash-header">
        <div className="dash-title">
          <span className="dash-logo">🚀</span>
          <div>
            <h1>Dashboard</h1>
            <p className="dash-subtitle">
              {allSessions.length} session{allSessions.length > 1 ? 's' : ''} enregistrée{allSessions.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      {/* ── Stats globales par mode ── */}
      <section className="dash-section">
        <h2 className="dash-section-title">
          Stats globales par mode
          <span className="dash-section-hint">
            Clique sur un mode pour filtrer l'historique et l'analyse
          </span>
        </h2>
        <div className="dash-mode-grid">
          {MODE_ORDER.map((mode) => (
            <ModeStatCard
              key={mode}
              mode={mode}
              stats={globalStats[mode]}
              selected={selectedModes.has(mode)}
              onToggle={toggleMode}
            />
          ))}
        </div>
      </section>

      {/* ── Analyse & fun facts ── */}
      {insights && insights.length > 0 && (
        <section className="dash-section">
          <h2 className="dash-section-title">Analyse de tes données</h2>
          <div className="dash-insights-grid">
            {insights.map((ins) => (
              <div key={ins.title} className={`dash-insight dash-insight--${ins.tone}`}>
                <ShareButton buildText={() => shareInsightText(ins)} />
                <span className="dash-insight-icon">{ins.icon}</span>
                <div className="dash-insight-body">
                  <span className="dash-insight-title">{ins.title}</span>
                  <span className="dash-insight-value">{ins.value}</span>
                  <span className="dash-insight-detail">{ins.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Historique ── */}
      <section className="dash-section">
        <div className="dash-history-bar">
          <h2 className="dash-section-title">Historique des sessions</h2>
          <div className="dash-history-controls">
            <div className="dash-month-nav">
              <button onClick={() => shiftMonth(-1)} title="Mois précédent">‹</button>
              <span className="dash-month-label">{fmtMonth(monthCursor)}</span>
              <button onClick={() => shiftMonth(1)} disabled={isCurrentMonth} title="Mois suivant">›</button>
            </div>
            <input
              className="dash-search"
              type="search"
              placeholder="Rechercher (mode, joueur, jour…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {sessions === null ? (
          <div className="dash-empty">Chargement…</div>
        ) : days.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">📭</span>
            {search
              ? 'Aucune session ne correspond à la recherche.'
              : `Aucune session en ${fmtMonth(monthCursor).toLowerCase()}.`}
          </div>
        ) : (
          <div className="dash-timeline">
            {days.map((day) => (
              <div key={day.ts} className="dash-day">
                <div className="dash-day-marker">
                  <span className="dash-day-dot" />
                  <span className="dash-day-label">{fmtDay(day.ts)}</span>
                </div>
                <div className="dash-day-sessions">
                  {day.sessions.map((s) => (
                    <SessionCard key={s.id} session={s} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
