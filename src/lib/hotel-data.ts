export type Room = {
	id: string;
	name: string;
	tag: string;
	pricePerNight: number;
	description: string;
	highlights: string[];
	gradient: string;
};

export type Offer = {
	id: string;
	title: string;
	subtitle: string;
	description: string;
	badge: string;
};

export const rooms: Room[] = [
	{
		id: "ocean-suite",
		name: "Ocean Suite",
		tag: "Signature",
		pricePerNight: 420,
		description: "Panoramic sea view, private terrace, and curated minibar.",
		highlights: ["52m²", "King Bed", "Breakfast Included"],
		gradient: "from-teal-500 to-cyan-700",
	},
	{
		id: "city-loft",
		name: "City Loft",
		tag: "Urban",
		pricePerNight: 310,
		description: "Skyline-facing loft with lounge corner and marble bathroom.",
		highlights: ["44m²", "Rain Shower", "Late Checkout"],
		gradient: "from-slate-500 to-blue-700",
	},
	{
		id: "garden-retreat",
		name: "Garden Retreat",
		tag: "Wellness",
		pricePerNight: 350,
		description: "Calm courtyard room with wellness access and organic amenities.",
		highlights: ["48m²", "Spa Access", "Quiet Zone"],
		gradient: "from-emerald-500 to-green-700",
	},
];

export const offers: Offer[] = [
	{
		id: "long-stay",
		title: "Stay 4, Pay 3",
		subtitle: "Extended Escape",
		description: "Book four nights and enjoy one complimentary night with breakfast.",
		badge: "Best Value",
	},
	{
		id: "spa-weekend",
		title: "Spa Weekend Pairing",
		subtitle: "Wellness Package",
		description: "Two-night stay with spa ritual, thermal pass, and sunset tea.",
		badge: "Limited",
	},
	{
		id: "chef-experience",
		title: "Chef Table Evening",
		subtitle: "Dining Experience",
		description: "Seasonal tasting menu and sommelier pairing for two guests.",
		badge: "Popular",
	},
];
