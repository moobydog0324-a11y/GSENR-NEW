import { type NextRequest, NextResponse } from "next/server"

interface NewsItem {
  id: number
  title: string
  summary: string
  source: string
  publishedAt: string
  category: string
  relevanceScore: number
  url: string
}

const categorizeNews = (title: string, originalCategory?: string): string => {
  // MISO API에서 제공하는 카테고리를 우선 사용
  if (originalCategory && originalCategory !== "기타") {
    return originalCategory
  }

  const keywords = {
    한전: ["한전", "한국전력", "KEPCO"],
    SMR: ["SMR", "소형모듈원자로", "소형원자로"],
    원전: ["원전", "원자력", "핵발전", "원자력발전소", "원자로"],
    송전: ["송전", "송전선", "송전망", "전력망", "송배전"],
    ESS: ["ESS", "에너지저장장치", "배터리", "저장시스템"],
    정전: ["정전", "전력공급", "전기공급", "블랙아웃"],
    전력망: ["전력망", "전력계통", "전력시스템", "그리드"],
    열병합: ["열병합", "열병합발전", "CHP"],
    풍력: ["풍력", "풍력발전", "해상풍력", "육상풍력"],
    태양광: ["태양광", "태양광발전", "솔라", "PV"],
    RE100: ["RE100", "재생에너지100", "재생에너지"],
    수소: ["수소", "수소경제", "연료전지", "그린수소", "블루수소"],
    암모니아: ["암모니아", "NH3", "암모니아연료"],
    LNG: ["LNG", "액화천연가스", "가스터미널"],
    재생에너지: ["재생에너지", "신재생", "태양광", "풍력", "수력"],
    석유화학: ["석유화학", "정유", "화학", "플라스틱"],
    원유: ["원유", "유가", "석유", "OPEC"],
  }

  for (const [category, keywordList] of Object.entries(keywords)) {
    if (keywordList.some((keyword) => title.includes(keyword))) {
      return category
    }
  }
  return "기타"
}

const calculateRelevanceScore = (title: string): number => {
  const gsKeywords = ["GS", "E&R", "에너지", "자원"]
  const matches = gsKeywords.filter((keyword) => title.includes(keyword)).length
  return Math.min(70 + matches * 10, 100)
}

export async function POST(request: NextRequest) {
  try {
    const misoEndpoint = process.env.MISO_ENDPOINT
    const misoApiKey = process.env.MISO_API_KEY

    console.log("[v0] 환경 변수 확인:", {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      endpoint: misoEndpoint ? "설정됨" : "미설정",
      apikey: misoApiKey ? "설정됨" : "미설정",
    })

    if (!misoEndpoint || !misoApiKey) {
      console.error("[v0] MISO API 환경 변수 누락")
      return NextResponse.json(
        {
          success: false,
          data: [],
          error: "MISO API 환경 변수가 설정되지 않았습니다.",
          details: {
            endpoint: misoEndpoint ? "설정됨" : "미설정",
            apiKey: misoApiKey ? "설정됨" : "미설정",
            environment: process.env.VERCEL_ENV || "development",
            guide:
              "Vercel 대시보드 > 프로젝트 > Settings > Environment Variables에서 MISO_ENDPOINT와 MISO_API_KEY를 설정하세요.",
          },
        },
        { status: 500 },
      )
    }

    const misoInputs = {
      input: 0,
    }

    const requestBody = {
      inputs: misoInputs,
      mode: "streaming",
      user: "gs-er-news-system",
    }

    console.log("[v0] MISO API 요청 시작:", {
      url: `${misoEndpoint}/workflows/run`,
      method: "POST",
      hasAuth: !!misoApiKey,
      bodySize: JSON.stringify(requestBody).length,
    })

    const controller = new AbortController()
    const timeoutDuration = 30000 // 30초로 단축
    const timeoutId = setTimeout(() => {
      console.log("[v0] 요청 타임아웃 발생 (30초)")
      controller.abort()
    }, timeoutDuration)

    let response: Response
    const maxRetries = 2 // 재시도 횟수 줄임

    try {
      console.log("[v0] MISO API 호출 시작")

      response = await fetch(`${misoEndpoint}/workflows/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${misoApiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "User-Agent": "GS-ER-News-Collector/1.0",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      console.log("[v0] 응답 수신:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      console.error("[v0] MISO API 호출 실패:", fetchError)
      throw fetchError
    }

    clearTimeout(timeoutId)

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("응답 스트림을 읽을 수 없습니다")
    }

    let responseText = ""
    let finalOutputs = null
    const startTime = Date.now()

    try {
      const processingTimeout = setTimeout(() => {
        reader.cancel()
        console.log("[v0] 스트리밍 처리 타임아웃")
      }, 20000)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        responseText += chunk

        const lines = chunk.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.substring(6).trim()
              if (jsonStr && jsonStr !== "[DONE]") {
                const eventData = JSON.parse(jsonStr)
                if (eventData.event === "workflow_finished" && eventData.data?.outputs) {
                  finalOutputs = eventData.data.outputs
                  clearTimeout(processingTimeout)
                  reader.cancel()
                  break
                }
              }
            } catch {
              continue
            }
          }
        }

        if (finalOutputs) break
      }

      clearTimeout(processingTimeout)
    } finally {
      reader.releaseLock()
    }

    const processingTime = Date.now() - startTime
    console.log("[v0] 스트리밍 완료:", {
      processingTime: `${processingTime}ms`,
      responseLength: responseText.length,
      hasOutputs: !!finalOutputs,
    })

    if (!finalOutputs) {
      const lines = responseText.split("\n")
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim()
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.substring(6).trim()
            if (jsonStr && jsonStr !== "[DONE]") {
              const eventData = JSON.parse(jsonStr)
              if (eventData.data?.outputs) {
                finalOutputs = eventData.data.outputs
                break
              }
            }
          } catch {
            continue
          }
        }
      }
    }

    const newsData: NewsItem[] = []

    if (finalOutputs?.output && Array.isArray(finalOutputs.output)) {
      console.log(`[v0] 뉴스 데이터 처리 시작: ${finalOutputs.output.length}개 카테고리`)

      for (const categoryData of finalOutputs.output) {
        try {
          if (!categoryData || categoryData === "[]" || categoryData.trim() === "") {
            continue
          }

          const newsArray = JSON.parse(categoryData)
          if (!Array.isArray(newsArray)) continue

          for (const newsItem of newsArray) {
            if (!newsItem.title || !newsItem.link) continue

            const originalCategory = newsItem.id ? newsItem.id.split("-")[0] : "기타"
            const titleParts = newsItem.title.split(" - ")
            const source = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "알 수 없음"
            const cleanTitle = titleParts.slice(0, -1).join(" - ") || newsItem.title

            let publishedAt: string
            try {
              publishedAt = newsItem.pub_date
                ? new Date(newsItem.pub_date.replace(" ", "T") + ":00").toISOString()
                : new Date().toISOString()
            } catch {
              publishedAt = new Date().toISOString()
            }

            newsData.push({
              id: Date.now() + Math.random(),
              title: cleanTitle,
              summary: `${originalCategory} 관련 뉴스입니다.`,
              source: source,
              publishedAt: publishedAt,
              category: categorizeNews(cleanTitle, originalCategory),
              relevanceScore: calculateRelevanceScore(cleanTitle),
              url: newsItem.link || newsItem.url || "#",
            })
          }
        } catch (categoryError) {
          console.log("[v0] 카테고리 처리 실패:", categoryError)
          continue
        }
      }
    }

    console.log("[v0] 최종 뉴스 처리 결과:", {
      totalNews: newsData.length,
      processingTime: `${processingTime}ms`,
    })

    if (newsData.length === 0) {
      return NextResponse.json({
        success: false,
        data: [],
        message: "뉴스 데이터를 수집하지 못했습니다.",
        error: "NO_NEWS_DATA",
        debug: {
          environment: process.env.VERCEL_ENV || "development",
          processingTime: `${processingTime}ms`,
          responseLength: responseText.length,
          hasOutputs: !!finalOutputs,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: newsData,
      message: `${newsData.length}건의 뉴스를 성공적으로 수집했습니다.`,
      debug: {
        environment: process.env.VERCEL_ENV || "development",
        processingTime: `${processingTime}ms`,
        totalNews: newsData.length,
      },
    })
  } catch (error) {
    console.error("[v0] MISO API 호출 최종 실패:", error)

    let errorMessage = "알 수 없는 오류가 발생했습니다"
    let errorCode = "UNKNOWN_ERROR"

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "요청 시간이 초과되었습니다 (30초)"
        errorCode = "TIMEOUT"
      } else if (error.message.includes("fetch")) {
        errorMessage = "네트워크 연결에 실패했습니다"
        errorCode = "NETWORK_ERROR"
      } else {
        errorMessage = error.message
        errorCode = "API_ERROR"
      }
    }

    return NextResponse.json(
      {
        success: false,
        data: [],
        message: `MISO API 호출 실패: ${errorMessage}`,
        error: errorCode,
        debug: {
          environment: process.env.VERCEL_ENV || "development",
          endpoint: process.env.MISO_ENDPOINT ? "설정됨" : "미설정",
          apiKey: process.env.MISO_API_KEY ? "설정됨" : "미설정",
          errorType: error instanceof Error ? error.name : "Unknown",
        },
      },
      { status: 500 },
    )
  }
}
