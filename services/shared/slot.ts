export type ParsedSlot = {
	roomId: string;
	checkIn: string;
	checkOut: string;
	guests: string;
};

const SLOT_ID_PATTERN = /^([^:]+):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2}):g(\d+)$/;

export function parseSlotId(slotId: string): ParsedSlot | null {
	if (!slotId.trim()) {
		return null;
	}

	const match = SLOT_ID_PATTERN.exec(slotId.trim());
	if (!match) {
		return null;
	}

	const [_full, roomId, checkIn, checkOut, guests] = match;
	const checkInDate = new Date(`${checkIn}T00:00:00Z`);
	const checkOutDate = new Date(`${checkOut}T00:00:00Z`);

	if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
		return null;
	}

	if (checkOutDate <= checkInDate) {
		return null;
	}

	return { roomId, checkIn, checkOut, guests };
}

export function isOverlapDatabaseError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const value = error as { code?: string; constraint?: string };
	return value.code === "23P01" || value.constraint === "bookings_room_overlap_excl";
}
