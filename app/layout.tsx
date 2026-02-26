import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { SupabaseProvider } from "@/components/providers/SupabaseProvider";
import { NextAuthProvider } from "@/components/providers/NextAuthProvider";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Volina Dashboard | AI Voice Agent Platform",
  description: "Manage your AI voice agents, calls, leads, campaigns, and calendar.",
  icons: {
    icon: "/VolinaLogo.png",
    shortcut: "/VolinaLogo.png",
    apple: "/VolinaLogo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <NextAuthProvider>
          <SupabaseProvider>
            {children}
          </SupabaseProvider>
        </NextAuthProvider>
      </body>
    </html>
  );
}
