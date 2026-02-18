import Link from "next/link";
import { offers } from "@/lib/hotel-data";

export default function OffersPage() {
	return (
		<main className="mx-auto w-full max-w-5xl px-6 py-10 md:py-14">
			<header className="flex items-center justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.22em] text-[var(--gold)]">Seasonal Benefits</p>
					<h1 className="font-editorial mt-2 text-5xl text-[var(--ink)]">Special Offers</h1>
				</div>
				<Link className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--ink)] hover:bg-white" href="/">
					Back Home
				</Link>
			</header>

			<section className="mt-8 space-y-5">
				{offers.map((offer) => (
					<article className="surface-card rounded-2xl p-6 md:p-7" key={offer.id}>
						<div className="flex flex-wrap items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.2em] text-[var(--brand)]">{offer.subtitle}</p>
								<h2 className="font-editorial mt-1 text-4xl text-[var(--ink)]">{offer.title}</h2>
							</div>
							<span className="rounded-full bg-[var(--brand)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
								{offer.badge}
							</span>
						</div>
						<p className="mt-3 text-sm text-[var(--ink-soft)]">{offer.description}</p>
					</article>
				))}
			</section>
		</main>
	);
}
