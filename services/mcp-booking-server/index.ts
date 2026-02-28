import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { ensureSchema, pool } from "../shared/db";

const BOOKING_REQUESTED_EVENT_TYPE =
	process.env.BOOKING_REQUESTED_EVENT_TYPE ?? "booking.requested";

async function createBooking(userId: string, slotId: string): Promise<string> {
	const bookingId = randomUUID();
	const createdAt = new Date().toISOString();

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query(
			`INSERT INTO bookings (id, user_id, slot_id, status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
			[bookingId, userId, slotId, "PENDING", null],
		);
		await client.query(
			`INSERT INTO outbox_events (event_type, event_key, payload)
       VALUES ($1, $2, $3::jsonb)`,
			[
				BOOKING_REQUESTED_EVENT_TYPE,
				bookingId,
				JSON.stringify({
					bookingId,
					userId,
					slotId,
					status: "PENDING",
					createdAt,
				}),
			],
		);
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}

	return JSON.stringify(
		{
			bookingId,
			userId,
			slotId,
			status: "PENDING",
			message: "Booking created in PostgreSQL. Use get_booking to check status after worker processing.",
		},
		null,
		2,
	);
}

async function getBooking(bookingId: string): Promise<string> {
	const result = await pool.query<{
		id: string;
		user_id: string;
		slot_id: string;
		status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
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
		throw new Error(`Booking not found: ${bookingId}`);
	}

	const row = result.rows[0];
	return JSON.stringify(
		{
			bookingId: row.id,
			userId: row.user_id,
			slotId: row.slot_id,
			status: row.status,
			reason: row.reason,
			createdAt: row.created_at.toISOString(),
			updatedAt: row.updated_at.toISOString(),
		},
		null,
		2,
	);
}

const server = new McpServer({
	name: "booking-system",
	version: "1.0.0",
});

server.registerTool(
	"create_booking",
	{
		description:
			"Create a new booking for a user and time slot. The booking is created as PENDING; a worker will confirm or reject it. Use get_booking to check the final status.",
		inputSchema: {
			userId: z.string().describe("User ID"),
			slotId: z.string().describe("Time slot ID (e.g. slot-2026-02-17T10:00:00Z)"),
		},
	},
	async ({ userId, slotId }) => {
		try {
			const text = await createBooking(userId, slotId);
			return { content: [{ type: "text" as const, text }] };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				content: [{ type: "text" as const, text: `Error: ${message}` }],
				isError: true,
			};
		}
	},
);

server.registerTool(
	"get_booking",
	{
		description:
			"Get the current status and details of a booking by its ID (e.g. PENDING, CONFIRMED, REJECTED).",
		inputSchema: {
			bookingId: z.string().describe("Booking ID returned from create_booking"),
		},
	},
	async ({ bookingId }) => {
		try {
			const text = await getBooking(bookingId);
			return { content: [{ type: "text" as const, text }] };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				content: [{ type: "text" as const, text: `Error: ${message}` }],
				isError: true,
			};
		}
	},
);

async function main(): Promise<void> {
	await ensureSchema();

	const transport = new StdioServerTransport();
	await server.connect(transport);
	// Log to stderr so stdio is free for MCP messages
	console.error("MCP booking server running on stdio (PostgreSQL mode)");

	const shutdown = async () => {
		await pool.end();
		process.exit(0);
	};

	process.on("SIGINT", () => {
		void shutdown();
	});
	process.on("SIGTERM", () => {
		void shutdown();
	});
}

main().catch((error) => {
	console.error("MCP server error:", error);
	process.exit(1);
});
