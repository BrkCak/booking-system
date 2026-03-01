import { randomUUID } from "node:crypto";
import { ACTIVE_SLOT_CONFLICT_CONSTRAINT, pool } from "./db";
import { isOverlapDatabaseError, parseSlotId } from "./slot";

type BookingRow = {
	id: string;
	user_id: string;
	slot_id: string;
	status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
	reason: string | null;
	created_at: Date;
	updated_at: Date;
};

type PgError = {
	code?: string;
	constraint?: string;
};

export type BookingRecord = {
	bookingId: string;
	userId: string;
	slotId: string;
	status: "PENDING";
	createdAt: string;
	updatedAt: string;
	reason: string | null;
};

export class SlotAlreadyBookedError extends Error {
	constructor() {
		super("This room and time slot is already booked.");
	}
}

export function isActiveSlotConflict(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const value = error as PgError;
	return (
		(value.code === "23505" && value.constraint === ACTIVE_SLOT_CONFLICT_CONSTRAINT) ||
		isOverlapDatabaseError(error)
	);
}

export async function createBookingRecord(
	userId: string,
	slotId: string,
	requestedEventType: string,
): Promise<BookingRecord> {
	const parsedSlot = parseSlotId(slotId);
	if (!parsedSlot) {
		throw new Error(
			"Invalid slotId. Expected roomId:YYYY-MM-DD:YYYY-MM-DD:g<guests> with check-out after check-in.",
		);
	}

	const normalizedSlotId = slotId.trim();
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const insertResult = await client.query<BookingRow>(
			`INSERT INTO bookings (id, user_id, slot_id, room_id, check_in, check_out, status, reason)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NULL)
       RETURNING id, user_id, slot_id, status, reason, created_at, updated_at`,
			[
				randomUUID(),
				userId,
				normalizedSlotId,
				parsedSlot.roomId,
				parsedSlot.checkIn,
				parsedSlot.checkOut,
			],
		);
		const row = insertResult.rows[0];
		const booking: BookingRecord = {
			bookingId: row.id,
			userId: row.user_id,
			slotId: row.slot_id,
			status: "PENDING",
			reason: row.reason,
			createdAt: row.created_at.toISOString(),
			updatedAt: row.updated_at.toISOString(),
		};

		await client.query(
			`INSERT INTO outbox_events (event_type, event_key, payload)
       VALUES ($1, $2, $3::jsonb)`,
			[
				requestedEventType,
				booking.bookingId,
				JSON.stringify({
					bookingId: booking.bookingId,
					userId: booking.userId,
					slotId: booking.slotId,
					status: booking.status,
					createdAt: booking.createdAt,
				}),
			],
		);

		await client.query("COMMIT");
		return booking;
	} catch (error) {
		await client.query("ROLLBACK");
		if (isActiveSlotConflict(error)) {
			throw new SlotAlreadyBookedError();
		}
		throw error;
	} finally {
		client.release();
	}
}
