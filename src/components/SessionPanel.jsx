import { useGame } from '../context/GameContext.jsx';
import MmrChart   from './MmrChart.jsx';

function StatBox({ label, value, avg, avgLabel = 'match', valueClass = '' }) {
  return (
    <div className="ext-box">
      <span className="label">{label}</span>
      <span className={`ext-val ${valueClass}`}>{value}</span>
      {avg !== undefined && <span className="ext-sub">{avg} / {avgLabel}</span>}
    </div>
  );
}

export default function SessionPanel() {
  const { state } = useGame();
  const {
    totalMatches, wins,
    totalGoals, totalAssists, totalSaves, totalDemolished, totalMVPs,
    mmrHistory,
  } = state;

  const avg = (n, denom = totalMatches) =>
    denom > 0 ? (n / denom).toFixed(1) : '0.0';

  return (
    <div className="panel extended-dashboard">

      {/* Graphique MMR (s'affiche dès 2 points) */}
      {mmrHistory.length >= 2 && (
        <div className="mmr-chart-wrapper">
          <MmrChart mmrHistory={mmrHistory} height={88} />
        </div>
      )}

      <StatBox label="Buts"         value={totalGoals}      avg={avg(totalGoals)} />
      <StatBox label="Passes"       value={totalAssists}    avg={avg(totalAssists)} />
      <StatBox label="Arrêts"       value={totalSaves}      avg={avg(totalSaves)} />
      <StatBox label="Démos Subies" value={totalDemolished} avg={avg(totalDemolished)} valueClass="text-loss" />
      <StatBox
        label="Titres de MVP"
        value={totalMVPs}
        avg={avg(totalMVPs, wins)}
        avgLabel="win"
        valueClass="text-gold"
      />
    </div>
  );
}
