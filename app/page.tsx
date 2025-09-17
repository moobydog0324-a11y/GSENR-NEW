"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RefreshCw, Calendar, Globe, Zap, Settings, CheckCircle, Copy, FileText } from "lucide-react"

interface NewsItem {
  id: number | string
  title: string
  summary?: string
  source: string
  publishedAt: string
  category: string
  relevanceScore: number
  url: string
  link?: string
  pub_date?: string
}

export default function NewsManagementDashboard() {
  const [selectedNews, setSelectedNews] = useState<number[]>([])
  const [newsData, setNewsData] = useState<NewsItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false)
  const [collectedNewsCount, setCollectedNewsCount] = useState<number>(0)
  const [categoryFilter, setCategoryFilter] = useState<string>("전체")

  const callNewsAPI = async (): Promise<NewsItem[]> => {
    try {
      console.log("[v0] 내부 API를 통한 뉴스 수집 시작...")

      const response = await fetch("/api/collect-news", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`API 호출 실패: ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        console.log(`[v0] ${result.message}`)
        return result.data
      } else {
        console.warn(`[v0] ${result.message}`)
        return result.data
      }
    } catch (error) {
      console.error("[v0] 뉴스 수집 API 호출 오류:", error)
      throw error
    }
  }

  const filterLast24Hours = (news: NewsItem[]) => {
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    return news.filter((item) => {
      const publishedDate = new Date(item.publishedAt)
      return publishedDate >= twentyFourHoursAgo
    })
  }

  const refreshNews = async () => {
    setIsLoading(true)
    try {
      const newNewsData = await callNewsAPI()
      const filteredNewsData = filterLast24Hours(newNewsData)
      const sortedNewsData = filteredNewsData.sort((a, b) => b.relevanceScore - a.relevanceScore)

      setNewsData(sortedNewsData)
      setCollectedNewsCount(filteredNewsData.length)
      setShowSuccessModal(true)
    } catch (error) {
      console.error("[v0] 뉴스 수집 실패:", error)
      alert("뉴스 수집에 실패했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewsSelection = (id: number | string, checked: boolean) => {
    const newsId = typeof id === "string" ? Number.parseInt(id) : id
    setSelectedNews((prevSelectedNews) =>
      checked ? [...prevSelectedNews, newsId] : prevSelectedNews.filter((news) => news !== newsId),
    )
  }

  const handleNewsClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const getSelectedNewsData = () => {
    return newsData.filter((news) =>
      selectedNews.includes(typeof news.id === "string" ? Number.parseInt(news.id) : news.id),
    )
  }

  const formatSelectedNewsForHTML = () => {
    const selectedNewsData = getSelectedNewsData()
    if (selectedNewsData.length === 0) {
      return ""
    }

    const htmlDocument = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>오늘의 주요 기사</title>
    <style>
        body { font-family: 'Malgun Gothic', sans-serif; line-height: 1.6; margin: 20px; }
        h1 { color: #1f2937; border-bottom: 2px solid #A0D3E8; padding-bottom: 10px; }
        ol { padding-left: 20px; }
        li { margin-bottom: 8px; }
        a { color: #3b82f6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .intro { background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>오늘의 주요 기사</h1>
    <div class="intro">
        <p>안녕하십니까. 미래전략부문 대외협력팀 입니다.<br>
        오늘의 주요 기사를 게시합니다.</p>
    </div>
    <ol>
${selectedNewsData
  .map((news, index) => {
    const category = news.category && news.category !== "기타" ? `[${news.category}] ` : "[기타] "
    return `        <li><a href="${news.url || news.link || "#"}">${category}${news.title}(${news.source})</a></li>`
  })
  .join("\n")}
    </ol>
</body>
</html>`

    return htmlDocument
  }

  const copyHTMLToClipboard = async () => {
    const htmlContent = formatSelectedNewsForHTML()

    if (!htmlContent) {
      alert("선택된 뉴스가 없습니다.")
      return
    }

    try {
      await navigator.clipboard.writeText(htmlContent)

      const notification = document.createElement("div")
      notification.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; font-family: sans-serif;">
          ✅ 완전한 HTML 문서가 클립보드에 복사되었습니다!
        </div>
      `
      document.body.appendChild(notification)
      setTimeout(() => document.body.removeChild(notification), 3000)

      console.log("[v0] HTML 복사 완료:", htmlContent.substring(0, 200) + "...")
    } catch (err) {
      console.error("클립보드 복사 실패:", err)
      alert("클립보드 복사에 실패했습니다.")
    }
  }

  const copyToClipboard = () => {
    const selectedNewsData = getSelectedNewsData()
    if (selectedNewsData.length === 0) {
      alert("선택된 뉴스가 없습니다.")
      return
    }

    const formattedText = selectedNewsData
      .map(
        (news, index) =>
          `${index + 1}. ${news.title} - ${news.source} (${new Date(news.publishedAt).toLocaleDateString("ko-KR")})`,
      )
      .join("\n")

    navigator.clipboard.writeText(formattedText)
    alert("선택된 뉴스가 텍스트 형식으로 클립보드에 복사되었습니다!")
  }

  useEffect(() => {
    setNewsData([])
  }, [])

  const filteredNews = newsData.filter((news) => {
    if (categoryFilter === "전체") {
      return true
    }
    return news.category === categoryFilter
  })

  const getUniqueCategories = () => {
    const categories = newsData.map((news) => news.category)
    return ["전체", ...Array.from(new Set(categories))]
  }

  return (
    <div className="min-h-screen bg-background">
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border animate-in fade-in-0 zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-card-foreground">뉴스 수집 완료!</h3>
                <p className="text-sm text-muted">
                  총 <span className="font-semibold text-primary">{collectedNewsCount}건</span>의 뉴스를 성공적으로
                  수집했습니다.
                </p>
              </div>
              <Button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                확인
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-chart-1 rounded-lg flex items-center justify-center">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-card-foreground">GS E&R 뉴스 센터</h1>
                  <p className="text-sm text-muted">에너지 & 자원 뉴스 수집 및 관리 시스템</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={refreshNews}
                disabled={isLoading}
                className="border-primary/20 bg-transparent hover:bg-primary/10 text-slate-700 hover:text-slate-800 font-medium"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "수집 중..." : "24시간 뉴스 수집"}
              </Button>
              <Button variant="outline" className="border-border text-muted hover:bg-muted/10 bg-transparent">
                <Settings className="h-4 w-4 mr-2" />
                설정
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card shadow-sm border-border">
              <CardContent className="p-6">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-card-foreground">카테고리:</span>
                  <div className="flex flex-wrap gap-2">
                    {getUniqueCategories().map((category) => (
                      <Button
                        key={category}
                        variant={categoryFilter === category ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCategoryFilter(category)}
                        className={
                          categoryFilter === category
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "border-border text-muted hover:bg-muted/10"
                        }
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {filteredNews.map((news) => (
                <Card
                  key={news.id}
                  className="bg-card hover:shadow-md transition-all duration-200 cursor-pointer group border-border"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-4">
                      <div className="flex items-center justify-center pt-1">
                        <Checkbox
                          checked={selectedNews.includes(
                            typeof news.id === "string" ? Number.parseInt(news.id) : news.id,
                          )}
                          onCheckedChange={(checked) => {
                            handleNewsSelection(news.id, checked as boolean)
                          }}
                          className="h-6 w-6 border-2 border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </div>
                      <div className="flex-1 min-w-0" onClick={() => handleNewsClick(news.url)}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold text-card-foreground text-xl leading-tight group-hover:text-primary transition-colors">
                            {news.title}
                          </h3>
                          <Badge className="bg-accent text-accent-foreground text-base px-3 py-1 flex-shrink-0">
                            {news.relevanceScore}%
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-3 text-base text-muted mt-2">
                          <span className="flex items-center">
                            <Globe className="h-5 w-5 mr-1" />
                            {news.source}
                          </span>
                          <span>•</span>
                          <span className="flex items-center">
                            <Calendar className="h-5 w-5 mr-1" />
                            {new Date(news.publishedAt).toLocaleDateString("ko-KR")}
                          </span>
                          <Badge variant="outline" className="border-border text-muted text-sm">
                            {news.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card className="bg-card shadow-sm border-border">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-card-foreground">선택된 뉴스</h3>
                    <Badge className="bg-primary text-primary-foreground">{selectedNews.length}개 선택</Badge>
                  </div>

                  {selectedNews.length > 0 ? (
                    <>
                      <div className="space-y-3">
                        <div className="p-4 bg-muted/20 rounded-lg border border-border">
                          <h4 className="text-sm font-medium mb-3 text-card-foreground flex items-center">
                            <FileText className="h-4 w-4 mr-2" />
                            HTML 미리보기:
                          </h4>
                          <div className="text-sm leading-relaxed text-card-foreground space-y-2">
                            <div className="bg-primary/10 p-3 rounded border-l-4 border-primary">
                              <p>
                                안녕하십니까. 미래전략부문 대외협력팀 입니다.
                                <br />
                                오늘의 주요 기사를 게시합니다.
                              </p>
                            </div>
                            <ol className="list-decimal list-inside space-y-1">
                              {getSelectedNewsData().map((news, index) => {
                                const category =
                                  news.category && news.category !== "기타" ? `[${news.category}] ` : "[기타] "
                                return (
                                  <li key={news.id} className="text-primary hover:text-primary/80">
                                    <a href={news.url || news.link || "#"} className="underline">
                                      {category}
                                      {news.title}({news.source})
                                    </a>
                                  </li>
                                )
                              })}
                            </ol>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {getSelectedNewsData().map((news, index) => (
                          <div key={news.id} className="p-3 bg-muted/10 rounded-lg border border-border">
                            <div className="text-sm font-medium line-clamp-2 mb-1 text-card-foreground">
                              {index + 1}. {news.title}
                            </div>
                            <div className="text-xs text-muted">
                              {news.source} • {new Date(news.publishedAt).toLocaleDateString("ko-KR")}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <Button
                          onClick={copyHTMLToClipboard}
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground text-base py-3"
                        >
                          <Copy className="h-5 w-5 mr-2" />
                          완전한 HTML 문서로 복사
                        </Button>
                        <Button
                          onClick={copyToClipboard}
                          variant="outline"
                          className="w-full border-border text-muted hover:bg-muted/10 bg-transparent"
                        >
                          텍스트로 복사
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-8 h-8 text-muted" />
                      </div>
                      <p className="text-muted text-sm">뉴스를 선택해주세요</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
