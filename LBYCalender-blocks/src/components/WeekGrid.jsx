import {
  BOOKING_STATUS,
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
          const dayInfo = weekData[dateKey] ?? { blocks: [], summary: { releasedHours: 0, reservedHours: 0 } };
          return (
            <div key={dateKey} className="week-grid-column">
              {Array.from({ length: maxRows }, (_, row) => (
                <div key={row} className="week-grid-cell" style={{ height: ROW_HEIGHT }} />
              ))}

              {dayInfo.summary.releasedHours > 0 && (
                <div className="week-grid-day-summary">
                  <strong>{isAdmin ? `${dayInfo.summary.releasedHours}h released` : `${dayInfo.summary.remainingHours}h open`}</strong>
                  <span>{dayInfo.summary.reservedHours}h reserved</span>
                </div>
              )}

              {dayInfo.blocks.map((block) => {
                const showOpen = visibleLayers.has("open") && block.remainingHours > 0;
                const showReserved = visibleLayers.has("reserved") && block.reservedHours > 0;
                if (!showOpen && !showReserved && !isAdmin) return null;

                const top = block.startSlot * ROW_HEIGHT;
                const height = Math.max(ROW_HEIGHT, block.totalHours * ROW_HEIGHT);
                const reservedPct = block.totalHours > 0 ? Math.min(100, (block.reservedHours / block.totalHours) * 100) : 0;
                const isSelected = pendingClaim?.blockId === block.id;
                const isNewOpportunity = block.remainingHours > 0;

                return (
                  <button
                    key={block.id}
                    className={[
                      "calendar-capacity-block",
                      isNewOpportunity ? "calendar-capacity-block--open" : "calendar-capacity-block--reserved",
                      block.isFull && "calendar-capacity-block--full",
                      isSelected && "calendar-capacity-block--selected",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ top, height }}
                    disabled={disabled || isAdmin || block.remainingHours <= 0}
                    onClick={() => onSelectBlock(dateKey, block)}
                  >
                    <span className="calendar-capacity-fill" style={{ height: `${reservedPct}%` }} />
                    <span className="calendar-capacity-content">
                      <strong>Hubdoc</strong>
                      <small>{block.totalHours}h total</small>
                      <em>{block.remainingHours}h available</em>
                    </span>
                  </button>
                );
              })}

              {dayInfo.blocks.flatMap((block) =>
                block.bookings.map((booking, index) => {
                  const isReserved = booking.status === BOOKING_STATUS.RESERVED;
                  if (isReserved && !visibleLayers.has("reserved")) return null;
                  if (!isReserved && !visibleLayers.has("completed")) return null;
                  const top = (block.startSlot + index * 0.45) * ROW_HEIGHT;
                  const height = Math.max(ROW_HEIGHT * 1.25, Math.min(booking.hours, block.totalHours) * ROW_HEIGHT);
                  return (
                    <div
                      key={booking.id}
                      className={[
                        "calendar-booking-block",
                        isReserved ? "calendar-booking-block--reserved" : "calendar-booking-block--completed",
                        booking.isMine && "calendar-booking-block--mine",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ top, height }}
                    >
                      <strong>{booking.isMine ? "Hubdoc" : "Reserved"}</strong>
                      <span>{booking.hours}h of Extraction Experienced</span>
                      {booking.isMine && isReserved && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCancelBooking(booking.id);
                          }}
                          aria-label="Cancel this booking"
                        >
                          x
                        </button>
                      )}
                    </div>
                  );
                })
              )}

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
