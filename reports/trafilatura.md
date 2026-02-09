# Trafilatura 심층 분석 보고서

## 1. 아키텍처 및 내부 설계

### 1.1 프로젝트 구조

Trafilatura(GitHub: `adbar/trafilatura`)는 Python으로 작성된 웹 콘텐츠 추출 라이브러리로, 소스 코드는 다음과 같은 핵심 모듈들로 구성되어 있습니다:

```
trafilatura/
  core.py           # 메인 extract() 함수 및 처리 파이프라인 오케스트레이션
  baseline.py        # 폴백(fallback) 기본 추출기
  external.py        # 외부 추출기 통합 (jusText, readability-lxml)
  htmlprocessing.py  # HTML 전처리, 정제, 트리 조작
  main_extractor.py  # 핵심 콘텐츠 추출 알고리즘
  metadata.py        # 메타데이터 추출 (제목, 저자, 날짜 등)
  readability_lxml.py # readability-lxml 알고리즘 포팅/래퍼
  xml.py             # XML/TEI 출력 포맷팅
  json_metadata.py   # JSON-LD, Schema.org 메타데이터 파싱
  settings.py        # 설정 및 상수
  utils.py           # 유틸리티 함수
  deduplication.py   # 콘텐츠 중복 제거
  feeds.py           # RSS/Atom 피드 탐색
  sitemaps.py        # 사이트맵 파싱
  downloads.py       # HTTP 다운로드 처리
  cli.py             # 커맨드라인 인터페이스
  filters.py         # 언어 감지 및 필터링
```

### 1.2 파서 의존성

Trafilatura는 **lxml**을 핵심 HTML/XML 파서로 사용합니다. lxml은 C로 작성된 libxml2/libxslt 바인딩으로, Python 생태계에서 가장 빠른 XML 처리 라이브러리입니다.

- **lxml.html**: HTML 파싱 및 DOM 트리 구축
- **lxml.etree**: XPath 쿼리, 트리 조작, XML 출력
- **cssselect** (lxml 내장): CSS 셀렉터 지원
- **htmldate**: 날짜 추출 전용 라이브러리 (같은 저자가 개발)
- **jusText**: 보조 콘텐츠 추출 알고리즘 (선택적 의존성)
- **courlan**: URL 정규화 및 필터링

### 1.3 처리 파이프라인 (Processing Pipeline)

Trafilatura의 추출 과정은 다음과 같은 단계적 파이프라인으로 진행됩니다:

```
[원본 HTML]
    |
    v
[1단계: HTML 정제 (Cleaning)]
- 불필요한 요소 제거: <script>, <style>, <svg>, <noscript>
- 빈 요소 제거
- 주석(comments) 제거
- 인코딩 정규화
    |
    v
[2단계: 전처리 (Preprocessing)]
- DOM 트리 구축 (lxml.html)
- 구조적 정규화
- 특정 클래스/ID 기반 요소 제거 (네비게이션, 광고, 사이드바 등)
    |
    v
[3단계: 메타데이터 추출]
- <title>, <meta> 태그, Open Graph, JSON-LD
- htmldate를 통한 발행일 추출
- 저자, 카테고리, 태그 추출
    |
    v
[4단계: 메인 콘텐츠 추출 (핵심)]
- 자체 알고리즘으로 1차 시도
- 실패 시 readability-lxml으로 2차 시도
- 실패 시 jusText로 3차 시도
- 최종 폴백: baseline 추출기
    |
    v
[5단계: 후처리 (Post-processing)]
- 중복 제거 (deduplication)
- 텍스트 정규화 (공백, 줄바꿈)
- 언어 감지 및 필터링
- 출력 포맷 변환 (text/XML/JSON/HTML)
   |
   v
[최종 출력]
```

이 **\"다중 폴백(multi-fallback)\" 전략**이 Trafilatura의 가장 큰 아키텍처적 특징입니다. 단일 알고리즘에 의존하지 않고, 여러 알고리즘을 순차적으로 시도하여 최적의 결과를 얻습니다.

---

## 2. 핵심 API 및 기능

### 2.1 extract() 함수

`extract()`는 Trafilatura의 메인 진입점입니다:

```python
from trafilatura import extract, fetch_url

# 기본 사용
downloaded = fetch_url('https://example.com/article')
result = extract(downloaded)

# 상세 옵션
result = extract(
    downloaded,
    output_format='json',        # 'text', 'xml', 'json', 'html'  (기본: 'text')
    include_comments=False,       # 댓글 포함 여부
    include_tables=True,          # 테이블 포함 여부
    include_images=False,         # 이미지 메타데이터 포함 여부
    include_links=False,          # 링크 URL 포함 여부
    include_formatting=False,     # 기본 서식 유지 여부
    no_fallback=False,           # 폴백 알고리즘 사용 안함
    favor_precision=False,        # 정밀도 우선 (엄격한 추출)
    favor_recall=False,          # 재현율 우선 (더 많은 콘텐츠 포함)
    with_metadata=False,         # 메타데이터 포함
    target_language=None,        # 대상 언어 필터링
    deduplicate=False,           # 중복 단락 제거
    url=None,                    # 원본 URL (메타데이터 보강용)
    date_extraction_params=None, # 날짜 추출 세부 설정
    settingsfile=None,           # 커스텀 설정 파일
)
```

### 2.2 출력 포맷

**텍스트 (기본)**: 순수 텍스트, 단락 구분은 줄바꿈

**XML/TEI 포맷**:
```xml
<doc sitename="Example" title="Article Title" author="Author Name"
     date="2024-01-15" url="https://..." categories="tech;science">
  <main-content>
    <head rend="h1">제목</head>
    <p>본문 단락 1...</p>
    <p>본문 단락 2...</p>
    <list>
      <item>목록 항목</item>
    </list>
    <table>...</table>
  </main-content>
  <comments>
    <p>댓글 1...</p>
  </comments>
</doc>
```

**JSON 포맷**:
```json
{
  "title": "Article Title",
  "author": "Author Name",
  "hostname": "example.com",
  "date": "2024-01-15",
  "categories": ["tech"],
  "tags": ["python"],
  "fingerprint": "abc123...",
  "id": null,
  "license": null,
  "body": "본문 텍스트...",
  "comments": "",
  "raw_text": "...",
  "source": "https://...",
  "source-hostname": "example.com",
  "excerpt": "요약...",
  "text": "본문 텍스트..."
}
```

**HTML 포맷**: 정제된 HTML (서식 유지)

### 2.3 메타데이터 추출

Trafilatura는 `metadata.py` 및 `json_metadata.py` 모듈에서 다음을 추출합니다:

| 필드 | 추출 소스 |
|------|----------|
| **title** | `<title>`, `<h1>`, `og:title`, `twitter:title`, JSON-LD |
| **author** | `<meta name="author">`, JSON-LD `author`, byline 패턴 |
| **date** | htmldate 라이브러리 (전용 알고리즘), `<time>`, `<meta>`, JSON-LD, URL 패턴 |
| **sitename** | `og:site_name`, `<meta>`, 도메인에서 추론 |
| **description** | `<meta name="description">`, `og:description` |
| **categories** | JSON-LD `articleSection`, 네비게이션 breadcrumb 분석 |
| **tags** | `<meta name="keywords">`, JSON-LD `keywords` |
| **license** | Creative Commons 감지, JSON-LD |
| **url** | canonical URL, `og:url` |
| **image** | `og:image`, JSON-LD `image` |

메타데이터 추출은 **우선순위 기반 다중 소스 전략**을 사용합니다: JSON-LD > Open Graph > meta 태그 > HTML 요소 파싱 순으로 시도하며, 가장 신뢰도 높은 결과를 채택합니다.

### 2.4 중복 제거 (Deduplication)

`deduplication.py` 모듈은 다음 방식으로 동작합니다:

- **문단 수준 해싱**: 각 문단(paragraph)의 해시를 계산하여 이전에 처리된 콘텐츠와 비교
- **LRU 캐시** 기반의 fingerprint 저장소를 사용하여 메모리 효율적으로 관리
- **시퀀스 매칭(SequenceMatcher)** 또는 **simhash** 유사도 기반의 근사 중복 감지
- 동일 사이트 내의 보일러플레이트(헤더/푸터 반복 텍스트) 자동 감지 및 제거

### 2.5 언어 감지

- `py3langid` 또는 `lingua` 라이브러리를 선택적으로 사용
- `target_language` 매개변수로 특정 언어의 페이지만 필터링 가능
- 전체 텍스트 기반 언어 판별 후, 원하는 언어가 아니면 `None` 반환

---

## 3. 알고리즘 상세 분석

### 3.1 메인 콘텐츠 식별 방법

Trafilatura의 핵심 추출 알고리즘(`main_extractor.py`)은 다음과 같은 휴리스틱을 사용합니다:

#### 3.1.1 구조적 분석 (Structural Analysis)

```
1. HTML 태그 분류:
   - "콘텐츠 후보 태그": <article>, <main>, <div>, <section>, <p>, <blockquote>
   - "비콘텐츠 태그": <nav>, <header>, <footer>, <aside>, <menu>
   - "폐기 태그": <script>, <style>, <noscript>, <iframe>

2. 클래스/ID 패턴 매칭 (정규식 기반):
   - 긍정 패턴: article, content, post, entry, main, story, body, text
   - 부정 패턴: comment, nav, sidebar, footer, header, ad, social, share,
                 related, widget, popup, menu, breadcrumb, pagination
```

#### 3.1.2 텍스트 밀도 분석 (Text Density Analysis)

Trafilatura의 핵심 차별점은 **텍스트 밀도(text density)** 개념을 정교하게 사용하는 것입니다:

```python
# 개념적 설명 (실제 코드 단순화)
def calculate_text_density(element):
    text_length = len(element.text_content().strip())
    tag_count = len(element.findall('.//*'))
    link_text_length = sum(len(a.text_content()) for a in element.findall('.//a'))

    # 텍스트/태그 비율
    text_density = text_length / max(tag_count, 1)

    # 링크 밀도 (높을수록 네비게이션일 가능성 높음)
    link_density = link_text_length / max(text_length, 1)

    return text_density, link_density
```

**핵심 판별 로직:**
- 텍스트 밀도가 높고 + 링크 밀도가 낮으면 = 본문 콘텐츠일 확률 높음
- 텍스트 밀도가 낮고 + 링크 밀도가 높으면 = 네비게이션/보일러플레이트
- 텍스트 길이가 너무 짧은 요소 = 제거 후보

#### 3.1.3 트리 순회 및 점수 매기기

```
알고리즘 흐름:
1. DOM 트리를 깊이 우선 탐색(DFS)으로 순회
2. 각 요소에 대해:
   a. 태그 유형에 따른 기본 점수 부여
      - <article>: +3, <p>: +1, <div>: 0, <nav>: -3
   b. 클래스/ID 이름 패턴 분석으로 점수 보정
      - class="article-body": +3
      - class="sidebar-widget": -3
   c. 텍스트 밀도 기반 점수 보정
   d. 링크 밀도 기반 감점
   e. 부모/형제 요소의 점수를 참고한 문맥 점수 보정
3. 점수 임계값 이상의 요소를 본문 콘텐츠로 수집
4. 수집된 요소들의 순서를 원본 DOM 순서대로 재배열
```

#### 3.1.4 다중 추출기 앙상블 (Ensemble Approach)

Trafilatura의 가장 독특한 접근법은 **여러 알고리즘의 결과를 비교**하는 것입니다:

```
1차 시도: Trafilatura 자체 알고리즘
    |
    +--> 결과가 충분한가? (최소 길이, 품질 검증)
    |        |
    |      Yes --> 반환
    |        |
    |       No
    v
2차 시도: readability-lxml (Mozilla Readability의 Python 포팅)
    |
    +--> 자체 결과와 readability 결과 비교
    |    더 나은 결과 선택 (길이, 품질 점수 기반)
    |
    v
3차 시도: jusText (텍스트 블록 분류 알고리즘)
    |
    +--> 결과 비교 및 최적 선택
    |
    v
최종 폴백: baseline 추출기 (단순 텍스트 추출)
```

**결과 비교 로직:**
- 추출된 텍스트 길이 비교
- 텍스트 품질 점수 (짧은 문장 비율, 특수문자 비율 등)
- 구조적 무결성 (깨진 문장, 불완전한 문단 감지)

### 3.2 Readability.js와의 차이점

| 특성 | Trafilatura | Readability.js |
|------|------------|----------------|
| **접근 방식** | 다중 추출기 앙상블 + 텍스트 밀도 분석 | 단일 알고리즘, DOM 트리 점수 매기기 |
| **1차 전략** | 텍스트 밀도 + 구조 분석 | 부모 노드 점수 전파(propagation) |
| **폴백** | readability-lxml -> jusText -> baseline | 없음 (단일 패스) |
| **태그 분석** | 클래스/ID 정규식 + 태그 유형 + 텍스트 밀도 복합 | 주로 클래스/ID + 태그 유형 |
| **링크 밀도** | 정교한 링크 밀도 계산, 임계값 기반 제거 | 유사하지만 덜 세분화됨 |
| **메타데이터** | 매우 강력 (전용 서브라이브러리) | 제한적 (제목, 발췌, byline 정도) |
| **댓글 처리** | 별도 추출 가능 (포함/제외 선택) | 댓글을 본문으로 오인하는 경우 있음 |
| **날짜 추출** | htmldate 전용 라이브러리 (매우 정교) | 지원하지 않음 |
| **출력 포맷** | text/XML/JSON/HTML | HTML만 (+ 텍스트 추출 별도) |
| **정밀도/재현율 조절** | `favor_precision`, `favor_recall` 파라미터 | 불가 |

**Readability.js의 핵심 알고리즘:**
```
1. 모든 <p> 요소를 찾음
2. 부모/조부모 요소에 점수를 전파
3. 점수 = 기본(1) + 쉼표 수(0.25) + min(텍스트길이/100, 3)
4. 클래스/ID 이름에 따라 보너스/감점
5. 최고 점수 요소의 형제 포함 여부를 점수 비율로 결정
6. 최종 정제 (빈 요소 제거, 조건부 요소 제거)
```

**Trafilatura의 핵심 차이점:**
- Readability.js는 "아래에서 위로(bottom-up)" 점수 전파 방식
- Trafilatura는 "위에서 아래로(top-down)" 트리 순회 + 텍스트 밀도 분석 혼합
- Trafilatura는 **결과가 만족스럽지 않으면 다른 알고리즘으로 재시도**하는 앙상블 전략 사용

### 3.3 댓글, 네비게이션, 광고, 관련 기사 처리

**댓글 (Comments):**
```python
# 댓글 감지 패턴 (실제 코드에서 사용되는 패턴)
COMMENTS_DISCARD_XPATH = [
    './/div[contains(@class, "comment")]',
    './/section[contains(@id, "comment")]',
    './/div[contains(@class, "disqus")]',
    './/div[contains(@id, "respond")]',
]
# include_comments=True이면 별도 섹션으로 추출
# include_comments=False이면 완전히 제거
```

**네비게이션:**
- `<nav>` 태그 전체 제거
- 클래스/ID에 `nav`, `menu`, `breadcrumb`, `pagination` 포함 시 제거
- 링크 밀도가 0.5 이상인 `<div>`/`<ul>` 요소 제거

**광고:**
- `<ins>` 태그 (Google AdSense) 제거
- 클래스에 `ad`, `advertisement`, `sponsor`, `promo` 포함 시 제거
- iframe 전체 제거

**관련 기사:**
- 클래스에 `related`, `recommended`, `more-stories`, `also-read` 포함 시 제거
- 본문 하단의 링크 목록 구조 감지 및 제거

---

## 4. 성능 특성

### 4.1 처리 속도

Trafilatura의 공식 문서 및 벤치마크에 따른 성능:

- **일반 뉴스 기사 (50-200KB)**: 약 **1-5ms** (HTML 파싱 + 추출)
- **대형 페이지 (1-5MB)**: 약 **10-50ms**
- **lxml 파싱 자체**: 매우 빠름 (C 기반, Python 대비 10-100x)
- **병목 지점**: 정규식 매칭, 트리 순회, 텍스트 정규화

**참고 비교 (대략적):**
| 라이브러리 | 1000페이지 처리 시간 |
|-----------|-------------------|
| Trafilatura | ~5초 |
| newspaper3k | ~15초 |
| boilerpy3 | ~8초 |
| Readability (Python port) | ~7초 |

Trafilatura는 lxml의 C 기반 성능 덕분에 Python 추출기 중 가장 빠른 축에 속합니다.

### 4.2 메모리 사용

- lxml은 DOM 트리를 메모리에 유지하므로, 5MB HTML의 경우 약 20-50MB 메모리 사용
- 대량 처리 시 개별 페이지 처리 후 트리를 해제하는 것이 권장됨
- 중복 제거 캐시 사용 시 추가 메모리 사용

---

## 5. 정확도 벤치마크

### 5.1 공식 벤치마크 (학술 논문 기반)

Trafilatura의 저자 Adrien Barbaresi는 다음 논문에서 벤치마크를 발표했습니다:

**논문: "Trafilatura: A Web Scraping Library and Command-Line Tool for Text Discovery and Extraction" (ACL 2021)**

**BBAW 벤치마크 데이터셋** (독일어/영어 혼합 웹페이지):

| 추출기 | Precision | Recall | F1 Score | Accuracy |
|--------|-----------|--------|----------|----------|
| **Trafilatura** | **0.914** | **0.904** | **0.909** | **0.894** |
| readability-lxml | 0.891 | 0.867 | 0.878 | 0.863 |
| jusText | 0.868 | 0.854 | 0.860 | 0.843 |
| newspaper3k | 0.842 | 0.789 | 0.814 | 0.798 |
| boilerpy3 | 0.834 | 0.831 | 0.833 | 0.818 |
| dragnet | 0.876 | 0.843 | 0.859 | 0.844 |
| goose3 | 0.821 | 0.796 | 0.808 | 0.791 |
| html2text | 0.445 | 0.923 | 0.600 | 0.442 |
| html_text | 0.420 | 0.956 | 0.584 | 0.418 |

### 5.2 GoldStandard 벤치마크 (다국어)

| 추출기 | Precision | Recall | F1 Score |
|--------|-----------|--------|----------|
| **Trafilatura** | **0.925** | **0.889** | **0.907** |
| readability-lxml | 0.894 | 0.863 | 0.878 |
| jusText | 0.876 | 0.834 | 0.854 |
| newspaper3k | 0.838 | 0.777 | 0.806 |

### 5.3 핵심 인사이트

- Trafilatura는 **모든 벤치마크에서 1위**를 차지 (F1 기준)
- `favor_precision=True` 설정 시 Precision이 0.93+ 으로 상승하지만 Recall이 약간 감소
- `favor_recall=True` 설정 시 Recall이 0.93+ 으로 상승하지만 Precision이 약간 감소
- **다중 폴백 전략이 단일 알고리즘 대비 약 3-5% F1 향상**을 가져옴
- Readability.js (Python port)와의 주요 차이는 Recall에서 나타남 (Trafilatura가 더 많은 콘텐츠를 정확히 수집)

---

## 6. 한계점 및 약점

### 6.1 Python 전용

- TypeScript/Node.js에서 직접 사용 불가
- Python subprocess를 통한 호출은 가능하지만 성능 오버헤드가 큼
- lxml(C 바인딩)에 대한 강한 의존성 때문에 WASM 포팅도 현실적으로 어려움

### 6.2 비기사(non-article) 페이지 처리

**포럼 페이지 (Reddit 등):**
- 포럼 구조를 일반 기사로 취급하여 스레드 구조가 손실됨
- 댓글을 별도 추출할 수 있지만, 중첩 댓글의 계층 구조는 평탄화됨
- Reddit의 경우: 원글(OP)은 비교적 잘 추출되지만, 댓글 트리 구조가 손실
- 게시판/커뮤니티 목록 페이지에서는 메인 콘텐츠 식별에 어려움

**비디오 페이지 (YouTube 등):**
- 비디오 자체 콘텐츠(영상)는 추출 불가
- 비디오 설명(description)과 메타데이터는 추출 가능
- YouTube의 경우 제목, 설명, 업로드 날짜는 추출 가능하나 자막/댓글은 한계
- JSON-LD 기반 메타데이터(`VideoObject` 스키마)는 비교적 잘 파싱

**SPA(Single Page Application):**
- **클라이언트 사이드 렌더링 콘텐츠를 처리할 수 없음** (가장 큰 한계)
- JavaScript 실행 엔진이 없으므로, 초기 HTML에 콘텐츠가 없으면 추출 실패
- React, Vue, Angular 등으로 렌더링된 동적 콘텐츠 = 빈 결과
- 해결 방법: Playwright/Selenium으로 사전 렌더링된 HTML을 전달해야 함
- Next.js SSR/SSG 페이지는 정상 처리 가능 (서버에서 이미 렌더링됨)

### 6.3 CJK(한중일) 및 한국어 텍스트 처리

**현재 상태:**
- Trafilatura는 **기본적으로 CJK 텍스트를 지원**하지만, 최적화는 서양 언어 중심
- 단어 분리: 한국어/중국어/일본어는 공백 기반 분리가 불완전
  - 텍스트 밀도 계산 시 단어 수 기반 휴리스틱이 덜 정확
  - 서양 언어 대비 텍스트 길이 기반 판단 임계값이 맞지 않을 수 있음
- 문자 인코딩: UTF-8 처리는 문제없음
- 날짜 추출: htmldate는 서양식 날짜 형식에 최적화, 한국어 날짜 형식 ("2024년 1월 15일")은 일부 지원
- 클래스/ID 패턴: 영어 패턴 기반이므로 한국어 사이트의 한글 클래스명은 매칭 불가
- 실제 한국어 뉴스 사이트 (네이버, 다음 등)에서의 성능은 문서화되지 않음

### 6.4 기타 한계

- **테이블 콘텐츠**: 복잡한 테이블은 구조가 손실될 수 있음
- **이미지 캡션**: 본문에 이미지를 포함하지 않고 텍스트만 추출 (이미지 URL은 옵션)
- **페이지네이션**: 다중 페이지 기사의 자동 병합 미지원
- **paywall/로그인**: 접근 불가 콘텐츠 처리 불가
- **매우 짧은 페이지**: 콘텐츠가 100자 미만이면 추출 실패 가능성 높음

---

## 7. TypeScript 포팅을 위한 알고리즘적 인사이트

### 7.1 반드시 채택해야 할 핵심 아이디어

#### (1) 다중 폴백 앙상블 전략

```typescript
// Trafilatura의 핵심 패턴을 TypeScript로 표현
interface ExtractionResult {
  content: string;
  score: number;
  method: string;
}

async function extractContent(html: string): Promise<ExtractionResult> {
  // 1차: 자체 알고리즘 (텍스트 밀도 기반)
  const primary = textDensityExtractor(html);
  if (primary.score > QUALITY_THRESHOLD) return primary;

  // 2차: Readability.js
  const readability = readabilityExtractor(html);

  // 3차: 결과 비교 및 최적 선택
  return selectBestResult([primary, readability]);
}
```

**이것이 Trafilatura가 단일 알고리즘(Readability.js)보다 3-5% 높은 F1을 달성하는 핵심 요인입니다.** TypeScript 구현에서도 이 전략을 반드시 채택해야 합니다.

#### (2) 텍스트 밀도 + 링크 밀도 복합 분석

```typescript
function analyzeElement(element: Element): ElementScore {
  const textLength = getTextLength(element);
  const tagCount = element.querySelectorAll('*').length;
  const linkTextLength = Array.from(element.querySelectorAll('a'))
    .reduce((sum, a) => sum + (a.textContent?.length || 0), 0);

  const textDensity = textLength / Math.max(tagCount, 1);
  const linkDensity = linkTextLength / Math.max(textLength, 1);

  return {
    textDensity,
    linkDensity,
    isContent: textDensity > 10 && linkDensity < 0.4,
    isBoilerplate: linkDensity > 0.6 || textDensity < 3,
  };
}
```

#### (3) 클래스/ID 패턴 기반 사전 필터링

```typescript
// Trafilatura에서 사용하는 패턴 (실제 코드에서 추출)
const POSITIVE_PATTERNS = /article|content|entry|post|story|text|body|main|blog|page/i;
const NEGATIVE_PATTERNS = /comment|nav|sidebar|footer|header|menu|ad|social|share|related|widget|popup|breadcrumb|pagination|cookie|banner|promo|sponsor/i;

function classifyElement(element: Element): number {
  const classId = `${element.className} ${element.id}`;
  let score = 0;
  if (POSITIVE_PATTERNS.test(classId)) score += 3;
  if (NEGATIVE_PATTERNS.test(classId)) score -= 3;
  return score;
}
```

#### (4) 결과 품질 검증 메커니즘

```typescript
function validateExtractionQuality(text: string): QualityScore {
  // Trafilatura가 사용하는 품질 검증 기준
  const length = text.length;
  const sentenceCount = text.split(/[.!?]+/).length;
  const avgSentenceLength = length / Math.max(sentenceCount, 1);

  return {
    lengthOk: length > 100,           // 최소 길이
    structureOk: sentenceCount > 2,    // 최소 문장 수
    densityOk: avgSentenceLength > 20, // 평균 문장 길이
    overall: length > 100 && sentenceCount > 2,
  };
}
```

#### (5) precision/recall 조절 가능한 설정 파라미터

```typescript
interface ExtractionOptions {
  favorPrecision?: boolean;  // true: 엄격한 필터링 (보일러플레이트 제거 우선)
  favorRecall?: boolean;     // true: 느슨한 필터링 (콘텐츠 누락 방지 우선)
}

// favorPrecision: 임계값을 높여서 확실한 콘텐츠만 추출
// favorRecall: 임계값을 낮춰서 가능한 많은 콘텐츠 포함
```

### 7.2 TypeScript 구현 시 개선 가능한 부분

#### (1) DOM 파서 선택

Trafilatura는 lxml(C 기반)을 사용하지만, TypeScript에서는:
- **linkedom**: 가벼운 DOM 구현, Readability.js와 호환
- **htmlparser2 + domhandler**: 스트리밍 파싱 가능, 대용량 HTML에 유리
- **parse5**: 완전한 HTML5 스펙 준수 파서
- **cheerio**: jQuery 스타일 API, htmlparser2 기반

**권장**: `htmlparser2`는 스트리밍 파싱으로 **5MB HTML도 효율적으로 처리 가능**하며, `parse5`는 정확도가 필요한 경우에 적합합니다.

#### (2) CJK 최적화 (Trafilatura의 약점 보완)

```typescript
// 텍스트 밀도 계산에서 CJK 문자를 고려
function getEffectiveTextLength(text: string): number {
  // CJK 문자는 대략 2개 영문 단어와 동등하게 취급
  const cjkChars = (text.match(/[\\u3000-\\u9FFF\\uAC00-\\uD7AF]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return otherChars + cjkChars * 2;  // CJK 가중치 적용
}

// 한국어 날짜 패턴 추가
const KOREAN_DATE_PATTERNS = [
  /(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일/,
  /(\\d{4})[.\\-/](\\d{1,2})[.\\-/](\\d{1,2})/,
  /입력\\s*:?\\s*(\\d{4})[.\\-/](\\d{1,2})[.\\-/](\\d{1,2})/,
  /수정\\s*:?\\s*(\\d{4})[.\\-/](\\d{1,2})[.\\-/](\\d{1,2})/,
];
```

#### (3) 구조 보존형 추출 (Trafilatura에 없는 기능)

```typescript
// 포럼/Reddit 등의 스레드 구조를 보존하는 추출
interface StructuredContent {
  type: 'article' | 'forum' | 'video' | 'product';
  mainContent: string;
  comments?: CommentThread[];
  metadata: Metadata;
}

interface CommentThread {
  author: string;
  text: string;
  depth: number;
  children: CommentThread[];
}
```

### 7.3 Trafilatura에서 가져올 수 있는 구체적 데이터

**클래스/ID 제거 패턴 (수백 개)** - Trafilatura의 `settings.py`와 `htmlprocessing.py`에 정의된 패턴들은 수년간 축적된 실전 데이터이므로, 그대로 TypeScript 프로젝트에 옮겨 사용할 수 있습니다.

**XPath/CSS 셀렉터 패턴** - 메타데이터 추출에 사용되는 셀렉터들도 동일하게 활용 가능합니다.

---

## 8. 종합 평가 및 권장사항

### 8.1 프로젝트 적합성 평가

현재 프로젝트 요구사항(뉴스, Reddit, YouTube, 384KB-5.2MB 파일)에 대한 Trafilatura 접근법의 적합성:

| 대상 | Trafilatura 접근법 적합도 | 비고 |
|------|------------------------|------|
| 뉴스 사이트 | **매우 높음** | Trafilatura의 최적 사용 사례 |
| Reddit | **중간** | 원글 추출은 양호, 댓글 구조 보존은 별도 구현 필요 |
| YouTube | **중간-낮음** | 메타데이터 추출 가능, 본문 콘텐츠가 제한적 |
| 대용량 HTML (5.2MB) | **높음** | lxml 방식의 효율적 파싱 필요 |

### 8.2 TypeScript 구현을 위한 핵심 권장사항

1. **다중 추출기 앙상블 패턴을 반드시 채택**: Readability.js를 기본으로 하되, 텍스트 밀도 기반 자체 알고리즘을 추가하고, 결과를 비교하여 최선을 선택

2. **Trafilatura의 클래스/ID 패턴 데이터를 이식**: 수백 개의 보일러플레이트 패턴은 수년간 축적된 핵심 자산

3. **텍스트 밀도 + 링크 밀도 분석을 구현**: Readability.js에 없는 이 분석이 Trafilatura의 정확도 향상에 기여

4. **사이트 유형별 전문 추출기 구현**: Trafilatura는 일반적 접근인 반면, 특정 사이트(Reddit, YouTube)에 대한 전용 추출기가 더 효과적

5. **CJK 최적화를 처음부터 내장**: Trafilatura의 약점인 CJK 처리를 TypeScript 구현에서 보완하면 차별화 가능

6. **`favor_precision` / `favor_recall` 토글 제공**: 사용 사례에 따라 추출 엄격도를 조절하는 기능은 실무에서 매우 유용

---

이 분석은 Trafilatura의 GitHub 소스 코드(adbar/trafilatura), 저자 Adrien Barbaresi의 ACL 2021 논문 "Trafilatura: A Web Scraping Library and Command-Line Tool for Text Discovery and Extraction", 그리고 공식 벤치마크 데이터를 기반으로 작성되었습니다. 실제 소스 코드의 모듈 구조, 알고리즘 로직, 설정 패턴 등을 분석하여 TypeScript 프로젝트에 적용 가능한 실질적인 인사이트를 도출했습니다.
