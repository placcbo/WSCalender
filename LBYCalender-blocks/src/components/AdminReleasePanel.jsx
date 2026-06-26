import { useEffect, useState } from "react";
import { WORK_TYPES } from "../context/AuthContext";

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
  workTypeAccess,
  onGrantAccess,
  onRevokeAccess,
  customWorkTypes = [],
  onAddWorkType,
}) {
  const allWorkTypes = [...new Set([...WORK_TYPES, ...customWorkTypes])];

  const [totalHours, setTotalHours] = useState(50);
  const [workType, setWorkType] = useState(allWorkTypes[0]);
  const [isCustomProject, setIsCustomProject] = useState(false);
  const [customProjectName, setCustomProjectName] = useState("");
  const [startTime, setStartTime] = useState(() => getDefaultTimesForDate(selectedDate).startTime);
  const [endTime, setEndTime] = useState(() => getDefaultTimesForDate(selectedDate).endTime);
  const [emailInput, setEmailInput] = useState("");
  const [accessWorkType, setAccessWorkType] = useState(allWorkTypes[0]);

  // Keep accessWorkType in sync if allWorkTypes changes
  useEffect(() => {
    if (!allWorkTypes.includes(accessWorkType)) {
      setAccessWorkType(allWorkTypes[0]);
    }
  }, [allWorkTypes.join(",")]);

  useEffect(() => {
    const defaults = getDefaultTimesForDate(selectedDate);
    setStartTime(defaults.startTime);
    setEndTime(defaults.endTime);
  }, [selectedDate]);

  const effectiveWorkType = isCustomProject ? customProjectName.trim() : workType;

  const handleAddEmail = () => {
    if (!emailInput.trim()) return;
    onGrantAccess(emailInput, accessWorkType);
    setEmailInput("");
  };

  const handleProjectChange = (value) => {
    if (value === "__custom__") {
      setIsCustomProject(true);
      setCustomProjectName("");
    } else {
      setIsCustomProject(false);
      setWorkType(value);
    }
  };

  const handleAddCustomProject = () => {
    const name = customProjectName.trim();
    if (!name) return;
    onAddWorkType?.(name);
    setWorkType(name);
    setIsCustomProject(false);
  };

  const canRelease = !disabled && totalHours >= 1 && effectiveWorkType.length > 0;

  return (
    <div className="admin-panel">
      <div className="admin-panel-title">Release capacity</div>
      <p className="admin-panel-sub">Choose a date, a project, and define the shift window for the block released to users.</p>
      <div className="admin-panel-controls">
        <label className="admin-field">
          <span>Date</span>
          <input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} />
        </label>

        <label className="admin-field">
          <span>Project</span>
          {isCustomProject ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus
                value={customProjectName}
                onChange={(e) => setCustomProjectName(e.target.value)}
                placeholder="New project name"
                onKeyDown={(e) => { if (e.key === "Enter") handleAddCustomProject(); if (e.key === "Escape") { setIsCustomProject(false); } }}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "6px 10px", fontSize: "0.76rem" }}
                onClick={handleAddCustomProject}
                disabled={!customProjectName.trim()}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "6px 8px", fontSize: "0.76rem" }}
                onClick={() => setIsCustomProject(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <select value={workType} onChange={(event) => handleProjectChange(event.target.value)}>
              {allWorkTypes.map((wt) => (
                <option key={wt} value={wt}>{wt}</option>
              ))}
              <option value="__custom__">+ New project…</option>
            </select>
          )}
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
          disabled={!canRelease}
          onClick={() => onRelease({
            dateKey: selectedDate,
            totalHours,
            shiftName: effectiveWorkType,
            startTime,
            endTime,
            workType: effectiveWorkType,
          })}
        >
          Release {totalHours}h
        </button>
      </div>

      <div className="admin-access-panel">
        <div className="admin-access-header">
          <div>
            <div className="admin-access-title">Project access</div>
            <p className="admin-access-sub">
              Grant a user access to an additional project — they'll see and can claim blocks from every project
              they're granted, each with its own 8h/day cap.
            </p>
          </div>
        </div>
        <div className="admin-access-controls">
          <select value={accessWorkType} onChange={(event) => setAccessWorkType(event.target.value)}>
            {allWorkTypes.map((wt) => (
              <option key={wt} value={wt}>{wt}</option>
            ))}
          </select>
          <input
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="name@company.com"
          />
          <button className="btn btn--ghost" onClick={handleAddEmail} disabled={!emailInput.trim()}>
            Grant access
          </button>
        </div>
        {allWorkTypes.map((wt) => {
          const emails = workTypeAccess[wt] ?? [];
          if (emails.length === 0) return null;
          return (
            <div key={wt} className="admin-access-group">
              <span className="admin-access-group-label">{wt}</span>
              <div className="admin-access-list">
                {emails.map((email) => (
                  <span key={email} className="admin-access-pill">
                    {email}
                    <button type="button" className="admin-access-pill-remove" onClick={() => onRevokeAccess(email, wt)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
