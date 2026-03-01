import { Pool } from "pg";
import process from "node:process";

const DATABASE_URL =
	process.env.DATABASE_URL ?? "postgres://booking:booking@localhost:5432/booking";

export const ACTIVE_SLOT_CONFLICT_CONSTRAINT = "bookings_slot_active_unique";

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
		await runDdlSafely(client, `CREATE EXTENSION IF NOT EXISTS btree_gist;`);
		await runDdlSafely(client, `
			CREATE TABLE IF NOT EXISTS bookings (
				id UUID PRIMARY KEY,
				user_id TEXT NOT NULL,
				slot_id TEXT NOT NULL,
				room_id TEXT,
				check_in DATE,
				check_out DATE,
				status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
				reason TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);
		`);
		await runDdlSafely(client, `
			ALTER TABLE bookings
			ADD COLUMN IF NOT EXISTS room_id TEXT,
			ADD COLUMN IF NOT EXISTS check_in DATE,
			ADD COLUMN IF NOT EXISTS check_out DATE;
		`);
		await runDdlSafely(client, `
			ALTER TABLE bookings
			DROP CONSTRAINT IF EXISTS bookings_status_check;
		`);
		await runDdlSafely(client, `
			ALTER TABLE bookings
			ADD CONSTRAINT bookings_status_check
			CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'));
		`);
		await client.query(`
			UPDATE bookings
			SET room_id = split_part(slot_id, ':', 1),
					check_in = NULLIF(split_part(slot_id, ':', 2), '')::DATE,
					check_out = NULLIF(split_part(slot_id, ':', 3), '')::DATE
			WHERE (room_id IS NULL OR check_in IS NULL OR check_out IS NULL)
				AND slot_id ~ '^[^:]+:\\d{4}-\\d{2}-\\d{2}:\\d{4}-\\d{2}-\\d{2}:g\\d+$';
		`);
		await client.query(`
			ALTER TABLE bookings
			DROP CONSTRAINT IF EXISTS bookings_check_in_out_positive;
		`);
		await runDdlSafely(client, `
			ALTER TABLE bookings
			ADD CONSTRAINT bookings_check_in_out_positive
			CHECK (check_in IS NOT NULL AND check_out IS NOT NULL AND check_in < check_out);
		`);
		await client.query(`
			WITH conflicts AS (
				SELECT DISTINCT newer.id
				FROM bookings newer
				JOIN bookings older
					ON newer.room_id = older.room_id
					AND newer.id <> older.id
					AND newer.status IN ('PENDING', 'CONFIRMED')
					AND older.status IN ('PENDING', 'CONFIRMED')
					AND daterange(newer.check_in, newer.check_out, '[)') && daterange(older.check_in, older.check_out, '[)')
					AND (
						newer.created_at > older.created_at
						OR (newer.created_at = older.created_at AND newer.id::text > older.id::text)
					)
			)
			UPDATE bookings b
			SET status = 'REJECTED',
					reason = COALESCE(NULLIF(TRIM(b.reason), ''), 'Auto-rejected during schema migration due to overlapping active booking.'),
					updated_at = NOW()
			WHERE b.id IN (SELECT id FROM conflicts);
		`);
		await client.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM pg_constraint WHERE conname = 'bookings_room_overlap_excl'
				) THEN
					ALTER TABLE bookings
					ADD CONSTRAINT bookings_room_overlap_excl
					EXCLUDE USING gist (
						room_id WITH =,
						daterange(check_in, check_out, '[)') WITH &&
					)
					WHERE (status IN ('PENDING', 'CONFIRMED'));
				END IF;
			END $$;
		`);
		await runDdlSafely(client, `
			ALTER TABLE bookings
			ALTER COLUMN room_id SET NOT NULL,
			ALTER COLUMN check_in SET NOT NULL,
			ALTER COLUMN check_out SET NOT NULL;
		`);
		await runDdlSafely(client, `
			CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_SLOT_CONFLICT_CONSTRAINT}
			ON bookings (slot_id)
			WHERE status IN ('PENDING', 'CONFIRMED');
		`);
		await runDdlSafely(client, `
			CREATE TABLE IF NOT EXISTS outbox_events (
				id BIGSERIAL PRIMARY KEY,
				event_type TEXT NOT NULL,
				event_key TEXT NOT NULL,
				payload JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				published_at TIMESTAMPTZ,
				dead_lettered_at TIMESTAMPTZ,
				retry_count INT NOT NULL DEFAULT 0,
				last_error TEXT
			);
		`);
		await runDdlSafely(client, `
			ALTER TABLE outbox_events
			ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
		`);
		await runDdlSafely(client, `
			ALTER TABLE outbox_events
			ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;
		`);
		await runDdlSafely(client, `
			CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
			ON outbox_events (next_attempt_at, created_at)
			WHERE published_at IS NULL AND dead_lettered_at IS NULL;
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
