"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

function statusColor(status: BookingStatus): string {
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

export default function BookingStatusPage() {
	const params = useParams<{ id: string }>();
	const bookingId = params.id;
	const [booking, setBooking] = useState<Booking | null>(null);
	const [error, setError] = useState<string | null>(null);

	const isFinal = useMemo(
		() =>
			booking?.status === "CONFIRMED" ||
			booking?.status === "REJECTED" ||
			booking?.status === "CANCELLED",
		[booking?.status],
	);

	useEffect(() => {
		let cancelled = false;

		async function loadStatus() {
			try {
				const response = await fetch(`/api/bookings/${bookingId}`, {
					cache: "no-store",
				});
				if (!response.ok) {
					const payload = (await response.json()) as { error?: string };
					if (!cancelled) {
						setError(payload.error ?? "Could not load booking status.");
					}
					return;
				}

				const payload = (await response.json()) as Booking;
				if (!cancelled) {
					setBooking(payload);
					setError(null);
				}
			} catch {
				if (!cancelled) {
					setError("Network error while fetching booking status.");
				}
			}
		}

		void loadStatus();
		const intervalId = setInterval(() => {
			if (!isFinal) {
				void loadStatus();
			}
		}, 1500);

		return () => {
			cancelled = true;
			clearInterval(intervalId);
		};
	}, [bookingId, isFinal]);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12">
			<div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
				<div className="flex items-center justify-between gap-4">
					<h1 className="text-2xl font-bold text-slate-900">Booking Status</h1>
					<Link className="text-sm font-medium text-slate-600 hover:text-slate-900" href="/">
						New booking
					</Link>
				</div>

				<p className="mt-3 text-sm text-slate-500">Booking ID: {bookingId}</p>

				{error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

				{booking ? (
					<div className="mt-6 space-y-4 rounded-xl border border-slate-200 p-5">
						<div className="flex items-center justify-between">
							<span className="text-sm text-slate-500">Status</span>
							<span
								className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(booking.status)}`}
							>
								{booking.status}
							</span>
						</div>
						<div className="text-sm text-slate-700">
							<p>User: {booking.userId}</p>
							<p>Slot: {booking.slotId}</p>
							<p>Updated: {new Date(booking.updatedAt).toLocaleString()}</p>
						</div>
						{booking.reason ? (
							<p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
								Reason: {booking.reason}
							</p>
						) : null}
						{booking.status === "PENDING" ? (
							<p className="text-sm text-slate-600">
								Processing asynchronously. This page polls every 1.5 seconds.
							</p>
						) : null}
					</div>
				) : (
					<p className="mt-6 text-sm text-slate-600">Loading booking status...</p>
				)}
			</div>
		</main>
	);
}
