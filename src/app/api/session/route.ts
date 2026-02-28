import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "booking_user_id";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function isValidUserId(value: unknown): value is string {
	return typeof value === "string" && /^[a-zA-Z0-9_-]{2,64}$/.test(value);
}

export async function GET(): Promise<Response> {
	const cookieStore = await cookies();
	const userId = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
	return Response.json({ userId });
}

export async function POST(request: Request): Promise<Response> {
	try {
		const payload = (await request.json()) as { userId?: unknown };
		if (!isValidUserId(payload.userId)) {
			return Response.json(
				{
					error:
						"Invalid userId. Use 2-64 chars with letters, digits, _ or -.",
				},
				{ status: 400 },
			);
		}

		const cookieStore = await cookies();
		cookieStore.set(SESSION_COOKIE_NAME, payload.userId, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			path: "/",
			maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
		});

		return Response.json({ userId: payload.userId });
	} catch {
		return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
	}
}

export async function DELETE(): Promise<Response> {
	const cookieStore = await cookies();
	cookieStore.delete(SESSION_COOKIE_NAME);
	return Response.json({ userId: null });
}
