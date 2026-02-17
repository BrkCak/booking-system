import { Pool } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgres://booking:booking@localhost:5432/booking";

export const pool = new Pool({
	connectionString: DATABASE_URL,
});

let schemaReady = false;

export async function ensureSchema(): Promise<void> {
	if (schemaReady) {
		return;
	}

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT pg_advisory_lock(424242)");
		await client.query(`
			CREATE TABLE IF NOT EXISTS bookings (
				id UUID PRIMARY KEY,
				user_id TEXT NOT NULL,
				slot_id TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED')),
				reason TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
		await client.query("SELECT pg_advisory_unlock(424242)");
		await client.query("COMMIT");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}

	schemaReady = true;
}
