import { MAX_HOURS_PER_DAY } from "../data/schedule";

export default function TimeInsights({ reportedHours, reservedHours, releasedHours, rangeLabel, daysInRange, isAdmin }) {
  const capacity = Math.max(isAdmin ? releasedHours : MAX_HOURS_PER_DAY * daysInRange, 1);
  const reportedPct = Math.min(100, (reportedHours / capacity) * 100);
  const upcomingHours = Math.max(0, reservedHours - reportedHours);
  const upcomingPct = Math.min(100 - reportedPct, (upcomingHours / capacity) * 100);

  return (
    <div className="time-insights">
      <div className="time-insights-title">Time insights</div>
      <div className="time-insights-range">{rangeLabel}</div>

      <div className="time-insights-bar-track">
        <div className="time-insights-bar-fill time-insights-bar-fill--reported" style={{ width: `${reportedPct}%` }} />
        <div
          className="time-insights-bar-fill time-insights-bar-fill--upcoming"
          style={{ width: `${upcomingPct}%`, left: `${reportedPct}%` }}
        />
      </div>

      <div className="time-insights-legend">
        <div className="time-insights-stat">
          <span className="time-insights-swatch time-insights-swatch--reported" />
          <span className="time-insights-stat-label">Reported hours</span>
          <span className="time-insights-stat-value">{reportedHours}h</span>
        </div>
        <div className="time-insights-stat">
          <span className="time-insights-swatch time-insights-swatch--upcoming" />
          <span className="time-insights-stat-label">{isAdmin ? "Total reserved" : "Reserved hours"}</span>
          <span className="time-insights-stat-value">{reservedHours}h</span>
        </div>
        {isAdmin && (
          <div className="time-insights-stat">
            <span className="time-insights-swatch time-insights-swatch--released" />
            <span className="time-insights-stat-label">Total released</span>
            <span className="time-insights-stat-value">{releasedHours}h</span>
          </div>
        )}
      </div>
    </div>
  );
}
