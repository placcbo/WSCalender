// ---------------------------------------------------------------------------
// Mock backend.
//
// This version models released capacity as admin-created blocks. An admin
// releases a total number of hours for a day and chooses the block size used
// to split that capacity. Users claim hours from a block; the block remains
// available until its remaining hours reaches 0.
// ---------------------------------------------------------------------------

import {
  buildDateRange,
  buildWeekRange,
  toDateKey,
  BOOKING_STATUS,
  deriveBookingStatus,
  slotIndexToLabel,
  MAX_HOURS_PER_DAY,
} from "./schedule.js";

const NETWORK_DELAY_MS = 20;

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), NETWORK_DELAY_MS));
}

const today = new Date();

const releaseBlocks = new Map();
let bookings = [];
let nextBlockId = 100;
let nextBookingId = 100;

function blockEndSlot(block) {
  return block.startSlot + Math.max(1, Math.ceil(block.totalHours)) - 1;
}

function bookingHours(booking) {
  return booking.hours;
}

function getBlockBookings(blockId) {
  return bookings.filter((booking) => booking.blockId === blockId);
}

function reservedForBlock(blockId) {
  return getBlockBookings(blockId).reduce((sum, booking) => sum + booking.hours, 0);
}

function remainingForBlock(block) {
  return Math.max(0, block.totalHours - reservedForBlock(block.id));
}

function buildBlocks(totalHours, blockSize, startSlot) {
  const blocks = [];
  let remaining = totalHours;
  let cursor = startSlot;
  while (remaining > 0) {
    const hours = Math.min(blockSize, remaining);
    blocks.push({
      startSlot: cursor,
      totalHours: hours,
      blockSize,
    });
    remaining -= hours;
    cursor += Math.ceil(hours);
  }
  return blocks;
}

function addRelease(dateKey, totalHours, blockSize, startSlot = 0, shiftName = "Extraction Experienced", startTime = "08:00", endTime = "17:00", workType = "Extraction") {
  const current = releaseBlocks.get(dateKey) ?? [];
  const created = buildBlocks(totalHours, blockSize, startSlot).map((block) => ({
    id: `rb-${nextBlockId++}`,
    dateKey,
    ...block,
    shiftName,
    startTime,
    endTime,
    workType,
  }));
  releaseBlocks.set(dateKey, current.concat(created));
  return created;
}

function normalizeForUserBlocks(blocks) {
  if (!blocks.length) return [];
  const first = blocks[0];
  return [
    {
      ...first,
      totalHours: Math.min(8, first.totalHours),
      remainingHours: Math.min(8, Math.max(0, first.totalHours - reservedForBlock(first.id))),
      reservedHours: reservedForBlock(first.id),
      isFull: Math.max(0, first.totalHours - reservedForBlock(first.id)) <= 0,
      bookings: getBlockBookings(first.id).map((booking) => ({
        ...booking,
        isMine: false,
        status: BOOKING_STATUS.RESERVED,
      })),
    },
  ];
}

function serializeBlock(block, currentUserId) {
  const blockBookings = getBlockBookings(block.id);
  const reservedHours = blockBookings.reduce((sum, booking) => sum + booking.hours, 0);
  const remainingHours = Math.max(0, block.totalHours - reservedHours);
  const endSlot = blockEndSlot(block);
  return {
    ...block,
    label: `${slotIndexToLabel(block.startSlot)} start`,
    endSlot,
    reservedHours,
    remainingHours,
    isFull: remainingHours <= 0,
    myHours: blockBookings
      .filter((booking) => booking.userId === currentUserId)
      .reduce((sum, booking) => sum + booking.hours, 0),
    bookings: blockBookings.map((booking) => ({
      ...booking,
      isMine: booking.userId === currentUserId,
      status: deriveBookingStatus(booking.dateKey, endSlot),
    })),
  };
}

function summarizeDate(dateKey) {
  const blocks = releaseBlocks.get(dateKey) ?? [];
  const releasedHours = blocks.reduce((sum, block) => sum + block.totalHours, 0);
  const reservedHours = blocks.reduce((sum, block) => sum + reservedForBlock(block.id), 0);
  return {
    releasedHours,
    reservedHours,
    remainingHours: Math.max(0, releasedHours - reservedHours),
  };
}

export function fetchVisibleDateRange(days = 7) {
  return delay(buildDateRange(today, days));
}

export function fetchWeekRange(anchorDate) {
  return delay(buildWeekRange(anchorDate));
}

export function fetchDaySchedule(dateKey, currentUserId) {
  return delay((releaseBlocks.get(dateKey) ?? []).map((block) => serializeBlock(block, currentUserId)));
}

export function fetchWeekSchedule(dateKeys, currentUserId, isAdmin = false, userWorkType = null) {
  const byDate = {};
  dateKeys.forEach((dateKey) => {
    const blocks = (releaseBlocks.get(dateKey) ?? []).map((block) => serializeBlock(block, currentUserId));
    const filteredBlocks = (isAdmin || !userWorkType)
      ? blocks
      : blocks.filter((block) => block.workType === userWorkType);
    const visibleBlocks = isAdmin || !currentUserId || filteredBlocks.length === 0
      ? filteredBlocks
      : [
          {
            ...filteredBlocks[0],
            totalHours: Math.min(8, filteredBlocks[0].totalHours),
            remainingHours: Math.min(8, Math.max(0, filteredBlocks[0].remainingHours)),
            reservedHours: Math.min(8, filteredBlocks[0].reservedHours),
            isFull: Math.min(8, Math.max(0, filteredBlocks[0].remainingHours)) <= 0,
          },
        ];
    byDate[dateKey] = {
      blocks: visibleBlocks,
      summary: summarizeDate(dateKey),
    };
  });
  return delay(byDate);
}

export function fetchUserHoursForDay(dateKey, userId) {
  const total = bookings
    .filter((booking) => booking.dateKey === dateKey && booking.userId === userId)
    .reduce((sum, booking) => sum + bookingHours(booking), 0);
  return delay(total);
}

export function fetchUserHoursSummary(dateKeys, userId) {
  const dateSet = new Set(dateKeys);
  const userBookings = bookings.filter((booking) => booking.userId === userId && dateSet.has(booking.dateKey));
  let reportedHours = 0;
  let reservedHours = 0;
  userBookings.forEach((booking) => {
    const block = (releaseBlocks.get(booking.dateKey) ?? []).find((candidate) => candidate.id === booking.blockId);
    const endSlot = block ? blockEndSlot(block) : 0;
    reservedHours += booking.hours;
    if (deriveBookingStatus(booking.dateKey, endSlot) === BOOKING_STATUS.COMPLETED) {
      reportedHours += booking.hours;
    }
  });
  return delay({ reportedHours, reservedHours });
}

export function fetchAdminCapacitySummary(dateKeys) {
  const byDate = {};
  dateKeys.forEach((dateKey) => {
    byDate[dateKey] = summarizeDate(dateKey);
  });
  return delay(byDate);
}

export function releaseHours(dateKey, totalHours, blockSize, startSlot = 0, shiftName = "Extraction Experienced", startTime = "08:00", endTime = "17:00", workType = "Extraction") {
  const normalizedTotal = Math.max(1, Number(totalHours) || 1);
  const normalizedBlockSize = Math.max(1, Number(blockSize) || 1);
  const created = addRelease(dateKey, normalizedTotal, normalizedBlockSize, Number(startSlot) || 0, shiftName, startTime, endTime, workType);
  return delay({ ok: true, created });
}

export function adjustReleasedHours(dateKey, totalHours, blockSize = 8, startSlot = 0, shiftName = "Extraction Experienced", startTime = "08:00", endTime = "17:00", workType = "Extraction") {
  const existing = releaseBlocks.get(dateKey) ?? [];
  const normalizedTotal = Math.max(1, Number(totalHours) || 1);
  const normalizedBlockSize = Math.max(1, Number(blockSize) || 1);
  const existingReserved = existing.reduce((sum, block) => sum + reservedForBlock(block.id), 0);
  const nextTotal = Math.max(0, normalizedTotal);
  const delta = nextTotal - existing.reduce((sum, block) => sum + block.totalHours, 0);

  if (delta === 0) {
    return delay({ ok: true, created: [], updated: existing });
  }

  if (delta < 0) {
    const removable = Math.min(existingReserved, Math.abs(delta));
    if (removable > 0) {
      return delay({ ok: false, error: "Can't reduce released hours while there are active reservations." });
    }
  }

  const current = releaseBlocks.get(dateKey) ?? [];
  const currentTotal = current.reduce((sum, block) => sum + block.totalHours, 0);
  const newBlocks = [];
  if (currentTotal > 0) {
    current.forEach((block) => {
      newBlocks.push({ ...block, totalHours: block.totalHours });
    });
  }

  releaseBlocks.set(dateKey, []);
  const created = addRelease(dateKey, nextTotal, normalizedBlockSize, Number(startSlot) || 0, shiftName, startTime, endTime, workType);
  return delay({ ok: true, created, updated: created });
}

export function revokeBlock(dateKey, blockId) {
  if (reservedForBlock(blockId) > 0) {
    return delay({ ok: false, error: "This block already has reservations." });
  }
  const current = releaseBlocks.get(dateKey) ?? [];
  releaseBlocks.set(
    dateKey,
    current.filter((block) => block.id !== blockId)
  );
  return delay({ ok: true });
}

export function reserveHours(dateKey, blockId, hours, userId, maxHoursPerDay) {
  const block = (releaseBlocks.get(dateKey) ?? []).find((candidate) => candidate.id === blockId);
  if (!block) return delay({ ok: false, error: "Block not found." });

  const claimHours = Math.max(1, Number(hours) || 1);
  const remainingHours = remainingForBlock(block);
  if (claimHours > remainingHours) {
    return delay({ ok: false, error: `Only ${remainingHours}h remain in this block.` });
  }

  const existingForUser = bookings
    .filter((booking) => booking.dateKey === dateKey && booking.userId === userId)
    .reduce((sum, booking) => sum + bookingHours(booking), 0);
  if (existingForUser + claimHours > maxHoursPerDay) {
    return delay({
      ok: false,
      error: `That would put you at ${existingForUser + claimHours} hours; the max is ${maxHoursPerDay}/day.`,
    });
  }

  const created = {
    id: `b-${nextBookingId++}`,
    userId,
    dateKey,
    blockId,
    hours: claimHours,
  };
  bookings = bookings.concat(created);
  return delay({ ok: true, created });
}

export function updateBookingHours(bookingId, hours, userId, maxHoursPerDay = MAX_HOURS_PER_DAY) {
  const target = bookings.find((booking) => booking.id === bookingId);
  if (!target) return delay({ ok: false, error: "Booking not found." });
  if (target.userId !== userId) return delay({ ok: false, error: "Not your booking." });

  const normalizedHours = Number(hours);
  if (!Number.isFinite(normalizedHours) || normalizedHours < 0) {
    return delay({ ok: false, error: "Hours must be 0 or more." });
  }

  if (normalizedHours === 0) {
    bookings = bookings.filter((booking) => booking.id !== bookingId);
    return delay({ ok: true, cancelled: true, booking: target });
  }

  const block = (releaseBlocks.get(target.dateKey) ?? []).find((candidate) => candidate.id === target.blockId);
  const otherBookingsOnBlock = bookings.filter((booking) => booking.dateKey === target.dateKey && booking.blockId === target.blockId && booking.id !== bookingId);
  const otherUserHoursOnDay = bookings.filter((booking) => booking.dateKey === target.dateKey && booking.userId === userId && booking.id !== bookingId).reduce((sum, booking) => sum + bookingHours(booking), 0);
  const blockCapacityRemaining = block ? Math.max(0, block.totalHours - otherBookingsOnBlock.reduce((sum, booking) => sum + bookingHours(booking), 0)) : Number.POSITIVE_INFINITY;
  const dailyCapacityRemaining = Math.max(0, maxHoursPerDay - otherUserHoursOnDay);
  const maxAllowedHours = Math.min(blockCapacityRemaining, dailyCapacityRemaining);

  if (normalizedHours > maxAllowedHours) {
    return delay({ ok: false, error: `Only ${maxAllowedHours}h are available for this booking.` });
  }

  if (normalizedHours === target.hours) {
    return delay({ ok: true, updated: false, booking: target });
  }

  bookings = bookings.map((booking) => (booking.id === bookingId ? { ...booking, hours: normalizedHours } : booking));
  return delay({ ok: true, updated: true, booking: { ...target, hours: normalizedHours } });
}

export function cancelBooking(bookingId, userId) {
  const target = bookings.find((booking) => booking.id === bookingId);
  if (!target) return delay({ ok: false, error: "Booking not found." });
  if (target.userId !== userId) return delay({ ok: false, error: "Not your booking." });

  const block = (releaseBlocks.get(target.dateKey) ?? []).find((candidate) => candidate.id === target.blockId);
  const endSlot = block ? blockEndSlot(block) : 0;
  if (deriveBookingStatus(target.dateKey, endSlot) === BOOKING_STATUS.COMPLETED) {
    return delay({ ok: false, error: "Can't cancel a shift that already happened." });
  }

  bookings = bookings.filter((booking) => booking.id !== bookingId);
  return delay({ ok: true });
}

export { toDateKey };
