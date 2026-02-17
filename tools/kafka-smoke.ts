import { Kafka } from "kafkajs";

const kafka = new Kafka({
	clientId: "booking-smoke",
	brokers: ["localhost:9092"],
});

async function run(): Promise<void> {
	const producer = kafka.producer();
	const consumer = kafka.consumer({ groupId: "booking-smoke-group" });

	await consumer.connect();
	await consumer.subscribe({ topic: "booking.requested", fromBeginning: true });
	await producer.connect();

	await producer.send({
		topic: "booking.requested",
		messages: [
			{
				key: "booking-1",
				value: JSON.stringify({
					bookingId: "booking-1",
					userId: "user-1",
					slotId: "slot-2026-02-17T10:00:00Z",
					createdAt: new Date().toISOString(),
				}),
			},
		],
	});

	let received = false;
	await consumer.run({
		eachMessage: async ({ topic, message }) => {
			received = true;
			console.log(
				`[${topic}] key=${message.key?.toString() ?? ""} value=${message.value?.toString() ?? ""}`,
			);
		},
	});

	await new Promise<void>((resolve, reject) => {
		setTimeout(() => {
			if (!received) {
				reject(new Error("No message consumed within timeout."));
				return;
			}
			resolve();
		}, 1500);
	});

	await consumer.stop();
	await producer.disconnect();
	await consumer.disconnect();
}

run().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
