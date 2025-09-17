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
      mode: "blocking", // streaming에서 blocking으로 변경하여 타임아웃 방지
      user: "gs-er-news-system",
    }

    console.log("[v0] 미소 API 요청 URL:", `${misoEndpoint}/workflows/run`)
    console.log("[v0] 미소 API 요청 Body:", JSON.stringify(requestBody, null, 2))
    console.log("[v0] 미소 API 입력 데이터:", misoInputs)

    const response = await fetch(`${misoEndpoint}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${misoApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })

    console.log("[v0] 미소 API 응답 상태:", response.status, response.statusText)

    const responseText = await response.text()
    console.log("[v0] 미소 API 원본 응답 길이:", responseText.length)
    console.log("[v0] 미소 API 원본 응답 미리보기:", responseText.substring(0, 500))

    let apiResponse
    try {
      apiResponse = JSON.parse(responseText)
      console.log("[v0] JSON 파싱 성공")
      console.log("[v0] 응답 최상위 키들:", Object.keys(apiResponse))

      if (apiResponse.data) {
        console.log("[v0] apiResponse.data 키들:", Object.keys(apiResponse.data))
        if (apiResponse.data.outputs) {
          console.log("[v0] apiResponse.data.outputs 키들:", Object.keys(apiResponse.data.outputs))
        }
      }
      if (apiResponse.result) {
        console.log("[v0] apiResponse.result 키들:", Object.keys(apiResponse.result))
      }
      if (apiResponse.outputs) {
        console.log("[v0] apiResponse.outputs 키들:", Object.keys(apiResponse.outputs))
      }
    } catch (parseError) {
      console.log("[v0] JSON 파싱 실패, 원본 응답:", responseText.substring(0, 200))
      throw new Error("API 응답을 파싱할 수 없습니다")
    }

    let newsData: NewsItem[] = []

    const outputs = apiResponse.data?.outputs || apiResponse.result || apiResponse.outputs
    console.log("[v0] 최종 선택된 outputs:", outputs ? "존재함" : "없음")

    if (outputs) {
      console.log("[v0] outputs 타입:", typeof outputs)
      console.log("[v0] outputs 키들:", Object.keys(outputs))

      if (outputs.output) {
        console.log("[v0] outputs.output 타입:", typeof outputs.output)
        console.log("[v0] outputs.output 배열 여부:", Array.isArray(outputs.output))
        if (Array.isArray(outputs.output)) {
          console.log("[v0] outputs.output 길이:", outputs.output.length)
          console.log("[v0] outputs.output 첫 번째 항목 미리보기:", outputs.output[0]?.substring(0, 100))
        }
      }

      if (outputs.output && Array.isArray(outputs.output)) {
        console.log("[v0] outputs.output 배열 처리, 총", outputs.output.length, "개 카테고리")

        outputs.output.forEach((categoryData: string, index: number) => {
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
          url: "#",
        },
        {
          id: Date.now() + 2,
          title: "LNG 터미널 확장 공사 착수",
          summary: "인천 LNG 터미널 3호기 건설이 본격 시작되었습니다.",
          source: "가스신문",
          publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          category: "LNG",
          relevanceScore: 89,
          url: "#",
        },
      ]
    }

    console.log("[v0] 최종 처리된 뉴스 데이터 개수:", newsData.length)

    return NextResponse.json({
      success: true,
      data: newsData, // 이미 파싱된 NewsItem[] 배열
      message: `${newsData.length}건의 뉴스를 수집했습니다.`,
      totalCategories: outputs?.output ? outputs.output.length : 0,
    })
  } catch (error) {
    console.error("[v0] 뉴스 수집 API 오류:", error)

    const mockData: NewsItem[] = [
      {
        id: Date.now() + 1,
        title: "신재생에너지 보급 확산 정책 발표",
        summary: "정부가 2024년 신재생에너지 보급 목표를 상향 조정했습니다.",
        source: "에너지데일리",
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        category: "재생에너지",
        relevanceScore: 93,
        url: "#",
      },
      {
        id: Date.now() + 2,
        title: "LNG 터미널 확장 공사 착수",
        summary: "인천 LNG 터미널 3호기 건설이 본격 시작되었습니다.",
        source: "가스신문",
        publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        category: "LNG",
        relevanceScore: 89,
        url: "#",
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
