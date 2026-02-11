# Web Parsing 라이브러리 종합 비교 분석 보고서

> Duorian-client 프로젝트를 위한 기존 web parsing 라이브러리 비교 분석
>
> 분석 대상: Cheerio, jsdom, parse5, PostHTML, Rehype/Remark, Readability.js, Trafilatura

---

## 목차

1. [Executive Summary](#executive-summary)
2. [라이브러리별 개요](#라이브러리별-개요)
3. [아키텍처 및 파싱 방식 비교](#아키텍처-및-파싱-방식-비교)
4. [성능 비교](#성능-비교)
5. [테스트 케이스별 적합성 평가](#테스트-케이스별-적합성-평가)
6. [Duorian 프로젝트에 대한 권장사항](#duorian-프로젝트에-대한-권장사항)

---

## Executive Summary

**Duorian-client 프로젝트 요구사항:**
- Server로 전송할 HTML content를 경량화/색인화
- 완전한 parsing이 아닌, server에 전송하기 위한 packing이 목적
- Content를 최대한 보존하는 방향
- 테스트 케이스: 384KB~5.2MB HTML 문서 (뉴스, Reddit, YouTube)

**핵심 결론:**

| 라이브러리 | 적합도 | 주요 이유 |
|-----------|-------|----------|
| **Cheerio** | ⭐⭐⭐⭐⭐ | 최적의 성능/기능 균형, jQuery-like API, 경량 |
| **Readability.js** | ⭐⭐⭐⭐ | 뛰어난 content extraction, but 단독 사용은 부족 |
| **parse5** | ⭐⭐⭐⭐ | 가장 정확한 파싱, Cheerio와 함께 사용 권장 |
| **PostHTML** | ⭐⭐⭐ | 강력한 변환 능력, 복잡도 증가 우려 |
| **Rehype/Remark** | ⭐⭐ | Markdown 중심, HTML 처리는 부차적 |
| **jsdom** | ⭐ | 너무 무거움, 불필요한 기능 과다 |
| **Trafilatura** | ❌ | Python 전용, TypeScript 프로젝트에 부적합 |

**권장 아키텍처:**
```
Cheerio (parse5 parser) + Readability.js (content scoring) + 자체 로직 (구조 보존)
```

---

## 라이브러리별 개요

### 1. Cheerio

- **언어**: TypeScript/JavaScript
- **파서**: htmlparser2 (기본) 또는 parse5 (선택 가능)
- **API**: jQuery-like selector API
- **npm 주간 다운로드**: ~2,500만 회
- **GitHub Stars**: ~28,000+
- **라이선스**: MIT

**핵심 특징:**
- 브라우저 없이 서버 사이드에서 jQuery 스타일로 DOM 조작
- 극도로 빠른 파싱과 낮은 메모리 사용량
- Window, Navigator 등 불필요한 브라우저 에뮬레이션 없음
- TypeScript 완벽 지원 (v1.0부터 전체 TypeScript 포팅)

**작동 방식:**
```typescript
import * as cheerio from 'cheerio';

const $ = cheerio.load(html, {
  xml: false,           // HTML 모드
  decodeEntities: true, // &nbsp; 등 디코딩
  _useHtmlParser2: true // htmlparser2 사용 (기본값)
});

// jQuery-like API
const title = $('h1.article-title').text();
const content = $('article p').toArray().map(el => $(el).text());
```

**장점:**
- **매우 빠름**: jsdom 대비 5-7배 빠른 파싱
- **메모리 효율**: jsdom 대비 1/5 수준 메모리 사용
- **친숙한 API**: jQuery 경험이 있으면 즉시 사용 가능
- **유연한 파서**: htmlparser2(속도) 또는 parse5(정확도) 선택 가능

**단점:**
- **Content extraction 알고리즘 부재**: 어디가 본문인지 자동 판별 불가
- **구조적 분석 기능 없음**: 광고/네비게이션 자동 제거 불가
- **레이아웃 정보 없음**: `display:none` 등 CSS 기반 판별 불가

### 2. jsdom

> 상세 분석: [reports/jsdom.md](./jsdom.md) 참조

- **언어**: TypeScript/JavaScript
- **파서**: parse5 (WHATWG HTML5 spec-compliant)
- **API**: 완전한 DOM API (Window, Document, Navigator 등)
- **npm 주간 다운로드**: ~2,500만 회 (Jest 기본 환경)
- **메모리**: 1MB HTML → ~200MB (원본 대비 200배)
- **파싱 속도**: 1MB HTML → ~700ms

**핵심 문제:**
- **과도한 오버헤드**: Duorian의 "경량화" 목적과 정반대
- **Web Components 한계**: Reddit의 `shreddit-*`, YouTube의 Polymer 컴포넌트 처리 불가
- **메모리 누수 리스크**: `dom.window.close()` 미호출 시 타이머/이벤트 리스너 누수

**결론**: Duorian 프로젝트에 부적합. 완전한 브라우저 에뮬레이션이 필요 없음.

### 3. parse5

- **언어**: TypeScript
- **타입**: HTML 파서 (DOM 조작 API 없음)
- **준수**: WHATWG HTML Living Standard 완벽 준수
- **npm 주간 다운로드**: ~2,800만 회
- **GitHub Stars**: ~3,600+

**핵심 특징:**
- **Spec-compliant 파싱**: 브라우저와 동일한 에러 복구 알고리즘
- **AST 출력**: parse5는 DOM API를 제공하지 않고 AST(Abstract Syntax Tree)만 반환
- **빠른 속도**: v7.0.0에서 45% 성능 향상, v8.0.0에서 TypeScript 포팅
- **주요 사용처**: jsdom, Cheerio, Angular, Lit, rehype 등의 내부 파서

**작동 방식:**
```typescript
import * as parse5 from 'parse5';

// HTML → AST
const document = parse5.parse(html);

// AST 순회 (수동)
function traverse(node) {
  if (node.nodeName === 'p') {
    // 텍스트 추출
  }
  if (node.childNodes) {
    node.childNodes.forEach(traverse);
  }
}
```

**장점:**
- **가장 정확한 파싱**: 비정형 HTML을 브라우저와 동일하게 처리
- **경량**: AST만 생성하므로 jsdom보다 훨씬 가벼움
- **TypeScript 네이티브**: 타입 안전성

**단점:**
- **DOM API 없음**: `querySelector` 등 사용 불가, 수동 AST 순회 필요
- **낮은 생산성**: jQuery-like API가 없어 코드 작성이 복잡

**Duorian 적용:**
- **Cheerio + parse5 조합**: Cheerio를 parse5 모드로 사용하면 정확도와 생산성 모두 확보
  ```typescript
  const $ = cheerio.load(html, { xmlMode: false, _useHtmlParser2: false });
  // 내부적으로 parse5 사용
  ```

### 4. Readability.js

- **개발**: Mozilla (Firefox Reader View)
- **언어**: JavaScript
- **알고리즘**: Content extraction 휴리스틱
- **npm**: `@mozilla/readability` (~100만 주간 다운로드)
- **GitHub Stars**: ~8,400+

**핵심 알고리즘:**

Readability.js는 DOM 트리를 점수 기반으로 분석하여 본문 콘텐츠를 식별합니다.

**1단계: 초기 점수 부여**
```javascript
function getInitialScore(node) {
  let score = 0;

  // 태그별 기본 점수
  switch(node.tagName) {
    case 'DIV': score = 5; break;
    case 'ARTICLE': score = 10; break;
    case 'SECTION': score = 8; break;
    case 'P': score = 3; break;
  }

  // 클래스/ID 패턴 분석
  const classId = `${node.className} ${node.id}`;
  if (/article|content|post|entry|main/i.test(classId)) score += 25;
  if (/comment|sidebar|footer|nav|ad/i.test(classId)) score -= 25;

  return score;
}
```

**2단계: 콘텐츠 밀도 분석**
```javascript
function scoreNode(node) {
  // 텍스트 길이
  const textLength = node.textContent.trim().length;

  // 링크 밀도 (링크 텍스트 / 전체 텍스트)
  const linkText = Array.from(node.querySelectorAll('a'))
    .reduce((sum, a) => sum + a.textContent.length, 0);
  const linkDensity = linkText / textLength;

  // 쉼표 개수 (문장 복잡도 지표)
  const commas = (node.textContent.match(/,/g) || []).length;

  let score = textLength / 100; // 기본 점수
  score += commas * 0.25; // 쉼표 보너스
  score -= linkDensity * 10; // 링크 밀도 페널티

  return score;
}
```

**3단계: 부모 노드 점수 전파 (Backoff Algorithm)**
```javascript
function propagateScoreToParents(node, score) {
  let parent = node.parentNode;
  let ancestor = 1;

  while (parent && ancestor <= 3) {
    parent.readabilityScore = (parent.readabilityScore || 0) +
                               score / (ancestor * 2);
    parent = parent.parentNode;
    ancestor++;
  }
}
```

**4단계: 최적 후보 선택**
```javascript
function getBestCandidate(candidates) {
  // 점수 상위 5개 후보 비교
  const topCandidates = candidates.slice(0, 5);

  // 형제 노드 포함 여부 결정
  const best = topCandidates[0];
  const threshold = best.score * 0.2; // 20% 임계값

  topCandidates.slice(1).forEach(candidate => {
    if (candidate.score >= threshold && isSibling(best, candidate)) {
      // 형제 노드도 포함
      includeNode(candidate);
    }
  });

  return best;
}
```

**장점:**
- **자동 content 식별**: 수동 셀렉터 불필요
- **다양한 사이트 대응**: 뉴스, 블로그, 포럼 등 범용적으로 작동
- **검증된 알고리즘**: Firefox에서 수년간 사용

**단점:**
- **구조 손실**: 계층적 댓글 구조 등이 평탄화됨
- **jsdom 의존성**: 원본 구현은 DOM API 필요 (Cheerio 포트 존재)
- **과도한 필터링**: 때때로 본문 일부를 제거할 수 있음

**Duorian 적용:**
- **Cheerio 기반 포트 사용**: `node-readability-cheerio` 사용 시 6-8배 빠른 성능
- **점수 알고리즘만 차용**: Readability.js의 scoring 로직을 참고하여 자체 구현

### 5. PostHTML

- **언어**: JavaScript
- **타입**: Plugin-based HTML transformer
- **npm 주간 다운로드**: ~50만 회
- **GitHub**: 107+ repositories in PostHTML org
- **철학**: PostCSS의 HTML 버전

**핵심 개념:**
PostHTML은 HTML을 AST로 변환하고, 플러그인을 통해 변환한 후, 다시 HTML로 직렬화합니다.

```javascript
import posthtml from 'posthtml';
import { parser } from 'posthtml-parser';
import { render } from 'posthtml-render';

// 플러그인 예시
const plugin = (tree) => {
  tree.match({ tag: 'a' }, (node) => {
    node.attrs = node.attrs || {};
    node.attrs.target = '_blank'; // 모든 링크에 target="_blank" 추가
    return node;
  });
};

posthtml([plugin])
  .process(html)
  .then(result => console.log(result.html));
```

**주요 플러그인:**
- `posthtml-include`: HTML 파일 인클루드
- `posthtml-modules`: 컴포넌트 시스템
- `posthtml-content`: 콘텐츠 추출
- `posthtml-minifier`: HTML 경량화
- `posthtml-beautify`: HTML 포맷팅

**장점:**
- **강력한 변환 능력**: 플러그인으로 복잡한 HTML 변환 가능
- **생태계**: 100+ 플러그인 사용 가능
- **조합 가능**: 여러 플러그인을 파이프라인으로 연결

**단점:**
- **복잡도**: 플러그인 설정 및 관리 오버헤드
- **성능**: 플러그인 체인이 길어지면 느려짐
- **Content extraction 부재**: 본문 추출 전용 플러그인 없음

**Duorian 적용:**
- **변환 파이프라인**: HTML 경량화 단계에서 활용 가능
- **주의**: Content extraction이 목적이라면 적합하지 않음

### 6. Rehype / Remark (Unified)

- **생태계**: unified (content 변환 프레임워크)
- **Remark**: Markdown AST (mdast) 처리
- **Rehype**: HTML AST (hast) 처리
- **npm**: remark (~700만/주), rehype (~500만/주)

**핵심 개념:**
unified는 텍스트 → AST → 변환 → 직렬화 파이프라인을 제공합니다.

```javascript
import { unified } from 'unified';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import rehypeSanitize from 'rehype-sanitize';
import { visit } from 'unist-util-visit';

const processor = unified()
  .use(rehypeParse)  // HTML → hast
  .use(() => (tree) => {
    // 커스텀 변환
    visit(tree, 'element', (node) => {
      if (node.tagName === 'script') {
        node.tagName = 'noscript'; // 모든 script를 noscript로
      }
    });
  })
  .use(rehypeSanitize) // XSS 방어
  .use(rehypeStringify); // hast → HTML

const result = await processor.process(html);
```

**주요 플러그인:**
- `rehype-parse`: HTML → hast 파싱
- `rehype-sanitize`: XSS 방어
- `rehype-minify`: HTML 경량화
- `remark-rehype`: Markdown → HTML 변환
- `rehype-remark`: HTML → Markdown 변환

**장점:**
- **표준화된 AST**: hast(HTML AST) 사용으로 플러그인 간 호환성
- **풍부한 생태계**: 200+ unified 플러그인
- **Markdown 지원**: remark와 함께 사용 시 Markdown ↔ HTML 변환

**단점:**
- **Markdown 중심**: HTML 처리는 부차적 기능
- **Content extraction 부재**: 본문 추출 기능 없음
- **복잡한 설정**: unified 생태계 이해 필요

**Duorian 적용:**
- **후처리 파이프라인**: HTML 정제/변환 단계에서 활용
- **주의**: Content extraction이 주 목적이라면 부적합

### 7. Trafilatura

> 상세 분석: [reports/trafilatura.md](./trafilatura.md) 참조

- **언어**: Python
- **파서**: lxml (C 기반 libxml2 바인딩)
- **알고리즘**: 다중 폴백 앙상블 (자체 → readability-lxml → jusText → baseline)
- **성능**: Python 추출기 중 최고 (F1: 0.909)

**핵심 강점:**
- **다중 추출기 앙상블**: 여러 알고리즘을 순차적으로 시도하여 최적 결과 선택
- **텍스트 밀도 + 링크 밀도 복합 분석**: Readability.js보다 정교한 휴리스틱
- **메타데이터 추출**: htmldate 전용 라이브러리로 정확한 날짜 추출
- **Precision/Recall 조절**: `favor_precision`, `favor_recall` 파라미터 제공

**치명적 약점:**
- **Python 전용**: TypeScript 프로젝트에서 직접 사용 불가
- **subprocess 호출 오버헤드**: Node.js에서 Python subprocess 호출 시 성능 저하

**Duorian 적용:**
- **알고리즘 참고**: Trafilatura의 텍스트 밀도 분석, 클래스/ID 패턴을 TypeScript로 포팅
- **직접 사용**: 불가능 (Python 전용)

---

## 아키텍처 및 파싱 방식 비교

### 파서 계층 구조

```
┌─────────────────────────────────────────────────────────────┐
│                     고수준 라이브러리                          │
├─────────────────────────────────────────────────────────────┤
│  jsdom          │  Cheerio  │  PostHTML  │  Rehype          │
│  (완전한 DOM)   │ (jQuery)  │ (Plugin)   │  (unified)       │
└────────┬────────┴─────┬─────┴──────┬─────┴──────┬───────────┘
         │              │            │            │
         │         ┌────┴────┐       │            │
         │         │ 선택 가능│       │            │
         v         v         v       v            v
┌─────────────────────────────────────────────────────────────┐
│                      HTML 파서                               │
├─────────────────────────────────────────────────────────────┤
│  parse5                    │  htmlparser2                    │
│  (WHATWG spec-compliant)   │  (빠르고 관대함)                 │
└─────────────────────────────────────────────────────────────┘
```

### 파서 특성 비교

| 특성 | parse5 | htmlparser2 |
|------|--------|-------------|
| **에러 복구** | WHATWG 표준 준수 | 관대한 파싱, 비표준 |
| **속도** | 중간 | 매우 빠름 |
| **정확도** | 브라우저와 동일 | 브라우저와 차이 가능 |
| **unclosed 태그** | 자동 닫기 | 설정에 따라 다름 |
| **비정형 HTML** | 우수 | 양호 |
| **SAX 모드** | 미지원 | 지원 (스트리밍) |

**예시: 비정형 HTML 처리 차이**

```html
<!-- 입력 -->
<div> <p>Start <div>Nested</div> Continue?</div>

<!-- parse5 결과 (브라우저 동일) -->
<div>
  <p>Start</p>
  <div>Nested</div>
  Continue?
</div>

<!-- htmlparser2 결과 -->
<div>
  <p>
    Start
    <div>Nested</div>
    Continue?
  </p>
</div>
```

**Duorian 선택 기준:**
- **뉴스 사이트 (case-1, 2, 4)**: 비정형 HTML 많음 → **parse5 권장**
- **Reddit/YouTube (case-3, 5)**: 구조화된 HTML → **htmlparser2도 충분**

### Content Extraction 알고리즘 비교

| 라이브러리 | 알고리즘 | 접근 방식 |
|-----------|---------|----------|
| **Readability.js** | 점수 전파 (bottom-up) | `<p>` 기준 부모에 점수 전파 |
| **Trafilatura** | 텍스트 밀도 (top-down) | 트리 순회 + 밀도 분석 |
| **Cheerio** | 없음 | 수동 셀렉터 필요 |
| **jsdom** | 없음 | 수동 셀렉터 필요 |

**Readability.js vs Trafilatura 알고리즘 차이:**

| 항목 | Readability.js | Trafilatura |
|------|----------------|-------------|
| **1차 전략** | `<p>` 태그 찾기 → 부모 점수 전파 | 텍스트 밀도 + 구조 분석 |
| **점수 기준** | 쉼표 수, 텍스트 길이 | 텍스트/태그 비율, 링크 밀도 |
| **폴백** | 없음 (단일 패스) | readability → jusText → baseline |
| **링크 밀도** | 간단한 계산 | 정교한 임계값 기반 제거 |
| **결과 비교** | 없음 | 여러 알고리즘 결과 품질 비교 |

---

## 성능 비교

### 파싱 속도 벤치마크

> 참고: Apple Silicon M1, Node.js 기준 추정값

| 라이브러리 | 384KB | 1MB | 3MB | 5MB |
|-----------|-------|-----|-----|-----|
| **Cheerio (htmlparser2)** | 60-100ms | 120-250ms | 400-700ms | 600ms-1.2s |
| **Cheerio (parse5)** | 80-130ms | 180-300ms | 500-900ms | 800ms-1.5s |
| **parse5 (단독)** | 50-80ms | 100-200ms | 300-500ms | 500ms-1s |
| **jsdom** | 200-400ms | 500ms-1s | 1.5-3s | 3-6s |
| **PostHTML** | 70-120ms | 150-280ms | 450-800ms | 700ms-1.4s |
| **Rehype** | 80-140ms | 160-300ms | 480-850ms | 750ms-1.5s |

**핵심 인사이트:**
- **Cheerio (htmlparser2)**: 가장 빠름, 5MB 문서도 1초 내 처리
- **jsdom**: 가장 느림, 5MB 문서 3-6초 소요
- **parse5**: raw 파서로서 최고 속도, but DOM API 없음

### 메모리 사용량 비교

| 라이브러리 | 1MB HTML | 3MB HTML | 5MB HTML |
|-----------|----------|----------|----------|
| **parse5 (raw AST)** | 15-30MB | 45-90MB | 75-150MB |
| **Cheerio** | 30-50MB | 90-150MB | 150-250MB |
| **PostHTML** | 35-55MB | 100-165MB | 170-280MB |
| **Rehype** | 40-65MB | 120-195MB | 200-320MB |
| **jsdom** | **200MB** | **600MB** | **800MB-1.2GB** |

**메모리 증폭 비율 (원본 HTML 대비):**
- parse5: ~20-30배
- Cheerio: ~30-50배
- jsdom: ~200배

**Duorian case-3 (5.2MB Reddit) 예상:**
- Cheerio: ~160-280MB
- jsdom: ~1GB-1.5GB

### Readability.js 성능 개선

`node-readability-cheerio` (Cheerio 기반 Readability.js 포트):
- 원본 대비 **6-8배 빠름**
- 메모리 사용량 **대폭 감소**

**이유:**
- 원본: jsdom (무거움)
- 포트: Cheerio (가벼움)

---

## 테스트 케이스별 적합성 평가

### Case-1 & Case-2: 한국일보 뉴스 (790KB, 891KB)

**특징:**
- 한국어 UTF-8 인코딩
- 광고 스크립트 대량 포함
- 비정형 HTML 가능성
- 댓글 섹션 포함

**라이브러리 적합성:**

| 라이브러리 | 평가 | 상세 |
|-----------|------|------|
| **Cheerio + parse5** | ⭐⭐⭐⭐⭐ | 비정형 HTML 정확 파싱, 빠른 속도 |
| **Readability.js** | ⭐⭐⭐⭐ | 본문 자동 추출, 댓글 분리 가능 |
| **Cheerio + htmlparser2** | ⭐⭐⭐⭐ | 매우 빠름, 비정형 HTML 처리 약간 약함 |
| **jsdom** | ⭐⭐ | 정확하지만 너무 느리고 무거움 |
| **PostHTML/Rehype** | ⭐⭐ | Content extraction 기능 없음 |

**권장 전략:**
```typescript
// 1단계: Cheerio (parse5) 파싱
const $ = cheerio.load(html, { xml: false, _useHtmlParser2: false });

// 2단계: Readability.js로 본문 추출
const reader = new Readability($);
const article = reader.parse();

// 3단계: 댓글 별도 추출
const comments = $('[class*="comment"]').toArray();
```

### Case-3: Reddit (5.2MB, Shadow DOM 2,306건)

**특징:**
- 커스텀 엘리먼트 (`shreddit-*`)
- Shadow DOM 대량 사용
- 계층적 댓글 구조
- 매우 큰 파일 크기

**라이브러리 적합성:**

| 라이브러리 | 평가 | 상세 |
|-----------|------|------|
| **Cheerio** | ⭐⭐⭐ | Shadow DOM 미지원, 커스텀 엘리먼트는 태그로 접근 가능 |
| **jsdom** | ⭐ | Shadow DOM 제한적 지원, 너무 무거움 (1GB+ 메모리) |
| **Readability.js** | ⭐⭐ | 계층 구조 손실, 평탄화됨 |
| **parse5** | ⭐⭐⭐ | 빠른 파싱, Shadow DOM 내부는 별도 처리 필요 |

**핵심 문제: Shadow DOM**

Chrome extension에서 HTML을 캡처하는 방법에 따라 달라집니다:

1. **`element.outerHTML`로 캡처**:
   - Shadow DOM 내부가 **포함되지 않음**
   - `<shreddit-comment>` 태그만 존재, 내용 없음
   - **어떤 라이브러리를 사용해도 Shadow DOM 내용 추출 불가**

2. **Chrome extension에서 Shadow DOM 수동 추출**:
   ```javascript
   // Chrome extension 단에서 처리
   function extractWithShadowDOM(element) {
     const clone = element.cloneNode(true);

     // Shadow DOM을 일반 DOM으로 변환
     element.querySelectorAll('*').forEach((el, i) => {
       if (el.shadowRoot) {
         const shadowContent = el.shadowRoot.innerHTML;
         const marker = document.createElement('div');
         marker.className = '__shadow-root-content__';
         marker.innerHTML = shadowContent;
         clone.querySelectorAll('*')[i].appendChild(marker);
       }
     });

     return clone.outerHTML;
   }
   ```

**권장 전략:**
```typescript
// Chrome extension에서 Shadow DOM을 평탄화한 HTML을 전달받았다고 가정

// 1단계: Cheerio로 파싱 (htmlparser2 사용, 속도 중요)
const $ = cheerio.load(html, { _useHtmlParser2: true });

// 2단계: Reddit 구조 특화 추출
const posts = $('shreddit-post, [class*="Post"]').toArray();
const comments = $('shreddit-comment, [class*="Comment"]').toArray();

// 3단계: 계층 구조 재구성 (자체 로직)
function buildCommentTree(comments) {
  // depth, parent 속성 기반 계층 구조 복원
}
```

### Case-4: ZDNet Korea (384KB)

**특징:**
- 한국어 뉴스 사이트
- 상대적으로 작은 크기
- 표준적인 뉴스 레이아웃

**라이브러리 적합성:**

모든 라이브러리가 무난하게 처리 가능. **Cheerio + Readability.js** 조합 권장.

### Case-5: YouTube (3.1MB, Polymer Web Components)

**특징:**
- Polymer/Lit 기반 Web Components
- `iron-iconset-svg`, `custom-style`, `paper-tabs` 등
- 비디오 메타데이터 (제목, 설명, 댓글)
- 추천 동영상 등 무관한 콘텐츠 대량

**라이브러리 적합성:**

| 라이브러리 | 평가 | 상세 |
|-----------|------|------|
| **Cheerio** | ⭐⭐⭐⭐ | 빠른 파싱, Web Components는 태그로 접근 |
| **Readability.js** | ⭐⭐⭐ | 비디오 설명 추출 가능, 추천 동영상 제거 |
| **jsdom** | ⭐ | Web Components 미지원, 너무 무거움 |

**YouTube 특화 전략:**
```typescript
// YouTube는 초기 데이터를 JSON으로 인라인 삽입
const $ = cheerio.load(html);

// 방법 1: JSON-LD 메타데이터 추출
const jsonLd = $('script[type="application/ld+json"]').html();
const metadata = JSON.parse(jsonLd);
// { name, description, uploadDate, author, ... }

// 방법 2: ytInitialData 스크립트 파싱
const ytDataScript = $('script:contains("var ytInitialData")').html();
const ytData = extractJSON(ytDataScript);
// 댓글, 추천 동영상 등 모든 정보

// 방법 3: Readability.js로 설명 추출
const article = new Readability($).parse();
// 비디오 설명 텍스트
```

---

## Duorian 프로젝트에 대한 권장사항

### 최종 권장 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│           Chrome Extension (HTML 캡처)                    │
│  - Shadow DOM 평탄화                                      │
│  - 초기 HTML 전달                                         │
└────────────────────┬─────────────────────────────────────┘
                     │
                     v
┌──────────────────────────────────────────────────────────┐
│              Duorian-client (TypeScript)                  │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1. [Cheerio + parse5] HTML 파싱                          │
│     - parse5로 정확한 파싱                                │
│     - Cheerio API로 DOM 탐색                              │
│                                                           │
│  2. [Readability.js scoring] Content 점수 계산            │
│     - 본문 후보 자동 식별                                 │
│     - 광고/네비게이션 제거                                │
│                                                           │
│  3. [자체 로직] 구조 보존형 추출                          │
│     - Reddit: 계층적 댓글 구조 유지                       │
│     - YouTube: JSON-LD 우선, Readability 폴백             │
│     - 뉴스: Readability + 댓글 별도 추출                  │
│                                                           │
│  4. [경량화] 불필요 요소 제거                             │
│     - <script>, <style>, <svg> 제거                       │
│     - 공백/줄바꿈 정규화                                  │
│     - 속성 최소화 (class, id만 유지)                      │
│                                                           │
│  5. [색인화] 청크 분할 및 메타데이터                      │
│     - 본문을 paragraph 단위로 분할                        │
│     - 각 청크에 위치 정보 (depth, index)                  │
│     - 메타데이터 (제목, 저자, 날짜) 추출                  │
│                                                           │
└────────────────────┬─────────────────────────────────────┘
                     │
                     v
┌──────────────────────────────────────────────────────────┐
│             JSON 출력 (Duorian-server 전송)               │
│  {                                                        │
│    metadata: { title, author, date, ... },               │
│    mainContent: [                                         │
│      { type: 'paragraph', text: '...', depth: 0 },       │
│      { type: 'heading', text: '...', level: 2 },         │
│    ],                                                     │
│    comments: [ ... ], // 계층 구조 유지                   │
│    removed: [ 'nav', 'ads', 'sidebar' ]                  │
│  }                                                        │
└──────────────────────────────────────────────────────────┘
```

### 구체적 구현 계획

#### 1단계: 파서 선택 및 설정

```typescript
import * as cheerio from 'cheerio';

interface ParserOptions {
  useStrictParser: boolean; // true: parse5, false: htmlparser2
}

function createParser(options: ParserOptions) {
  return (html: string) => cheerio.load(html, {
    xml: false,
    decodeEntities: true,
    _useHtmlParser2: !options.useStrictParser, // parse5 vs htmlparser2
  });
}

// 뉴스 사이트: parse5 (정확도)
const newsParser = createParser({ useStrictParser: true });

// Reddit/YouTube: htmlparser2 (속도)
const socialParser = createParser({ useStrictParser: false });
```

#### 2단계: Readability.js 점수 알고리즘 통합

```typescript
import Readability from '@mozilla/readability';
import { JSDOM } from 'jsdom'; // 또는 node-readability-cheerio

interface ContentCandidate {
  element: cheerio.Element;
  score: number;
  linkDensity: number;
}

function scoreContent($: cheerio.Root): ContentCandidate[] {
  const candidates: ContentCandidate[] = [];

  $('p, div, article, section').each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();
    const textLength = text.length;

    if (textLength < 25) return; // 너무 짧은 요소 제외

    // Readability.js 스타일 점수 계산
    let score = 0;

    // 1. 태그별 기본 점수
    const tag = elem.tagName.toLowerCase();
    if (tag === 'article') score += 10;
    else if (tag === 'section') score += 8;
    else if (tag === 'div') score += 5;
    else if (tag === 'p') score += 3;

    // 2. 클래스/ID 패턴
    const classId = `${$elem.attr('class') || ''} ${$elem.attr('id') || ''}`;
    if (/article|content|post|entry|main/i.test(classId)) score += 25;
    if (/comment|sidebar|footer|nav|ad|promo/i.test(classId)) score -= 25;

    // 3. 콘텐츠 밀도
    score += Math.min(textLength / 100, 10);

    // 4. 쉼표 개수 (문장 복잡도)
    const commas = (text.match(/,/g) || []).length;
    score += commas * 0.25;

    // 5. 링크 밀도 (페널티)
    const linkText = $elem.find('a').toArray()
      .reduce((sum, a) => sum + $(a).text().length, 0);
    const linkDensity = linkText / textLength;
    score -= linkDensity * 10;

    candidates.push({
      element: elem,
      score,
      linkDensity,
    });
  });

  // 점수순 정렬
  return candidates.sort((a, b) => b.score - a.score);
}
```

#### 3단계: 사이트별 전용 추출기

```typescript
interface ExtractorResult {
  mainContent: ContentNode[];
  comments?: CommentNode[];
  metadata: Metadata;
}

// Reddit 전용 추출기
function extractReddit($: cheerio.Root): ExtractorResult {
  // 원글 추출
  const post = $('shreddit-post, [data-testid="post-container"]').first();

  // 댓글 계층 구조 복원
  const comments = $('shreddit-comment, [data-testid="comment"]')
    .toArray()
    .map(elem => {
      const $elem = $(elem);
      return {
        author: $elem.attr('author') || $elem.find('[data-testid="comment-author"]').text(),
        text: $elem.find('[slot="comment"]').text() || $elem.text(),
        depth: parseInt($elem.attr('depth') || '0'),
        score: parseInt($elem.attr('score') || '0'),
      };
    });

  // depth 기반 계층 구조 구축
  const commentTree = buildTree(comments);

  return {
    mainContent: [{ type: 'post', content: post.text() }],
    comments: commentTree,
    metadata: extractRedditMetadata($),
  };
}

// YouTube 전용 추출기
function extractYouTube($: cheerio.Root): ExtractorResult {
  // JSON-LD 메타데이터 우선 추출
  const jsonLdScript = $('script[type="application/ld+json"]').html();
  if (jsonLdScript) {
    const metadata = JSON.parse(jsonLdScript);
    return {
      mainContent: [
        { type: 'title', content: metadata.name },
        { type: 'description', content: metadata.description },
      ],
      metadata: {
        title: metadata.name,
        author: metadata.author,
        uploadDate: metadata.uploadDate,
        videoId: extractVideoId(metadata.url),
      },
    };
  }

  // 폴백: Readability.js
  const candidates = scoreContent($);
  return extractFromCandidates(candidates);
}

// 뉴스 사이트 범용 추출기
function extractNews($: cheerio.Root): ExtractorResult {
  // Readability.js 기반 추출
  const candidates = scoreContent($);
  const mainContent = candidates.slice(0, 1)[0]; // 최고 점수

  // 댓글 별도 추출
  const comments = $('[class*="comment"], [id*="comment"]')
    .toArray()
    .map(elem => ({
      author: $(elem).find('[class*="author"]').text(),
      text: $(elem).find('[class*="text"], p').text(),
    }));

  return {
    mainContent: parseMainContent($(mainContent.element)),
    comments,
    metadata: extractNewsMetadata($),
  };
}
```

#### 4단계: 경량화 및 색인화

```typescript
interface DuorianOutput {
  metadata: Metadata;
  chunks: ContentChunk[];
  structure: StructureInfo;
}

function lightweightPack($: cheerio.Root, extracted: ExtractorResult): DuorianOutput {
  // 1. 불필요 요소 제거
  $('script, style, noscript, svg, iframe').remove();

  // 2. 속성 최소화
  $('*').each((i, elem) => {
    const $elem = $(elem);
    const attrs = elem.attribs;

    // class, id, data-* 만 유지
    Object.keys(attrs).forEach(attr => {
      if (!['class', 'id'].includes(attr) && !attr.startsWith('data-')) {
        $elem.removeAttr(attr);
      }
    });
  });

  // 3. 공백 정규화
  const normalized = $.html()
    .replace(/\s+/g, ' ')        // 연속 공백 → 단일 공백
    .replace(/>\s+</g, '><');    // 태그 간 공백 제거

  // 4. 청크 분할 (paragraph 단위)
  const chunks: ContentChunk[] = extracted.mainContent.map((node, index) => ({
    index,
    type: node.type,
    text: node.content,
    depth: calculateDepth(node),
    tokens: estimateTokens(node.content), // 대략적 토큰 수 (server 처리용)
  }));

  return {
    metadata: extracted.metadata,
    chunks,
    structure: {
      totalChunks: chunks.length,
      hasComments: !!extracted.comments,
      commentCount: extracted.comments?.length || 0,
    },
  };
}
```

### 의존성 목록

```json
{
  "dependencies": {
    "cheerio": "^1.0.0",           // jQuery-like API
    "parse5": "^8.0.0",             // WHATWG HTML parser (Cheerio 내부 사용)
    "@mozilla/readability": "^0.5.0" // Content extraction (선택적)
  },
  "devDependencies": {
    "@types/cheerio": "^0.22.35",
    "typescript": "^5.3.0"
  }
}
```

### 성능 목표

| 테스트 케이스 | 파싱 시간 | 메모리 | 출력 크기 |
|--------------|----------|--------|----------|
| case-1 (790KB) | < 150ms | < 50MB | < 50KB |
| case-2 (891KB) | < 180ms | < 60MB | < 60KB |
| case-3 (5.2MB) | < 1.2s | < 300MB | < 200KB |
| case-4 (384KB) | < 100ms | < 40MB | < 30KB |
| case-5 (3.1MB) | < 800ms | < 200MB | < 150KB |

**경량화 비율 목표:**
- 원본 HTML 대비 **90-95% 축소**
- 예: 5.2MB → ~200KB (약 96% 축소)

---

## 추가 고려사항

### CJK(한중일) 텍스트 처리

**Cheerio**:
- UTF-8 완벽 지원
- 한국어 문자열 처리 문제 없음

**Readability.js**:
- 영어 중심 휴리스틱 (쉼표 개수, 단어 수 등)
- CJK 최적화 필요:
  ```typescript
  function getEffectiveTextLength(text: string): number {
    // CJK 문자는 영문 단어 2개와 동등하게 취급
    const cjkChars = (text.match(/[\u3000-\u9FFF\uAC00-\uD7AF]/g) || []).length;
    const otherChars = text.length - cjkChars;
    return otherChars + cjkChars * 2;
  }
  ```

### XSS 방어

Duorian-server로 전송하기 전 HTML sanitization:

```typescript
import sanitizeHtml from 'sanitize-html';

function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'div', 'article', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    allowedAttributes: {
      '*': ['class', 'id']
    },
  });
}
```

### 에러 처리

```typescript
function safeParse(html: string): DuorianOutput | null {
  try {
    const $ = cheerio.load(html);
    // ... 처리
  } catch (error) {
    console.error('Parsing failed:', error);

    // 폴백: 단순 텍스트 추출
    const plainText = html.replace(/<[^>]*>/g, '');
    return {
      metadata: { title: 'Parse Error' },
      chunks: [{ index: 0, type: 'text', text: plainText }],
      structure: { totalChunks: 1 },
    };
  }
}
```

---

## 결론

**Duorian-client 최적 구성:**

```
Cheerio (parse5 mode)
  + Readability.js scoring algorithm
  + 사이트별 전용 추출기 (Reddit, YouTube, 뉴스)
  + 자체 경량화/색인화 로직
```

**핵심 강점:**
1. **성능**: jsdom 대비 5-7배 빠른 파싱, 1/5 메모리 사용
2. **정확도**: parse5로 브라우저와 동일한 파싱
3. **유연성**: Readability.js 점수 + 사이트별 커스텀 로직 조합
4. **경량화**: 90-95% 크기 축소 목표 달성 가능

**피해야 할 것:**
- ❌ jsdom 단독 사용 (너무 무거움)
- ❌ Readability.js 단독 사용 (구조 손실)
- ❌ PostHTML/Rehype 중심 설계 (content extraction 부재)

**다음 단계:**
1. Cheerio + parse5 기본 파싱 구현
2. Readability.js 점수 알고리즘 포팅
3. 테스트 케이스로 실제 테스트 및 검증
4. 사이트별 전용 추출기 개발 (Reddit, YouTube 우선)
5. 경량화 로직 구현 및 성능 최적화

---

## 참고 자료

### Cheerio
- [GitHub - cheeriojs/cheerio](https://github.com/cheeriojs/cheerio)
- [Cheerio Official Documentation](https://cheerio.js.org/)
- [npm - cheerio](https://www.npmjs.com/package/cheerio)

### parse5
- [GitHub - inikulin/parse5](https://github.com/inikulin/parse5)
- [parse5 Documentation](https://parse5.js.org/)
- [npm - parse5](https://www.npmjs.com/package/parse5)

### Readability.js
- [GitHub - mozilla/readability](https://github.com/mozilla/readability)
- [npm - @mozilla/readability](https://www.npmjs.com/package/@mozilla/readability)
- [WebcrawlerAPI - Extracting with Readability](https://webcrawlerapi.com/blog/how-to-extract-article-or-blogpost-content-in-js-using-readabilityjs)

### PostHTML
- [GitHub - posthtml/posthtml](https://github.com/posthtml/posthtml)
- [PostHTML Plugins Catalog](https://posthtml.github.io/posthtml-plugins/)
- [npm - posthtml](https://www.npmjs.com/package/posthtml)

### Rehype/Remark
- [GitHub - remarkjs/remark-rehype](https://github.com/remarkjs/remark-rehype)
- [unified Documentation](https://unifiedjs.com/)
- [npm - remark-rehype](https://www.npmjs.com/package/remark-rehype)

### 성능 비교
- [npm trends - cheerio vs jsdom vs readability](https://npmtrends.com/cheerio-vs-jsdom-vs-readability-js-vs-readability-node)
- [Comparison of htmlparser2 vs parse5](https://npm-compare.com/htmlparser2,parse5)
- [Web Scraping FYI - parse5 vs htmlparser2](https://webscraping.fyi/lib/compare/javascript-htmlparser2-vs-javascript-parse5/)

---

**작성일**: 2026-02-11
**분석자**: Claude Sonnet 4.5
**프로젝트**: Duorian-client
**버전**: 1.0
