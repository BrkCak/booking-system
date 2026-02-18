import Link from "next/link";
import { rooms } from "@/lib/hotel-data";

export default function RoomsPage() {
	return (
		<main className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
			<header className="flex items-center justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.22em] text-[var(--brand)]">Astera Collection</p>
					<h1 className="font-editorial mt-2 text-5xl text-[var(--ink)]">Our Rooms</h1>
				</div>
				<Link className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-white" href="/">
					Back Home
				</Link>
			</header>

			<section className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{rooms.map((room) => (
					<article className="surface-card rounded-2xl p-5" key={room.id}>
						<div className={`h-40 rounded-xl bg-gradient-to-br ${room.gradient}`} />
						<div className="mt-4 flex items-center justify-between">
							<p className="text-xs uppercase tracking-[0.2em] text-[var(--brand)]">{room.tag}</p>
							<p className="text-sm font-semibold text-[var(--ink)]">${room.pricePerNight}/night</p>
						</div>
						<h2 className="font-editorial mt-1 text-3xl text-[var(--ink)]">{room.name}</h2>
						<p className="mt-2 text-sm text-[var(--ink-soft)]">{room.description}</p>
						<ul className="mt-4 flex flex-wrap gap-2">
							{room.highlights.map((item) => (
								<li className="rounded-full bg-white px-3 py-1 text-xs text-[var(--ink-soft)]" key={item}>
									{item}
								</li>
							))}
						</ul>
					</article>
				))}
			</section>
		</main>
	);
}
