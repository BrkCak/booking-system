import type { Metadata } from "next";
import { Cormorant_Garamond, Space_Grotesk } from "next/font/google";
import "./globals.css";

const editorial = Cormorant_Garamond({
	variable: "--font-editorial",
	subsets: ["latin"],
	weight: ["500", "600", "700"],
});

const uiSans = Space_Grotesk({
	variable: "--font-ui",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
	title: "Astera Hotels | Modern Booking",
	description: "Luxury-inspired hotel booking experience with real-time status tracking.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${editorial.variable} ${uiSans.variable} antialiased`}>
				{children}
			</body>
		</html>
	);
}
