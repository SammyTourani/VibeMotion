import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stan Video Editor - AI-Powered Video Creation",
  description: "Auto-generate vertical videos for TikTok, Reels, and Shorts with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
