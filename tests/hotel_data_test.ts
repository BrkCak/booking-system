import { offers, rooms } from "../src/lib/hotel-data.ts";

Deno.test("rooms catalog is non-empty and has unique ids", () => {
	if (rooms.length === 0) {
		throw new Error("Expected at least one room.");
	}

	const ids = new Set<string>();
	for (const room of rooms) {
		if (ids.has(room.id)) {
			throw new Error(`Duplicate room id: ${room.id}`);
		}
		ids.add(room.id);
		if (room.pricePerNight <= 0) {
			throw new Error(`Invalid room price for ${room.id}`);
		}
	}
});

Deno.test("offers catalog is non-empty and has unique ids", () => {
	if (offers.length === 0) {
		throw new Error("Expected at least one offer.");
	}

	const ids = new Set<string>();
	for (const offer of offers) {
		if (ids.has(offer.id)) {
			throw new Error(`Duplicate offer id: ${offer.id}`);
		}
		ids.add(offer.id);
		if (!offer.title.trim()) {
			throw new Error(`Offer title is empty for ${offer.id}`);
		}
	}
});
