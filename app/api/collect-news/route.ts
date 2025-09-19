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

    console.log("[v0] === MISO API 연결 시작 ===")
    console.log("[v0] 환경변수 확인:")
    console.log(`[v0] - MISO_ENDPOINT: ${misoEndpoint ? "설정됨" : "미설정"}`)
    console.log(`[v0] - MISO_API_KEY: ${misoApiKey ? "설정됨" : "미설정"}`)

    if (!misoEndpoint || !misoApiKey) {
      console.log("[v0] 필수 환경변수 누락")
      return NextResponse.json({
        success: false,
        message: "뉴스 수집을 실패하였습니다.",
        data: [],
        error: "MISO API 환경변수가 설정되지 않았습니다.",
      })
    }

    let apiUrl: string
    if (misoEndpoint.includes("/workflows/run")) {
      // 이미 전체 경로가 포함된 경우
      apiUrl = misoEndpoint
    } else if (misoEndpoint.endsWith("/ext/v1")) {
      // /ext/v1로 끝나는 경우
      apiUrl = `${misoEndpoint}/workflows/run`
    } else if (misoEndpoint.includes("/ext/v1")) {
      // 중간에 /ext/v1이 포함된 경우
      apiUrl = misoEndpoint.replace(/\/ext\/v1.*$/, "/ext/v1/workflows/run")
    } else {
      // 기본 도메인만 있는 경우
      apiUrl = `${misoEndpoint}/ext/v1/workflows/run`
    }

    console.log(`[v0] 최종 API URL: ${apiUrl}`)

    const requestBody = {
      inputs: {}, // 필수 필드
      mode: "blocking", // blocking 또는 streaming
      user: "gs-er-news-system", // 필수 필드
    }

    console.log("[v0] MISO API 호출 시작...")
    console.log(`[v0] 요청 본문: ${JSON.stringify(requestBody)}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log("[v0] 5분 타임아웃 발생")
      controller.abort()
    }, 300000) // 5분

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${misoApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log(`[v0] 응답 상태: ${response.status} ${response.statusText}`)
      console.log(`[v0] 응답 헤더:`, Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`[v0] API 오류 응답: ${errorText}`)

        if (response.status === 401) {
          return NextResponse.json({
            success: false,
            message: "뉴스 수집을 실패하였습니다.",
            data: [],
            error: "MISO API 인증 실패. API 키를 확인해주세요.",
          })
        }

        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: `MISO API 요청 실패 (${response.status}): ${response.statusText}`,
        })
      }

      const responseText = await response.text()
      console.log(`[v0] 응답 길이: ${responseText.length}자`)
      console.log(`[v0] 응답 미리보기: ${responseText.substring(0, 500)}...`)

      let apiResponse
      try {
        apiResponse = JSON.parse(responseText)
        console.log("[v0] JSON 파싱 성공")
        console.log(`[v0] 응답 구조: ${JSON.stringify(Object.keys(apiResponse))}`)
      } catch (parseError) {
        console.log(`[v0] JSON 파싱 실패: ${parseError.message}`)
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "MISO API 응답을 파싱할 수 없습니다.",
        })
      }

      const newsData: NewsItem[] = []

      if (apiResponse.data?.status === "succeeded" && apiResponse.data?.outputs) {
        console.log("[v0] MISO API 성공 응답 확인")
        console.log(`[v0] 출력 키들: ${JSON.stringify(Object.keys(apiResponse.data.outputs))}`)

        const outputs = apiResponse.data.outputs
        let resultData = null

        // outputs에서 뉴스 데이터 찾기
        for (const [key, value] of Object.entries(outputs)) {
          console.log(`[v0] 출력 키 ${key} 확인 중...`)
          if (
            typeof value === "string" &&
            (value.includes("news_briefing") || value.includes("뉴스") || value.includes("title"))
          ) {
            console.log(`[v0] outputs.${key}에서 뉴스 데이터 발견`)
            resultData = value
            break
          }
        }

        if (!resultData) {
          // 첫 번째 출력값 사용
          const firstKey = Object.keys(outputs)[0]
          if (firstKey) {
            console.log(`[v0] 첫 번째 출력값 사용: ${firstKey}`)
            resultData = outputs[firstKey]
          }
        }

        if (resultData) {
          try {
            let parsedData = resultData

            // 문자열인 경우 JSON 파싱 시도
            if (typeof resultData === "string") {
              console.log("[v0] 문자열 데이터 파싱 시도")

              // \`\`\`json 블록 제거
              if (resultData.includes("```json")) {
                const jsonMatch = resultData.match(/```json\n([\s\S]*?)\n```/)
                if (jsonMatch) {
                  parsedData = JSON.parse(jsonMatch[1])
                  console.log("[v0] JSON 블록에서 파싱 성공")
                }
              } else {
                try {
                  parsedData = JSON.parse(resultData)
                  console.log("[v0] 직접 JSON 파싱 성공")
                } catch {
                  console.log("[v0] JSON 파싱 실패, 원본 텍스트 사용")
                  parsedData = { raw_text: resultData }
                }
              }
            }

            // 뉴스 데이터 추출
            if (parsedData?.news_briefing && Array.isArray(parsedData.news_briefing)) {
              console.log(`[v0] ${parsedData.news_briefing.length}개 뉴스 발견`)

              parsedData.news_briefing.forEach((item: any, index: number) => {
                try {
                  const cleanCategory = item.category ? item.category.replace(/[[\]]/g, "") : "기타"

                  let publishedAt: string
                  if (item.date) {
                    try {
                      publishedAt = new Date(item.date + "T00:00:00").toISOString()
                    } catch {
                      publishedAt = new Date().toISOString()
                    }
                  } else {
                    publishedAt = new Date().toISOString()
                  }

                  newsData.push({
                    id: Date.now() + index,
                    title: item.title || "제목 없음",
                    summary: item.summary || `${cleanCategory} 관련 뉴스입니다.`,
                    source: item.press || "알 수 없음",
                    publishedAt: publishedAt,
                    category: categorizeNews(item.title, cleanCategory),
                    relevanceScore: item.score || calculateRelevanceScore(item.title),
                    url: item.url || "#",
                  })
                } catch (itemError) {
                  console.log(`[v0] 뉴스 항목 ${index} 처리 실패: ${itemError.message}`)
                }
              })
            } else {
              console.log("[v0] news_briefing 배열을 찾을 수 없음, 원본 데이터 확인")
              console.log(`[v0] 파싱된 데이터 구조: ${JSON.stringify(Object.keys(parsedData))}`)
            }
          } catch (dataError) {
            console.log(`[v0] 뉴스 데이터 파싱 실패: ${dataError.message}`)
          }
        }
      } else if (apiResponse.data?.status === "failed") {
        console.log(`[v0] MISO 워크플로우 실행 실패: ${apiResponse.data.error}`)
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: `MISO 워크플로우 실행 실패: ${apiResponse.data.error}`,
        })
      } else {
        console.log("[v0] 예상하지 못한 응답 구조")
        console.log(`[v0] 전체 응답: ${JSON.stringify(apiResponse)}`)
      }

      console.log(`[v0] 최종 처리된 뉴스: ${newsData.length}개`)

      if (newsData.length === 0) {
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "수집된 뉴스가 없습니다.",
        })
      }

      return NextResponse.json({
        success: true,
        data: newsData,
        message: `${newsData.length}건의 뉴스를 수집했습니다.`,
        totalCategories: newsData.length > 0 ? 1 : 0,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)

      if (fetchError.name === "AbortError") {
        console.log("[v0] 요청 타임아웃")
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "MISO API 요청 시간 초과 (5분)",
        })
      }

      console.log(`[v0] 네트워크 오류: ${fetchError.message}`)
      throw fetchError
    }
  } catch (error) {
    console.error(`[v0] API 오류: ${error.message}`)

    return NextResponse.json({
      success: false,
      message: "뉴스 수집을 실패하였습니다.",
      data: [],
      error: error instanceof Error ? error.message : "알 수 없는 오류",
    })
  }
}
