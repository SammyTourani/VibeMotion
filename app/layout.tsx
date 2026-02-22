import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeMotion — AI Video Editor",
  description:
    "Turn raw iPhone clips into viral TikTok/Reels-ready videos in minutes. AI transcription, smart B-roll, animated captions — no editing skills needed.",
  keywords: ["AI video editor", "TikTok editor", "Reels editor", "video automation", "VibeMotion"],
  openGraph: {
    title: "VibeMotion — AI Video Editor",
    description: "Transform raw iPhone footage into viral-ready videos in minutes.",
    url: "https://vibemotiontech.com",
    siteName: "VibeMotion",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeMotion — AI Video Editor",
    description: "Transform raw iPhone footage into viral-ready videos in minutes.",
  },
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
