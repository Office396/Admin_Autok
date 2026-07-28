import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Admin Security Panel",
  description: "Remote control and monitoring for Autok installations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-900">
        {children}
      </body>
    </html>
  );
}
