import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Serif, Inter_Tight } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://firstrow.site"),
  title: { default: "Firstrow — tickets tied to a person", template: "%s · Firstrow" },
  description:
    "Tickets tied to a person, not an email. Passkey sign-in, money held until you're at the door, and a record that rewards the fans who showed up first. On Monad.",
};

export const viewport: Viewport = {
  themeColor: "#eeeae3",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
