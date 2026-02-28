import process from "node:process";
import { cookies } from "next/headers";

const BOOKING_API_BASE_URL =
	process.env.BOOKING_API_BASE_URL ?? "http://localhost:4001";
const SESSION_COOKIE_NAME = "booking_user_id";

async function authenticatedUserId(): Promise<string | null> {
	const cookieStore = await cookies();
	const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim() ?? "";
	return userId.length > 0 ? userId : null;
}

function unauthorizedResponse(): Response {
	return Response.json(
		{ error: "Not authenticated. Set a user in the home page first." },
		{ status: 401 },
	);
}

export async function POST(request: Request): Promise<Response> {
	try {
		const userId = await authenticatedUserId();
		if (!userId) {
			return unauthorizedResponse();
		}

		const body = await request.text();
		const response = await fetch(`${BOOKING_API_BASE_URL}/bookings`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-booking-user-id": userId,
			},
			body,
		});

		const payload = await response.text();
		return new Response(payload, {
			status: response.status,
			headers: {
				"content-type": response.headers.get("content-type") ?? "application/json",
			},
		});
	} catch {
		return Response.json(
			{ error: "Booking API is unavailable." },
			{
				status: 502,
			},
			);
	}
}

export async function GET(): Promise<Response> {
	try {
		const userId = await authenticatedUserId();
		if (!userId) {
			return unauthorizedResponse();
		}

		const response = await fetch(
			`${BOOKING_API_BASE_URL}/bookings?userId=${encodeURIComponent(userId)}`,
			{
			method: "GET",
			cache: "no-store",
			headers: {
				"x-booking-user-id": userId,
			},
			},
		);

		const payload = await response.text();
		return new Response(payload, {
			status: response.status,
			headers: {
				"content-type": response.headers.get("content-type") ?? "application/json",
			},
		});
	} catch {
		return Response.json(
			{ error: "Booking API is unavailable." },
			{
				status: 502,
			},
		);
	}
}
