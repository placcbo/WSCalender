import { useState } from "react";

export default function AdminReleasePanel({ onRelease, disabled, selectedDate, onDateChange }) {
  const [totalHours, setTotalHours] = useState(50);

  return (
    <div className="admin-panel">
      <div className="admin-panel-title">Release capacity</div>
      <p className="admin-panel-sub">Choose a date and release one total-hours capacity block for that day.</p>
      <div className="admin-panel-controls">
        <label className="admin-field">
          <span>Date</span>
          <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <label className="admin-field">
          <span>Total hours</span>
          <input
            type="number"
            min="1"
            max="200"
            value={totalHours}
            onChange={(event) => setTotalHours(Number(event.target.value))}
          />
        </label>
        <button
          className="btn btn--amber"
          disabled={disabled || totalHours < 1}
          onClick={() => onRelease({ dateKey: selectedDate, totalHours })}
        >
          Release {totalHours}h
        </button>
      </div>
    </div>
  );
}
