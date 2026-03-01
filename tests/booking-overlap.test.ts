import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { ensureSchema, pool } from "../services/shared/db.ts";

let schemaReady: Promise<void> | undefined;
const TEST_DB_LOCK_ID = 918_273_645;

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

async function setupTest(): Promise<void> {
	schemaReady ??= ensureSchema();
	await schemaReady;
	await truncateAll();
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
	name: "allows non-overlapping bookings for the same room",
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		await withTestDbLock(async () => {
			await setupTest();
			await insertBooking("ocean-suite", "2026-03-21", "2026-03-25");
			await assert.doesNotReject(insertBooking("ocean-suite", "2026-03-25", "2026-03-28"));
		});
	},
});

Deno.test({
	name: "rejects a full overlap for the same room",
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		await withTestDbLock(async () => {
			await setupTest();
			await insertBooking("city-loft", "2026-03-21", "2026-03-25");

			await assert.rejects(
				insertBooking("city-loft", "2026-03-21", "2026-03-25"),
				(error: unknown) => typeof error === "object" && (error as { code?: string }).code === "23P01",
			);
		});
	},
});

Deno.test({
	name: "rejects partial overlap ranges",
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		await withTestDbLock(async () => {
			await setupTest();
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
	},
});
