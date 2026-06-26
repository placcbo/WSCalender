# WorkBoard

A shift/hours reservation board. Admin releases a daily pool of hours, chooses
the block size users should see (for example 50h split into 8h blocks), and
users claim from those blocks up to an 8h/day cap.

## Run it

```bash
npm install
npm run dev
```

Open the printed localhost URL. Sign in by picking one of the mock accounts
(two regular users, one admin). The picker stands in for Google login for now.

## Current flow

- Admin selects a day, total released hours, block size, and start label.
- The app splits released hours into discrete claim blocks. Remainders become
  smaller final blocks, so 50h at 8h creates six 8h blocks and one 2h block.
- Users click a block and use the slider to claim 1h through the lesser of the
  block's remaining hours and their remaining 8h daily allowance.
- Partially claimed blocks stay visible with a reserved/free split.
- Admin sees released vs reserved hours per day and across the visible week.

## Backend swap notes

- `src/data/schedule.js` - pure date/time helpers for date keys, headings, and
  8am-start labels.
- `src/data/mockApi.js` - Promise-returning mock API functions shaped for a
  future Go backend:
  - `fetchVisibleDateRange(days)`
  - `fetchDaySchedule(dateKey, userId)`
  - `fetchUserHoursForDay(dateKey, userId)`
  - `releaseHours(dateKey, totalHours, blockSize, startSlot)`
  - `revokeBlock(dateKey, blockId)`
  - `reserveHours(dateKey, blockId, hours, userId, maxHoursPerDay)`
  - `cancelBooking(bookingId, userId)`
- `src/context/AuthContext.jsx` - mocked Google login. Replace the picker with
  Google Identity Services when the Go backend is ready.
