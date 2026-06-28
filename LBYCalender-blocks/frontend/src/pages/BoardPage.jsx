import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  cancelBooking,
  fetchUserHoursForDay,
  fetchUserHoursSummary,
  fetchWeekRange,
  fetchWeekSchedule,
  adjustReleasedHours,
  releaseHours,
  reserveHours,
  revokeBlock,
  updateBookingHours,
} from "../data/backendApi";
import { formatDateHeading, formatMonthHeading, MAX_HOURS_PER_DAY, toDateKey } from "../data/schedule";
import Header from "../components/Header";
import MiniMonth from "../components/MiniMonth";
import CalendarLayers from "../components/CalendarLayers";
import TimeInsights from "../components/TimeInsights";
import WeekGrid from "../components/WeekGrid";
import AdminReleasePanel from "../components/AdminReleasePanel";

const todayDate = new Date();
const todayKey = toDateKey(todayDate);
// Custom work types intentionally live in React state only (no localStorage).
// The Go backend has no DB yet, so projects vanish on restart — persisting
// names in the browser would leave stale tabs showing projects whose blocks
// no longer exist on the server.

export default function BoardPage() {
  const { user, logout, workTypeAccess, grantWorkTypeAccess, revokeWorkTypeAccess } = useAuth();
  const isAdmin = user.role === "admin";
  // Bug fix (Bug 2): admins have no defaultWorkTypes so grantedWorkTypes is
  // undefined → was passed as [] to fetchWeekSchedule, which (after fixing
  // Bug 1) would now show nothing. Pass null explicitly for admins so the API
  // skips filtering entirely.
  const grantedWorkTypes = isAdmin ? null : (user?.grantedWorkTypes ?? []);

  const [anchorDate, setAnchorDate] = useState(todayDate);
  const [monthCursor, setMonthCursor] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [dateKeys, setDateKeys] = useState([]);
  const [weekData, setWeekData] = useState({});
  const [pendingClaim, setPendingClaim] = useState(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [adminAdjustTarget, setAdminAdjustTarget] = useState(null);
  const [activeDate, setActiveDate] = useState(todayKey);
  const [committedHoursByWorkType, setCommittedHoursByWorkType] = useState({});
  const [summary, setSummary] = useState({ reportedHours: 0, reservedHours: 0 });
  const [visibleLayers, setVisibleLayers] = useState(new Set(["reserved", "completed", "open"]));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  // Admin-created project names beyond the built-in WORK_TYPES
  const [customWorkTypes, setCustomWorkTypes] = useState([]);
  const [adminProjectFilter, setAdminProjectFilter] = useState(null);
  const [highlightedProject, setHighlightedProject] = useState(null);

  // Bug fix (Bug 3): clear admin modal state whenever the logged-in user
  // changes (e.g. admin-1 logs out and admin-2 logs in in the same tab).
  const prevUserId = useRef(user?.id);
  useEffect(() => {
    if (prevUserId.current !== user?.id) {
      prevUserId.current = user?.id;
      setAdminAdjustTarget(null);
      setPendingClaim(null);
      setCancelConfirmOpen(false);
      setBanner(null);
    }
  }, [user?.id]);

  const handleAddWorkType = useCallback((name) => {
    setCustomWorkTypes((prev) => {
      if (prev.includes(name)) return prev;
      return [...prev, name];
    });
    // Auto-select the project for admin quick-access and refresh insights
    setAdminProjectFilter(name);
    // Temporarily highlight the newly created tab
    setHighlightedProject(name);
    setTimeout(() => setHighlightedProject(null), 3500);
    // Refresh current week to reflect the new project in the data view.
    // Fire-and-forget: loadWeek handles its own errors.
    loadWeek(anchorDate, true);
  }, [loadWeek, anchorDate]);

  const handleAdminProjectFilterChange = useCallback((project) => {
    setAdminProjectFilter(project || null);
  }, []);

  // Bug fix (Bug 5): grantedWorkTypes is an array — a new array reference on
  // every render caused loadWeek to be recreated every render, which triggered
  // the useEffect below on every render (infinite loop). We stabilise it with
  // a ref so the callback only sees the latest value without it being a dep.
  const grantedWorkTypesRef = useRef(grantedWorkTypes);
  useEffect(() => { grantedWorkTypesRef.current = grantedWorkTypes; }, [grantedWorkTypes]);

  const loadWeek = useCallback(async (weekAnchorDate = anchorDate, showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const keys = await fetchWeekRange(weekAnchorDate);
      setDateKeys(keys);
      const data = await fetchWeekSchedule(keys, user?.id ?? "", isAdmin, grantedWorkTypesRef.current);
      setWeekData(data);
      setSummary(await fetchUserHoursSummary(keys, user?.id ?? ""));
    } catch (err) {
      // Backend unreachable or network error — clear all volatile client state
      setDateKeys([]);
      setWeekData({});
      setSummary({ reportedHours: 0, reservedHours: 0 });
      setCommittedHoursByWorkType({});
      setCustomWorkTypes([]);
      setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
    } finally {
      setLoading(false);
    }
  }, [anchorDate, user?.id, isAdmin]); // grantedWorkTypes accessed via ref — no array dep

  useEffect(() => {
    loadWeek(anchorDate, true);
  }, [anchorDate, loadWeek]);

  // Lightweight backend liveness probe: if the backend becomes unreachable
  // we proactively clear all volatile client state to ensure nothing persists
  // while the server is down.
  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        await fetchWeekRange(todayDate);
      } catch (err) {
        if (cancelled) return;
        setDateKeys([]);
        setWeekData({});
        setSummary({ reportedHours: 0, reservedHours: 0 });
        setCommittedHoursByWorkType({});
        setCustomWorkTypes([]);
        setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
        clearInterval(interval);
      }
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /** Committed hours for `activeDate`, scoped per project — refetched whenever the visible week data changes. */
  useEffect(() => {
    if (isAdmin || !grantedWorkTypes || grantedWorkTypes.length === 0) return;
    Promise.all(
      grantedWorkTypes.map((workType) =>
        fetchUserHoursForDay(activeDate, user?.id ?? "", workType).then((hours) => [workType, hours])
      )
    ).then((entries) => setCommittedHoursByWorkType(Object.fromEntries(entries)));
  }, [activeDate, user?.id, weekData, isAdmin, grantedWorkTypes]);

  const committedHoursForWorkType = useCallback(
    (workType) => committedHoursByWorkType[workType] ?? 0,
    [committedHoursByWorkType]
  );

  const pendingHours = pendingClaim?.dateKey === activeDate && pendingClaim?.mode !== "adjust" ? pendingClaim.hours : 0;
  const overBudget = pendingClaim?.mode !== "adjust" && pendingClaim != null && pendingHours > pendingClaim.maxHours;
  const isAdjustingToZero = pendingClaim?.mode === "adjust" && pendingClaim.hours === 0;
  const pendingBlock = useMemo(() => {
    if (!pendingClaim) return null;
    return weekData[pendingClaim.dateKey]?.blocks.find((block) => block.id === pendingClaim.blockId) ?? null;
  }, [pendingClaim, weekData]);

  const handleSelectBlock = useCallback(
    async (dateKey, block) => {
      if (isAdmin) {
        setAdminAdjustTarget({
          dateKey,
          blockId: block.id,
          currentHours: block.totalHours,
          reservedHours: block.reservedHours ?? 0,
          targetHours: block.totalHours,
          shiftName: block.shiftName ?? block.workType ?? "Shift",
          startTime: block.startTime ?? "08:00",
          endTime: block.endTime ?? "17:00",
          workType: block.workType,
          maxHoursPerUser: block.maxHoursPerUser ?? 8,
        });
        setActiveDate(dateKey);
        return;
      }
      setBanner(null);
      setActiveDate(dateKey);
      // Fetch fresh rather than trust cached committedHoursByWorkType, which
      // may not yet reflect `dateKey` or `block.workType` if this is the
      // first click after navigating to a new date/project.
      const committedForProject = await fetchUserHoursForDay(dateKey, user?.id ?? "", block.workType);
      const existingHours = block.myHours ?? 0;
      if (existingHours > 0) {
        const availableForThisBooking = Math.max(existingHours, (block.remainingHours ?? 0) + existingHours);
        const dailyAllowance = Math.max(existingHours, MAX_HOURS_PER_DAY - Math.max(0, committedForProject - existingHours));
        const maxHours = Math.min(availableForThisBooking, dailyAllowance);
        setPendingClaim({
          dateKey,
          blockId: block.id,
          hours: existingHours,
          maxHours,
          existingHours,
          mode: "adjust",
          bookingId: block.bookings?.find((booking) => booking.isMine)?.id ?? null,
          workType: block.workType,
        });
        return;
      }
      if (block.isFull) return;
      const maxHours = Math.min(block.remainingHours, MAX_HOURS_PER_DAY - committedForProject);
      if (maxHours <= 0) {
        setBanner({ kind: "error", text: `You're capped at ${MAX_HOURS_PER_DAY}h/day for ${block.workType}.` });
        return;
      }
      setPendingClaim({
        dateKey,
        blockId: block.id,
        hours: Math.min(1, maxHours),
        maxHours,
        existingHours,
        mode: "reserve",
        workType: block.workType,
      });
    },
    [isAdmin, user?.id]
  );

  const handlePendingHoursChange = useCallback((hours) => {
    setPendingClaim((current) => {
      if (!current) return current;
      if (current.mode === "adjust") {
        setCancelConfirmOpen(hours === 0);
      }
      return { ...current, hours };
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pendingClaim) return;
    if (pendingClaim.mode === "adjust" && pendingClaim.hours === 0) {
      setCancelConfirmOpen(true);
      return;
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const res =
        pendingClaim.mode === "adjust"
          ? await updateBookingHours(pendingClaim.bookingId, pendingClaim.hours, user?.id ?? "", MAX_HOURS_PER_DAY)
          : await reserveHours(
              pendingClaim.dateKey,
              pendingClaim.blockId,
              pendingClaim.hours,
              user?.id ?? "",
              MAX_HOURS_PER_DAY
            );
      setSubmitting(false);
      if (!res.ok) {
        setBanner({ kind: "error", text: res.error });
        return;
      }
    } catch (err) {
      setSubmitting(false);
      setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
      setDateKeys([]);
      setWeekData({});
      setSummary({ reportedHours: 0, reservedHours: 0 });
      setCommittedHoursByWorkType({});
      setCustomWorkTypes([]);
      return;
    }
    setBanner({
      kind: "success",
      text:
        pendingClaim.mode === "adjust"
          ? `Updated reservation to ${pendingClaim.hours}h on ${formatDateHeading(pendingClaim.dateKey)}.`
          : `Reserved ${pendingClaim.hours}h on ${formatDateHeading(pendingClaim.dateKey)}.`,
    });
    setPendingClaim(null);
    loadWeek(new Date(pendingClaim.dateKey));
  }, [loadWeek, pendingClaim, user?.id]);

  const handleClearPending = useCallback(() => {
    setPendingClaim(null);
    setCancelConfirmOpen(false);
  }, []);

  const handleAdminAdjustHoursChange = useCallback((hours) => {
    setAdminAdjustTarget((current) => (current ? { ...current, targetHours: hours } : current));
  }, []);

  const handleAdminAdjustMaxHoursChange = useCallback((maxHoursPerUser) => {
    setAdminAdjustTarget((current) =>
      current ? { ...current, maxHoursPerUser: maxHoursPerUser } : current
    );
  }, []);

  const handleAdminAdjustConfirm = useCallback(async () => {
    if (!adminAdjustTarget) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await adjustReleasedHours(
        adminAdjustTarget.dateKey,
        adminAdjustTarget.blockId,
        adminAdjustTarget.targetHours,
        adminAdjustTarget.shiftName,
        adminAdjustTarget.startTime,
        adminAdjustTarget.endTime,
        adminAdjustTarget.workType,
        adminAdjustTarget.maxHoursPerUser
      );
      setSubmitting(false);
      if (!res.ok) {
        setBanner({ kind: "error", text: res.error });
        return;
      }
    } catch (err) {
      setSubmitting(false);
      setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
      setDateKeys([]);
      setWeekData({});
      setSummary({ reportedHours: 0, reservedHours: 0 });
      setCommittedHoursByWorkType({});
      setCustomWorkTypes([]);
      return;
    }
    setBanner({ kind: "success", text: `Updated released capacity to ${adminAdjustTarget.targetHours}h.` });
    setAdminAdjustTarget(null);
    loadWeek(new Date(adminAdjustTarget.dateKey));
  }, [adminAdjustTarget, loadWeek]);

  const handleCancelReservation = useCallback(async () => {
    if (!pendingClaim?.bookingId) return;
    setSubmitting(true);
    setCancelConfirmOpen(false);
    try {
      const res = await updateBookingHours(pendingClaim.bookingId, 0, user?.id ?? "");
      setSubmitting(false);
      if (!res.ok) {
        setBanner({ kind: "error", text: res.error });
        return;
      }
    } catch (err) {
      setSubmitting(false);
      setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
      setDateKeys([]);
      setWeekData({});
      setSummary({ reportedHours: 0, reservedHours: 0 });
      setCommittedHoursByWorkType({});
      setCustomWorkTypes([]);
      return;
    }
    setBanner({ kind: "success", text: "Reservation cancelled." });
    setPendingClaim(null);
    loadWeek(new Date(pendingClaim.dateKey));
  }, [loadWeek, pendingClaim, user?.id]);

  // Bug fix (Bug 6): anchorDate was used inside but missing from dep array.
  const handleCancelBooking = useCallback(
    async (bookingId) => {
      setSubmitting(true);
      try {
        const res = await cancelBooking(bookingId, user?.id ?? "");
        setSubmitting(false);
        setBanner(res.ok ? { kind: "success", text: "Booking cancelled." } : { kind: "error", text: res.error });
        if (res.ok) loadWeek(anchorDate);
      } catch (err) {
        setSubmitting(false);
        setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
        setDateKeys([]);
        setWeekData({});
        setSummary({ reportedHours: 0, reservedHours: 0 });
        setCommittedHoursByWorkType({});
        setCustomWorkTypes([]);
        return;
      }
    },
    [loadWeek, user?.id, anchorDate]
  );

  // Bug fix (Bug 7): anchorDate was used inside but missing from dep array.
  const handleRevokeBlock = useCallback(
    async (dateKey, blockId) => {
      try {
        const res = await revokeBlock(dateKey, blockId);
        setBanner(res.ok ? { kind: "success", text: "Released block removed." } : { kind: "error", text: res.error });
        if (res.ok) loadWeek(anchorDate);
      } catch (err) {
        setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
        setDateKeys([]);
        setWeekData({});
        setSummary({ reportedHours: 0, reservedHours: 0 });
        setCommittedHoursByWorkType({});
        setCustomWorkTypes([]);
        return;
      }
    },
    [loadWeek, anchorDate]
  );

  const handleDateChange = useCallback((dateKey) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    setActiveDate(dateKey);
    setAnchorDate(new Date(year, month - 1, day));
    setMonthCursor({ year, month: month - 1 });
  }, []);

  const handleRelease = useCallback(
    async ({ dateKey, totalHours, shiftName, startTime, endTime, workType, maxHoursPerUser }) => {
      const [year, month, day] = dateKey.split("-").map(Number);
      setSubmitting(true);
      setBanner(null);
      try {
        const releaseResult = await releaseHours(
          dateKey,
          totalHours,
          totalHours,
          0,
          shiftName,
          startTime,
          endTime,
          workType,
          user?.id ?? "",
          maxHoursPerUser
        );
        setSubmitting(false);
        if (!releaseResult.ok) {
          setBanner({ kind: "error", text: releaseResult.error || "Failed to release capacity." });
          return;
        }
      } catch (err) {
        setSubmitting(false);
        setBanner({ kind: "error", text: "Backend unreachable — cleared local state." });
        setDateKeys([]);
        setWeekData({});
        setSummary({ reportedHours: 0, reservedHours: 0 });
        setCommittedHoursByWorkType({});
        setCustomWorkTypes([]);
        return;
      }
      setActiveDate(dateKey);
      setAnchorDate(new Date(year, month - 1, day));
      setMonthCursor({ year, month: month - 1 });
      setAdminProjectFilter(workType);
      await loadWeek(new Date(year, month - 1, day), true);
      setBanner({
        kind: "success",
        text: `Released ${totalHours}h of ${workType} capacity on ${formatDateHeading(dateKey)}.`,
      });
    },
    [loadWeek, user?.id, setAdminProjectFilter]
  );

  const handleToggleLayer = useCallback((layerKey) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerKey)) next.delete(layerKey);
      else next.add(layerKey);
      return next;
    });
  }, []);

  const handlePrevMonth = useCallback(() => {
    setMonthCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  }, []);

  const handleNextMonth = useCallback(() => {
    setMonthCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  }, []);

  const handleSelectDate = useCallback((date) => {
    setAnchorDate(date);
    setActiveDate(toDateKey(date));
    setMonthCursor({ year: date.getFullYear(), month: date.getMonth() });
  }, []);

  const handlePrevWeek = useCallback(() => {
    setAnchorDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() - 7);
      setMonthCursor({ year: next.getFullYear(), month: next.getMonth() });
      return next;
    });
  }, []);

  const handleNextWeek = useCallback(() => {
    setAnchorDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 7);
      setMonthCursor({ year: next.getFullYear(), month: next.getMonth() });
      return next;
    });
  }, []);

  const handleJumpToToday = useCallback(() => {
    setAnchorDate(todayDate);
    setActiveDate(todayKey);
    setMonthCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  }, []);

  const midWeekDate = dateKeys.length === 7 ? new Date(`${dateKeys[3]}T00:00:00`) : null;
  const weekHeading = midWeekDate ? formatMonthHeading(midWeekDate.getFullYear(), midWeekDate.getMonth()) : "";
  const rangeLabel = dateKeys.length === 7 ? `${formatDateHeading(dateKeys[0])} - ${formatDateHeading(dateKeys[6])}` : "";

  // Max hours ceiling for the admin adjust slider — generous enough to let
  // admins increase a block, not just decrease it. We allow up to 3× the
  // current total or 200h, whichever is lower.
  const adminAdjustMax = adminAdjustTarget
    ? Math.min(200, Math.max(adminAdjustTarget.currentHours * 3, adminAdjustTarget.currentHours + 50))
    : 200;

  // For the HourGauge: sum committed hours across all projects for the active date.
  const totalCommittedForActiveDate = Object.values(committedHoursByWorkType).reduce((a, b) => a + b, 0);

  return (
    <div className="board-page">
      <Header user={user} onLogout={logout} />

      <main className="board-main board-main--week">
        <aside className="board-rail">
          <MiniMonth
            year={monthCursor.year}
            month={monthCursor.month}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            selectedDate={anchorDate}
            onSelectDate={handleSelectDate}
            todayKey={todayKey}
          />
          <CalendarLayers visibleLayers={visibleLayers} onToggle={handleToggleLayer} />
          <TimeInsights
            reportedHours={summary.reportedHours}
            reservedHours={summary.reservedHours}
            releasedHours={dateKeys.reduce((sum, key) => sum + (weekData[key]?.summary.releasedHours ?? 0), 0)}
            rangeLabel={rangeLabel}
            daysInRange={7}
            projectCount={Math.max(1, grantedWorkTypes?.length ?? 1)}
            isAdmin={isAdmin}
            todayByProject={(grantedWorkTypes ?? []).map((workType) => ({
              workType,
              hours: committedHoursForWorkType(workType),
            }))}
          />
        </aside>

        <section className="board-week-area">
          <div className="week-nav">
            <div className="week-nav-controls">
              <button className="week-nav-arrow" onClick={handlePrevWeek} aria-label="Previous week">
                &lsaquo;
              </button>
              <button className="week-nav-arrow" onClick={handleNextWeek} aria-label="Next week">
                &rsaquo;
              </button>
              <span className="week-nav-heading">{weekHeading}</span>
            </div>
            <div className="week-nav-meta">
              <button className="btn btn--ghost week-nav-today" onClick={handleJumpToToday}>
                Today
              </button>
              <span className="week-nav-tz">Africa/Nairobi</span>
            </div>
          </div>

          {isAdmin && (
            <AdminReleasePanel
              onRelease={handleRelease}
              onSelectBlock={handleSelectBlock}
              onProjectFilterChange={handleAdminProjectFilterChange}
              disabled={loading || submitting}
              selectedDate={activeDate}
              onDateChange={handleDateChange}
              workTypeAccess={workTypeAccess}
              onGrantAccess={grantWorkTypeAccess}
              onRevokeAccess={revokeWorkTypeAccess}
              customWorkTypes={customWorkTypes}
              onAddWorkType={handleAddWorkType}
              highlightedProject={highlightedProject}
              dateBlocks={weekData[activeDate]?.blocks ?? []}
            />
          )}
          {banner && <div className={`banner banner--${banner.kind}`}>{banner.text}</div>}

          {/* ── Admin: adjust released block hours (increase OR decrease) ── */}
          {adminAdjustTarget && (
            <div className="claim-modal-overlay" role="dialog" aria-modal="true">
              <div className="claim-modal">
                <div className="claim-modal-title">Adjust released hours</div>
                <p className="claim-modal-sub">
                  Increase or decrease the released capacity for this block. You cannot reduce below the hours
                  already reserved ({adminAdjustTarget.reservedHours}h).
                </p>
                <div className="claim-modal-times">
                  <span>Current: {adminAdjustTarget.currentHours}h released</span>
                  <span>Reserved: {adminAdjustTarget.reservedHours}h</span>
                </div>
                <label className="claim-modal-slider">
                  <span>{adminAdjustTarget.targetHours}h</span>
                  <input
                    type="range"
                    min={Math.max(1, adminAdjustTarget.reservedHours)}
                    max={adminAdjustMax}
                    step="1"
                    value={adminAdjustTarget.targetHours}
                    onChange={(event) => handleAdminAdjustHoursChange(Number(event.target.value))}
                  />
                  <small>
                    Min {Math.max(1, adminAdjustTarget.reservedHours)}h (already reserved) · max {adminAdjustMax}h
                  </small>
                </label>
                <label className="admin-field" style={{ marginTop: 12 }}>
                  <span>Max/user</span>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={adminAdjustTarget.maxHoursPerUser}
                    onChange={(event) => handleAdminAdjustMaxHoursChange(Number(event.target.value))}
                  />
                </label>
                <div className="claim-modal-actions">
                  <button className="btn btn--ghost" onClick={() => setAdminAdjustTarget(null)}>
                    Cancel
                  </button>
                  <button className="btn btn--teal" disabled={submitting} onClick={handleAdminAdjustConfirm}>
                    {submitting ? "Updating..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── User: claim or adjust a block ── */}
          {!isAdmin && pendingBlock && (
            <div className="claim-modal-overlay" role="dialog" aria-modal="true">
              {cancelConfirmOpen ? (
                <div className="claim-modal">
                  <div className="claim-modal-title">Cancel reservation?</div>
                  <p className="claim-modal-sub">This will remove your current reservation for this block.</p>
                  <div className="claim-modal-actions">
                    <button className="btn btn--ghost" onClick={() => setCancelConfirmOpen(false)}>
                      Keep reservation
                    </button>
                    <button className="btn btn--teal" disabled={submitting} onClick={handleCancelReservation}>
                      {submitting ? "Cancelling..." : "Cancel reservation"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="claim-modal">
                  <div className="claim-modal-title">
                    {pendingClaim.mode === "adjust" ? "Adjust your reservation" : "Claim this block"}
                  </div>

                  {/* Project name badge */}
                  {pendingClaim.workType && (
                    <div className="claim-modal-project-badge">
                      <span className="claim-modal-project-dot" />
                      {pendingClaim.workType}
                    </div>
                  )}

                  <p className="claim-modal-sub">
                    {pendingClaim.mode === "adjust"
                      ? "Adjust your current reservation for this released block."
                      : "Choose how many hours to reserve from this released block."}
                  </p>
                  <div className="claim-modal-times">
                    <span>Start: {pendingBlock?.startTime ?? "08:00"}</span>
                    <span>End: {pendingBlock?.endTime ?? "16:00"}</span>
                  </div>
                  <label className="claim-modal-slider">
                    <span>{pendingClaim.hours}h</span>
                    <input
                      type="range"
                      min="0"
                      max={pendingClaim.maxHours}
                      step="1"
                      value={pendingClaim.hours}
                      onChange={(event) => handlePendingHoursChange(Number(event.target.value))}
                    />
                    <small>
                      {pendingClaim.mode === "adjust"
                        ? `Choose between 0h and ${pendingClaim.maxHours}h; setting it to 0 cancels the reservation.`
                        : `Up to ${pendingClaim.maxHours}h available`}
                    </small>
                  </label>
                  <div className="claim-modal-actions">
                    <button className="btn btn--ghost" onClick={handleClearPending}>
                      Cancel
                    </button>
                    <button className="btn btn--teal" disabled={overBudget || submitting} onClick={handleConfirm}>
                      {submitting
                        ? pendingClaim.mode === "adjust"
                          ? "Updating..."
                          : "Reserving..."
                        : pendingClaim.mode === "adjust"
                          ? isAdjustingToZero
                            ? "Cancel reservation"
                            : "Save"
                          : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="board-week-grid-wrap">
            {loading && Object.keys(weekData).length === 0 ? (
              <div className="ledger-loading">Loading the week...</div>
            ) : (
              <WeekGrid
                dateKeys={dateKeys}
                weekData={weekData}
                pendingClaim={pendingClaim}
                projectFilter={adminProjectFilter}
                onSelectBlock={handleSelectBlock}
                onCancelBooking={handleCancelBooking}
                visibleLayers={visibleLayers}
                todayKey={todayKey}
                isAdmin={isAdmin}
                onRevokeBlock={handleRevokeBlock}
                disabled={submitting}
              />
            )}
          </div>
        </section>

      </main>
    </div>
  );
}