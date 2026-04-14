"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import axios from "axios"
import { CheckCircle, XCircle, RefreshCw, Clock, Database, Server, ChevronDown, ChevronUp } from "lucide-react"
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
}

interface Stats {
  total_users: number
  total_links: number
  total_campaigns: number
  total_workspaces: number
}

interface HistoryPoint { t: number; up: boolean }

interface UptimeRecord {
  service_id: string
  up_count: number
  total_count: number
  last_down_at: number | null
  started_at: number
  history: HistoryPoint[]
}

async function fetchHealth(url: string): Promise<HealthResult> {
  const start = Date.now()
  try {
    const res = await axios.get(url, { timeout: 5000 })
    return { status: res.data?.status === "ok" ? "ok" : "error", latency_ms: Date.now() - start }
  } catch {
    return { status: "error", latency_ms: Date.now() - start }
  }
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return "< 1m"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const services = [
  {
    id: "api",
    label: "Core API Backend",
    icon: Server,
    checks: [
      { label: "HTTP",       url: `${BASE}/health` },
      { label: "Database",   url: `${BASE}/health/db` },
      { label: "Redis",      url: `${BASE}/health/redis` },
      { label: "ClickHouse", url: `${BASE}/health/clickhouse` },
    ],
  },
  {
    id: "redirect",
    label: "Redirect Service",
    icon: RefreshCw,
    checks: [
      { label: "HTTP",  url: `${BASE}/admin/api/v1/health/redirect` },
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

// 90-block history bar like OpenAI status page
function UptimeBar({ history }: { history: HistoryPoint[] }) {
  const BAR_SIZE = 90
  const blocks = Array.from({ length: BAR_SIZE }, (_, i) => {
    const offset = i - (BAR_SIZE - history.length)
    if (offset < 0) return "empty"
    return history[offset].up ? "up" : "down"
  })
  return (
    <div className="flex gap-px">
      {blocks.map((s, i) => (
        <div
          key={i}
          className={cn("h-8 flex-1 rounded-[2px]", {
            "bg-emerald-500": s === "up",
            "bg-red-500":     s === "down",
            "bg-muted":       s === "empty",
          })}
        />
      ))}
    </div>
  )
}

function CheckRow({ label, result }: { label: string; result: HealthResult }) {
  const Icon = result.status === "ok" ? CheckCircle : result.status === "loading" ? Clock : XCircle
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", {
          "text-emerald-500": result.status === "ok",
          "text-muted-foreground animate-pulse": result.status === "loading",
          "text-red-500": result.status === "error",
        })} />
        {label}
      </div>
      {result.latency_ms !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums">{result.latency_ms}ms</span>
      )}
    </div>
  )
}

export default function MonitoringPage() {
  const [now, setNow] = useState(new Date())
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const qc = useQueryClient()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Health checks every 10s
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

  // Uptime records from server
  const { data: uptimeRecords } = useQuery<UptimeRecord[]>({
    queryKey: ["admin", "uptime"],
    queryFn: () => api.get<UptimeRecord[]>("/uptime").then((r) => r.data),
    refetchInterval: 30_000,
  })

  const recordUptime = useMutation({
    mutationFn: (body: { service_id: string; up: boolean }) => api.post("/uptime", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "uptime"] }),
  })

  const { data: stats, dataUpdatedAt, refetch: refetchStats, isFetching } = useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<Stats>("/stats").then((r) => r.data),
    refetchInterval: 15_000,
  })

  useEffect(() => {
    if (dataUpdatedAt) setRefreshedAt(new Date(dataUpdatedAt))
  }, [dataUpdatedAt])

  const byService = services.map((svc) => {
    const rows = healthQueries.filter((q) => q.serviceId === svc.id)
    const isLoading = rows.some((r) => r.result.data?.status === "loading")
    const overallOk = rows.every((r) => r.result.data?.status === "ok")
    return { ...svc, rows, isLoading, overallOk }
  })

  const queryUpdateKey = healthQueries.map((q) => q.result.dataUpdatedAt).join(",")
  useEffect(() => {
    byService.forEach((svc) => {
      if (svc.isLoading) return
      recordUptime.mutate({ service_id: svc.id, up: svc.overallOk })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryUpdateKey])

  function getUptime(serviceId: string) {
    const r = uptimeRecords?.find((u) => u.service_id === serviceId)
    if (!r || r.total_count < 2) return null
    const pct = (r.up_count / r.total_count) * 100
    const since = r.last_down_at ?? r.started_at
    return {
      percent: pct.toFixed(2) + "%",
      duration: formatDuration(now.getTime() - since),
      history: r.history,
    }
  }

  function handleRefresh() {
    refetchStats()
    healthQueries.forEach((q) => q.result.refetch())
    qc.invalidateQueries({ queryKey: ["admin", "uptime"] })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-refreshes every 10s &nbsp;·&nbsp;
            {refreshedAt ? <>Last updated {refreshedAt.toLocaleTimeString()}</> : "Checking…"}
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

      {/* OpenAI-style service status list */}
      <div className="border rounded-xl divide-y overflow-hidden">
        {byService.map((svc) => {
          const uptime = getUptime(svc.id)
          const overallOk = svc.isLoading ? null : svc.overallOk
          const isOpen = expanded[svc.id]
          return (
            <div key={svc.id} className="p-4 space-y-3 bg-card">
              {/* Service row */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  {overallOk === null ? (
                    <Clock className="h-5 w-5 text-muted-foreground animate-pulse shrink-0" />
                  ) : overallOk ? (
                    <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                  )}
                  <span className="font-semibold text-sm">{svc.label}</span>
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [svc.id]: !p[svc.id] }))}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {svc.checks.length} checks
                    {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
                <span className={cn("text-sm font-medium tabular-nums shrink-0", {
                  "text-muted-foreground": !uptime,
                  "text-emerald-600": uptime && parseFloat(uptime.percent) >= 99,
                  "text-yellow-600": uptime && parseFloat(uptime.percent) >= 90 && parseFloat(uptime.percent) < 99,
                  "text-red-600": uptime && parseFloat(uptime.percent) < 90,
                })}>
                  {uptime ? `${uptime.percent} uptime` : "collecting…"}
                </span>
              </div>

              {/* History bar */}
              <UptimeBar history={uptime?.history ?? []} />

              {/* Timestamp range label */}
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>
                  {uptime
                    ? new Date(uptimeRecords!.find(u => u.service_id === svc.id)!.started_at).toLocaleDateString()
                    : "—"}
                </span>
                <span>↑ {uptime?.duration ?? "—"} continuous</span>
                <span>Now</span>
              </div>

              {/* Expandable check details */}
              {isOpen && (
                <div className="pt-1 border-t divide-y">
                  {svc.rows.map((row) => (
                    <CheckRow
                      key={row.label}
                      label={row.label}
                      result={row.result.data ?? { status: "loading" }}
                    />
                  ))}
                </div>
              )}
            </div>
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
                { label: "Users",      key: "total_users" },
                { label: "Links",      key: "total_links" },
                { label: "Campaigns",  key: "total_campaigns" },
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
