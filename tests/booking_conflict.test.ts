import assert from "node:assert/strict";
import process from "node:process";
import { SlotAlreadyBookedError, createBookingRecord } from "../services/shared/bookings.ts";
import { ensureSchema, pool } from "../services/shared/db.ts";

const EVENT_TYPE = process.env.BOOKING_REQUESTED_EVENT_TYPE ?? "booking.requested";
const SLOT_ID = "room-101:2026-03-01:2026-03-02:g2";
const TEST_DB_LOCK_ID = 918_273_645;
let schemaReady: Promise<void> | undefined;

async function setupTest(): Promise<void> {
	schemaReady ??= ensureSchema();
	await schemaReady;
	await pool.query("TRUNCATE outbox_events, bookings");
}

async function withTestDbLock(fn: () => Promise<void>): Promise<void> {
	const client = await pool.connect();
	try {
		await client.query("SELECT pg_advisory_lock($1)", [TEST_DB_LOCK_ID]);
		await fn();
	} finally {
		await client.query("SELECT pg_advisory_unlock($1)", [TEST_DB_LOCK_ID]);
		client.release();
	}
}

Deno.test({
	name: "booking slot uniqueness: creates a booking when the slot is free",
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		await withTestDbLock(async () => {
			await setupTest();
			const booking = await createBookingRecord("user-1", SLOT_ID, EVENT_TYPE);
			assert.equal(booking.slotId, SLOT_ID);
			assert.equal(booking.status, "PENDING");

			const count = await pool.query<{ count: string }>(
				"SELECT COUNT(*) FROM bookings WHERE slot_id = $1",
				[SLOT_ID],
			);
			assert.equal(Number.parseInt(count.rows[0].count, 10), 1);
		});
	},
});

Deno.test({
	name: "booking slot uniqueness: rejects a second booking for the same active slot",
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		await withTestDbLock(async () => {
			await setupTest();
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
});
