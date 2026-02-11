/**
 * Cheerio + Readability.js 조합 파서
 * - Mozilla의 Readability 알고리즘 사용
 * - JSDOM 대신 linkedom 사용 (경량화)
 */

import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export function parseWithReadability(html) {
  const startTime = Date.now();

  // linkedom으로 DOM 생성 (jsdom보다 훨씬 가벼움)
  const { document } = parseHTML(html);

  // Readability로 본문 추출
  const reader = new Readability(document, {
    charThreshold: 500, // 최소 문자 수
    keepClasses: false, // 클래스 제거
  });

  let article = null;
  try {
    article = reader.parse();
  } catch (error) {
    console.error('Readability parsing failed:', error.message);
  }

  // Cheerio로 추가 정보 추출
  const $ = cheerio.load(html);

  // 메타데이터
  const metadata = {
    title: article?.title || $('title').text() || '',
    byline: article?.byline || $('meta[name="author"]').attr('content') || '',
    excerpt: article?.excerpt || '',
    siteName: article?.siteName || '',
    publishedTime: $('meta[property="article:published_time"]').attr('content') || '',
  };

  // Readability가 추출한 본문을 단락으로 분할
  const mainContent = [];
  if (article?.content) {
    const $content = cheerio.load(article.content);

    $content('p, h1, h2, h3, h4, h5, h6, li').each((i, elem) => {
      const $elem = $content(elem);
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

  // 댓글 별도 추출 (원본 HTML에서)
  const comments = [];
  $('[class*="comment"], [id*="comment"], [data-testid*="comment"]').each((i, elem) => {
    const $elem = $(elem);
    const text = $elem.text().trim();

    // 본문과 중복되지 않는 댓글만 추출
    if (text.length > 10 && text.length < 5000) {
      comments.push({
        text: text.substring(0, 500),
        index: i,
      });
    }
  });

  const parseTime = Date.now() - startTime;

  return {
    method: 'readability',
    metadata,
    mainContent,
    comments: comments.slice(0, 10),
    readabilityScore: article?.textContent?.length || 0,
    stats: {
      parseTime: `${parseTime}ms`,
      originalSize: html.length,
      extractedTextLength: article?.textContent?.length || 0,
      contentBlocks: mainContent.length,
      commentsFound: comments.length,
    },
  };
}
