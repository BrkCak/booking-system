import process from "node:process";

const BOOKING_API_BASE_URL =
	process.env.BOOKING_API_BASE_URL ?? "http://localhost:4001";

export async function POST(request: Request): Promise<Response> {
	try {
		const body = await request.text();
		const response = await fetch(`${BOOKING_API_BASE_URL}/bookings`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
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
