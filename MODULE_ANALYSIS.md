# 기존 도구 분석
`Duorian` 라이브러리를 만들기 전, 기존의 정적 web parsing 라이브러리를 철저히 검토하고, 부족한 부분을 발견한다. (동적으로 페이지를 전개하는 과정은 이미 실행되어 있음을 가정한다. 'Chrome extention 사용자가 전개 해놓은' 기반.)
`test-cases/` 디렉토리에 포함된 `case-*.html` 파일들을 테스트하며 분석한다.

## 분석 대상 라이브러리
- Cheerio
- jsdom
- parse5
- PostHTML
- Rehype/Remark
- Readability.js
- Trafilatura