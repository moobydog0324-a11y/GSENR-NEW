"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, CheckCircle, Clock, Globe } from "lucide-react"

interface ApiData {
  id: number
  title: string
  body: string
}

type ApiStatus = "Idle" | "Loading" | "Success" | "Error"

export default function ApiDebugComponent() {
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ApiData[]>([])
  const [apiStatus, setApiStatus] = useState<ApiStatus>("Idle")

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://jsonplaceholder.typicode.com/posts"

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setApiStatus("Loading")
      setError(null)

      try {
        console.log("[v0] API 호출 시작:", apiUrl)

        const response = await fetch(apiUrl)

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()

        // 처음 10개 항목만 가져오기
        const limitedData = Array.isArray(result) ? result.slice(0, 10) : [result]

        setData(limitedData)
        setApiStatus("Success")
        console.log("[v0] API 호출 성공:", limitedData.length, "개 항목")
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred"
        setError(errorMessage)
        setApiStatus("Error")
        console.error("[v0] API 호출 실패:", errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [apiUrl])

  const getStatusIcon = () => {
    switch (apiStatus) {
      case "Loading":
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />
      case "Success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "Error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Globe className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = () => {
    switch (apiStatus) {
      case "Loading":
        return "bg-blue-100 text-blue-800"
      case "Success":
        return "bg-green-100 text-green-800"
      case "Error":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            API Data Fetcher with Debug Interface
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Loading State */}
          {loading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 animate-spin" />
                Loading data from API...
              </div>
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">API Call Failed</AlertTitle>
              <AlertDescription className="text-red-700 mt-2">
                <code className="bg-red-100 px-2 py-1 rounded text-sm font-mono">{error}</code>
              </AlertDescription>
            </Alert>
          )}

          {/* Success State */}
          {!loading && !error && data.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Data loaded successfully</span>
                <Badge variant="secondary">{data.length} items</Badge>
              </div>

              <div className="space-y-3">
                {data.map((item) => (
                  <Card key={item.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4">
                      <h3 className="font-semibold text-lg mb-2 line-clamp-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-3">{item.body}</p>
                      <div className="mt-2">
                        <Badge variant="outline" className="text-xs">
                          ID: {item.id}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Debug Information Section */}
          <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Debug Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">API URL Being Called:</label>
                  <code className="block bg-white p-3 rounded border text-sm font-mono break-all">{apiUrl}</code>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Current API Status:</label>
                  <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <Badge className={getStatusColor()}>{apiStatus}</Badge>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-600 italic">
                  <strong>Reminder:</strong> For the published site, ensure{" "}
                  <code className="bg-gray-200 px-1 rounded">NEXT_PUBLIC_API_URL</code> is correctly set in the Vercel
                  project's Environment Variables settings.
                </p>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}
