"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
	const [userId, setUserId] = useState("user-1");
	const [slotId, setSlotId] = useState("slot-2026-02-21T10:00:00Z");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const router = useRouter();

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);

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
		<main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12">
			<div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
				<p className="text-sm font-medium uppercase tracking-wide text-slate-500">
					Booking System
				</p>
				<h1 className="mt-2 text-3xl font-bold text-slate-900">Create a Booking</h1>
				<p className="mt-2 text-slate-600">
					Submit a booking request and track its async status through Kafka.
				</p>

				<form className="mt-8 space-y-5" onSubmit={onSubmit}>
					<label className="block">
						<span className="mb-2 block text-sm font-medium text-slate-700">User ID</span>
						<input
							className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-300 focus:ring"
							value={userId}
							onChange={(event) => setUserId(event.target.value)}
							required
						/>
					</label>

					<label className="block">
						<span className="mb-2 block text-sm font-medium text-slate-700">Slot ID</span>
						<input
							className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-slate-300 focus:ring"
							value={slotId}
							onChange={(event) => setSlotId(event.target.value)}
							required
						/>
					</label>

					{error ? <p className="text-sm text-red-600">{error}</p> : null}

					<button
						type="submit"
						disabled={isSubmitting}
						className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
					>
						{isSubmitting ? "Creating booking..." : "Create booking"}
					</button>
				</form>
			</div>
		</main>
	);
}
