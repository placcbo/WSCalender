import { useState } from "react";

export default function AdminReleasePanel({ onRelease, disabled, selectedDate, onDateChange }) {
  const [totalHours, setTotalHours] = useState(50);
  const [shiftName, setShiftName] = useState("Extraction Experienced");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  return (
    <div className="admin-panel">
      <div className="admin-panel-title">Release capacity</div>
      <p className="admin-panel-sub">Choose a date and define the shift details for the block released to users.</p>
      <div className="admin-panel-controls">
        <label className="admin-field">
          <span>Date</span>
          <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <label className="admin-field">
          <span>Shift name</span>
          <input value={shiftName} onChange={(event) => setShiftName(event.target.value)} />
        </label>
        <label className="admin-field">
          <span>Start</span>
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label className="admin-field">
          <span>End</span>
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
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
          onClick={() => onRelease({ dateKey: selectedDate, totalHours, shiftName, startTime, endTime })}
        >
          Release {totalHours}h
        </button>
      </div>
    </div>
  );
}
