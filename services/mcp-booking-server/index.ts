import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import process from "node:process";

const BOOKING_API_BASE_URL =
	process.env.BOOKING_API_BASE_URL ?? "http://localhost:4001";

async function createBooking(userId: string, slotId: string): Promise<string> {
	const res = await fetch(`${BOOKING_API_BASE_URL}/bookings`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ userId, slotId }),
	});
	if (!res.ok) {
		const body = await res.text();
		let detail = body;
		try {
			const json = JSON.parse(body) as { error?: string; details?: string };
			detail = [json.error, json.details].filter(Boolean).join(" — ") || body;
		} catch {
			// use raw body
		}
		throw new Error(`Booking API error (${res.status}): ${detail}`);
	}
	const data = (await res.json()) as { bookingId: string; status: string };
	return JSON.stringify(
		{
			bookingId: data.bookingId,
			userId,
			slotId,
			status: data.status,
			message: "Booking created. Use get_booking to check status after the worker processes it.",
		},
		null,
		2,
	);
}

async function getBooking(bookingId: string): Promise<string> {
	const res = await fetch(`${BOOKING_API_BASE_URL}/bookings/${encodeURIComponent(bookingId)}`);
	if (!res.ok) {
		if (res.status === 404) {
			throw new Error(`Booking not found: ${bookingId}`);
		}
		const body = await res.text();
		let detail = body;
		try {
			const json = JSON.parse(body) as { error?: string; details?: string };
			detail = [json.error, json.details].filter(Boolean).join(" — ") || body;
		} catch {
			// use raw body
		}
		throw new Error(`Booking API error (${res.status}): ${detail}`);
	}
	const data = (await res.json()) as {
		bookingId: string;
		userId: string;
		slotId: string;
		status: string;
		reason: string | null;
		createdAt: string;
		updatedAt: string;
	};
	return JSON.stringify(data, null, 2);
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
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// Log to stderr so stdio is free for MCP messages
	console.error("MCP booking server running on stdio");
}

main().catch((error) => {
	console.error("MCP server error:", error);
	process.exit(1);
});
