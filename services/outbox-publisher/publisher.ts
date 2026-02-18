import { Kafka } from "kafkajs";
import process from "node:process";
import { ensureSchema, pool } from "../shared/db";

type OutboxRow = {
	id: number;
	event_type: string;
	event_key: string;
	payload: unknown;
};

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 25);
const MAX_RETRY_COUNT = Number(process.env.OUTBOX_MAX_RETRY_COUNT ?? 20);

const kafka = new Kafka({
	clientId: "outbox-publisher",
	brokers: KAFKA_BROKERS,
});

const producer = kafka.producer();

function topicFor(eventType: string): string {
	return eventType;
}

async function publishBatch(): Promise<number> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await client.query<OutboxRow>(
			`SELECT id, event_type, event_key, payload
       FROM outbox_events
       WHERE published_at IS NULL
         AND retry_count < $1
       ORDER BY created_at
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
			[MAX_RETRY_COUNT, BATCH_SIZE],
		);

		if (result.rowCount === 0) {
			await client.query("COMMIT");
			return 0;
		}

		for (const row of result.rows) {
			try {
				await producer.send({
					topic: topicFor(row.event_type),
					messages: [
						{
							key: row.event_key,
							value: JSON.stringify(row.payload),
						},
					],
				});

				await client.query(
					`UPDATE outbox_events
           SET published_at = NOW(), last_error = NULL
           WHERE id = $1`,
					[row.id],
				);
			} catch (error) {
				await client.query(
					`UPDATE outbox_events
           SET retry_count = retry_count + 1, last_error = $2
           WHERE id = $1`,
					[row.id, error instanceof Error ? error.message : "Unknown publish error"],
				);
			}
		}

		await client.query("COMMIT");
		return result.rowCount ?? 0;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function start(): Promise<void> {
	await ensureSchema();
	await producer.connect();

	console.log("outbox-publisher started");

	const timer = setInterval(() => {
		void publishBatch()
			.then((count) => {
				if (count > 0) {
					console.log(`Published outbox events: ${count}`);
				}
			})
			.catch((error) => {
				console.error("Outbox publish loop failed", error);
			});
	}, POLL_INTERVAL_MS);

	const shutdown = async () => {
		clearInterval(timer);
		await producer.disconnect();
		await pool.end();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

start().catch((error) => {
	console.error("outbox-publisher failed to start", error);
	process.exit(1);
});
