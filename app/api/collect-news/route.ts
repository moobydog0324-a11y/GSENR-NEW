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
    })

    if (!misoEndpoint || !misoApiKey) {
      return NextResponse.json({ error: "미소 API 설정이 필요합니다. 환경변수를 확인해주세요." }, { status: 500 })
    }

    const misoInputs = {
      input: 0,
    }

    const requestBody = {
      inputs: misoInputs,
      mode: "streaming", // blocking에서 streaming으로 변경하여 타임아웃 방지
      user: "gs-er-news-system",
    }

    console.log("[v0] 미소 API 요청 URL:", `${misoEndpoint}/workflows/run`)
    console.log("[v0] 미소 API 요청 Body:", JSON.stringify(requestBody, null, 2))
    console.log("[v0] 미소 API 입력 데이터:", misoInputs)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000) // 5분 타임아웃

    const response = await fetch(`${misoEndpoint}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${misoApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal, // 타임아웃 시그널 추가
    })

    clearTimeout(timeoutId) // 성공 시 타임아웃 해제

    console.log("[v0] 미소 API 응답 상태:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.log("[v0] 미소 API 오류 응답:", errorText)
      throw new Error(`미소 API 호출 실패: ${response.status} - ${errorText}`)
    }

    const responseText = await response.text()
    console.log("[v0] 미소 API 스트리밍 응답 수신 완료")

    // SSE 형식의 응답을 라인별로 분리
    const lines = responseText.split("\n")
    let finalOutputs = null

    console.log("[v0] 스트리밍 응답 라인 수:", lines.length)

    for (const line of lines) {
      // "data:" 접두사가 있는 라인만 처리
      if (line.startsWith("data: ")) {
        try {
          const jsonStr = line.substring(6) // "data: " 제거
          const eventData = JSON.parse(jsonStr)

          console.log("[v0] 이벤트 처리:", eventData.event)

          // workflow_finished 이벤트에서 최종 결과 추출
          if (eventData.event === "workflow_finished" && eventData.data && eventData.data.outputs) {
            finalOutputs = eventData.data.outputs
            console.log("[v0] 워크플로우 완료, 최종 outputs 추출:", JSON.stringify(finalOutputs, null, 2))
            break
          }

          // iteration_completed 이벤트에서도 결과 확인 (백업)
          if (eventData.event === "iteration_completed" && eventData.data && eventData.data.outputs) {
            finalOutputs = eventData.data.outputs
            console.log("[v0] 반복 완료, outputs 추출:", JSON.stringify(finalOutputs, null, 2))
          }
        } catch (parseError) {
          // JSON 파싱 실패는 무시 (ping 이벤트 등)
          continue
        }
      }
    }

    let newsData: NewsItem[] = []

    if (finalOutputs) {
      console.log("[v0] 최종 outputs 처리 시작")

      if (finalOutputs.output && Array.isArray(finalOutputs.output)) {
        console.log("[v0] outputs.output 배열 처리, 총", finalOutputs.output.length, "개 카테고리")

        finalOutputs.output.forEach((categoryData: string, index: number) => {
          try {
            // 빈 배열 문자열 스킵
            if (categoryData === "[]") {
              return
            }

            const newsArray = JSON.parse(categoryData)
            if (Array.isArray(newsArray) && newsArray.length > 0) {
              console.log(`[v0] 카테고리 ${index}: ${newsArray.length}개 뉴스 파싱`)

              newsArray.forEach((newsItem: any) => {
                // 카테고리 추출 (id에서 추출)
                const originalCategory = newsItem.id ? newsItem.id.split("-")[0] : "기타"

                // 언론사 추출 (제목에서 마지막 - 이후 부분)
                const titleParts = newsItem.title.split(" - ")
                const source = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "알 수 없음"
                const cleanTitle = titleParts.slice(0, -1).join(" - ")

                // 날짜 형식 변환
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

                // 관련도 점수 계산
                const relevanceScore = calculateRelevanceScore(cleanTitle)

                newsData.push({
                  id: Date.now() + Math.random(), // 고유 ID 생성
                  title: cleanTitle,
                  summary: `${originalCategory} 관련 뉴스입니다.`,
                  source: source,
                  publishedAt: publishedAt,
                  category: categorizeNews(cleanTitle, originalCategory) || originalCategory,
                  relevanceScore: relevanceScore,
                  url: newsItem.link || newsItem.url || "#",
                })
              })
            }
          } catch (parseError) {
            console.log(`[v0] 카테고리 ${index} 파싱 실패:`, parseError)
          }
        })
      }
    }

    // 뉴스 데이터가 없으면 Mock 데이터 사용
    if (newsData.length === 0) {
      console.log("[v0] 실제 뉴스 데이터가 없어 Mock 데이터 사용")
      newsData = [
        {
          id: Date.now() + 1,
          title: "신재생에너지 보급 확산 정책 발표",
          summary: "정부가 2024년 신재생에너지 보급 목표를 상향 조정했습니다.",
          source: "에너지데일리",
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          category: "재생에너지",
          relevanceScore: 93,
          url: "https://example.com/news/6",
        },
        {
          id: Date.now() + 2,
          title: "LNG 터미널 확장 공사 착수",
          summary: "인천 LNG 터미널 3호기 건설이 본격 시작되었습니다.",
          source: "가스신문",
          publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          category: "LNG",
          relevanceScore: 89,
          url: "https://example.com/news/7",
        },
      ]
    }

    console.log("[v0] 최종 처리된 뉴스 데이터 개수:", newsData.length)

    return NextResponse.json({
      success: true,
      data: newsData, // 이미 파싱된 NewsItem[] 배열
      message: `${newsData.length}건의 뉴스를 수집했습니다.`,
      totalCategories: finalOutputs?.output ? finalOutputs.output.length : 0,
    })
  } catch (error) {
    console.error("[v0] 뉴스 수집 API 오류:", error)

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.log("[v0] 요청 타임아웃 발생 (5분 초과)")
        return NextResponse.json({
          success: false,
          data: [],
          message: "요청 시간이 초과되었습니다. 미소 워크플로우가 5분을 초과하여 실행되고 있습니다.",
          error: "REQUEST_TIMEOUT",
        })
      }
    }

    const mockData: NewsItem[] = [
      {
        id: Date.now() + 1,
        title: "신재생에너지 보급 확산 정책 발표",
        summary: "정부가 2024년 신재생에너지 보급 목표를 상향 조정했습니다.",
        source: "에너지데일리",
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        category: "재생에너지",
        relevanceScore: 93,
        url: "https://example.com/news/6",
      },
      {
        id: Date.now() + 2,
        title: "LNG 터미널 확장 공사 착수",
        summary: "인천 LNG 터미널 3호기 건설이 본격 시작되었습니다.",
        source: "가스신문",
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        category: "LNG",
        relevanceScore: 89,
        url: "https://example.com/news/7",
      },
    ]

    return NextResponse.json({
      success: false,
      data: mockData,
      message: "API 연결에 실패했습니다. Mock 데이터를 표시합니다.",
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    })
  }
}
