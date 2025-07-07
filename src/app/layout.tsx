import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IPL Auction Game",
  description: "Real-time IPL auction game with friends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geist.variable} ${geistMono.variable} antialiased min-h-screen text-white`}
        suppressHydrationWarning={true}
      >
        {/* Mobile Restriction Overlay */}
        <div className="mobile-restriction">
          <div className="restriction-content">
            <div className="restriction-logo">IPL Auction</div>
            <div className="restriction-icon">🖥️</div>
            <h1 className="restriction-title">
              Please access this application on a desktop or a device with a screen width of at least 900px for the best experience.
            </h1>
            <p className="restriction-message">
              This IPL auction game is designed for larger screens to provide the optimal bidding experience with all features fully accessible.
            </p>
            <div className="restriction-future">
              Mobile support will be available in future updates.
            </div>
          </div>
        </div>

        {/* Main App Content */}
        <div className="app-content">{children}</div>
      </body>
    </html>
  );
}
