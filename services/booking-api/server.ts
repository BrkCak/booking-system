import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Kafka, Producer } from "kafkajs";
import { ensureSchema, pool } from "../shared/db";

type BookingRequest = {
	userId: string;
	slotId: string;
};

type BookingCreated = {
	bookingId: string;
	userId: string;
	slotId: string;
	status: "PENDING";
	createdAt: string;
	updatedAt: string;
	reason: string | null;
};

const PORT = Number(process.env.BOOKING_API_PORT ?? 4001);
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const BOOKING_REQUESTED_TOPIC =
	process.env.BOOKING_REQUESTED_TOPIC ?? "booking.requested";

const kafka = new Kafka({
	clientId: "booking-api",
	brokers: KAFKA_BROKERS,
});

const producer: Producer = kafka.producer();

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
	return typeof value.userId === "string" && typeof value.slotId === "string";
}

async function handleCreateBooking(
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	try {
		const body = await readJsonBody(req);
		if (!isBookingRequest(body)) {
			sendJson(res, 400, {
				error: "Invalid payload. Expected { userId: string, slotId: string }.",
			});
			return;
		}

		const bookingId = randomUUID();
		const booking: BookingCreated = {
			bookingId,
			userId: body.userId,
			slotId: body.slotId,
			status: "PENDING",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			reason: null,
		};

		await pool.query(
			`INSERT INTO bookings (id, user_id, slot_id, status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
			[booking.bookingId, booking.userId, booking.slotId, booking.status, booking.reason],
		);

		await producer.send({
			topic: BOOKING_REQUESTED_TOPIC,
			messages: [
				{
					key: booking.bookingId,
					value: JSON.stringify(booking),
				},
			],
		});

		sendJson(res, 201, booking);
	} catch (error) {
		sendJson(res, 500, {
			error: "Could not create booking.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function handleGetBooking(pathname: string, res: ServerResponse): Promise<void> {
	const match = pathname.match(/^\/bookings\/([a-zA-Z0-9-]+)$/);
	if (!match) {
		sendJson(res, 404, { error: "Not found" });
		return;
	}

	const bookingId = match[1];
	try {
		const result = await pool.query<{
			id: string;
			user_id: string;
			slot_id: string;
			status: "PENDING" | "CONFIRMED" | "REJECTED";
			reason: string | null;
			created_at: Date;
			updated_at: Date;
		}>(
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
		sendJson(res, 200, {
			bookingId: row.id,
			userId: row.user_id,
			slotId: row.slot_id,
			status: row.status,
			reason: row.reason,
			createdAt: row.created_at.toISOString(),
			updatedAt: row.updated_at.toISOString(),
		});
	} catch (error) {
		sendJson(res, 500, {
			error: "Could not fetch booking.",
			details: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

async function start(): Promise<void> {
	await ensureSchema();
	await producer.connect();

	const server = createServer(async (req, res) => {
		const method = req.method ?? "GET";
		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
		const pathname = url.pathname;

		if (method === "GET" && pathname === "/health") {
			sendJson(res, 200, { status: "ok" });
			return;
		}

		if (method === "POST" && pathname === "/bookings") {
			await handleCreateBooking(req, res);
			return;
		}

		if (method === "GET" && pathname.startsWith("/bookings/")) {
			await handleGetBooking(pathname, res);
			return;
		}

		sendJson(res, 404, { error: "Not found" });
	});

	server.listen(PORT, () => {
		console.log(
			`booking-api listening on http://localhost:${PORT} (topic: ${BOOKING_REQUESTED_TOPIC})`,
		);
	});

	const shutdown = async () => {
		server.close();
		await producer.disconnect();
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
