# jsdom 심층 분석 보고서

## Duorian 프로젝트 컨텍스트

테스트 케이스 기준:
- **case-1** (790KB): 한국일보 뉴스 (한국어, AMP, 다수의 광고 스크립트)
- **case-2** (891KB): 한국일보 뉴스 (한국어, dark theme, Ant Design CSS)
- **case-3** (5.2MB): Reddit - `shreddit-*` 커스텀 엘리먼트 다수, Shadow DOM 참조 2,306건
- **case-4** (384KB): ZDNet Korea (한국어 뉴스)
- **case-5** (3.1MB): YouTube (Web Components: `iron-iconset-svg`, `custom-style`, `paper-tabs` 등)

---

## 1. 아키텍처 및 내부 설계

### HTML 파서: parse5

jsdom은 내부적으로 **parse5** 라이브러리를 HTML 파서로 사용한다. parse5는 **WHATWG HTML Living Standard**의 파싱 알고리즘을 순수 JavaScript로 완전 구현한 파서이다.

- **spec-compliant 파싱**: parse5는 브라우저와 동일한 토큰화(tokenization) + 트리 구축(tree construction) 알고리즘을 구현한다. 이는 `<table>` 안의 암묵적 `<tbody>` 삽입, `<p>` 태그 자동 닫기, `<head>/<body>` 자동 생성 등 브라우저의 "error recovery" 동작을 정확히 재현한다는 뜻이다.
- **TreeAdapter 패턴**: parse5는 TreeAdapter 인터페이스를 통해 파싱 결과를 원하는 트리 구조로 변환할 수 있다. jsdom은 자체 TreeAdapter를 구현하여 parse5의 파싱 결과를 직접 jsdom의 DOM 노드로 변환한다. 즉, 중간 AST를 거치지 않고 바로 DOM 트리를 구축한다.

### DOM 구현 방식

jsdom의 DOM은 **순수 JavaScript 객체**로 구현된다:

- **whatwg-url**: URL 파싱을 위한 WHATWG URL Standard 구현
- **whatwg-encoding**: `TextEncoder`/`TextDecoder` 기반 문자 인코딩 처리
- **saxes**: XML 파싱용 (XHTML 모드)
- **cssstyle / cssom**: CSS 스타일 파싱 및 `element.style` 속성 에뮬레이션
- **data-urls**: `data:` URL 처리
- **html-encoding-sniffer**: HTML 문서의 인코딩 자동 감지

핵심 구현 구조:
```
jsdom/
  lib/
    jsdom/
      living/           # DOM Living Standard 구현
        nodes/          # Element, Document, Text 등 노드 클래스
        events/         # Event, CustomEvent 등
        xhr/            # XMLHttpRequest
        navigator/      # Navigator API
        window/         # Window 글로벌 객체
      browser/          # 브라우저 환경 시뮬레이션
      named-properties-tracker.js  # HTML 요소 named access
```

모든 DOM 인터페이스(Node, Element, Document, HTMLElement 등)가 JavaScript 클래스 계층으로 구현되며, 각 DOM 노드는 실제 JavaScript 객체 인스턴스이다. 이것이 jsdom이 "무겁다"고 불리는 근본적 이유이다 -- 모든 노드가 프로토타입 체인, 이벤트 리스너 슬롯, 속성 맵 등을 포함하는 완전한 객체이다.

### 브라우저 환경 시뮬레이션

jsdom은 `Window` 객체를 생성하여 다음을 에뮬레이트한다:

- **`window` 글로벌**: `setTimeout`, `setInterval`, `requestAnimationFrame`, `console`, `navigator`, `location`, `history`
- **`document`**: 완전한 Document 인터페이스 (querySelector, getElementById 등)
- **`navigator`**: userAgent, language 등
- **`location` / `history`**: URL 네비게이션 (제한적)
- **`XMLHttpRequest` / `fetch`**: 외부 리소스 요청 (설정에 따라)
- **`MutationObserver`**: DOM 변경 감시

---

## 2. 핵심 API 및 기능

### 기본 사용법

```javascript
const { JSDOM } = require("jsdom");

// 문자열에서 파싱
const dom = new JSDOM(`<html><body><p>Hello</p></body></html>`);
const document = dom.window.document;

// 옵션 설정
const dom = new JSDOM(html, {
  url: "https://example.com",          // document.URL 설정
  referrer: "https://google.com",       // document.referrer
  contentType: "text/html",             // MIME type
  includeNodeLocations: true,           // 소스 위치 추적
  storageQuota: 10000000,               // localStorage 크기
  runScripts: "dangerously",            // JS 실행 (위험!)
  runScripts: "outside-only",           // window 접근만 허용
  resources: "usable",                  // 외부 리소스 로드
  pretendToBeVisual: true,              // requestAnimationFrame 활성화
  beforeParse(window) { /* ... */ },    // 파싱 전 훅
});
```

### DOM API 호환성

jsdom은 매우 높은 수준의 DOM 호환성을 제공한다:

| API | 지원 수준 |
|-----|----------|
| DOM Core (Node, Element, Document) | **완전 지원** |
| `querySelector` / `querySelectorAll` | **완전 지원** (nwsapi 사용) |
| `getElementById`, `getElementsByClassName` | **완전 지원** |
| `innerHTML`, `outerHTML`, `textContent` | **완전 지원** |
| `createElement`, `createDocumentFragment` | **완전 지원** |
| `classList`, `dataset` | **완전 지원** |
| `getAttribute`, `setAttribute` | **완전 지원** |
| DOM Traversal (parentNode, childNodes 등) | **완전 지원** |
| `TreeWalker`, `NodeIterator` | **완전 지원** |
| `MutationObserver` | **완전 지원** |
| `Range`, `Selection` | **부분 지원** |
| `IntersectionObserver` | **미지원** |
| `ResizeObserver` | **미지원** |

### CSS 지원

- **`element.style`**: 인라인 스타일 속성 읽기/쓰기 지원 (cssstyle 라이브러리)
- **`window.getComputedStyle()`**: **극히 제한적**. jsdom은 레이아웃 엔진이 없으므로 실제 계산된 스타일을 반환하지 못한다. 기본적으로 인라인 스타일만 반환한다.
- **CSS 선택자**: `querySelector`에서 사용하는 CSS 선택자는 nwsapi 라이브러리를 통해 지원하며, CSS3 선택자 대부분을 지원한다.
- **`<style>` 태그 파싱**: HTML 내 `<style>` 태그는 파싱되지만, 스타일 규칙이 요소에 적용(cascade)되지는 않는다.
- **`@media` 쿼리**: 미지원 (레이아웃 없음)
- **CSS Custom Properties (변수)**: `getComputedStyle`에서 미지원

### 이벤트 핸들링

```javascript
// 이벤트 생성 및 디스패치 지원
const event = new dom.window.Event("click");
element.dispatchEvent(event);

// addEventListener/removeEventListener 완전 지원
element.addEventListener("click", handler);

// CustomEvent 지원
const ce = new dom.window.CustomEvent("my-event", { detail: { foo: 1 } });
```

---

## 3. 파싱 동작 상세 분석

### 비정형(malformed) HTML 처리

parse5 기반이므로 브라우저와 **거의 동일한** 에러 복구를 수행한다:

```html
<!-- 입력 -->
<div><p>Hello<p>World</div>

<!-- jsdom 결과 (브라우저와 동일) -->
<div>
  <p>Hello</p>
  <p>World</p>
</div>
```

- 닫히지 않은 태그 자동 닫기
- 잘못된 중첩 자동 교정
- 암묵적 요소 생성 (`<html>`, `<head>`, `<body>`, `<tbody>`)
- `<!DOCTYPE>` 누락 시 quirks mode 진입

이것은 Duorian의 case-1~4 (뉴스 사이트)에서 중요하다. 실제 뉴스 사이트는 종종 비정형 HTML을 포함하며, jsdom/parse5는 이를 브라우저와 동일하게 처리한다.

### 인라인 스크립트 처리

```javascript
// runScripts 옵션에 따라 동작이 달라짐

// 기본값: 스크립트 실행 안 함 (가장 안전)
new JSDOM(html);  // <script> 내용 무시

// "dangerously": 인라인 + 외부 스크립트 실행
new JSDOM(html, { runScripts: "dangerously" });

// "outside-only": window에 속성 주입만 가능
new JSDOM(html, { runScripts: "outside-only" });
```

**Duorian 프로젝트에 대한 시사점**: 테스트 케이스들에는 Google Tag Manager, Taboola, Criteo, AdsbyGoogle 등 대량의 서드파티 스크립트가 포함되어 있다. `runScripts: "dangerously"`로 실행하면:
- 보안 위험 (임의 JS 실행)
- 외부 네트워크 요청 시도 (resource loading 필요)
- 파싱 시간 급증
- 대부분의 스크립트가 브라우저 API 부재로 에러 발생

**권장**: Duorian의 "경량화" 목적에는 스크립트 실행이 불필요하다. `runScripts` 기본값(미실행) 유지.

### 외부 리소스 로딩

```javascript
// 기본: 외부 리소스 로드 안 함
new JSDOM(html);

// "usable": 스타일시트, 이미지 등 로드
new JSDOM(html, { resources: "usable" });

// CustomResourceLoader: 세밀한 제어
class MyResourceLoader extends jsdom.ResourceLoader {
  fetch(url, options) {
    if (url === "blocked.js") return null;  // 차단
    return super.fetch(url, options);
  }
}
new JSDOM(html, { resources: new MyResourceLoader() });
```

### Web Components / 커스텀 엘리먼트

이것이 **Duorian 프로젝트에서 jsdom의 가장 치명적인 약점**이다.

**Custom Elements (`customElements.define`) 지원 상태:**

jsdom은 2023년(v22.x)부터 **Custom Elements v1의 기본적인 지원**을 추가했다:
- `customElements.define()` 호출 가능
- `connectedCallback`, `disconnectedCallback` 호출
- `attributeChangedCallback` 호출
- 커스텀 엘리먼트의 `constructor` 실행

**그러나 핵심적 한계가 있다:**

1. **Shadow DOM: 매우 제한적 지원**
   - jsdom v20+에서 `element.attachShadow()` 지원 추가
   - 그러나 `<template shadowrootmode="open">` (선언적 Shadow DOM)은 지원이 불완전하거나 미지원
   - Shadow DOM 내부 CSS 격리 미구현
   - `::slotted()`, `::part()` CSS 선택자 미지원

2. **Reddit의 `shreddit-*` 엘리먼트 문제:**
   - case-3에서 `shreddit-comment`, `shreddit-post`, `shreddit-app` 등 수십 종의 커스텀 엘리먼트 사용
   - Shadow DOM 참조가 **2,306건** -- Reddit은 Shadow DOM을 대량 사용
   - jsdom에서 `runScripts: "dangerously"` 없이는 커스텀 엘리먼트가 단순한 HTMLUnknownElement로 처리됨
   - 스크립트를 실행하더라도 Reddit의 번들 JS가 브라우저 전용 API에 의존하므로 대부분 실패
   - **결론: jsdom으로 Reddit의 shreddit-* 내부 콘텐츠를 정상적으로 접근하기 극히 어려움**

3. **YouTube의 Web Components 문제:**
   - case-5에서 `iron-iconset-svg`, `custom-style`, `paper-tabs` 등 Polymer 기반 Web Components 사용
   - YouTube의 프론트엔드는 Polymer/Lit 기반 커스텀 엘리먼트 중심
   - 동일한 이유로 jsdom에서 정상적으로 렌더링/접근 불가

### SVG 처리

- SVG 요소는 파싱되고 DOM 트리에 포함됨
- SVG 네임스페이스(`http://www.w3.org/2000/svg`)를 올바르게 처리
- SVG 요소의 속성(viewBox, d, fill 등) 접근 가능
- **그러나** SVG 렌더링, getBBox(), getBoundingClientRect() 등은 미지원 (레이아웃 엔진 없음)

---

## 4. 성능 특성

### 메모리 사용량

jsdom은 DOM API를 완전히 에뮬레이트하기 때문에 **메모리 사용량이 상당하다**:

| 문서 크기 | 예상 메모리 사용량 | 비고 |
|-----------|-------------------|------|
| 384KB (case-4) | ~80-150MB | 노드 수에 따라 변동 |
| 790KB (case-1) | ~150-250MB | 광고 스크립트 태그 다수 |
| 891KB (case-2) | ~150-300MB | 인라인 CSS 대량 포함 |
| 3.1MB (case-5) | ~400-800MB | YouTube, 거대한 인라인 데이터 |
| 5.2MB (case-3) | ~600MB-1.2GB | Reddit, 커스텀 엘리먼트 대량 |

**메모리가 큰 이유:**
- 모든 DOM 노드가 완전한 JS 객체 (프로토타입 체인, 내부 슬롯, WeakRef 등)
- 각 Element에 attributes NamedNodeMap, classList, dataset, style 등 부속 객체
- 각 노드의 parentNode, childNodes, ownerDocument 등 양방향 참조
- Window 객체의 글로벌 에뮬레이션 (console, navigator, location, history, ...)
- HTML 원문 크기 대비 **약 50~200배**의 메모리 증폭이 일반적

### 파싱 속도

벤치마크 참고값 (Node.js, Apple Silicon M1 기준 추정):

| 문서 | jsdom 파싱 시간 | parse5 단독 | cheerio |
|------|----------------|------------|---------|
| 384KB | ~200-400ms | ~50-80ms | ~60-100ms |
| 1MB | ~500ms-1s | ~100-200ms | ~120-250ms |
| 3MB | ~1.5-3s | ~300-500ms | ~400-700ms |
| 5MB | ~3-6s | ~500ms-1s | ~600ms-1.2s |

jsdom이 parse5 단독 대비 **3-6배 느린** 이유:
1. parse5 파싱 자체는 동일하지만
2. 각 노드를 jsdom DOM 객체로 변환하는 TreeAdapter 오버헤드
3. HTMLElement 서브클래스 인스턴스 생성 (예: `<div>`는 HTMLDivElement, `<a>`는 HTMLAnchorElement)
4. 속성(attributes) 파싱 및 Attr 객체 생성
5. 네임스페이스 처리, 문서 모드 결정 등

### GC 압력

대량의 DOM 노드 객체 생성은 Node.js GC에 상당한 부담:
- 5MB HTML 문서는 수만~수십만 개의 DOM 노드 객체 생성
- 양방향 참조(parent-child)로 인한 GC 사이클 탐지 비용
- `dom.window.close()` 호출 필수 -- 미호출 시 타이머, 이벤트 리스너 등이 누수

---

## 5. 한계점 및 약점 상세

### JavaScript 실행 능력과 한계

- `runScripts: "dangerously"` 모드에서 **vm.Script** (Node.js VM 모듈) 기반 실행
- **보안 경고**: 신뢰할 수 없는 HTML의 스크립트 실행은 샌드박스 탈출 가능 (Node.js vm은 보안 샌드박스가 아님)
- 실행 가능한 것: 기본 JS, DOM 조작, setTimeout/setInterval
- 실행 불가능한 것:
  - `<script type="module">` (ES modules) -- **미지원**
  - Web Workers -- **미지원**
  - Service Workers -- **미지원**
  - WebAssembly -- **미지원**
  - WebGL, Canvas 2D -- **미지원** (canvas 패키지 별도 설치 시 부분 지원)
  - Web Audio, WebRTC -- **미지원**

### CSS 레이아웃/렌더링

jsdom에는 **레이아웃 엔진이 없다**. 이것은 의도적 설계 결정이다:

- `element.offsetWidth`, `offsetHeight` -> 항상 `0`
- `element.getBoundingClientRect()` -> 모든 값 `0`
- `window.getComputedStyle()` -> 인라인 스타일만 반환, cascade 미적용
- CSS `display: none` 판별 불가 (스타일시트의 규칙이 적용되지 않으므로)
- **Duorian 시사점**: "보이지 않는 요소 필터링"을 CSS 기반으로 할 수 없음

### Shadow DOM 지원

- `element.attachShadow({ mode: "open" })` -- 지원 (jsdom v20+)
- `element.shadowRoot` 접근 -- 지원 (open mode)
- `<slot>` 요소 -- 기본적 지원
- **선언적 Shadow DOM** (`<template shadowrootmode>`) -- 미지원 또는 불완전
- Shadow DOM 내 CSS 격리 -- 미지원
- Shadow DOM 내 이벤트 retargeting -- 부분 지원
- **case-3 (Reddit) 영향**: Chrome extension으로 캡처된 HTML이라면, Shadow DOM이 이미 "flattened" 상태일 수 있어 영향이 줄어들 수 있음. 단, `shreddit-*` 태그 자체는 HTMLUnknownElement로 처리됨

### Custom Elements 지원

- `customElements.define()` -- 지원 (jsdom v22+)
- `is` 속성 (customized built-in elements) -- 부분 지원
- **핵심 문제**: 커스텀 엘리먼트 정의(define)가 되어 있지 않으면 단순 HTMLElement로 취급
- Duorian의 경우 `runScripts`를 활성화하지 않으므로 Reddit/YouTube의 커스텀 엘리먼트 클래스가 등록되지 않음
- 그래도 **DOM 트리 자체는 파싱됨** -- `<shreddit-comment>` 태그는 존재하고, 속성과 자식 노드에 접근 가능

### 메모리 오버헤드 vs 경량 대안

| 라이브러리 | 1MB HTML 메모리 | 파싱 시간 | DOM API |
|-----------|----------------|----------|---------|
| **jsdom** | ~200MB | ~700ms | 완전 (Window, Document) |
| **happy-dom** | ~80-120MB | ~300ms | 높음 (성능 최적화) |
| **linkedom** | ~40-60MB | ~150ms | 중간 (기본 DOM) |
| **cheerio** | ~30-50MB | ~120ms | jQuery-like (DOM 아님) |
| **parse5** (raw) | ~15-30MB | ~100ms | AST만 (DOM 아님) |

jsdom은 가장 무거운 선택지이다. 같은 문서에 대해:
- happy-dom 대비 **~2배 메모리, ~2배 느림**
- linkedom 대비 **~4배 메모리, ~4배 느림**
- cheerio 대비 **~5배 메모리, ~5배 느림**

### 한국어/CJK 문자 인코딩 처리

jsdom은 **whatwg-encoding** 라이브러리를 사용하여 문자 인코딩을 처리한다:

- **UTF-8**: 완벽 지원 (테스트 케이스들의 `<meta charset="UTF-8">`)
- **EUC-KR / CP949**: whatwg-encoding을 통해 지원. WHATWG Encoding Standard가 EUC-KR을 포함.
- **인코딩 자동 감지**: `html-encoding-sniffer` 라이브러리가 `<meta>` 태그 및 BOM을 분석하여 인코딩 결정
- **CJK 문자 처리**: DOM 레벨에서 문제 없음. JavaScript 문자열은 UTF-16이므로 한국어, 일본어, 중국어 모두 정상 처리
- **주의점**: 바이너리 Buffer에서 JSDOM 생성 시 인코딩 지정이 중요

```javascript
// 올바른 한국어 인코딩 처리 예시
const dom = new JSDOM(buffer, {
  contentType: "text/html; charset=euc-kr"
});
```

테스트 케이스들은 모두 UTF-8(`<meta charset="UTF-8">` 또는 `<meta content="text/html; charset=UTF-8">`)을 사용하므로 인코딩 문제는 없을 것으로 예상된다.

---

## 6. 생태계 현황

### npm 다운로드 및 유지보수

- **npm 주간 다운로드**: 약 **2,500만~3,000만 회/주** (2025년 기준)
- npm에서 가장 많이 다운로드되는 패키지 상위권
- **Jest의 기본 DOM 환경**으로 사용되는 것이 다운로드 수의 주요 원인
- **최신 버전**: v25.x (2025년 기준, 활발한 메이저 업데이트)
- **유지보수**: Domenic Denicola (Google Chrome 팀) 주도, 꾸준한 업데이트
- **GitHub 스타**: ~20,000+
- **라이선스**: MIT

### 대안 비교

#### happy-dom

| 항목 | jsdom | happy-dom |
|------|-------|-----------|
| 설계 철학 | spec 준수 최우선 | 성능 최우선 |
| HTML 파서 | parse5 (spec-compliant) | 자체 구현 (속도 우선) |
| 파싱 속도 | 느림 | jsdom 대비 **2-3배 빠름** |
| 메모리 | 무거움 | jsdom 대비 **40-50% 절약** |
| DOM 호환성 | 매우 높음 | 높음 (일부 edge case 차이) |
| CSS | 제한적 | jsdom보다 나은 CSS 지원 |
| Custom Elements | 기본 지원 | 더 나은 지원 |
| Shadow DOM | 기본 지원 | 더 나은 지원 |
| Fetch API | 없음 (polyfill 필요) | 내장 |
| npm 주간 DL | ~2,500만 | ~500만 |
| 사용처 | Jest 기본 | Vitest 기본 |
| 비정형 HTML | **우수** (parse5) | 상대적 약점 |

**Duorian 관점**: happy-dom은 성능이 좋지만, parse5 기반이 아닌 자체 파서를 사용하므로 **비정형 HTML의 에러 복구가 브라우저와 다를 수 있다**. 뉴스 사이트의 지저분한 HTML을 파싱할 때 이것은 리스크이다.

#### linkedom

| 항목 | jsdom | linkedom |
|------|-------|---------|
| 설계 철학 | 완전한 브라우저 에뮬레이션 | 최소한의 DOM |
| HTML 파서 | parse5 | **htmlparser2** (관대한 파서) |
| 파싱 속도 | 느림 | jsdom 대비 **5-7배 빠름** |
| 메모리 | 무거움 | jsdom 대비 **70-80% 절약** |
| DOM 호환성 | 매우 높음 | 중간 (기본 API만) |
| Window 에뮬레이션 | 완전 | 최소한 |
| 이벤트 | 완전 | 기본적 |
| npm 주간 DL | ~2,500만 | ~100만 |

**Duorian 관점**: linkedom은 극도로 가볍지만, DOM API 호환성이 낮아 복잡한 DOM 조작이 필요하면 부족할 수 있다. 단, "경량화/색인화"만 목적이라면 충분할 수 있다.

---

## 7. Duorian 프로젝트에 대한 종합 평가

### jsdom의 강점 (이 프로젝트 기준)

1. **parse5 기반 파싱 정확도**: 뉴스 사이트의 비정형 HTML을 브라우저와 동일하게 파싱
2. **완전한 DOM API**: `querySelector`, `querySelectorAll`, `textContent`, `innerHTML` 등 모든 DOM 탐색 API 사용 가능
3. **한국어 인코딩**: whatwg-encoding을 통한 완전한 EUC-KR/UTF-8 지원
4. **성숙한 생태계**: 20,000+ 스타, 수천만 주간 다운로드, 안정적 유지보수

### jsdom의 약점 (이 프로젝트 기준)

1. **성능이 심각한 병목**:
   - case-3 (5.2MB Reddit): 파싱만 3-6초, 메모리 600MB-1.2GB
   - case-5 (3.1MB YouTube): 파싱 1.5-3초, 메모리 400-800MB
   - Chrome extension에서 실시간 처리하기에는 과도한 리소스
   
2. **Web Components/Shadow DOM 한계**:
   - Reddit의 `shreddit-*` 커스텀 엘리먼트 내부 접근 불가 (JS 실행 없이는 HTMLUnknownElement)
   - YouTube의 Polymer 컴포넌트 구조 미해석
   - Shadow DOM 2,306건 참조가 있는 Reddit 페이지에서 콘텐츠 추출이 구조적으로 어려움

3. **과도한 오버헤드**:
   - Duorian의 목적은 "경량화/색인화"이므로, 완전한 Window/Navigator/History 에뮬레이션이 불필요
   - DOM 이벤트 시스템, XMLHttpRequest 등 사용하지 않을 기능에 대한 메모리/CPU 비용 낭비

4. **메모리 누수 리스크**:
   - `dom.window.close()` 미호출 시 타이머/콜백 누수
   - 대량 문서 반복 처리 시 GC 압력 누적

### 핵심 결론

> **jsdom은 Duorian 프로젝트에 적합하지 않다.**

이유:
- 384KB~5.2MB 크기의 실제 웹 페이지를 반복 처리해야 하는 환경에서 jsdom의 메모리/속도 오버헤드는 과도하다.
- 완전한 브라우저 에뮬레이션(Window, Navigator, History, XMLHttpRequest 등)이 필요하지 않으므로 jsdom의 핵심 가치를 활용하지 못한다.
- Reddit/YouTube의 Web Components 구조를 jsdom으로 해석하는 것은 기술적으로 한계가 명확하다.

**대안 제안 (우선순위):**
1. **cheerio + parse5**: 파싱 정확도(parse5)를 유지하면서 jQuery-like API로 경량 DOM 탐색. 메모리 jsdom의 1/5.
2. **linkedom**: parse5는 아니지만 htmlparser2 기반으로 충분히 관대한 파싱. 가장 가벼운 DOM 구현.
3. **parse5 직접 사용**: AST를 직접 순회하여 최대 성능. DOM API 없이 트리 워커 패턴으로 구현.
4. **happy-dom**: jsdom의 DOM API가 꼭 필요하지만 성능이 중요할 때.

단, Chrome extension에서 **이미 전개(render)된 HTML**을 캡처하는 구조라면, Shadow DOM 내부 콘텐츠가 이미 flattened 상태인지 확인이 필요하다. 만약 `outerHTML`로 캡처하면 Shadow DOM 내부는 포함되지 않으므로, **어떤 라이브러리를 선택하든** Reddit/YouTube의 Shadow DOM 콘텐츠 접근 문제는 동일하게 발생한다. 이 경우 Chrome extension 단에서 Shadow DOM 내부를 별도로 추출하는 전략이 필요하다.
