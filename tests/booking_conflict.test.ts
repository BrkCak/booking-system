import assert from "node:assert/strict";
import process from "node:process";
import { after, before, beforeEach, describe, it } from "node:test";
import { SlotAlreadyBookedError, createBookingRecord } from "../services/shared/bookings.ts";
import { ensureSchema, pool } from "../services/shared/db.ts";

const EVENT_TYPE = process.env.BOOKING_REQUESTED_EVENT_TYPE ?? "booking.requested";
const SLOT_ID = "room-101:2026-03-01:2026-03-02:g2";

before(async () => {
	await ensureSchema();
});

beforeEach(async () => {
	await pool.query("TRUNCATE outbox_events, bookings");
});

after(async () => {
	await pool.end();
});

describe(
	"booking slot uniqueness",
	{ concurrency: false },
	() => {
		it("creates a booking when the slot is free", async () => {
			const booking = await createBookingRecord("user-1", SLOT_ID, EVENT_TYPE);
			assert.equal(booking.slotId, SLOT_ID);
			assert.equal(booking.status, "PENDING");

			const count = await pool.query<{ count: string }>(
				"SELECT COUNT(*) FROM bookings WHERE slot_id = $1",
				[SLOT_ID],
			);
			assert.equal(Number.parseInt(count.rows[0].count, 10), 1);
		});

		it("rejects a second booking for the same active slot", async () => {
			await createBookingRecord("user-1", SLOT_ID, EVENT_TYPE);

			await assert.rejects(
				() => createBookingRecord("user-2", SLOT_ID, EVENT_TYPE),
				(error: unknown) => error instanceof SlotAlreadyBookedError,
			);

			const count = await pool.query<{ count: string }>(
				"SELECT COUNT(*) FROM bookings WHERE slot_id = $1",
				[SLOT_ID],
			);
			assert.equal(Number.parseInt(count.rows[0].count, 10), 1);
		});
	},
);
