import { useGame } from '../context/GameContext.jsx';

function StatBox({ label, value, avg, valueClass = '' }) {
  return (
    <div className="ext-box">
      <span className="label">{label}</span>
      <span className={`ext-val ${valueClass}`}>{value}</span>
      {avg !== undefined && <span className="ext-sub">{avg} / match</span>}
    </div>
  );
}

export default function SessionPanel({ visible }) {
  const { state } = useGame();
  const { totalMatches, totalGoals, totalAssists, totalSaves, totalDemolished, totalMVPs } = state;

  const avg = (n) => totalMatches > 0 ? (n / totalMatches).toFixed(1) : '0.0';

  return (
    <div className={`panel extended-dashboard ${visible ? '' : 'hidden'}`}>
      <StatBox label="Buts"         value={totalGoals}     avg={avg(totalGoals)} />
      <StatBox label="Passes"       value={totalAssists}   avg={avg(totalAssists)} />
      <StatBox label="Arrêts"       value={totalSaves}     avg={avg(totalSaves)} />
      <StatBox label="Démos Subies" value={totalDemolished} avg={avg(totalDemolished)} valueClass="text-loss" />
      <div className="ext-box" style={{ gridColumn: 'span 4' }}>
        <span className="label">Titres de MVP</span>
        <span className="ext-val text-gold">{totalMVPs}</span>
      </div>
    </div>
  );
}
