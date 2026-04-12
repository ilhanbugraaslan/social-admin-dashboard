import axios, { AxiosError } from "axios"

const ADMIN_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

const api = axios.create({
  baseURL: `${ADMIN_BASE}/admin/api/v1`,
  headers: { "Content-Type": "application/json" },
})

// Attach stored admin token on every request
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  (res) => {
    if (
      res.data !== null &&
      typeof res.data === "object" &&
      "data" in res.data
    ) {
      res.data = res.data.data
    }
    return res
  },
  (err: AxiosError) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      clearToken()
      window.location.href = "/login"
    }
    return Promise.reject(err)
  }
)

export default api

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("admin_token")
}

export function setToken(token: string) {
  localStorage.setItem("admin_token", token)
}

export function clearToken() {
  localStorage.removeItem("admin_token")
}

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined
    return data?.error ?? err.message
  }
  if (err instanceof Error) return err.message
  return "Beklenmedik bir hata oluştu."
}
