/**
 * 경량 파서 (Cheerio + htmlparser2)
 * - 최고 속도를 위한 htmlparser2 사용
 * - 간단한 휴리스틱으로 본문 추출
 */

import * as cheerio from 'cheerio';

export function parseWithLightweight(html) {
  const startTime = Date.now();

  // htmlparser2 모드 (가장 빠름)
  const $ = cheerio.load(html, {
    xml: false,
    decodeEntities: true,
    _useHtmlParser2: true, // htmlparser2 사용
  });

  // 메타데이터 추출
  const metadata = extractMetadata($);

  // 콘텐츠 점수 계산
  const scored = scoreElements($);

  // 본문 추출
  const mainContent = extractMainContent($, scored);

  // 댓글 추출
  const comments = extractComments($);

  // 경량화
  const lightweight = createLightweightOutput($, scored[0]);

  const parseTime = Date.now() - startTime;

  return {
    method: 'lightweight-htmlparser2',
    metadata,
    mainContent,
    comments,
    lightweight,
    stats: {
      parseTime: `${parseTime}ms`,
      originalSize: html.length,
      lightweightSize: JSON.stringify(lightweight).length,
      compressionRatio: `${((1 - JSON.stringify(lightweight).length / html.length) * 100).toFixed(1)}%`,
      contentBlocks: mainContent.length,
      commentsFound: comments.length,
    },
  };
}

function extractMetadata($) {
  return {
    title: $('title').text() || $('h1').first().text(),
    description: $('meta[name="description"]').attr('content') ||
                 $('meta[property="og:description"]').attr('content'),
    url: $('meta[property="og:url"]').attr('content') ||
         $('link[rel="canonical"]').attr('href'),
    image: $('meta[property="og:image"]').attr('content'),
    type: $('meta[property="og:type"]').attr('content'),
  };
}

function scoreElements($) {
  const candidates = [];

  // 본문 후보 요소들
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '[class*="content"]',
    '[class*="article"]',
    '[class*="post"]',
    '[id*="content"]',
    '[id*="article"]',
    'div',
  ];

  $(selectors.join(', ')).each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text();
    const textLength = text.trim().length;

    if (textLength < 100) return;

    let score = 0;

    // 1. 태그 점수
    const tag = elem.tagName.toLowerCase();
    if (tag === 'article') score += 10;
    else if (tag === 'main') score += 10;
    else if (tag === 'div') score += 2;

    // 2. 텍스트 길이 점수
    score += Math.min(textLength / 100, 20);

    // 3. 클래스/ID 점수
    const classId = `${$elem.attr('class') || ''} ${$elem.attr('id') || ''}`.toLowerCase();
    if (/article|content|post|entry|main|body|text/i.test(classId)) score += 15;
    if (/comment|sidebar|footer|header|nav|menu|ad|widget|related|promo/i.test(classId)) score -= 15;

    // 4. 링크 밀도 페널티
    const links = $elem.find('a');
    const linkText = links.toArray().reduce((sum, a) => sum + $(a).text().length, 0);
    const linkDensity = textLength > 0 ? linkText / textLength : 0;
    score -= linkDensity * 15;

    // 5. 단락 개수 보너스
    const paragraphs = $elem.find('p').length;
    score += Math.min(paragraphs * 2, 10);

    // 6. 쉼표 개수 (문장 복잡도)
    const commas = (text.match(/,|、/g) || []).length; // 한국어 쉼표 포함
    score += commas * 0.1;

    candidates.push({
      element: elem,
      score,
      textLength,
      linkDensity,
      paragraphs,
    });
  });

  return candidates.sort((a, b) => b.score - a.score);
}

function extractMainContent($, scored) {
  const content = [];

  if (scored.length === 0) return content;

  const best = scored[0];
  const $best = $(best.element);

  // 단락 및 제목 추출
  $best.find('h1, h2, h3, h4, h5, h6, p, blockquote, li').each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();

    if (text.length > 15) {
      content.push({
        type: elem.tagName.toLowerCase(),
        text: text,
        length: text.length,
      });
    }
  });

  return content;
}

function extractComments($) {
  const comments = [];

  // 댓글 패턴
  const commentSelectors = [
    '[class*="comment"]',
    '[id*="comment"]',
    '[data-testid*="comment"]',
    '[class*="reply"]',
    '.discussion',
  ];

  $(commentSelectors.join(', ')).each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();

    if (text.length > 20 && text.length < 3000) {
      const author = $elem.find('[class*="author"], [class*="username"]').first().text().trim();

      comments.push({
        author: author || 'Unknown',
        text: text.substring(0, 500),
        length: text.length,
      });
    }
  });

  return comments.slice(0, 15);
}

function createLightweightOutput($, bestCandidate) {
  if (!bestCandidate) return null;

  const $best = $(bestCandidate.element);

  // 불필요 요소 제거
  $best.find('script, style, noscript, svg, iframe, img, video').remove();

  // 속성 정리
  $best.find('*').each((i, elem) => {
    const $elem = $(elem);
    const attrs = Object.keys(elem.attribs || {});

    attrs.forEach(attr => {
      if (!['class', 'id'].includes(attr)) {
        $elem.removeAttr(attr);
      }
    });
  });

  return {
    html: $best.html(),
    text: $best.text().trim(),
    score: bestCandidate.score.toFixed(2),
  };
}
