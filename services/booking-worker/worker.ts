import { Kafka } from "kafkajs";
import { ensureSchema, pool } from "../shared/db";

type BookingRequestedEvent = {
	bookingId: string;
	userId: string;
	slotId: string;
	status: "PENDING";
	createdAt: string;
};

type BookingResultEvent = {
	bookingId: string;
	userId: string;
	slotId: string;
	status: "CONFIRMED" | "REJECTED";
	reason?: string;
	processedAt: string;
};

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
const BOOKING_REQUESTED_TOPIC =
	process.env.BOOKING_REQUESTED_TOPIC ?? "booking.requested";
const BOOKING_CONFIRMED_TOPIC =
	process.env.BOOKING_CONFIRMED_TOPIC ?? "booking.confirmed";
const BOOKING_REJECTED_TOPIC = process.env.BOOKING_REJECTED_TOPIC ?? "booking.rejected";
const CONSUMER_GROUP_ID =
	process.env.BOOKING_WORKER_GROUP_ID ?? "booking-worker-group-v1";

const kafka = new Kafka({
	clientId: "booking-worker",
	brokers: KAFKA_BROKERS,
});

const consumer = kafka.consumer({ groupId: CONSUMER_GROUP_ID });
const producer = kafka.producer();

function parseBookingRequested(value: Buffer | null): BookingRequestedEvent | null {
	if (!value) {
		return null;
	}

	try {
		const data = JSON.parse(value.toString("utf8")) as Partial<BookingRequestedEvent>;
		if (
			typeof data.bookingId === "string" &&
			typeof data.userId === "string" &&
			typeof data.slotId === "string"
		) {
			return {
				bookingId: data.bookingId,
				userId: data.userId,
				slotId: data.slotId,
				status: "PENDING",
				createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
			};
		}
		return null;
	} catch {
		return null;
	}
}

function evaluateBooking(event: BookingRequestedEvent): BookingResultEvent {
	const isRejected = event.slotId.toLowerCase().includes("full");
	if (isRejected) {
		return {
			bookingId: event.bookingId,
			userId: event.userId,
			slotId: event.slotId,
			status: "REJECTED",
			reason: "Slot capacity reached",
			processedAt: new Date().toISOString(),
		};
	}

	return {
		bookingId: event.bookingId,
		userId: event.userId,
		slotId: event.slotId,
		status: "CONFIRMED",
		processedAt: new Date().toISOString(),
	};
}

async function start(): Promise<void> {
	await ensureSchema();
	await producer.connect();
	await consumer.connect();
	await consumer.subscribe({ topic: BOOKING_REQUESTED_TOPIC, fromBeginning: false });

	console.log(
		`booking-worker listening on topic ${BOOKING_REQUESTED_TOPIC} (group: ${CONSUMER_GROUP_ID})`,
	);

	await consumer.run({
		eachMessage: async ({ message }) => {
			const event = parseBookingRequested(message.value ?? null);
			if (!event) {
				console.error("Invalid booking.requested message, skipping.");
				return;
			}

			const result = evaluateBooking(event);
			const targetTopic =
				result.status === "CONFIRMED" ? BOOKING_CONFIRMED_TOPIC : BOOKING_REJECTED_TOPIC;

			await pool.query(
				`UPDATE bookings
         SET status = $1, reason = $2, updated_at = NOW()
         WHERE id = $3`,
				[result.status, result.reason ?? null, result.bookingId],
			);

			await producer.send({
				topic: targetTopic,
				messages: [
					{
						key: result.bookingId,
						value: JSON.stringify(result),
					},
				],
			});

			console.log(
				`Processed booking ${result.bookingId}: ${result.status} -> ${targetTopic}`,
			);
		},
	});
}

async function shutdown(): Promise<void> {
	await consumer.disconnect();
	await producer.disconnect();
	await pool.end();
	process.exit(0);
}

process.on("SIGINT", () => {
	void shutdown();
});
process.on("SIGTERM", () => {
	void shutdown();
});

start().catch((error) => {
	console.error("booking-worker failed", error);
	process.exit(1);
});
