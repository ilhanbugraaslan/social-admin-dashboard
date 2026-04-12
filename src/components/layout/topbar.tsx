"use client"

import { Shield } from "lucide-react"

export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center border-b bg-card px-4 md:px-6">
      {/* Spacer for mobile hamburger */}
      <div className="w-10 md:hidden" />
      <div className="flex items-center gap-2 md:hidden">
        <Shield className="h-4 w-4 text-primary" />
        <span className="font-bold text-sm">Admin Panel</span>
      </div>
    </header>
  )
}
