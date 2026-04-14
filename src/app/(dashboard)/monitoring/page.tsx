"use client"

import { useQuery } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import axios from "axios"
import { CheckCircle, XCircle, RefreshCw, Clock, Database, Server, Wifi } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

const BASE = process.env.NEXT_PUBLIC_API_URL || "https://social-api.stepup.com.tr"

interface HealthResult {
  status: "ok" | "error" | "loading"
  latency_ms?: number
  error?: string
}

interface Stats {
  total_users: number
  total_links: number
  total_campaigns: number
  total_workspaces: number
}

async function fetchHealth(url: string): Promise<HealthResult> {
  const start = Date.now()
  try {
    const res = await axios.get(url, { timeout: 5000 })
    return { status: res.data?.status === "ok" ? "ok" : "error", latency_ms: Date.now() - start }
  } catch {
    return { status: "error", latency_ms: Date.now() - start, error: "unreachable" }
  }
}

const services = [
  {
    id: "api",
    label: "Core API",
    icon: Server,
    checks: [
      { label: "HTTP", url: `${BASE}/health` },
      { label: "Database", url: `${BASE}/health/db` },
      { label: "Redis", url: `${BASE}/health/redis` },
      { label: "ClickHouse", url: `${BASE}/health/clickhouse` },
    ],
  },
  {
    id: "redirect",
    label: "Redirect Service",
    icon: RefreshCw,
    checks: [
      { label: "HTTP", url: `${BASE}/admin/api/v1/health/redirect` },
      { label: "Redis", url: `${BASE}/admin/api/v1/health/redirect/redis` },
    ],
  },
  {
    id: "worker",
    label: "Worker",
    icon: Database,
    checks: [
      { label: "HTTP", url: `${BASE}/admin/api/v1/health/worker` },
    ],
  },
]

function StatusBadge({ status }: { status: HealthResult["status"] }) {
  if (status === "loading") return <Badge variant="secondary">checking…</Badge>
  if (status === "ok") return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Healthy</Badge>
  return <Badge className="bg-red-500/10 text-red-600 border-red-200">Down</Badge>
}

function HealthRow({ label, result }: { label: string; result: HealthResult }) {
  const Icon = result.status === "ok" ? CheckCircle : result.status === "loading" ? Clock : XCircle
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={cn("h-4 w-4", {
          "text-emerald-500": result.status === "ok",
          "text-muted-foreground animate-pulse": result.status === "loading",
          "text-red-500": result.status === "error",
        })} />
        {label}
      </div>
      <div className="flex items-center gap-2">
        {result.latency_ms !== undefined && (
          <span className="text-xs text-muted-foreground">{result.latency_ms}ms</span>
        )}
        <StatusBadge status={result.status} />
      </div>
    </div>
  )
}

export default function MonitoringPage() {
  const [now, setNow] = useState(new Date())
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  // Tick the clock every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Health checks — refetch every 10s
  const healthQueries = services.flatMap((svc) =>
    svc.checks.map((check) => ({
      serviceId: svc.id,
      label: check.label,
      // eslint-disable-next-line react-hooks/rules-of-hooks
      result: useQuery<HealthResult>({
        queryKey: ["health", check.url],
        queryFn: () => fetchHealth(check.url),
        refetchInterval: 10_000,
        placeholderData: { status: "loading" },
      }),
    }))
  )

  // Stats — refetch every 15s
  const { data: stats, dataUpdatedAt, refetch: refetchStats, isFetching } = useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<Stats>("/stats").then((r) => r.data),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (dataUpdatedAt) setRefreshedAt(new Date(dataUpdatedAt))
  }, [dataUpdatedAt])

  function handleRefresh() {
    refetchStats()
    healthQueries.forEach((q) => q.result.refetch())
  }

  // Group health results by service
  const byService = services.map((svc) => ({
    ...svc,
    rows: healthQueries.filter((q) => q.serviceId === svc.id),
    overallOk: healthQueries
      .filter((q) => q.serviceId === svc.id)
      .every((q) => q.result.data?.status === "ok"),
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-refreshes every 10s &nbsp;·&nbsp;
            {refreshedAt ? (
              <>Last updated {refreshedAt.toLocaleTimeString()}</>
            ) : (
              "Checking…"
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-muted-foreground">{now.toLocaleTimeString()}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Service health */}
      <div className="grid gap-4 md:grid-cols-2">
        {byService.map((svc) => {
          const Icon = svc.icon
          return (
            <Card key={svc.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {svc.label}
                  </div>
                  <StatusBadge
                    status={
                      svc.rows.some((r) => r.result.data?.status === "loading")
                        ? "loading"
                        : svc.overallOk
                        ? "ok"
                        : "error"
                    }
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {svc.rows.map((row) => (
                  <HealthRow
                    key={row.label}
                    label={row.label}
                    result={row.result.data ?? { status: "loading" }}
                  />
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Live stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Platform Stats (live)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(
              [
                { label: "Users", key: "total_users" },
                { label: "Links", key: "total_links" },
                { label: "Campaigns", key: "total_campaigns" },
                { label: "Workspaces", key: "total_workspaces" },
              ] as const
            ).map(({ label, key }) => (
              <div key={key} className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                {stats ? (
                  <p className="text-2xl font-bold tabular-nums">{stats[key].toLocaleString()}</p>
                ) : (
                  <Skeleton className="h-8 w-12 mx-auto" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
