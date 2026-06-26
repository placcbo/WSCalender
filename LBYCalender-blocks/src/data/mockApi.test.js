import test from "node:test";
import assert from "node:assert/strict";
import { adjustReleasedHours, releaseHours, reserveHours, updateBookingHours } from "./mockApi.js";

test("zero-hour adjustment cancels the reservation", async () => {
  const dateKey = "2026-06-30";
  const releaseResult = await releaseHours(dateKey, 4, 4);
  const blockId = releaseResult.created[0].id;

  const reserveResult = await reserveHours(dateKey, blockId, 2, "user-1", 8);
  assert.equal(reserveResult.ok, true);

  const updateResult = await updateBookingHours(reserveResult.created.id, 0, "user-1");
  assert.equal(updateResult.ok, true);
  assert.equal(updateResult.cancelled, true);
});

test("adjustment can increase back up to available hours", async () => {
  const dateKey = "2026-06-30";
  const releaseResult = await releaseHours(dateKey, 8, 8);
  const blockId = releaseResult.created[0].id;

  const reserveResult = await reserveHours(dateKey, blockId, 8, "user-1", 8);
  assert.equal(reserveResult.ok, true);

  const reduceResult = await updateBookingHours(reserveResult.created.id, 7, "user-1");
  assert.equal(reduceResult.ok, true);

  const increaseResult = await updateBookingHours(reserveResult.created.id, 8, "user-1");
  assert.equal(increaseResult.ok, true);
  assert.equal(increaseResult.updated, true);
  assert.equal(increaseResult.booking.hours, 8);
});

test("admin can adjust released hours up and down", async () => {
  const dateKey = "2026-07-01";
  const initial = await adjustReleasedHours(dateKey, 6);
  assert.equal(initial.ok, true);
  assert.equal(initial.created.reduce((sum, block) => sum + block.totalHours, 0), 6);

  const increased = await adjustReleasedHours(dateKey, 10);
  assert.equal(increased.ok, true);
  assert.equal(increased.created.reduce((sum, block) => sum + block.totalHours, 0), 10);
});
