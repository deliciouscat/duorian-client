/**
 * 테스트 스크립트: 모든 파서로 test-cases를 처리하고 결과 출력
 */

import fs from 'fs';
import path from 'path';
import { parseWithCheerio } from './parser-cheerio.js';
import { parseWithReadability } from './parser-readability.js';
import { parseWithLightweight } from './parser-lightweight.js';

const TEST_CASES_DIR = './test-cases';
const OUTPUT_DIR = './test-cases/outputs';

// 출력 디렉토리 생성
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 테스트 케이스 파일 목록
const testCases = [
  { file: 'case-1.html', name: 'case-1 (한국일보 뉴스 790KB)' },
  { file: 'case-2.html', name: 'case-2 (한국일보 뉴스 891KB)' },
  { file: 'case-3.html', name: 'case-3 (Reddit 5.2MB)' },
  { file: 'case-4.html', name: 'case-4 (ZDNet Korea 384KB)' },
  { file: 'case-5.html', name: 'case-5 (YouTube 3.1MB)' },
];

// 파서 목록
const parsers = [
  { fn: parseWithCheerio, name: 'cheerio-parse5' },
  { fn: parseWithReadability, name: 'readability' },
  { fn: parseWithLightweight, name: 'lightweight' },
];

console.log('🚀 Starting parsing tests...\n');

// 전체 결과 요약
const summary = [];

// 각 테스트 케이스 처리
for (const testCase of testCases) {
  const filePath = path.join(TEST_CASES_DIR, testCase.file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${testCase.name}: File not found`);
    continue;
  }

  console.log(`📄 Processing: ${testCase.name}`);

  const html = fs.readFileSync(filePath, 'utf-8');
  const caseResults = {
    testCase: testCase.name,
    fileSize: `${(html.length / 1024).toFixed(1)}KB`,
    results: [],
  };

  // 각 파서로 처리
  for (const parser of parsers) {
    console.log(`   ⚙️  ${parser.name}...`);

    try {
      const startMemory = process.memoryUsage().heapUsed;
      const result = parser.fn(html);
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = ((endMemory - startMemory) / 1024 / 1024).toFixed(1);

      // 결과 저장
      const outputFileName = `${testCase.file.replace('.html', '')}-${parser.name}.json`;
      const outputPath = path.join(OUTPUT_DIR, outputFileName);

      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

      console.log(`      ✅ ${result.stats.parseTime} | Memory: ~${memoryUsed}MB | Blocks: ${result.mainContent.length}`);

      caseResults.results.push({
        parser: parser.name,
        parseTime: result.stats.parseTime,
        memoryUsed: `~${memoryUsed}MB`,
        contentBlocks: result.mainContent.length,
        comments: result.comments.length,
        output: outputFileName,
      });
    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
      caseResults.results.push({
        parser: parser.name,
        error: error.message,
      });
    }
  }

  summary.push(caseResults);
  console.log('');
}

// 요약 보고서 생성
console.log('📊 Generating summary report...\n');

const summaryReport = {
  timestamp: new Date().toISOString(),
  testCases: testCases.length,
  parsers: parsers.map(p => p.name),
  results: summary,
};

const summaryPath = path.join(OUTPUT_DIR, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summaryReport, null, 2), 'utf-8');

// 콘솔 요약 출력
console.log('═══════════════════════════════════════════════════════');
console.log('                    SUMMARY REPORT                     ');
console.log('═══════════════════════════════════════════════════════\n');

for (const caseResult of summary) {
  console.log(`📄 ${caseResult.testCase} (${caseResult.fileSize})`);
  console.log('─────────────────────────────────────────────────────');

  for (const result of caseResult.results) {
    if (result.error) {
      console.log(`   ❌ ${result.parser}: ${result.error}`);
    } else {
      console.log(`   ✅ ${result.parser}:`);
      console.log(`      Parse Time: ${result.parseTime}`);
      console.log(`      Memory: ${result.memoryUsed}`);
      console.log(`      Content Blocks: ${result.contentBlocks}`);
      console.log(`      Comments: ${result.comments}`);
    }
  }
  console.log('');
}

console.log('═══════════════════════════════════════════════════════');
console.log(`✅ All results saved to: ${OUTPUT_DIR}`);
console.log(`📋 Summary report: ${summaryPath}`);
console.log('═══════════════════════════════════════════════════════\n');

// 성능 비교표 생성
console.log('⚡ Performance Comparison:\n');

const comparisonTable = [];
for (const caseResult of summary) {
  const row = { testCase: caseResult.testCase };
  for (const result of caseResult.results) {
    if (!result.error) {
      row[result.parser] = result.parseTime;
    }
  }
  comparisonTable.push(row);
}

console.table(comparisonTable);

console.log('\n🎉 Testing complete!');
