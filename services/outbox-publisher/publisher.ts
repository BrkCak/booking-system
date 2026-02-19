import { Kafka } from "kafkajs";
import process from "node:process";
import { ensureSchema, pool } from "../shared/db";

type OutboxRow = {
	id: number;
	event_type: string;
	event_key: string;
	payload: unknown;
	retry_count: number;
};

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 25);
const MAX_RETRY_COUNT = Number(process.env.OUTBOX_MAX_RETRY_COUNT ?? 20);
const RETRY_BASE_DELAY_MS = Number(process.env.OUTBOX_RETRY_BASE_DELAY_MS ?? 1000);
const RETRY_MAX_DELAY_MS = Number(process.env.OUTBOX_RETRY_MAX_DELAY_MS ?? 60000);
const DEADLETTER_TOPIC = process.env.OUTBOX_DEADLETTER_TOPIC ?? "booking.deadletter";

const kafka = new Kafka({
	clientId: "outbox-publisher",
	brokers: KAFKA_BROKERS,
});

const producer = kafka.producer();

function topicFor(eventType: string): string {
	return eventType;
}

function nextBackoffMs(retryCount: number): number {
	const exponent = Math.max(0, retryCount - 1);
	const raw = RETRY_BASE_DELAY_MS * 2 ** exponent;
	return Math.min(RETRY_MAX_DELAY_MS, raw);
}

async function publishBatch(): Promise<number> {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await client.query<OutboxRow>(
			`SELECT id, event_type, event_key, payload, retry_count
       FROM outbox_events
       WHERE published_at IS NULL
         AND dead_lettered_at IS NULL
         AND next_attempt_at <= NOW()
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
				const nextRetryCount = row.retry_count + 1;
				const errorMessage =
					error instanceof Error ? error.message : "Unknown publish error";

				if (nextRetryCount >= MAX_RETRY_COUNT) {
					await producer.send({
						topic: DEADLETTER_TOPIC,
						messages: [
							{
								key: row.event_key,
								value: JSON.stringify({
									source: "outbox-publisher",
									outboxEventId: row.id,
									eventType: row.event_type,
									eventKey: row.event_key,
									payload: row.payload,
									retryCount: nextRetryCount,
									error: errorMessage,
									deadLetteredAt: new Date().toISOString(),
								}),
							},
						],
					});

					await client.query(
						`UPDATE outbox_events
           SET retry_count = $2, last_error = $3, dead_lettered_at = NOW()
           WHERE id = $1`,
						[row.id, nextRetryCount, errorMessage],
					);
					continue;
				}

				const backoffMs = nextBackoffMs(nextRetryCount);
				await client.query(
					`UPDATE outbox_events
           SET retry_count = $2,
               last_error = $3,
               next_attempt_at = NOW() + ($4 * INTERVAL '1 millisecond')
           WHERE id = $1`,
					[row.id, nextRetryCount, errorMessage, backoffMs],
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
