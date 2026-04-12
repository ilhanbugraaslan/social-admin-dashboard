import type { Metadata } from "next"
import { Geist } from "next/font/google"
import { Providers } from "@/components/common/providers"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: { default: "Admin Panel", template: "%s | Admin Panel" },
  description: "Social platform admin dashboard",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
