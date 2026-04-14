"use client"

import { useQuery } from "@tanstack/react-query"
import { useState, useEffect, useRef } from "react"
import axios from "axios"
import { CheckCircle, XCircle, RefreshCw, Clock, Database, Server } from "lucide-react"
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
    label: "Core API Backend",
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
    label: "Worker Service",
    icon: Database,
    checks: [
      { label: "HTTP", url: `${BASE}/admin/api/v1/health/worker` },
    ],
  },
]

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

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

  // Uptime tracking per service
  const historyRef = useRef<Record<string, boolean[]>>({})
  const lastDownRef = useRef<Record<string, number | null>>({})
  const pageStartRef = useRef(Date.now())

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
  const byService = services.map((svc) => {
    const rows = healthQueries.filter((q) => q.serviceId === svc.id)
    const isLoading = rows.some((r) => r.result.data?.status === "loading")
    const overallOk = rows.every((r) => r.result.data?.status === "ok")
    return { ...svc, rows, isLoading, overallOk }
  })

  // Record a history sample whenever all queries have settled
  const queryUpdateKey = healthQueries.map((q) => q.result.dataUpdatedAt).join(",")
  useEffect(() => {
    byService.forEach((svc) => {
      if (svc.isLoading) return
      if (!historyRef.current[svc.id]) historyRef.current[svc.id] = []
      const h = historyRef.current[svc.id]
      h.push(svc.overallOk)
      if (h.length > 180) h.shift() // keep ~30 min at 10s interval
      if (!svc.overallOk) {
        lastDownRef.current[svc.id] = Date.now()
      } else if (!(svc.id in lastDownRef.current)) {
        lastDownRef.current[svc.id] = null
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryUpdateKey])

  function getUptime(serviceId: string): { percent: string; duration: string } | null {
    const h = historyRef.current[serviceId]
    if (!h || h.length < 2) return null
    const upCount = h.filter(Boolean).length
    const pct = (upCount / h.length) * 100
    const lastDown = lastDownRef.current[serviceId]
    const since = lastDown != null ? lastDown : pageStartRef.current
    return {
      percent: pct.toFixed(1) + "%",
      duration: formatDuration(now.getTime() - since),
    }
  }

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
          const uptime = getUptime(svc.id)
          const overallStatus = svc.isLoading ? "loading" : svc.overallOk ? "ok" : "error"
          return (
            <Card key={svc.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {svc.label}
                  </div>
                  <div className="flex items-center gap-2">
                    {uptime && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn(
                          "tabular-nums font-medium",
                          parseFloat(uptime.percent) >= 99 ? "text-emerald-600" :
                          parseFloat(uptime.percent) >= 90 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {uptime.percent}
                        </span>
                        <span>·</span>
                        <span>↑ {uptime.duration}</span>
                      </div>
                    )}
                    <StatusBadge status={overallStatus} />
                  </div>
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
