import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "../data/mockApi";
import { formatDateHeading, formatMonthHeading, MAX_HOURS_PER_DAY, toDateKey } from "../data/schedule";
import Header from "../components/Header";
import MiniMonth from "../components/MiniMonth";
import CalendarLayers from "../components/CalendarLayers";
import TimeInsights from "../components/TimeInsights";
import WeekGrid from "../components/WeekGrid";
import AdminReleasePanel from "../components/AdminReleasePanel";
import HourGauge from "../components/HourGauge";

const todayDate = new Date();
const todayKey = toDateKey(todayDate);

export default function BoardPage() {
  const { user, logout, extractionViewerEmails, addExtractionViewerEmail, removeExtractionViewerEmail } = useAuth();
  const isAdmin = user.role === "admin";
  const effectiveWorkType = user?.effectiveWorkType ?? user?.workType ?? null;

  const [anchorDate, setAnchorDate] = useState(todayDate);
  const [monthCursor, setMonthCursor] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [dateKeys, setDateKeys] = useState([]);
  const [weekData, setWeekData] = useState({});
  const [pendingClaim, setPendingClaim] = useState(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [adminAdjustTarget, setAdminAdjustTarget] = useState(null);
  const [activeDate, setActiveDate] = useState(todayKey);
  const [committedHours, setCommittedHours] = useState(0);
  const [summary, setSummary] = useState({ reportedHours: 0, reservedHours: 0 });
  const [visibleLayers, setVisibleLayers] = useState(new Set(["reserved", "completed", "open"]));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);

  const loadWeek = useCallback(async (weekAnchorDate = anchorDate, showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    const keys = await fetchWeekRange(weekAnchorDate);
    setDateKeys(keys);
    const data = await fetchWeekSchedule(keys, user?.id ?? "", isAdmin, effectiveWorkType);
    setWeekData(data);
    setSummary(await fetchUserHoursSummary(keys, user?.id ?? ""));
    setLoading(false);
  }, [anchorDate, user?.id, isAdmin, effectiveWorkType]);

  useEffect(() => {
    loadWeek(anchorDate, true);
  }, [anchorDate, loadWeek]);

  useEffect(() => {
    fetchUserHoursForDay(activeDate, user?.id ?? "").then(setCommittedHours);
  }, [activeDate, user?.id, weekData]);

  const pendingHours = pendingClaim?.dateKey === activeDate && pendingClaim?.mode !== "adjust" ? pendingClaim.hours : 0;
  const overBudget = pendingClaim?.mode !== "adjust" && committedHours + pendingHours > MAX_HOURS_PER_DAY;
  const isAdjustingToZero = pendingClaim?.mode === "adjust" && pendingClaim.hours === 0;
  const pendingBlock = useMemo(() => {
    if (!pendingClaim) return null;
    return weekData[pendingClaim.dateKey]?.blocks.find((block) => block.id === pendingClaim.blockId) ?? null;
  }, [pendingClaim, weekData]);

  const handleSelectBlock = useCallback(
    (dateKey, block) => {
      if (isAdmin) {
        setAdminAdjustTarget({
          dateKey,
          blockId: block.id,
          currentHours: block.totalHours,
          reservedHours: block.reservedHours ?? 0,
          targetHours: block.totalHours,
          shiftName: block.shiftName ?? "Extraction Experienced",
          startTime: block.startTime ?? "08:00",
          endTime: block.endTime ?? "17:00",
        });
        setActiveDate(dateKey);
        return;
      }
      setBanner(null);
      setActiveDate(dateKey);
      const existingHours = block.myHours ?? 0;
      if (existingHours > 0) {
        const availableForThisBooking = Math.max(existingHours, (block.remainingHours ?? 0) + existingHours);
        const dailyAllowance = Math.max(existingHours, MAX_HOURS_PER_DAY - Math.max(0, committedHours - existingHours));
        const maxHours = Math.min(availableForThisBooking, dailyAllowance);
        setPendingClaim({
          dateKey,
          blockId: block.id,
          hours: existingHours,
          maxHours,
          existingHours,
          mode: "adjust",
          bookingId: block.bookings?.find((booking) => booking.isMine)?.id ?? null,
        });
        return;
      }
      if (block.isFull) return;
      const committedForThisDay = dateKey === activeDate ? committedHours : 0;
      const maxHours = Math.min(block.remainingHours, MAX_HOURS_PER_DAY - committedForThisDay);
      if (maxHours <= 0) {
        setBanner({ kind: "error", text: `You're capped at ${MAX_HOURS_PER_DAY}h/day.` });
        return;
      }
      setPendingClaim({ dateKey, blockId: block.id, hours: Math.min(1, maxHours), maxHours, existingHours, mode: "reserve" });
    },
    [activeDate, committedHours, isAdmin]
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

  const handleAdminAdjustConfirm = useCallback(async () => {
    if (!adminAdjustTarget) return;
    setSubmitting(true);
    setBanner(null);
    const res = await adjustReleasedHours(
      adminAdjustTarget.dateKey,
      adminAdjustTarget.targetHours,
      adminAdjustTarget.targetHours,
      0,
      adminAdjustTarget.shiftName,
      adminAdjustTarget.startTime,
      adminAdjustTarget.endTime
    );
    setSubmitting(false);
    if (!res.ok) {
      setBanner({ kind: "error", text: res.error });
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
    const res = await updateBookingHours(pendingClaim.bookingId, 0, user?.id ?? "");
    setSubmitting(false);
    if (!res.ok) {
      setBanner({ kind: "error", text: res.error });
      return;
    }
    setBanner({ kind: "success", text: "Reservation cancelled." });
    setPendingClaim(null);
    loadWeek(new Date(pendingClaim.dateKey));
  }, [loadWeek, pendingClaim, user?.id]);

  const handleCancelBooking = useCallback(
    async (bookingId) => {
      setSubmitting(true);
      const res = await cancelBooking(bookingId, user?.id ?? "");
      setSubmitting(false);
      setBanner(res.ok ? { kind: "success", text: "Booking cancelled." } : { kind: "error", text: res.error });
      if (res.ok) loadWeek(anchorDate);
    },
    [loadWeek, user?.id]
  );

  const handleRevokeBlock = useCallback(
    async (dateKey, blockId) => {
      const res = await revokeBlock(dateKey, blockId);
      setBanner(res.ok ? { kind: "success", text: "Released block removed." } : { kind: "error", text: res.error });
      if (res.ok) loadWeek(anchorDate);
    },
    [loadWeek]
  );

  const handleDateChange = useCallback((dateKey) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    setActiveDate(dateKey);
    setAnchorDate(new Date(year, month - 1, day));
    setMonthCursor({ year, month: month - 1 });
  }, []);

  const handleRelease = useCallback(
    async ({ dateKey, totalHours, shiftName, startTime, endTime, mode = "release" }) => {
      const [year, month, day] = dateKey.split("-").map(Number);
      if (mode === "adjust") {
        await adjustReleasedHours(dateKey, totalHours, totalHours, 0, shiftName, startTime, endTime);
        setBanner({
          kind: "success",
          text: `Updated released capacity to ${totalHours}h on ${formatDateHeading(dateKey)}.`,
        });
      } else {
        await releaseHours(dateKey, totalHours, totalHours, 0, shiftName, startTime, endTime);
        setBanner({
          kind: "success",
          text: `Released ${totalHours}h capacity on ${formatDateHeading(dateKey)}.`,
        });
      }
      setActiveDate(dateKey);
      setAnchorDate(new Date(year, month - 1, day));
      setMonthCursor({ year, month: month - 1 });
      loadWeek(new Date(year, month - 1, day));
    },
    [loadWeek]
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
            isAdmin={isAdmin}
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
              disabled={loading || submitting}
              selectedDate={activeDate}
              onDateChange={handleDateChange}
              visibleEmails={extractionViewerEmails}
              onAddEmail={addExtractionViewerEmail}
              onRemoveEmail={removeExtractionViewerEmail}
              existingHours={weekData[activeDate]?.summary.releasedHours ?? 0}
              existingShiftName={weekData[activeDate]?.blocks?.[0]?.shiftName ?? ""}
              existingStartTime={weekData[activeDate]?.blocks?.[0]?.startTime ?? "08:00"}
              existingEndTime={weekData[activeDate]?.blocks?.[0]?.endTime ?? "17:00"}
            />
          )}
          {banner && <div className={`banner banner--${banner.kind}`}>{banner.text}</div>}

          {adminAdjustTarget && (
            <div className="claim-modal-overlay" role="dialog" aria-modal="true">
              <div className="claim-modal">
                <div className="claim-modal-title">Reduce released hours</div>
                <p className="claim-modal-sub">Lower the released capacity for this day. Existing reservations must be cleared before the total can be reduced.</p>
                <div className="claim-modal-times">
                  <span>Currently released: {adminAdjustTarget.currentHours}h</span>
                  <span>Reserved: {adminAdjustTarget.reservedHours}h</span>
                </div>
                <label className="claim-modal-slider">
                  <span>{adminAdjustTarget.targetHours}h</span>
                  <input
                    type="range"
                    min="1"
                    max={adminAdjustTarget.currentHours}
                    step="1"
                    value={adminAdjustTarget.targetHours}
                    onChange={(event) => handleAdminAdjustHoursChange(Number(event.target.value))}
                  />
                  <small>Choose a lower total for this released day.</small>
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
                  <div className="claim-modal-title">{pendingClaim.mode === "adjust" ? "Adjust your reservation" : "Claim this block"}</div>
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
