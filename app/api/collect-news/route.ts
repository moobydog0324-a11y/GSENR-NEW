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
      mode: "blocking",
      user: "gs-er-news-system",
    }

    console.log("[v0] MISO API 요청 시작:", {
      url: `${misoEndpoint}/workflows/run`,
      method: "POST",
      hasAuth: !!misoApiKey,
      bodySize: JSON.stringify(requestBody).length,
    })

    const controller = new AbortController()
    const timeoutDuration = 600000 // 10분으로 변경
    const timeoutId = setTimeout(() => {
      console.log("[v0] 요청 타임아웃 발생")
      controller.abort()
    }, timeoutDuration)

    let response: Response
    let retryCount = 0
    const maxRetries = 5

    while (retryCount < maxRetries) {
      try {
        console.log(`[v0] MISO API 호출 시도 ${retryCount + 1}/${maxRetries}`)

        response = await fetch(`${misoEndpoint}/workflows/run`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${misoApiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "GS-ER-News-Collector/1.0",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        console.log(`[v0] 시도 ${retryCount + 1} 응답:`, {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        })

        const contentType = response.headers.get("content-type")
        console.log(`[v0] Content-Type: ${contentType}`)

        if (response.ok && contentType?.includes("application/json")) {
          break // JSON 응답이면 성공
        } else if (response.ok && !contentType?.includes("application/json")) {
          // 200이지만 HTML 응답인 경우
          const responseText = await response.text()
          console.log(`[v0] HTML 응답 감지 (재시도 필요):`, responseText.substring(0, 200))
          throw new Error(`HTML 응답 수신: ${responseText.substring(0, 100)}`)
        } else if (response.status >= 500 && retryCount < maxRetries - 1) {
          // 서버 오류면 재시도
          console.log(`[v0] 서버 오류 (${response.status}), 재시도 중...`)
          retryCount++
          await new Promise((resolve) => setTimeout(resolve, 5000 * retryCount)) // 5초씩 증가
          continue
        } else {
          // 클라이언트 오류면 즉시 실패
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (fetchError) {
        console.log(`[v0] 시도 ${retryCount + 1} 실패:`, fetchError)
        if (retryCount === maxRetries - 1) {
          throw fetchError
        }
        retryCount++
        await new Promise((resolve) => setTimeout(resolve, 5000 * retryCount))
      }
    }

    clearTimeout(timeoutId)

    const contentType = response!.headers.get("content-type")
    if (!contentType?.includes("application/json")) {
      const responseText = await response!.text()
      console.error("[v0] 비JSON 응답 수신:", {
        contentType,
        responsePreview: responseText.substring(0, 500),
      })
      throw new Error(`예상치 못한 응답 형식: ${contentType}`)
    }

    const responseData = await response!.json()

    console.log("[v0] 블로킹 모드 응답 수신:", {
      hasData: !!responseData,
      dataKeys: responseData ? Object.keys(responseData) : [],
      hasDataProperty: !!responseData?.data,
      dataStructure: responseData?.data ? Object.keys(responseData.data) : [],
      outputsExists: !!responseData?.data?.outputs,
      directOutputsExists: !!responseData?.outputs, // 기존 방식도 확인
    })

    const newsData: NewsItem[] = []
    const finalOutputs = responseData?.data?.outputs || responseData?.outputs // fallback 포함

    if (finalOutputs?.output && Array.isArray(finalOutputs.output)) {
      console.log(`[v0] 뉴스 데이터 처리 시작: ${finalOutputs.output.length}개 카테고리`)

      for (let categoryIndex = 0; categoryIndex < finalOutputs.output.length; categoryIndex++) {
        const categoryData = finalOutputs.output[categoryIndex]

        try {
          if (!categoryData || categoryData === "[]" || categoryData.trim() === "") {
            continue
          }

          const newsArray = JSON.parse(categoryData)
          if (!Array.isArray(newsArray) || newsArray.length === 0) {
            continue
          }

          console.log(`[v0] 카테고리 ${categoryIndex}: ${newsArray.length}개 뉴스 처리`)

          for (const newsItem of newsArray) {
            try {
              if (!newsItem.title || !newsItem.link) {
                continue // 필수 필드 누락 시 스킵
              }

              const originalCategory = newsItem.id ? newsItem.id.split("-")[0] : "기타"
              const titleParts = newsItem.title.split(" - ")
              const source = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "알 수 없음"
              const cleanTitle = titleParts.slice(0, -1).join(" - ") || newsItem.title

              let publishedAt: string
              try {
                if (newsItem.pub_date) {
                  publishedAt = new Date(newsItem.pub_date.replace(" ", "T") + ":00").toISOString()
                } else {
                  publishedAt = new Date().toISOString()
                }
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
            } catch (newsError) {
              console.log("[v0] 개별 뉴스 처리 실패:", newsError)
              continue
            }
          }
        } catch (categoryError) {
          console.log(`[v0] 카테고리 ${categoryIndex} 처리 실패:`, categoryError)
          continue
        }
      }
    }

    console.log("[v0] 최종 뉴스 처리 결과:", {
      totalNews: newsData.length,
      categories: newsData.reduce(
        (acc, news) => {
          acc[news.category] = (acc[news.category] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      ),
    })

    if (newsData.length === 0) {
      console.error("[v0] 뉴스 데이터 수집 실패 - 상세 디버그 정보")
      return NextResponse.json({
        success: false,
        data: [],
        message: "뉴스 데이터를 수집하지 못했습니다.",
        error: "NO_NEWS_DATA",
        debug: {
          hasData: !!responseData?.data,
          hasDirectOutputs: !!responseData?.outputs,
          hasNestedOutputs: !!responseData?.data?.outputs,
          outputStructure: finalOutputs ? Object.keys(finalOutputs) : [],
          fullResponse: responseData, // 전체 응답 구조 확인용
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: newsData,
      message: `${newsData.length}건의 뉴스를 성공적으로 수집했습니다.`,
      debug: {
        totalCategories: finalOutputs?.output?.length || 0,
        retryCount: retryCount,
      },
    })
  } catch (error) {
    console.error("[v0] MISO API 호출 최종 실패:", error)

    let errorMessage = "알 수 없는 오류가 발생했습니다"
    let errorCode = "UNKNOWN_ERROR"

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = "요청 시간이 초과되었습니다 (10분)"
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
          endpoint: process.env.MISO_ENDPOINT ? "설정됨" : "미설정",
          apiKey: process.env.MISO_API_KEY ? "설정됨" : "미설정",
          errorType: error instanceof Error ? error.name : "Unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 500 },
    )
  }
}
