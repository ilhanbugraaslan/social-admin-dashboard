"use client"

import { useQuery } from "@tanstack/react-query"
import { Users, Link2, Megaphone, LayoutDashboard } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import api from "@/lib/api"

interface Stats {
  total_users: number
  total_links: number
  total_campaigns: number
  total_workspaces: number
}

const statCards = [
  {
    key: "total_users" as keyof Stats,
    label: "Total Users",
    icon: Users,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    key: "total_links" as keyof Stats,
    label: "Affiliate Links",
    icon: Link2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    key: "total_campaigns" as keyof Stats,
    label: "Campaigns",
    icon: Megaphone,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    key: "total_workspaces" as keyof Stats,
    label: "Workspaces",
    icon: LayoutDashboard,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
]

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<Stats>("/stats").then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Card key={card.key} className="border-t-2 border-t-transparent" style={{ borderTopColor: "currentColor" }}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <div className={`rounded-lg p-2 ${card.bg}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-3xl font-bold tabular-nums">
                    {(stats?.[card.key] ?? 0).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
