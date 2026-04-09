import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = {
  title: {
    default: "Sideline Star",
    template: "%s | Sideline Star",
  },
  description: "The modern athlete evaluation platform. Upload rosters, score live, and generate rankings — across any sport, any level.",
  keywords: ["athlete evaluation", "sports rankings", "tryout software", "player evaluation", "scoring platform"],
  authors: [{ name: "Sideline Star" }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://sidelinestar.com"),
  openGraph: {
    title: "Sideline Star",
    description: "The modern athlete evaluation platform. Score live, rank athletes, run evaluations — any sport, any level.",
    url: "https://sidelinestar.com",
    siteName: "Sideline Star",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sideline Star",
    description: "The modern athlete evaluation platform. Score live, rank athletes, run evaluations.",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-light.png", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sideline Star",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#060b18",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
