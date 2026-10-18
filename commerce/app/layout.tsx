import type { Metadata } from "next";
import "./globals.css";
import Traffic from './traffic';

export const metadata: Metadata = {
  title: "LaunchReady | BUILT 4 GOD AI",
  description: "A practical software product validation and launch kit for independent builders. Editable worksheets, an offline workbook, and a clear path from idea to evidence.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}<Traffic/></body>
    </html>
  );
}
