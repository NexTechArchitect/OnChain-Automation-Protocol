import type { Metadata, Viewport } from "next";
import { Web3Provider } from "../providers/Web3Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keeper Network | Onchain Automation",
  description:
    "A cinematic Web3 control surface for registering, monitoring, and executing automated onchain jobs.",
};

export const viewport: Viewport = {
  themeColor: "#030705",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}