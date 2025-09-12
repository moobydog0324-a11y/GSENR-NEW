"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, Download, RefreshCw, Calendar, TrendingUp, Globe, Zap, Settings, ExternalLink } from "lucide-react"

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

const CATEGORIES = [
  "한전",
  "SMR",
  "원전",
  "송전",
  "ESS",
  "정전",
  "전력망",
  "집단에너지",
  "반월열병합발전",
  "풍력",
  "태양광",
  "RE100",
  "REC",
  "수소",
  "암모니아",
]

const mockNewsData: NewsItem[] = [
  {
    id: "한전-1",
    title: '기후솔루션 한전 상대로 소송 제기, "계통관리변전소 자료 비공개 부당하다" - 비즈니스포스트',
    source: "비즈니스포스트",
    publishedAt: "2025-09-10T10:23:00Z",
    category: "한전",
    relevanceScore: 85,
    url: "https://news.google.com/rss/articles/example1",
  },
  {
    id: "SMR-1",
    title: '"2039년까지 SMR 60기 건설 목표… 韩과 협력 필수적" - 동아일보',
    source: "동아일보",
    publishedAt: "2025-09-11T03:00:00Z",
    category: "SMR",
    relevanceScore: 92,
    url: "https://news.google.com/rss/articles/example2",
  },
]

export default function NewsManagementDashboard() {
  const [selectedNews, setSelectedNews] = useState<(number | string)[]>([])
  const [formattedOutput, setFormattedOutput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [newsData, setNewsData] = useState<NewsItem[]>(mockNewsData)
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({})

  const extractSource = (title: string): string => {
    console.log("[v0] 제목에서 언론사 추출 시도:", title)

    // 다양한 패턴으로 언론사 추출 시도
    const patterns = [
      / - (.+)$/, // "제목 - 언론사" 패턴
      /$$(.+)$$$/, // "제목(언론사)" 패턴
      /\[(.+)\]$/, // "제목[언론사]" 패턴
    ]

    for (const pattern of patterns) {
      const match = title.match(pattern)
      if (match && match[1]) {
        console.log("[v0] 언론사 추출 성공:", match[1])
        return match[1].trim()
      }
    }

    console.log("[v0] 언론사 추출 실패, 기본값 사용: 미분류")
    return "미분류"
  }

  const convertMisoDataToNewsItems = (misoData: any[]): NewsItem[] => {
    return misoData.map((item, index) => {
      const extractedSource = extractSource(item.title)
      console.log("[v0] 뉴스 변환:", {
        title: item.title,
        extractedSource: extractedSource,
        category: item.category,
      })

      return {
        id: item.id || `news-${index}`,
        title: item.title,
        source: extractedSource,
        publishedAt: item.pub_date ? new Date(item.pub_date).toISOString() : new Date().toISOString(),
        category: item.category || "기타",
        relevanceScore: Math.floor(Math.random() * 20) + 80,
        url: item.link || item.url || "#",
        link: item.link,
        pub_date: item.pub_date,
      }
    })
  }

  const filterLast24Hours = (news: NewsItem[]) => {
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    return news.filter((item) => {
      const publishedDate = new Date(item.publishedAt)
      return publishedDate >= twentyFourHoursAgo
    })
  }

  const calculateCategoryStats = (news: NewsItem[]) => {
    const stats: Record<string, number> = {}
    news.forEach((item) => {
      stats[item.category] = (stats[item.category] || 0) + 1
    })
    return stats
  }

  const handleNewsSelection = (newsId: number | string, checked: boolean) => {
    if (checked) {
      setSelectedNews([...selectedNews, newsId])
    } else {
      setSelectedNews(selectedNews.filter((id) => id !== newsId))
    }
  }

  const generateFormattedOutput = () => {
    const selectedNewsItems = newsData.filter((news) => selectedNews.includes(news.id))

    if (selectedNewsItems.length === 0) {
      setFormattedOutput("")
      return
    }

    const basicMessage = `안녕하십니까.
미래전략부문 대외협력팀입니다.
오늘의 주요 기사를 게시합니다.

`

    const numberedNewsList = selectedNewsItems
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map((news, index) => {
        const newsNumber = index + 1
        return `${newsNumber}. [${news.category}] ${news.title.replace(/ - .+$/, "")} (${news.source})`
      })
      .join("\n\n")

    setFormattedOutput(basicMessage + numberedNewsList)
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formattedOutput)
      alert("클립보드에 복사되었습니다!")
    } catch (err) {
      console.error("복사 실패:", err)
    }
  }

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
        return convertMisoDataToNewsItems(result.data)
      } else {
        console.warn(`[v0] ${result.message}`)
        return convertMisoDataToNewsItems(result.data || [])
      }
    } catch (error) {
      console.error("[v0] 뉴스 수집 API 호출 오류:", error)
      throw error
    }
  }

  const refreshNews = async () => {
    setIsLoading(true)
    try {
      const newNewsData = await callNewsAPI()

      const filteredNewsData = filterLast24Hours(newNewsData)
      setNewsData(filteredNewsData)

      const stats = calculateCategoryStats(filteredNewsData)
      setCategoryStats(stats)

      console.log(`[v0] 뉴스 수집 완료: 총 ${newNewsData.length}건 중 ${filteredNewsData.length}건 (24시간 이내)`)

      alert(`뉴스 수집이 완료되었습니다! 총 ${filteredNewsData.length}건의 뉴스를 수집했습니다.`)
    } catch (error) {
      console.error("[v0] 뉴스 수집 실패:", error)
      alert("뉴스 수집에 실패했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const filtered24HourNews = filterLast24Hours(mockNewsData)
    setNewsData(filtered24HourNews)
    setCategoryStats(calculateCategoryStats(filtered24HourNews))
  }, [])

  useEffect(() => {
    if (selectedNews.length > 0) {
      generateFormattedOutput()
    } else {
      setFormattedOutput("")
    }
  }, [selectedNews])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Zap className="h-8 w-8 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold text-foreground">GS E&R 뉴스 센터</h1>
                  <p className="text-sm text-foreground/70">에너지 & 자원 뉴스 수집 및 관리 시스템</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={refreshNews} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "수집 중..." : "24시간 뉴스 수집"}
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                설정
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Zap className="h-5 w-5 mr-2" />
                    수집된 뉴스 목록
                  </div>
                  <div className="text-sm text-foreground/60">
                    총 {newsData.length}건 | {selectedNews.length}건 선택됨
                  </div>
                </CardTitle>
                <CardDescription className="text-foreground/70">
                  원하는 뉴스를 체크하여 선택하고, 우측에서 복사 가능한 형태로 출력하세요.
                </CardDescription>
              </CardHeader>
            </Card>

            <div className="space-y-4">
              {newsData
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .map((news) => (
                  <Card
                    key={news.id}
                    className={`hover:shadow-md transition-all duration-200 py-0 ${selectedNews.includes(news.id) ? "ring-2 ring-primary/20 bg-primary/5" : ""}`}
                  >
                    <CardContent className="p-6 h-[94px] flex items-start my-0 py-6">
                      <div className="flex items-start space-x-4 w-full">
                        <div className="flex items-center justify-center w-6 h-6 mt-1">
                          <Checkbox
                            checked={selectedNews.includes(news.id)}
                            onCheckedChange={(checked) => handleNewsSelection(news.id, checked as boolean)}
                            className="w-5 h-5 border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-2 flex-1">
                              <h3
                                className={`font-semibold leading-tight max-w-full ${
                                  selectedNews.includes(news.id) ? "text-primary" : "text-foreground"
                                } ${
                                  news.title.length > 50 ? "text-sm" : news.title.length > 30 ? "text-base" : "text-lg"
                                }`}
                                style={{
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                  wordBreak: "break-word",
                                  lineHeight: "1.3",
                                }}
                              >
                                {news.title}
                              </h3>
                              <a
                                href={news.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 mt-1 flex-shrink-0"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                            <Badge variant="secondary" className="ml-2 flex-shrink-0">
                              {news.relevanceScore}%
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4 text-xs text-foreground/60">
                              <span className="flex items-center">
                                <Globe className="h-3 w-3 mr-1" />
                                {news.source && news.source !== "미분류" ? news.source : "언론사 정보 없음"}
                              </span>
                              <span className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {new Date(news.publishedAt).toLocaleDateString("ko-KR")}
                              </span>
                            </div>
                            <Badge variant="outline">{news.category}</Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  선택된 뉴스 요약
                </CardTitle>
                <CardDescription className="text-foreground/70">
                  선택한 뉴스를 탭으로 구분된 테이블 형식으로 정리합니다
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-foreground/60">
                  {selectedNews.length > 0 ? (
                    <span>{selectedNews.length}건의 뉴스가 선택되었습니다</span>
                  ) : (
                    <span>뉴스를 선택해주세요</span>
                  )}
                </div>

                {formattedOutput && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-foreground mb-2 block">
                        포맷된 출력 (미래전략부문 대외협력팀 형식)
                      </label>
                      <ScrollArea className="h-96 w-full border rounded-md">
                        <Textarea
                          value={formattedOutput}
                          readOnly
                          className="min-h-96 resize-none border-0 focus:ring-0 text-sm leading-relaxed"
                          placeholder="선택된 뉴스가 여기에 미래전략부문 대외협력팀 형식으로 표시됩니다..."
                        />
                      </ScrollArea>
                    </div>
                    <div className="flex space-x-2">
                      <Button onClick={copyToClipboard} className="flex-1">
                        <Copy className="h-4 w-4 mr-2" />
                        클립보드에 복사
                      </Button>
                      <Button variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        다운로드
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">오늘의 통계</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground/60">수집된 뉴스 (24시간)</span>
                  <span className="font-semibold">{newsData.length}건</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground/60">평균 관련도</span>
                  <span className="font-semibold">
                    {newsData.length > 0
                      ? Math.round(newsData.reduce((sum, news) => sum + news.relevanceScore, 0) / newsData.length)
                      : 0}
                    %
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground/60">활성 카테고리</span>
                  <span className="font-semibold">{Object.keys(categoryStats).length}개</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground/60">최신 업데이트</span>
                  <span className="font-semibold text-xs">방금 전</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
