import assert from "node:assert";
import { after, before, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { ensureSchema, pool } from "../services/shared/db";

async function truncateAll(): Promise<void> {
	await pool.query("TRUNCATE bookings, outbox_events RESTART IDENTITY");
}

async function insertBooking(roomId: string, checkIn: string, checkOut: string): Promise<void> {
	const bookingId = randomUUID();
	await pool.query(
		`INSERT INTO bookings (id, user_id, slot_id, status, reason, room_id, check_in, check_out)
     VALUES ($1, $2, $3, 'PENDING', NULL, $4, $5, $6)`,
		[bookingId, "user-1", `${roomId}:${checkIn}:${checkOut}:g2`, roomId, checkIn, checkOut],
	);
}

before(async () => {
	await ensureSchema();
});

beforeEach(async () => {
	await truncateAll();
});

after(async () => {
	await pool.end();
});

test("allows non-overlapping bookings for the same room", async () => {
	await insertBooking("ocean-suite", "2026-03-21", "2026-03-25");
	await assert.doesNotReject(insertBooking("ocean-suite", "2026-03-25", "2026-03-28"));
});

test("rejects a full overlap for the same room", async () => {
	await insertBooking("city-loft", "2026-03-21", "2026-03-25");

	await assert.rejects(
		insertBooking("city-loft", "2026-03-21", "2026-03-25"),
		(error: unknown) => typeof error === "object" && (error as { code?: string }).code === "23P01",
	);
});

test("rejects partial overlap ranges", async () => {
	await insertBooking("garden-retreat", "2026-03-21", "2026-03-25");

	await assert.rejects(
		insertBooking("garden-retreat", "2026-03-23", "2026-03-27"),
		(error: unknown) => typeof error === "object" && (error as { code?: string }).code === "23P01",
	);
	await assert.rejects(
		insertBooking("garden-retreat", "2026-03-19", "2026-03-22"),
		(error: unknown) => typeof error === "object" && (error as { code?: string }).code === "23P01",
	);
});
