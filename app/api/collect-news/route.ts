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

    console.log("[v0] === MISO API 연결 진단 시작 ===")
    console.log(`[v0] MISO_ENDPOINT: ${misoEndpoint ? "설정됨" : "❌ 미설정"}`)
    console.log(`[v0] MISO_API_KEY: ${misoApiKey ? "설정됨" : "❌ 미설정"}`)

    if (!misoEndpoint || !misoApiKey) {
      console.log("[v0] ❌ 필수 환경변수 누락")
      return NextResponse.json({
        success: false,
        message: "뉴스 수집을 실패하였습니다.",
        data: [],
        error: "MISO API 환경변수가 설정되지 않았습니다.",
      })
    }

    let apiUrl: string
    if (misoEndpoint.endsWith("/ext/v1/workflows/run")) {
      // 이미 완전한 경로인 경우
      apiUrl = misoEndpoint
    } else if (misoEndpoint.endsWith("/ext/v1")) {
      // /ext/v1까지만 있는 경우
      apiUrl = `${misoEndpoint}/workflows/run`
    } else {
      // 기본 도메인만 있는 경우
      apiUrl = `${misoEndpoint}/ext/v1/workflows/run`
    }

    console.log(`[v0] 최종 API URL: ${apiUrl}`)

    const requestBody = {
      inputs: {}, // 가이드에 따르면 필수이지만 빈 객체 가능
      mode: "blocking", // 가이드에 따른 blocking 모드 사용
      user: "gs-er-news-system", // 가이드에 따른 사용자 식별자
    }

    console.log("[v0] MISO API 호출 시작...")
    console.log(`[v0] 요청 본문: ${JSON.stringify(requestBody)}`)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log("[v0] ⏰ 10분 타임아웃 발생")
      controller.abort()
    }, 600000) // 10분

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

      console.log(`[v0] HTTP 응답: ${response.status} ${response.statusText}`)
      console.log(`[v0] 응답 헤더: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`[v0] ❌ API 오류 응답: ${errorText}`)

        let errorMessage = "MISO API 요청이 실패했습니다."
        if (response.status === 401) {
          errorMessage = "MISO API 인증에 실패했습니다. API 키를 확인해주세요."
        } else if (response.status === 404) {
          errorMessage = "MISO API 엔드포인트를 찾을 수 없습니다. URL을 확인해주세요."
        } else if (response.status === 400) {
          errorMessage = "MISO API 요청 형식이 올바르지 않습니다."
        }

        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: `${errorMessage} (HTTP ${response.status})`,
        })
      }

      const responseText = await response.text()
      console.log(`[v0] 응답 크기: ${responseText.length}자`)
      console.log(`[v0] 응답 미리보기: ${responseText.substring(0, 200)}...`)

      let apiResponse
      try {
        apiResponse = JSON.parse(responseText)
        console.log("[v0] ✅ JSON 파싱 성공")
        console.log(`[v0] 응답 최상위 키: ${JSON.stringify(Object.keys(apiResponse))}`)
      } catch (parseError) {
        console.log(`[v0] ❌ JSON 파싱 실패: ${parseError.message}`)
        console.log(`[v0] 원본 응답: ${responseText}`)
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "MISO API 응답 형식이 올바르지 않습니다.",
        })
      }

      const newsData: NewsItem[] = []

      if (apiResponse.data?.status === "succeeded" && apiResponse.data?.outputs) {
        console.log("[v0] ✅ MISO API 성공 응답 확인")
        console.log(`[v0] 출력 키들: ${JSON.stringify(Object.keys(apiResponse.data.outputs))}`)

        const outputs = apiResponse.data.outputs
        let newsContent = null

        // outputs에서 뉴스 데이터 찾기 (더 포괄적인 검색)
        for (const [key, value] of Object.entries(outputs)) {
          console.log(`[v0] 출력 키 '${key}' 분석 중... (타입: ${typeof value})`)

          if (typeof value === "string") {
            // 뉴스 관련 키워드가 포함된 경우
            if (
              value.includes("news_briefing") ||
              value.includes("뉴스") ||
              value.includes("title") ||
              value.includes("summary") ||
              value.includes("press")
            ) {
              console.log(`[v0] ✅ '${key}'에서 뉴스 데이터 발견`)
              newsContent = value
              break
            }
          } else if (typeof value === "object" && value !== null) {
            // 객체 형태의 뉴스 데이터
            console.log(`[v0] ✅ '${key}'에서 객체 형태 데이터 발견`)
            newsContent = value
            break
          }
        }

        // 첫 번째 출력값을 fallback으로 사용
        if (!newsContent) {
          const firstKey = Object.keys(outputs)[0]
          if (firstKey) {
            console.log(`[v0] 📝 첫 번째 출력값 사용: ${firstKey}`)
            newsContent = outputs[firstKey]
          }
        }

        if (newsContent) {
          try {
            let parsedData = newsContent

            if (typeof newsContent === "string") {
              console.log("[v0] 문자열 데이터 파싱 시도")

              // 다양한 JSON 형식 처리
              if (newsContent.includes("```json")) {
                const jsonMatch = newsContent.match(/```json\n([\s\S]*?)\n```/)
                if (jsonMatch) {
                  parsedData = JSON.parse(jsonMatch[1])
                  console.log("[v0] ✅ JSON 코드 블록에서 파싱 성공")
                }
              } else if (newsContent.includes("```")) {
                const codeMatch = newsContent.match(/```\n([\s\S]*?)\n```/)
                if (codeMatch) {
                  try {
                    parsedData = JSON.parse(codeMatch[1])
                    console.log("[v0] ✅ 일반 코드 블록에서 파싱 성공")
                  } catch {
                    parsedData = { raw_text: newsContent }
                  }
                }
              } else {
                // 직접 JSON 파싱 시도
                try {
                  parsedData = JSON.parse(newsContent)
                  console.log("[v0] ✅ 직접 JSON 파싱 성공")
                } catch {
                  // JSON이 아닌 경우 텍스트로 처리
                  console.log("[v0] 📝 JSON이 아닌 텍스트로 처리")
                  parsedData = { raw_text: newsContent }
                }
              }
            }

            let newsArray = []

            if (parsedData?.news_briefing && Array.isArray(parsedData.news_briefing)) {
              newsArray = parsedData.news_briefing
              console.log(`[v0] ✅ news_briefing 배열에서 ${newsArray.length}개 뉴스 발견`)
            } else if (Array.isArray(parsedData)) {
              newsArray = parsedData
              console.log(`[v0] ✅ 직접 배열에서 ${newsArray.length}개 뉴스 발견`)
            } else if (parsedData?.data && Array.isArray(parsedData.data)) {
              newsArray = parsedData.data
              console.log(`[v0] ✅ data 배열에서 ${newsArray.length}개 뉴스 발견`)
            } else {
              console.log("[v0] ❌ 뉴스 배열을 찾을 수 없음")
              console.log(`[v0] 파싱된 데이터 구조: ${JSON.stringify(Object.keys(parsedData || {})).substring(0, 200)}`)
            }

            // 뉴스 항목 처리
            newsArray.forEach((item: any, index: number) => {
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
                  title: item.title || `뉴스 ${index + 1}`,
                  summary: item.summary || `${cleanCategory} 관련 뉴스입니다.`,
                  source: item.press || item.source || "알 수 없음",
                  publishedAt: publishedAt,
                  category: categorizeNews(item.title, cleanCategory),
                  relevanceScore: item.score || calculateRelevanceScore(item.title || ""),
                  url: item.url || "#",
                })
              } catch (itemError) {
                console.log(`[v0] ⚠️ 뉴스 항목 ${index} 처리 실패: ${itemError.message}`)
              }
            })
          } catch (dataError) {
            console.log(`[v0] ❌ 뉴스 데이터 파싱 실패: ${dataError.message}`)
          }
        } else {
          console.log("[v0] ❌ 출력에서 뉴스 데이터를 찾을 수 없음")
        }
      } else if (apiResponse.data?.status === "failed") {
        console.log(`[v0] ❌ MISO 워크플로우 실행 실패: ${apiResponse.data.error}`)
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: `MISO 워크플로우 실행 실패: ${apiResponse.data.error}`,
        })
      } else if (apiResponse.data?.status === "running") {
        console.log("[v0] ⏳ MISO 워크플로우가 아직 실행 중입니다")
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "MISO 워크플로우가 아직 실행 중입니다. 잠시 후 다시 시도해주세요.",
        })
      } else {
        console.log("[v0] ❓ 예상하지 못한 응답 구조")
        console.log(`[v0] 전체 응답 구조: ${JSON.stringify(apiResponse).substring(0, 500)}`)
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "MISO API에서 예상하지 못한 응답을 받았습니다.",
        })
      }

      console.log(`[v0] 🎉 최종 처리된 뉴스: ${newsData.length}개`)

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
        message: `${newsData.length}건의 뉴스를 성공적으로 수집했습니다.`,
        totalCategories: [...new Set(newsData.map((item) => item.category))].length,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)

      if (fetchError.name === "AbortError") {
        console.log("[v0] ⏰ 요청 타임아웃 (10분)")
        return NextResponse.json({
          success: false,
          message: "뉴스 수집을 실패하였습니다.",
          data: [],
          error: "MISO API 요청 시간이 초과되었습니다 (10분). 네트워크 상태를 확인해주세요.",
        })
      }

      console.log(`[v0] 🌐 네트워크 오류: ${fetchError.message}`)
      throw fetchError
    }
  } catch (error) {
    console.error(`[v0] 💥 전체 API 오류: ${error.message}`)

    return NextResponse.json({
      success: false,
      message: "뉴스 수집을 실패하였습니다.",
      data: [],
      error: error instanceof Error ? error.message : "알 수 없는 시스템 오류가 발생했습니다.",
    })
  }
}
