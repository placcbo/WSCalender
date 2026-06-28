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

function fillClass(pct) {
  if (pct >= 100) return "arp-fill--full";
  if (pct >= 50)  return "arp-fill--partial";
  return "arp-fill--empty";
}

export default function AdminReleasePanel({
  onRelease,
  onSelectBlock,
  onProjectFilterChange,
  disabled,
  selectedDate,
  onDateChange,
  workTypeAccess,
  onGrantAccess,
  onRevokeAccess,
  customWorkTypes = [],
  onAddWorkType,
  dateBlocks = [],
  highlightedProject = null,
}) {
  const allWorkTypes = [...new Set([...WORK_TYPES, ...customWorkTypes])];

  const [totalHours, setTotalHours]           = useState(50);
  const [maxHoursPerUser, setMaxHoursPerUser] = useState(8);
  const [workType, setWorkType]               = useState(allWorkTypes[0] ?? "");
  const [isCustomProject, setIsCustomProject] = useState(allWorkTypes.length === 0);
  const [customProjectName, setCustomProjectName] = useState("");
  const [startTime, setStartTime] = useState(() => getDefaultTimesForDate(selectedDate).startTime);
  const [endTime,   setEndTime]   = useState(() => getDefaultTimesForDate(selectedDate).endTime);
  const [emailInput, setEmailInput]       = useState("");
  const [accessWorkType, setAccessWorkType] = useState(allWorkTypes[0] ?? "");

  useEffect(() => {
    if (allWorkTypes.length === 0) setIsCustomProject(true);
    if (!allWorkTypes.includes(accessWorkType)) setAccessWorkType(allWorkTypes[0] ?? "");
    if (!isCustomProject && !allWorkTypes.includes(workType)) setWorkType(allWorkTypes[0] ?? "");
  }, [allWorkTypes.join(","), accessWorkType, isCustomProject, workType]);

  useEffect(() => {
    const defaults = getDefaultTimesForDate(selectedDate);
    setStartTime(defaults.startTime);
    setEndTime(defaults.endTime);
  }, [selectedDate]);

  const effectiveWorkType   = isCustomProject ? customProjectName.trim() : workType;
  const projectBlocks       = dateBlocks.filter((b) => b.workType === effectiveWorkType);
  const projectReleased     = projectBlocks.reduce((s, b) => s + b.totalHours, 0);
  const projectClaimed      = projectBlocks.reduce((s, b) => s + (b.reservedHours ?? 0), 0);
  const projectRemaining    = Math.max(0, projectReleased - projectClaimed);
  const projectClaimedPct   = projectReleased > 0
    ? Math.min(100, Math.round((projectClaimed / projectReleased) * 100))
    : 0;

  useEffect(() => {
    if (!onProjectFilterChange || isCustomProject) return;
    onProjectFilterChange(workType || null);
  }, [isCustomProject, workType, onProjectFilterChange]);

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
    <div className="arp">
      {/* ── Section 1: Release form ── */}
      <div className="arp-section">
        <div className="arp-section-head">
          <span className="arp-section-eyebrow">Admin</span>
          <h2 className="arp-section-title">Release capacity</h2>
          <p className="arp-section-sub">Pick a project and define the shift window made available to workers.</p>
        </div>

        {/* Project tabs */}
        <div className="arp-project-row">
          {allWorkTypes.map((wt) => (
            <button
              key={wt}
              type="button"
              className={
                "arp-tab" +
                (wt === effectiveWorkType && !isCustomProject ? " arp-tab--active" : "") +
                (wt === highlightedProject ? " arp-tab--highlight" : "")
              }
              onClick={() => { setIsCustomProject(false); setWorkType(wt); }}
            >
              {wt}
            </button>
          ))}
          <button
            type="button"
            className={"arp-tab arp-tab--new" + (isCustomProject ? " arp-tab--active" : "")}
            onClick={() => { setIsCustomProject(true); setCustomProjectName(""); }}
          >
            + New project
          </button>
        </div>

        {/* Custom project name input */}
        {isCustomProject && (
          <div className="arp-custom-row">
            <input
              autoFocus
              className="arp-input"
              value={customProjectName}
              onChange={(e) => setCustomProjectName(e.target.value)}
              placeholder="Project name…"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustomProject();
                if (e.key === "Escape") { setIsCustomProject(false); }
              }}
            />
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: "7px 12px", fontSize: "0.8rem" }}
              onClick={handleAddCustomProject}
              disabled={!customProjectName.trim()}
            >
              Add
            </button>
            {allWorkTypes.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost"
                style={{ padding: "7px 10px", fontSize: "0.8rem" }}
                onClick={() => setIsCustomProject(false)}
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Form grid */}
        <div className="arp-form-grid">
          <label className="arp-field">
            <span className="arp-field-label">Date</span>
            <input
              className="arp-input"
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </label>
          <label className="arp-field">
            <span className="arp-field-label">Start</span>
            <input className="arp-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="arp-field">
            <span className="arp-field-label">End</span>
            <input className="arp-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <label className="arp-field">
            <span className="arp-field-label">Total hours</span>
            <input
              className="arp-input"
              type="number" min="1" max="200"
              value={totalHours}
              onChange={(e) => setTotalHours(Number(e.target.value))}
            />
          </label>
          <label className="arp-field">
            <span className="arp-field-label">Max / user</span>
            <input
              className="arp-input"
              type="number" min="1" max="24"
              value={maxHoursPerUser}
              onChange={(e) => setMaxHoursPerUser(Number(e.target.value))}
            />
          </label>
          <button
            className="btn btn--amber arp-release-btn"
            disabled={!canRelease}
            onClick={() => {
              if (isCustomProject && effectiveWorkType && !customWorkTypes.includes(effectiveWorkType)) {
                onAddWorkType?.(effectiveWorkType);
                setIsCustomProject(false);
                setWorkType(effectiveWorkType);
              }
              onRelease({
                dateKey: selectedDate,
                totalHours,
                shiftName: effectiveWorkType,
                startTime,
                endTime,
                workType: effectiveWorkType,
                maxHoursPerUser,
              });
            }}
          >
            Release {totalHours}h
          </button>
        </div>
      </div>

      {/* ── Section 2: Project status ── */}
      {effectiveWorkType && (
        <div className="arp-section arp-section--status">
          <div className="arp-section-head">
            <div className="arp-project-badge">
              <span className="arp-project-dot" />
              {effectiveWorkType}
            </div>
            <p className="arp-section-sub" style={{ marginTop: 4 }}>
              Capacity for the selected date
            </p>
          </div>

          {projectReleased === 0 ? (
            <div className="arp-empty">No blocks released for <strong>{effectiveWorkType}</strong> on this date yet.</div>
          ) : (
            <>
              {/* Stat strip */}
              <div className="arp-stat-strip">
                <div className="arp-stat">
                  <span className="arp-stat-value">{projectReleased}h</span>
                  <span className="arp-stat-label">Released</span>
                </div>
                <div className="arp-stat-divider" />
                <div className="arp-stat">
                  <span className="arp-stat-value arp-stat-value--claimed">{projectClaimed}h</span>
                  <span className="arp-stat-label">Claimed</span>
                </div>
                <div className="arp-stat-divider" />
                <div className="arp-stat">
                  <span className="arp-stat-value arp-stat-value--remaining">{projectRemaining}h</span>
                  <span className="arp-stat-label">Remaining</span>
                </div>
                <div className="arp-stat-divider" />
                <div className="arp-stat">
                  <span className="arp-stat-value">{projectClaimedPct}%</span>
                  <span className="arp-stat-label">Fill rate</span>
                </div>
              </div>

              {/* Fill bar */}
              <div className="arp-bar-track">
                <div
                  className={"arp-bar-fill " + fillClass(projectClaimedPct)}
                  style={{ width: `${projectClaimedPct}%` }}
                />
              </div>

              {/* Block list */}
              <div className="arp-block-list">
                {projectBlocks.map((block) => {
                  const pct = block.totalHours > 0
                    ? Math.round(((block.reservedHours ?? 0) / block.totalHours) * 100)
                    : 0;
                  return (
                    <div key={block.id} className="arp-block">
                      <div className="arp-block-bar" style={{ width: `${pct}%` }} />
                      <div className="arp-block-content">
                        <div className="arp-block-top">
                          <span className="arp-block-name">{block.shiftName || block.workType}</span>
                          <span className="arp-block-time">{block.startTime} – {block.endTime}</span>
                        </div>
                        <div className="arp-block-meta">
                          <span className="arp-block-chip">{block.totalHours}h released</span>
                          <span className="arp-block-chip arp-block-chip--claimed">{block.reservedHours ?? 0}h claimed</span>
                          <span className="arp-block-chip arp-block-chip--remaining">{block.remainingHours}h left</span>
                          <span className="arp-block-chip arp-block-chip--cap">cap {block.maxHoursPerUser ?? 8}h</span>
                        </div>
                      </div>
                      {onSelectBlock && (
                        <button
                          type="button"
                          className="arp-block-adjust"
                          onClick={() => onSelectBlock(selectedDate, block)}
                          title="Adjust block"
                        >
                          ✎
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Section 3: Project access ── */}
      <div className="arp-section arp-section--access">
        <div className="arp-section-head">
          <h2 className="arp-section-title">Project access</h2>
          <p className="arp-section-sub">
            Grant a worker access to a project — they'll see and can claim its blocks, each with its own daily cap.
          </p>
        </div>

        <div className="arp-access-row">
          <select
            className="arp-input arp-select"
            value={accessWorkType}
            onChange={(e) => setAccessWorkType(e.target.value)}
          >
            {allWorkTypes.map((wt) => (
              <option key={wt} value={wt}>{wt}</option>
            ))}
          </select>
          <input
            className="arp-input arp-email-input"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="name@company.com"
            onKeyDown={(e) => { if (e.key === "Enter") handleAddEmail(); }}
          />
          <button className="btn btn--ghost" onClick={handleAddEmail} disabled={!emailInput.trim()}>
            Grant
          </button>
        </div>

        {allWorkTypes.map((wt) => {
          const emails = workTypeAccess[wt] ?? [];
          if (emails.length === 0) return null;
          return (
            <div key={wt} className="arp-access-group">
              <span className="arp-access-group-label">{wt}</span>
              <div className="arp-pill-row">
                {emails.map((email) => (
                  <span key={email} className="arp-pill">
                    {email}
                    <button
                      type="button"
                      className="arp-pill-remove"
                      onClick={() => onRevokeAccess(email, wt)}
                      title="Remove access"
                    >
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