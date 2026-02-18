"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rooms } from "@/lib/hotel-data";

export default function Home() {
	const [userId, setUserId] = useState("user-1");
	const [roomId, setRoomId] = useState(rooms[0].id);
	const [checkIn, setCheckIn] = useState("2026-02-21");
	const [checkOut, setCheckOut] = useState("2026-02-23");
	const [guests, setGuests] = useState("2");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);
		if (checkOut <= checkIn) {
			setError("Check-out must be after check-in.");
			setIsSubmitting(false);
			return;
		}

		const slotId = `${roomId}:${checkIn}:${checkOut}:g${guests}`;

		try {
			const response = await fetch("/api/bookings", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
					body: JSON.stringify({ userId, slotId }),
			});

			const data = (await response.json()) as { bookingId?: string; error?: string };
			if (!response.ok || !data.bookingId) {
				setError(data.error ?? "Booking could not be created.");
				return;
			}

			router.push(`/bookings/${data.bookingId}`);
		} catch {
			setError("Network error while creating booking.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-6 py-8 md:py-12">
			<header className="reveal flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">
						A
					</div>
					<div>
						<p className="font-editorial text-2xl leading-none text-[var(--ink)]">Astera</p>
						<p className="text-xs tracking-[0.2em] text-[var(--ink-soft)]">HOTELS</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-white"
						href="/rooms"
					>
						Rooms
					</Link>
					<Link
						className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-white"
						href="/offers"
					>
						Offers
					</Link>
				</div>
			</header>

			<section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
				<div className="surface-card reveal rounded-3xl p-7 md:p-10">
					<p className="text-xs uppercase tracking-[0.24em] text-[var(--brand)]">City Escape Collection</p>
					<h1 className="font-editorial mt-4 text-5xl leading-[0.95] text-[var(--ink)] md:text-7xl">
						Stay where
						<br />
						design meets comfort.
					</h1>
					<p className="mt-5 max-w-xl text-base text-[var(--ink-soft)] md:text-lg">
						Book premium rooms, track your reservation status in real time, and enjoy a modern guest journey.
					</p>
					<div className="mt-8 grid grid-cols-3 gap-3 text-center">
						<div className="rounded-2xl bg-white px-3 py-4">
							<p className="font-editorial text-3xl text-[var(--ink)]">42</p>
							<p className="text-xs uppercase tracking-wider text-[var(--ink-soft)]">Suites</p>
						</div>
						<div className="rounded-2xl bg-white px-3 py-4">
							<p className="font-editorial text-3xl text-[var(--ink)]">4.9</p>
							<p className="text-xs uppercase tracking-wider text-[var(--ink-soft)]">Rating</p>
						</div>
						<div className="rounded-2xl bg-white px-3 py-4">
							<p className="font-editorial text-3xl text-[var(--ink)]">24/7</p>
							<p className="text-xs uppercase tracking-wider text-[var(--ink-soft)]">Concierge</p>
						</div>
					</div>
				</div>

				<div className="surface-card reveal-delay rounded-3xl p-6 md:p-7">
					<p className="text-xs uppercase tracking-[0.22em] text-[var(--gold)]">Reserve Now</p>
					<h2 className="font-editorial mt-2 text-3xl text-[var(--ink)]">Book Your Room</h2>
					<p className="mt-2 text-sm text-[var(--ink-soft)]">
						This submits a real booking event to your Kafka pipeline.
					</p>

					<form className="mt-6 space-y-4" onSubmit={onSubmit}>
						<label className="block">
							<span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--ink-soft)]">
								Guest ID
							</span>
							<input
								className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring"
								value={userId}
								onChange={(event) => setUserId(event.target.value)}
								required
							/>
						</label>

						<label className="block">
							<span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--ink-soft)]">Room</span>
							<select
								className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring"
								value={roomId}
								onChange={(event) => setRoomId(event.target.value)}
							>
								{rooms.map((room) => (
									<option key={room.id} value={room.id}>
										{room.name} (${room.pricePerNight}/night)
									</option>
								))}
							</select>
						</label>

						<div className="grid gap-4 sm:grid-cols-2">
							<label className="block">
								<span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--ink-soft)]">
									Check-in
								</span>
								<input
									type="date"
									className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring"
									value={checkIn}
									onChange={(event) => setCheckIn(event.target.value)}
									required
								/>
							</label>
							<label className="block">
								<span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--ink-soft)]">
									Check-out
								</span>
								<input
									type="date"
									className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring"
									value={checkOut}
									onChange={(event) => setCheckOut(event.target.value)}
									required
								/>
							</label>
						</div>

						<label className="block">
							<span className="mb-1.5 block text-xs uppercase tracking-wide text-[var(--ink-soft)]">Guests</span>
							<select
								className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring"
								value={guests}
								onChange={(event) => setGuests(event.target.value)}
							>
								<option value="1">1 Guest</option>
								<option value="2">2 Guests</option>
								<option value="3">3 Guests</option>
								<option value="4">4 Guests</option>
							</select>
						</label>

						{error ? <p className="text-sm text-red-700">{error}</p> : null}

						<button
							type="submit"
							disabled={isSubmitting}
							className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-60"
						>
							{isSubmitting ? "Submitting..." : "Confirm Booking"}
						</button>
					</form>
				</div>
			</section>

				<section className="mt-6 grid gap-6 md:grid-cols-3">
					{rooms.map((room) => (
						<article className="surface-card rounded-2xl p-5" key={room.id}>
							<div className={`h-32 rounded-xl bg-gradient-to-br ${room.gradient}`} />
							<p className="mt-4 text-xs uppercase tracking-[0.2em] text-[var(--brand)]">{room.tag}</p>
							<h3 className="font-editorial mt-1 text-3xl text-[var(--ink)]">{room.name}</h3>
							<p className="mt-2 text-sm text-[var(--ink-soft)]">{room.description}</p>
							<p className="mt-3 text-sm font-semibold text-[var(--ink)]">${room.pricePerNight}/night</p>
						</article>
					))}
				</section>

			<footer className="mt-8 pb-4 text-center text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
				Real-time booking status powered by Kafka and PostgreSQL
			</footer>
		</main>
	);
}
