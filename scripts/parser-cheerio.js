/**
 * Cheerio 기본 파서 (parse5 모드)
 * - jQuery-like API로 DOM 탐색
 * - parse5 파서 사용 (정확한 HTML 파싱)
 */

import * as cheerio from 'cheerio';

export function parseWithCheerio(html) {
  const startTime = Date.now();

  // parse5 모드로 파싱 (더 정확한 파싱)
  const $ = cheerio.load(html, {
    xml: false,
    decodeEntities: true,
    _useHtmlParser2: false, // parse5 사용
  });

  // 메타데이터 추출
  const metadata = {
    title: $('title').text() || $('h1').first().text() || '',
    description: $('meta[name="description"]').attr('content') ||
                 $('meta[property="og:description"]').attr('content') || '',
    author: $('meta[name="author"]').attr('content') ||
            $('meta[property="article:author"]').attr('content') || '',
    date: $('meta[property="article:published_time"]').attr('content') ||
          $('time').attr('datetime') || '',
  };

  // 본문 후보 찾기 (휴리스틱 기반)
  const contentCandidates = [];

  $('article, main, [class*="content"], [class*="article"], [id*="content"]').each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();
    const textLength = text.length;

    if (textLength < 100) return; // 너무 짧은 요소 제외

    // 링크 밀도 계산
    const linkText = $elem.find('a').toArray()
      .reduce((sum, a) => sum + ($(a).text()?.length || 0), 0);
    const linkDensity = textLength > 0 ? linkText / textLength : 1;

    // 점수 계산
    let score = textLength / 100;
    score -= linkDensity * 10; // 링크가 많으면 감점

    // 클래스/ID 분석
    const classId = `${$elem.attr('class') || ''} ${$elem.attr('id') || ''}`;
    if (/article|content|post|entry|main/i.test(classId)) score += 25;
    if (/comment|sidebar|footer|nav|ad/i.test(classId)) score -= 25;

    contentCandidates.push({
      element: elem,
      score,
      textLength,
      linkDensity,
    });
  });

  // 점수순 정렬
  contentCandidates.sort((a, b) => b.score - a.score);

  // 최고 점수 요소의 본문 추출
  const mainContent = [];
  if (contentCandidates.length > 0) {
    const best = contentCandidates[0];
    const $best = $(best.element);

    // 단락 추출
    $best.find('p, h1, h2, h3, h4, h5, h6').each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      if (text.length > 20) {
        mainContent.push({
          type: elem.tagName.toLowerCase(),
          text: text,
          index: i,
        });
      }
    });
  }

  // 댓글 추출
  const comments = [];
  $('[class*="comment"], [id*="comment"]').each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();
    if (text.length > 10 && text.length < 5000) {
      comments.push({
        text: text.substring(0, 500), // 최대 500자
        index: i,
      });
    }
  });

  // 스크립트/스타일 제거 후 경량화
  $('script, style, noscript, svg, iframe, img').remove();

  // 속성 최소화
  $('*').each((i, elem) => {
    const $elem = $(elem);
    const attrs = elem.attribs || {};

    Object.keys(attrs).forEach(attr => {
      if (!['class', 'id', 'href', 'src'].includes(attr)) {
        $elem.removeAttr(attr);
      }
    });
  });

  const cleanedHtml = $.html();
  const parseTime = Date.now() - startTime;

  return {
    method: 'cheerio-parse5',
    metadata,
    mainContent,
    comments: comments.slice(0, 10), // 최대 10개 댓글
    stats: {
      parseTime: `${parseTime}ms`,
      originalSize: html.length,
      cleanedSize: cleanedHtml.length,
      compressionRatio: `${((1 - cleanedHtml.length / html.length) * 100).toFixed(1)}%`,
      contentBlocks: mainContent.length,
      commentsFound: comments.length,
      topScore: contentCandidates[0]?.score.toFixed(2) || 0,
    },
  };
}
