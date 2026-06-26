import { useEffect, useState } from "react";

function getDefaultTimesForDate(dateKey) {
  if (!dateKey) return { startTime: "08:00", endTime: "17:00" };
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getDay() === 6
    ? { startTime: "14:00", endTime: "22:00" }
    : { startTime: "08:00", endTime: "17:00" };
}

export default function AdminReleasePanel({
  onRelease,
  disabled,
  selectedDate,
  onDateChange,
  visibleEmails,
  onAddEmail,
  onRemoveEmail,
}) {
  const [totalHours, setTotalHours] = useState(50);
  const [shiftName, setShiftName] = useState("Extraction Experienced");
  const [startTime, setStartTime] = useState(() => getDefaultTimesForDate(selectedDate).startTime);
  const [endTime, setEndTime] = useState(() => getDefaultTimesForDate(selectedDate).endTime);
  const [emailInput, setEmailInput] = useState("");

  useEffect(() => {
    const defaults = getDefaultTimesForDate(selectedDate);
    setStartTime(defaults.startTime);
    setEndTime(defaults.endTime);
  }, [selectedDate]);

  const handleAddEmail = () => {
    if (!emailInput.trim()) return;
    onAddEmail(emailInput);
    setEmailInput("");
  };

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

      <div className="admin-access-panel">
        <div className="admin-access-header">
          <div>
            <div className="admin-access-title">Extraction access</div>
            <p className="admin-access-sub">Add account emails that should be able to see Extraction blocks.</p>
          </div>
        </div>
        <div className="admin-access-controls">
          <input
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="name@company.com"
          />
          <button className="btn btn--ghost" onClick={handleAddEmail} disabled={!emailInput.trim()}>
            Add email
          </button>
        </div>
        <div className="admin-access-list">
          {visibleEmails.map((email) => (
            <span key={email} className="admin-access-pill">
              {email}
              <button type="button" className="admin-access-pill-remove" onClick={() => onRemoveEmail(email)}>
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
