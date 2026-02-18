import { Pool } from "pg";
import process from "node:process";

const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgres://booking:booking@localhost:5432/booking";

export const pool = new Pool({
	connectionString: DATABASE_URL,
});

let schemaReady = false;

function isConcurrentCreateTableRace(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const value = error as { code?: string; constraint?: string };
	return value.code === "23505" && value.constraint === "pg_type_typname_nsp_index";
}

async function runDdlSafely(client: PoolClientLike, sql: string): Promise<void> {
	try {
		await client.query(sql);
	} catch (error) {
		if (isConcurrentCreateTableRace(error)) {
			return;
		}
		throw error;
	}
}

type PoolClientLike = {
	query: (sql: string) => Promise<unknown>;
};

export async function ensureSchema(): Promise<void> {
	if (schemaReady) {
		return;
	}

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT pg_advisory_lock(424242)");
		await runDdlSafely(client, `
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
		await runDdlSafely(client, `
			CREATE TABLE IF NOT EXISTS outbox_events (
				id BIGSERIAL PRIMARY KEY,
				event_type TEXT NOT NULL,
				event_key TEXT NOT NULL,
				payload JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				published_at TIMESTAMPTZ,
				retry_count INT NOT NULL DEFAULT 0,
				last_error TEXT
			);
		`);
		await runDdlSafely(client, `
			CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
			ON outbox_events (created_at)
			WHERE published_at IS NULL;
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
