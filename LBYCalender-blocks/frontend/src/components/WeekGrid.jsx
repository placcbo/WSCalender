import {
  DAY_START_HOUR,
  SLOTS_PER_DAY,
  formatDayNumber,
  formatWeekdayShort,
  slotIndexToLabel,
} from "../data/schedule";

const ROW_HEIGHT = 34;

export default function WeekGrid({
  dateKeys,
  weekData,
  pendingClaim,
  projectFilter,
  onSelectBlock,
  onCancelBooking,
  visibleLayers,
  todayKey,
  isAdmin,
  onRevokeBlock,
  disabled,
}) {
  const maxRows = Math.max(
    SLOTS_PER_DAY,
    ...dateKeys.flatMap((dateKey) =>
      (weekData[dateKey]?.blocks ?? []).map((block) => block.startSlot + Math.ceil(block.totalHours))
    )
  );

  return (
    <div className="week-grid week-grid--released" style={{ "--ledger-rows": maxRows }}>
      <div className="week-grid-corner" />
      <div className="week-grid-day-headers">
        {dateKeys.map((dateKey) => (
          <div key={dateKey} className={`week-grid-day-header ${dateKey === todayKey ? "is-today" : ""}`}>
            <span className="week-grid-weekday">{formatWeekdayShort(dateKey)}</span>
            <span className="week-grid-daynum">{formatDayNumber(dateKey)}</span>
          </div>
        ))}
      </div>

      <div className="week-grid-hour-rail">
        {Array.from({ length: maxRows }, (_, row) => (
          <div key={row} className="week-grid-hour-label" style={{ height: ROW_HEIGHT }}>
            {slotIndexToLabel(row % SLOTS_PER_DAY)}
          </div>
        ))}
      </div>

      <div className="week-grid-columns">
        {dateKeys.map((dateKey) => {
          const dayInfo = weekData[dateKey] ?? { blocks: [], summary: { releasedHours: 0, reservedHours: 0, remainingHours: 0 } };
        const filteredBlocks = projectFilter ? dayInfo.blocks.filter((block) => block.workType === projectFilter) : dayInfo.blocks;
        const daySummary = projectFilter
          ? filteredBlocks.reduce(
              (summary, block) => {
                summary.releasedHours += block.totalHours;
                summary.reservedHours += block.reservedHours ?? 0;
                summary.remainingHours += Math.max(0, block.remainingHours ?? 0);
                return summary;
              },
              { releasedHours: 0, reservedHours: 0, remainingHours: 0 }
            )
          : dayInfo.summary;
          return (
            <div key={dateKey} className="week-grid-column">
              {Array.from({ length: maxRows }, (_, row) => (
                <div key={row} className="week-grid-cell" style={{ height: ROW_HEIGHT }} />
              ))}

              {(isAdmin || filteredBlocks.length > 0) && (
                <div className="week-grid-day-summary">
                  <strong>{isAdmin ? `${daySummary.releasedHours}h released` : "8h block"}</strong>
                  <span>
                    {isAdmin ? `${daySummary.reservedHours}h reserved • ${daySummary.remainingHours}h remaining` : `${dayInfo.summary.reservedHours}h reserved`}
                  </span>
                </div>
              )}

              {filteredBlocks.map((block) => {
                const showOpen = visibleLayers.has("open") && block.remainingHours > 0;
                const showReserved = visibleLayers.has("reserved") && block.reservedHours > 0;
                if (!showOpen && !showReserved && !isAdmin) return null;

                const hasMyReservation = !isAdmin && block.myHours > 0;
                const isUserReserved = !isAdmin && (hasMyReservation || block.remainingHours <= 0);

                const startHour = Number.parseInt((block.startTime ?? "08:00").split(":")[0], 10);
                const top = Math.max(0, (startHour - DAY_START_HOUR) * ROW_HEIGHT);
                const height = Math.max(ROW_HEIGHT, Math.max(1, Number(block.totalHours) || 1) * ROW_HEIGHT);
                const reservedPct = block.totalHours > 0 ? Math.min(100, ((isAdmin ? block.reservedHours : block.myHours) / block.totalHours) * 100) : 0;
                const isSelected = pendingClaim?.blockId === block.id;
                const isNewOpportunity = block.remainingHours > 0;

                return (
                  <button
                    key={block.id}
                    className={[
                      "calendar-capacity-block",
                      isAdmin && "calendar-capacity-block--admin",
                      hasMyReservation ? "calendar-capacity-block--mine" : isNewOpportunity ? "calendar-capacity-block--open" : "calendar-capacity-block--reserved",
                      block.isFull && "calendar-capacity-block--full",
                      isSelected && "calendar-capacity-block--selected",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ top, height }}
                    data-work-type={block.workType}
                    disabled={disabled || (!isAdmin && (!block.myHours && block.remainingHours <= 0))}
                    onClick={() => onSelectBlock(dateKey, block)}
                  >
                    <span className="calendar-capacity-fill" style={{ height: `${reservedPct}%` }} />
                    <span className="calendar-capacity-content">
                      <span className="calendar-capacity-title-row">
                        <span className="calendar-capacity-title">{block.shiftName || "Hubdoc"}</span>
                        {block.workType && <span className="calendar-capacity-project-chip">{block.workType}</span>}
                      </span>
                      {isAdmin && <span className="calendar-capacity-admin-hint">Tap to reduce</span>}
                      <span className="calendar-capacity-stack">
                        <span className="calendar-capacity-claimed">
                          {isAdmin ? `${block.totalHours}h total` : `${block.myHours || 0}h claimed`}
                        </span>
                        {!isAdmin ? null : (
                          <span className="calendar-capacity-remaining">{block.remainingHours}h available</span>
                        )}
                      </span>
                      {!isAdmin && <span className="calendar-capacity-times">{block.startTime} - {block.endTime}</span>}
                    </span>
                    {!isAdmin && <span className="calendar-capacity-edge" aria-hidden="true">⋯</span>}
                  </button>
                );
              })}

              {isAdmin &&
                dayInfo.blocks.map((block) =>
                  block.reservedHours === 0 ? (
                    <button
                      key={`remove-${block.id}`}
                      className="calendar-remove-block"
                      style={{ top: block.startSlot * ROW_HEIGHT + 4 }}
                      onClick={() => onRevokeBlock(dateKey, block.id)}
                    >
                      Remove
                    </button>
                  ) : null
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
