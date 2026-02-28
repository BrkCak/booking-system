"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type BookingStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

type Booking = {
	bookingId: string;
	userId: string;
	slotId: string;
	status: BookingStatus;
	reason: string | null;
	createdAt: string;
	updatedAt: string;
};

type BookingListResponse = {
	userId: string;
	bookings: Booking[];
};

function statusBadge(status: BookingStatus): string {
	if (status === "CONFIRMED") {
		return "text-emerald-700 bg-emerald-100";
	}
	if (status === "REJECTED") {
		return "text-red-700 bg-red-100";
	}
	if (status === "CANCELLED") {
		return "text-slate-700 bg-slate-200";
	}
	return "text-amber-700 bg-amber-100";
}

export default function MyBookingsPage() {
	const [userId, setUserId] = useState<string | null>(null);
	const [bookings, setBookings] = useState<Booking[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [rescheduleInputs, setRescheduleInputs] = useState<Record<string, string>>({});

	async function loadBookings() {
		setLoading(true);
		setError(null);

		try {
			const sessionResponse = await fetch("/api/session", { cache: "no-store" });
			const sessionPayload = (await sessionResponse.json()) as { userId?: string | null };
			if (!sessionPayload.userId) {
				setUserId(null);
				setBookings([]);
				return;
			}

			setUserId(sessionPayload.userId);
			const response = await fetch("/api/bookings", { cache: "no-store" });
			const payload = (await response.json()) as BookingListResponse & { error?: string };
			if (!response.ok) {
				setError(payload.error ?? "Could not load your bookings.");
				setBookings([]);
				return;
			}

			setBookings(payload.bookings ?? []);
		} catch {
			setError("Network error while loading bookings.");
			setBookings([]);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void loadBookings();
	}, []);

	async function cancelBooking(bookingId: string) {
		setBusyId(bookingId);
		setError(null);
		try {
			const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ reason: "Cancelled by user from web UI" }),
			});
			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				setError(payload.error ?? "Could not cancel booking.");
				return;
			}

			await loadBookings();
		} catch {
			setError("Network error while cancelling booking.");
		} finally {
			setBusyId(null);
		}
	}

	async function rescheduleBooking(event: FormEvent, bookingId: string) {
		event.preventDefault();
		const slotId = rescheduleInputs[bookingId]?.trim() ?? "";
		if (!slotId) {
			setError("Please enter a slotId for rescheduling.");
			return;
		}

		setBusyId(bookingId);
		setError(null);
		try {
			const response = await fetch(`/api/bookings/${bookingId}/reschedule`, {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ slotId }),
			});
			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				setError(payload.error ?? "Could not reschedule booking.");
				return;
			}

			setRescheduleInputs((current) => ({ ...current, [bookingId]: "" }));
			await loadBookings();
		} catch {
			setError("Network error while rescheduling booking.");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<main className="mx-auto w-full max-w-5xl px-6 py-10 md:py-14">
			<header className="flex items-center justify-between gap-4">
				<div>
					<p className="text-xs uppercase tracking-[0.22em] text-[var(--brand)]">Account</p>
					<h1 className="font-editorial mt-2 text-5xl text-[var(--ink)]">My Bookings</h1>
					<p className="mt-2 text-sm text-[var(--ink-soft)]">
						{userId ? `Signed in as ${userId}` : "No active user session"}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link
						className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-white"
						href="/"
					>
						Home
					</Link>
					<button
						type="button"
						onClick={() => void loadBookings()}
						className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-white"
					>
						Refresh
					</button>
				</div>
			</header>

			{error ? <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

			{loading ? <p className="mt-8 text-sm text-[var(--ink-soft)]">Loading bookings...</p> : null}

			{!loading && !userId ? (
				<p className="mt-8 text-sm text-[var(--ink-soft)]">
					Go to the home page, set an active user, and come back here.
				</p>
			) : null}

			{!loading && userId && bookings.length === 0 ? (
				<p className="mt-8 text-sm text-[var(--ink-soft)]">No bookings yet.</p>
			) : null}

			{bookings.length > 0 ? (
				<section className="mt-8 space-y-5">
					{bookings.map((booking) => {
						const canCancel =
							booking.status === "PENDING" || booking.status === "CONFIRMED";
						const canReschedule = booking.status !== "CANCELLED";
						const isBusy = busyId === booking.bookingId;

						return (
							<article className="surface-card rounded-2xl p-6 md:p-7" key={booking.bookingId}>
								<div className="flex flex-wrap items-center justify-between gap-4">
									<div>
										<p className="text-xs uppercase tracking-[0.2em] text-[var(--brand)]">
											Booking ID
										</p>
										<p className="mt-1 text-sm text-[var(--ink-soft)]">{booking.bookingId}</p>
									</div>
									<span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(booking.status)}`}>
										{booking.status}
									</span>
								</div>

								<div className="mt-4 text-sm text-[var(--ink-soft)]">
									<p>Slot: {booking.slotId}</p>
									<p>Updated: {new Date(booking.updatedAt).toLocaleString()}</p>
									{booking.reason ? <p>Reason: {booking.reason}</p> : null}
								</div>

								<div className="mt-5 flex flex-wrap items-center gap-3">
									<button
										type="button"
										disabled={!canCancel || isBusy}
										onClick={() => void cancelBooking(booking.bookingId)}
										className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
									>
										Cancel
									</button>

									{canReschedule ? (
										<form
											className="flex flex-wrap items-center gap-2"
											onSubmit={(event) => void rescheduleBooking(event, booking.bookingId)}
										>
											<input
												className="w-[280px] rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none ring-[var(--brand)] focus:ring"
												placeholder="new slotId e.g. ocean-suite:2026-03-10:2026-03-12:g2"
												value={rescheduleInputs[booking.bookingId] ?? ""}
												onChange={(event) =>
													setRescheduleInputs((current) => ({
														...current,
														[booking.bookingId]: event.target.value,
													}))
												}
											/>
											<button
												type="submit"
												disabled={isBusy}
												className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
											>
												Reschedule
											</button>
										</form>
									) : null}
								</div>
							</article>
						);
					})}
				</section>
			) : null}
		</main>
	);
}
