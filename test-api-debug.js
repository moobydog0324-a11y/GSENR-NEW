async function testAPI() {
  try {
    console.log('API 테스트 시작...');
    const response = await fetch('http://localhost:3000/api/collect-news', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('응답 상태:', response.status);
    console.log('응답 데이터 개수:', data.data ? data.data.length : 0);
    console.log('첫 번째 뉴스:', data.data ? data.data[0] : '없음');
    console.log('성공 여부:', data.success);
    console.log('메시지:', data.message);
  } catch (error) {
    console.error('API 테스트 실패:', error);
  }
}

testAPI();
