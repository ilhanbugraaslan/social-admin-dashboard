"use client"

import { getToken, clearToken } from "@/lib/api"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function useAdminAuth() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.replace("/login")
      setAuthenticated(false)
    } else {
      setAuthenticated(true)
    }
  }, [router])

  function logout() {
    clearToken()
    router.push("/login")
  }

  return { authenticated, logout }
}
