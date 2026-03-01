import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Buffer } from "node:buffer";
import process from "node:process";
import { ensureSchema, pool } from "../shared/db";
import {
	SlotAlreadyBookedError,
	createBookingRecord,
	isActiveSlotConflict,
} from "../shared/bookings";

type BookingStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

type BookingRequest = {
	userId: string;
	slotId: string;
};

type CancelBookingRequest = {
	reason?: string;
};

type RescheduleBookingRequest = {
	slotId: string;
};

type BookingRow = {
	id: string;
	user_id: string;
	slot_id: string;
	status: BookingStatus;
	reason: string | null;
	created_at: Date;
	updated_at: Date;
};

const PORT = Number(process.env.BOOKING_API_PORT ?? 4001);
const BOOKING_REQUESTED_EVENT_TYPE =
	process.env.BOOKING_REQUESTED_EVENT_TYPE ?? "booking.requested";

function actorUserIdFromRequest(req: IncomingMessage): string | null {
	const header = req.headers["x-booking-user-id"];
	if (typeof header !== "string") {
		return null;
	}
	const value = header.trim();
	return value.length > 0 ? value : null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];

	for await (const chunk of req) {
		chunks.push(Buffer.from(chunk));
	}

	if (chunks.length === 0) {
		return null;
	}

	const raw = Buffer.concat(chunks).toString("utf8");
	return JSON.parse(raw);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
	res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}

function isBookingRequest(input: unknown): input is BookingRequest {
	if (!input || typeof input !== "object") {
		return false;
	}

	const value = input as Partial<BookingRequest>;
	return (
		typeof value.userId === "string" &&
		value.userId.trim().length > 0 &&
		typeof value.slotId === "string" &&
		value.slotId.trim().length > 0
	);
}

function isCancelBookingRequest(input: unknown): input is CancelBookingRequest {
	if (input === null) {
		return true;
	}
	if (!input || typeof input !== "object") {
		return false;
	}

	const value = input as Partial<CancelBookingRequest>;
	return value.reason === undefined || typeof value.reason === "string";
}

function isRescheduleBookingRequest(input: unknown): input is RescheduleBookingRequest {
	if (!input || typeof input !== "object") {
		return false;
	}

	const value = input as Partial<RescheduleBookingRequest>;
	return typeof value.slotId === "string" && value.slotId.trim().length > 0;
}

function toBookingResponse(row: BookingRow): {
	bookingId: string;
	userId: string;
	slotId: string;
	status: BookingStatus;
	reason: string | null;
	createdAt: string;
	updatedAt: string;
} {
	return {
		bookingId: row.id,
		userId: row.user_id,
		slotId: row.slot_id,
		status: row.status,
		reason: row.reason,
		createdAt: row.created_at.toISOString(),
		updatedAt: row.updated_at.toISOString(),
	};
}

async function handleCreateBooking(
	body: BookingRequest,
	res: ServerResponse,
): Promise<void> {
	const slot = parseSlotId(body.slotId);
	if (!slot) {
		sendJson(res, 400, {
			error: "Invalid slotId. Expected roomId:YYYY-MM-DD:YYYY-MM-DD:g<guests> with check-out after check-in.",
		});
		return;
	}

	try {
		const booking = await createBookingRecord(body.userId, body.slotId, BOOKING_REQUESTED_EVENT_TYPE);
		sendJson(res, 201, booking);
	} catch (error) {
		if (error instanceof SlotAlreadyBookedError) {
			sendJson(res, 409, { error: error.message });
			return;
		}
		sendJson(res, 500, {
			error: "Could not create booking.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function handleGetBookingForActor(
	req: IncomingMessage,
	pathname: string,
	res: ServerResponse,
): Promise<void> {
	const actorUserId = actorUserIdFromRequest(req);
	if (!actorUserId) {
		sendJson(res, 401, { error: "Missing authenticated user." });
		return;
	}

	const match = pathname.match(/^\/bookings\/([a-zA-Z0-9-]+)$/);
	if (!match) {
		sendJson(res, 404, { error: "Not found" });
		return;
	}

	const bookingId = match[1];
	try {
		const result = await pool.query<BookingRow>(
			`SELECT id, user_id, slot_id, status, reason, created_at, updated_at
       FROM bookings
       WHERE id = $1`,
			[bookingId],
		);

		if (result.rowCount === 0) {
			sendJson(res, 404, { error: "Booking not found" });
			return;
		}

		const row = result.rows[0];
		if (row.user_id !== actorUserId) {
			sendJson(res, 403, { error: "Forbidden for this booking." });
			return;
		}

		sendJson(res, 200, toBookingResponse(row));
	} catch (error) {
		sendJson(res, 500, {
			error: "Could not fetch booking.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function handleListBookings(req: IncomingMessage, res: ServerResponse): Promise<void> {
	const userId = actorUserIdFromRequest(req);
	if (!userId) {
		sendJson(res, 401, { error: "Missing authenticated user." });
		return;
	}

	try {
		const result = await pool.query<BookingRow>(
			`SELECT id, user_id, slot_id, status, reason, created_at, updated_at
       FROM bookings
       WHERE user_id = $1
       ORDER BY created_at DESC`,
			[userId],
		);
		sendJson(res, 200, {
			userId,
			bookings: result.rows.map((row) => toBookingResponse(row)),
		});
	} catch (error) {
		sendJson(res, 500, {
			error: "Could not list bookings.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function handleCancelBooking(
	req: IncomingMessage,
	pathname: string,
	res: ServerResponse,
): Promise<void> {
	const actorUserId = actorUserIdFromRequest(req);
	if (!actorUserId) {
		sendJson(res, 401, { error: "Missing authenticated user." });
		return;
	}

	const match = pathname.match(/^\/bookings\/([a-zA-Z0-9-]+)\/cancel$/);
	if (!match) {
		sendJson(res, 404, { error: "Not found" });
		return;
	}

	const bookingId = match[1];
	try {
		const body = await readJsonBody(req);
		if (!isCancelBookingRequest(body)) {
			sendJson(res, 400, {
				error: "Invalid payload. Expected { reason?: string }.",
			});
			return;
		}

		const reason = body?.reason?.trim() ? body.reason.trim() : "Cancelled by user";
		const updateResult = await pool.query<BookingRow>(
			`UPDATE bookings
       SET status = 'CANCELLED', reason = $2, updated_at = NOW()
       WHERE id = $1
         AND user_id = $3
         AND status IN ('PENDING', 'CONFIRMED')
       RETURNING id, user_id, slot_id, status, reason, created_at, updated_at`,
			[bookingId, reason, actorUserId],
		);

		if (updateResult.rowCount && updateResult.rowCount > 0) {
			sendJson(res, 200, toBookingResponse(updateResult.rows[0]));
			return;
		}

		const existing = await pool.query<BookingRow>(
			`SELECT id, user_id, slot_id, status, reason, created_at, updated_at
       FROM bookings
       WHERE id = $1`,
			[bookingId],
		);
		if (existing.rowCount === 0) {
			sendJson(res, 404, { error: "Booking not found" });
			return;
		}

		const row = existing.rows[0];
		if (row.user_id !== actorUserId) {
			sendJson(res, 403, { error: "Forbidden for this booking." });
			return;
		}

		if (row.status === "CANCELLED") {
			sendJson(res, 200, toBookingResponse(row));
			return;
		}

		sendJson(res, 409, {
			error: `Booking cannot be cancelled from status ${row.status}.`,
		});
	} catch (error) {
		sendJson(res, 500, {
			error: "Could not cancel booking.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function handleRescheduleBooking(
	req: IncomingMessage,
	pathname: string,
	res: ServerResponse,
): Promise<void> {
	const actorUserId = actorUserIdFromRequest(req);
	if (!actorUserId) {
		sendJson(res, 401, { error: "Missing authenticated user." });
		return;
	}

	const match = pathname.match(/^\/bookings\/([a-zA-Z0-9-]+)\/reschedule$/);
	if (!match) {
		sendJson(res, 404, { error: "Not found" });
		return;
	}

	const bookingId = match[1];
	try {
		const body = await readJsonBody(req);
		if (!isRescheduleBookingRequest(body)) {
			sendJson(res, 400, {
				error: "Invalid payload. Expected { slotId: string }.",
			});
			return;
		}

		const slot = parseSlotId(body.slotId);
		if (!slot) {
			sendJson(res, 400, {
				error: "Invalid slotId. Expected roomId:YYYY-MM-DD:YYYY-MM-DD:g<guests> with check-out after check-in.",
			});
			return;
		}

		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const current = await client.query<BookingRow>(
				`SELECT id, user_id, slot_id, status, reason, created_at, updated_at
         FROM bookings
         WHERE id = $1
         FOR UPDATE`,
				[bookingId],
			);
			if (current.rowCount === 0) {
				await client.query("ROLLBACK");
				sendJson(res, 404, { error: "Booking not found" });
				return;
			}

			const currentRow = current.rows[0];
			if (currentRow.user_id !== actorUserId) {
				await client.query("ROLLBACK");
				sendJson(res, 403, { error: "Forbidden for this booking." });
				return;
			}

			if (currentRow.status === "CANCELLED") {
				await client.query("ROLLBACK");
				sendJson(res, 409, {
					error: "Cancelled bookings cannot be rescheduled.",
				});
				return;
			}

			const overlap = await client.query(
				`SELECT 1 FROM bookings
         WHERE room_id = $1
           AND id <> $4
           AND status IN ('PENDING', 'CONFIRMED')
           AND daterange(check_in, check_out, '[)') && daterange($2::date, $3::date, '[)')
         LIMIT 1
         FOR KEY SHARE`,
				[slot.roomId, slot.checkIn, slot.checkOut, bookingId],
			);

			if (overlap.rowCount && overlap.rowCount > 0) {
				await client.query("ROLLBACK");
				sendJson(res, 409, {
					error: "Requested dates overlap an existing booking for this room.",
				});
				return;
			}

			const updateResult = await client.query<BookingRow>(
				`UPDATE bookings
         SET slot_id = $2,
             room_id = $3,
             check_in = $4,
             check_out = $5,
             status = 'PENDING',
             reason = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, user_id, slot_id, status, reason, created_at, updated_at`,
				[bookingId, body.slotId.trim(), slot.roomId, slot.checkIn, slot.checkOut],
			);
			const updated = updateResult.rows[0];

			await client.query(
				`INSERT INTO outbox_events (event_type, event_key, payload)
         VALUES ($1, $2, $3::jsonb)`,
				[
					BOOKING_REQUESTED_EVENT_TYPE,
					updated.id,
					JSON.stringify({
						bookingId: updated.id,
						userId: updated.user_id,
						slotId: updated.slot_id,
						status: "PENDING",
						createdAt: new Date().toISOString(),
					}),
				],
			);
			await client.query("COMMIT");
			sendJson(res, 200, toBookingResponse(updated));
		} catch (error) {
			await client.query("ROLLBACK");
			if (isActiveSlotConflict(error)) {
				sendJson(res, 409, { error: "This room and time slot is already booked." });
				return;
			}
			throw error;
		} finally {
			client.release();
		}
	} catch (error) {
		if (isActiveSlotConflict(error)) {
			sendJson(res, 409, { error: "This room and time slot is already booked." });
			return;
		}
		sendJson(res, 500, {
			error: "Could not reschedule booking.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function start(): Promise<void> {
	await ensureSchema();

	const server = createServer(async (req, res) => {
		const method = req.method ?? "GET";
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const pathname = url.pathname;

		if (method === "GET" && pathname === "/health") {
			sendJson(res, 200, { status: "ok" });
			return;
		}

		if (method === "POST" && pathname === "/bookings") {
			const actorUserId = actorUserIdFromRequest(req);
			if (!actorUserId) {
				sendJson(res, 401, { error: "Missing authenticated user." });
				return;
			}

			try {
				const body = await readJsonBody(req);
				if (!isBookingRequest(body)) {
					sendJson(res, 400, {
						error: "Invalid payload. Expected { userId: string, slotId: string }.",
					});
					return;
				}

				if (body.userId !== actorUserId) {
					sendJson(res, 403, {
						error: "Payload userId does not match authenticated user.",
					});
					return;
				}

				await handleCreateBooking(body, res);
			} catch {
				sendJson(res, 400, {
					error: "Invalid JSON payload.",
				});
			}
			return;
		}

		if (method === "GET" && pathname === "/bookings") {
			await handleListBookings(req, res);
			return;
		}

		if ((method === "POST" || method === "PATCH") && pathname.endsWith("/cancel")) {
			await handleCancelBooking(req, pathname, res);
			return;
		}

		if ((method === "POST" || method === "PATCH") && pathname.endsWith("/reschedule")) {
			await handleRescheduleBooking(req, pathname, res);
			return;
		}

		if (method === "GET" && pathname.startsWith("/bookings/")) {
			await handleGetBookingForActor(req, pathname, res);
			return;
		}

		sendJson(res, 404, { error: "Not found" });
	});

	server.listen(PORT, () => {
		console.log(`booking-api listening on http://localhost:${PORT} (outbox mode)`);
	});

	const shutdown = async () => {
		server.close();
		await pool.end();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

start().catch((error) => {
	console.error("Failed to start booking-api", error);
	process.exit(1);
});
