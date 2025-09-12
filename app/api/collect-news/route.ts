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

    console.log("[v0] 미소 API 설정 확인:", {
      endpoint: misoEndpoint ? "설정됨" : "미설정",
      apiKey: misoApiKey ? "설정됨" : "미설정",
      environment: process.env.NODE_ENV || "development",
      vercelEnv: process.env.VERCEL_ENV || "preview",
    })

    if (!misoEndpoint || !misoApiKey) {
      console.error("[v0] 서버 환경 변수 누락:", {
        MISO_ENDPOINT: misoEndpoint ? "설정됨" : "미설정",
        MISO_API_KEY: misoApiKey ? "설정됨" : "미설정",
      })
      return NextResponse.json(
        {
          success: false,
          data: [],
          error:
            "미소 API 설정이 필요합니다. Vercel 프로젝트 설정 > Environment Variables에서 MISO_ENDPOINT와 MISO_API_KEY를 설정해주세요.",
          details: {
            endpoint: misoEndpoint ? "설정됨" : "미설정",
            apiKey: misoApiKey ? "설정됨" : "미설정",
            guide: "Vercel 대시보드 > 프로젝트 > Settings > Environment Variables에서 설정하세요.",
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

    console.log("[v0] 미소 API 요청 URL:", `${misoEndpoint}/workflows/run`)
    console.log("[v0] 미소 API 요청 Body:", JSON.stringify(requestBody, null, 2))

    const controller = new AbortController()
    const timeoutDuration = process.env.VERCEL_ENV === "production" ? 600000 : 300000 // 프로덕션: 10분, 개발: 5분
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration)

    console.log(`[v0] 타임아웃 설정: ${timeoutDuration / 1000}초`)

    const response = await fetch(`${misoEndpoint}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${misoApiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    console.log("[v0] 미소 API 응답 상태:", response.status)
    console.log("[v0] 미소 API 응답 헤더:", Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] 미소 API 오류 응답:", errorText)
      throw new Error(`미소 API 호출 실패: ${response.status} - ${errorText}`)
    }

    const responseText = await response.text()
    console.log("[v0] 미소 API 스트리밍 응답 수신 완료, 응답 길이:", responseText.length)

    const lines = responseText.split("\n")
    let finalOutputs = null

    console.log("[v0] 스트리밍 응답 라인 수:", lines.length)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith("data: ")) {
        try {
          const jsonStr = line.substring(6).trim()
          if (jsonStr === "[DONE]" || jsonStr === "") {
            continue
          }

          const eventData = JSON.parse(jsonStr)
          console.log(`[v0] 라인 ${i}: 이벤트 처리:`, eventData.event)

          if (eventData.event === "workflow_finished" && eventData.data && eventData.data.outputs) {
            finalOutputs = eventData.data.outputs
            console.log("[v0] 워크플로우 완료, 최종 outputs 추출")
            break
          }

          if (eventData.event === "iteration_completed" && eventData.data && eventData.data.outputs) {
            finalOutputs = eventData.data.outputs
            console.log("[v0] 반복 완료, outputs 추출")
          }
        } catch (parseError) {
          console.log(`[v0] 라인 ${i} 파싱 실패:`, parseError, "원본:", line)
          continue
        }
      }
    }

    const newsData: NewsItem[] = []

    if (finalOutputs) {
      console.log("[v0] 최종 outputs 처리 시작")
      console.log("[v0] finalOutputs 구조:", Object.keys(finalOutputs))

      if (finalOutputs.output && Array.isArray(finalOutputs.output)) {
        console.log("[v0] outputs.output 배열 처리, 총", finalOutputs.output.length, "개 카테고리")

        finalOutputs.output.forEach((categoryData: string, index: number) => {
          try {
            if (categoryData === "[]" || !categoryData || categoryData.trim() === "") {
              console.log(`[v0] 카테고리 ${index}: 빈 데이터 스킵`)
              return
            }

            console.log(`[v0] 카테고리 ${index} 원본 데이터:`, categoryData.substring(0, 200) + "...")

            const newsArray = JSON.parse(categoryData)
            if (Array.isArray(newsArray) && newsArray.length > 0) {
              console.log(`[v0] 카테고리 ${index}: ${newsArray.length}개 뉴스 파싱`)

              newsArray.forEach((newsItem: any, newsIndex: number) => {
                try {
                  const originalCategory = newsItem.id ? newsItem.id.split("-")[0] : "기타"
                  const titleParts = newsItem.title.split(" - ")
                  const source = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "알 수 없음"
                  const cleanTitle = titleParts.slice(0, -1).join(" - ")

                  let publishedAt: string
                  if (newsItem.pub_date) {
                    try {
                      publishedAt = new Date(newsItem.pub_date.replace(" ", "T") + ":00").toISOString()
                    } catch {
                      publishedAt = new Date().toISOString()
                    }
                  } else {
                    publishedAt = new Date().toISOString()
                  }

                  const relevanceScore = calculateRelevanceScore(cleanTitle)

                  newsData.push({
                    id: Date.now() + Math.random(),
                    title: cleanTitle,
                    summary: `${originalCategory} 관련 뉴스입니다.`,
                    source: source,
                    publishedAt: publishedAt,
                    category: categorizeNews(cleanTitle, originalCategory) || originalCategory,
                    relevanceScore: relevanceScore,
                    url: newsItem.link || newsItem.url || "#",
                  })

                  console.log(`[v0] 뉴스 ${newsIndex} 처리 완료: ${cleanTitle.substring(0, 50)}...`)
                } catch (newsError) {
                  console.log(`[v0] 뉴스 ${newsIndex} 처리 실패:`, newsError)
                }
              })
            }
          } catch (parseError) {
            console.log(`[v0] 카테고리 ${index} 파싱 실패:`, parseError)
          }
        })
      }
    } else {
      console.log("[v0] finalOutputs가 null입니다. 전체 응답 재검토")
      console.log("[v0] 응답 샘플:", responseText.substring(0, 500) + "...")
    }

    if (newsData.length === 0) {
      console.log("[v0] 실제 뉴스 데이터가 없습니다. API 응답을 확인하세요.")
      return NextResponse.json({
        success: false,
        data: [],
        message: "뉴스 데이터를 수집하지 못했습니다. MISO API 응답을 확인해주세요.",
        error: "NO_DATA_RECEIVED",
        debug: {
          environment: process.env.VERCEL_ENV || "preview",
          responseLength: responseText.length,
          linesProcessed: lines.length,
          hasOutputs: !!finalOutputs,
          rawResponse: responseText.substring(0, 1000) + "...",
        },
      })
    }

    console.log("[v0] 최종 처리된 뉴스 데이터 개수:", newsData.length)
    console.log(
      "[v0] 카테고리별 분포:",
      newsData.reduce(
        (acc, news) => {
          acc[news.category] = (acc[news.category] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ),
    )

    return NextResponse.json({
      success: true,
      data: newsData,
      message: `${newsData.length}건의 뉴스를 수집했습니다.`,
      totalCategories: finalOutputs?.output ? finalOutputs.output.length : 0,
      debug: {
        environment: process.env.VERCEL_ENV || "preview",
        responseLength: responseText.length,
        linesProcessed: lines.length,
        hasOutputs: !!finalOutputs,
      },
    })
  } catch (error) {
    console.error("[v0] 뉴스 수집 API 오류:", error)

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.log("[v0] 요청 타임아웃 발생")
        return NextResponse.json({
          success: false,
          data: [],
          message: "요청 시간이 초과되었습니다. MISO 워크플로우 실행 시간이 초과되었습니다.",
          error: "REQUEST_TIMEOUT",
        })
      }
    }

    return NextResponse.json({
      success: false,
      data: [],
      message: "MISO API 호출에 실패했습니다. 환경 변수와 네트워크 연결을 확인해주세요.",
      error: error instanceof Error ? error.message : "알 수 없는 오류",
      debug: {
        environment: process.env.VERCEL_ENV || "preview",
        endpoint: process.env.MISO_ENDPOINT ? "설정됨" : "미설정",
        apiKey: process.env.MISO_API_KEY ? "설정됨" : "미설정",
        errorType: error instanceof Error ? error.name : "Unknown",
      },
    })
  }
}
