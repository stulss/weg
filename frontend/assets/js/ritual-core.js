(() => {
  'use strict';

  const MAX_CSV_CHARACTERS = 5_000_000;
  const MAX_CSV_ROWS = 10_000;
  const MAX_FIELD_CHARACTERS = 100_000;

  function detectDelimiter(text) {
    const candidates = [',', ';', '\t', '|'];
    const counts = new Map(candidates.map((delimiter) => [delimiter, 0]));
    let quoted = false;
    let fieldStarted = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          index += 1;
        } else if (quoted) {
          quoted = false;
        } else if (!fieldStarted) {
          quoted = true;
          fieldStarted = true;
        }
        continue;
      }
      if (!quoted && counts.has(character)) {
        counts.set(character, counts.get(character) + 1);
        fieldStarted = false;
        continue;
      }
      if (!quoted && (character === '\n' || character === '\r')) break;
      if (!/\s/.test(character)) fieldStarted = true;
    }

    return candidates.reduce((best, delimiter) => counts.get(delimiter) > counts.get(best) ? delimiter : best, ',');
  }

  function parseCsv(input) {
    if (typeof input !== 'string') throw new TypeError('CSV 내용을 문자열로 읽지 못했습니다.');
    if (input.length > MAX_CSV_CHARACTERS) throw new RangeError('CSV 파일은 5MB 이하만 읽을 수 있습니다.');

    const text = input.replace(/^\uFEFF/, '');
    const delimiter = detectDelimiter(text);
    const parsedRows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let fieldStarted = false;

    function finishField() {
      row.push(field.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim());
      field = '';
      fieldStarted = false;
    }

    function finishRow() {
      finishField();
      if (row.some((cell) => cell.trim() !== '')) parsedRows.push(row);
      row = [];
      if (parsedRows.length > MAX_CSV_ROWS + 1) {
        throw new RangeError(`CSV는 머리글을 포함해 최대 ${MAX_CSV_ROWS.toLocaleString('ko-KR')}행까지 처리할 수 있습니다.`);
      }
    }

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (quoted) {
          quoted = false;
        } else if (!fieldStarted) {
          quoted = true;
          fieldStarted = true;
        } else {
          field += character;
        }
        continue;
      }

      if (!quoted && character === delimiter) {
        finishField();
        continue;
      }
      if (!quoted && (character === '\n' || character === '\r')) {
        finishRow();
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        continue;
      }
      field += character;
      if (!/\s/.test(character)) fieldStarted = true;
    }

    if (quoted) throw new SyntaxError('CSV의 따옴표가 닫히지 않았습니다. 원본 파일 형식을 확인해 주세요.');
    if (field.length || row.length) finishRow();
    if (parsedRows.length < 2) throw new Error('머리글과 기록 행이 있는 CSV를 선택해 주세요.');

    const sourceHeaders = parsedRows[0];
    const columnCount = Math.max(sourceHeaders.length, ...parsedRows.slice(1).map((entry) => entry.length));
    const headers = Array.from({ length: columnCount }, (_entry, index) => {
      const label = typeof sourceHeaders[index] === 'string' ? sourceHeaders[index].trim() : '';
      return label || `열 ${index + 1}`;
    });
    const rows = parsedRows.slice(1).map((sourceRow) => Array.from(
      { length: columnCount },
      (_entry, index) => typeof sourceRow[index] === 'string' ? sourceRow[index].trim() : ''
    ));

    return { headers, rows, delimiter };
  }

  function validDateParts(yearValue, monthValue, dayValue) {
    let year = Number(yearValue);
    const month = Number(monthValue);
    const day = Number(dayValue);
    if (year >= 0 && year < 100) year += year < 70 ? 2000 : 1900;
    if (!Number.isInteger(year) || year < 1900 || year > 2100) return '';
    if (!Number.isInteger(month) || month < 1 || month > 12) return '';
    if (!Number.isInteger(day) || day < 1 || day > 31) return '';
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function normalizeDate(value, { slashOrder = 'MDY' } = {}) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const raw = String(value).trim().replace(/^\uFEFF/, '');
    if (!raw) return '';

    let match = raw.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s|$|T)/i);
    if (match) return validDateParts(match[1], match[2], match[3]);

    match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match) return validDateParts(match[1], match[2], match[3]);

    match = raw.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
    if (match) return validDateParts(match[1], match[2], match[3]);

    match = raw.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(\d{4})\s*년?/);
    if (match) return validDateParts(match[3], match[1], match[2]);

    match = raw.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})(?:\s|$)/);
    if (match) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      let order = String(slashOrder || 'MDY').toUpperCase();
      if (first > 12 && second <= 12) order = 'DMY';
      else if (second > 12 && first <= 12) order = 'MDY';
      if (order === 'DMY') return validDateParts(match[3], second, first);
      return validDateParts(match[3], first, second);
    }

    if (/^\d{4}$/.test(raw)) return '';
    if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
      const serial = Number(raw);
      if (serial >= 20_000 && serial <= 80_000) {
        const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
        return validDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      }
    }

    if (/^\d{10}$/.test(raw) || /^\d{13}$/.test(raw)) {
      const numeric = Number(raw);
      const date = new Date(raw.length === 10 ? numeric * 1000 : numeric);
      if (!Number.isNaN(date.getTime())) {
        return validDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      }
    }

    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      const date = new Date(parsed);
      return validDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    return '';
  }

  function normalizeType(value) {
    const raw = String(value || '').trim().replace(/\s+/g, ' ');
    const normalized = raw.toLocaleLowerCase('ko-KR');
    if (/아침|오전|morning|check[\s-]?in|start[\s-]?of[\s-]?day/.test(normalized)) return '아침';
    if (/마무리|저녁|오후|evening|closing|end[\s-]?of[\s-]?day|wrap[\s-]?up/.test(normalized)) return '마무리';
    return raw.slice(0, 40) || '기타';
  }

  function canonicalText(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ').trim();
  }

  function fingerprintRecord(record) {
    return [record && record.date, record && record.type, record && record.prompt, record && record.content]
      .map(canonicalText)
      .join('\u001f');
  }

  function normalizeHeader(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s_.:/\\()[\]{}-]+/g, '');
  }

  function findColumnIndex(headers, aliases) {
    const normalizedAliases = aliases.map(normalizeHeader);
    return headers.findIndex((header) => {
      const normalized = normalizeHeader(header);
      return normalizedAliases.some((alias) => normalized === alias || (alias.length >= 4 && normalized.includes(alias)));
    });
  }

  function mapCsvRows(parsed, { slashOrder = 'MDY' } = {}) {
    if (!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) {
      throw new TypeError('CSV 머리글과 행을 확인할 수 없습니다.');
    }

    const headers = parsed.headers.map((header) => String(header || ''));
    const indexes = {
      date: findColumnIndex(headers, ['date', '날짜', '일자', 'created at', '작성일', '기록일', 'timestamp', 'submitted at', '제출일', 'datetime', '날짜시간']),
      type: findColumnIndex(headers, ['ritual type', 'ritual', 'form name', 'type', '리추얼 유형', '리추얼', '유형', '종류', '카테고리', 'category']),
      prompt: findColumnIndex(headers, ['prompt', 'question', '질문', '문항', 'item', 'question text', '질문 내용']),
      content: findColumnIndex(headers, ['answer', 'response', 'content', '내용', '답변', '기록', '회고', '응답', 'value', 'reflection']),
      participant: findColumnIndex(headers, ['participant', 'user email', 'email', 'username', '작성자', '참여자', '이름', '사용자', '사용자 이름'])
    };
    const metadataIndexes = new Set(Object.values(indexes).filter((index) => index >= 0));
    const participantAliases = new Map();

    function aliasParticipant(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const key = canonicalText(raw);
      if (!participantAliases.has(key)) participantAliases.set(key, `참여자 ${participantAliases.size + 1}`);
      return participantAliases.get(key);
    }

    function inferredType(row, prompt) {
      const source = [prompt, ...row].filter(Boolean).join(' ');
      if (/아침|오전|morning|check[\s-]?in/i.test(source)) return '아침';
      if (/마무리|저녁|오후|closing|evening|wrap[\s-]?up/i.test(source)) return '마무리';
      return '기타';
    }

    return parsed.rows.map((row, index) => {
      const safeRow = Array.isArray(row) ? row : [];
      const valueAt = (columnIndex) => columnIndex >= 0 ? String(safeRow[columnIndex] || '').slice(0, MAX_FIELD_CHARACTERS) : '';
      const rawDate = valueAt(indexes.date);
      const date = normalizeDate(rawDate, { slashOrder });
      const prompt = valueAt(indexes.prompt).slice(0, 5_000);
      const directContent = valueAt(indexes.content);
      let content = directContent;

      if (!content.trim()) {
        const parts = [];
        headers.forEach((header, columnIndex) => {
          if (metadataIndexes.has(columnIndex)) return;
          const value = String(safeRow[columnIndex] || '').trim();
          if (!value) return;
          const safeHeader = header.slice(0, 120) || `열 ${columnIndex + 1}`;
          parts.push(`${safeHeader}: ${value}`);
        });
        content = parts.join('\n').slice(0, MAX_FIELD_CHARACTERS);
      }

      const rawType = valueAt(indexes.type);
      const type = rawType ? normalizeType(rawType) : inferredType(safeRow, prompt);
      const participant = aliasParticipant(valueAt(indexes.participant));
      const safeContent = content.slice(0, MAX_FIELD_CHARACTERS);
      return {
        id: `preview-${index + 1}`,
        date,
        type,
        prompt,
        content: safeContent,
        participant,
        sourceRow: index + 2,
        invalidDate: !date,
        selected: Boolean(safeContent.trim()),
        duplicateInFile: false,
        duplicateExisting: false,
        warning: !safeContent.trim() ? '응답 내용이 비어 있음' : (!date ? '날짜를 확인하거나 미리보기에서 입력해 주세요' : '')
      };
    });
  }

  function deduplicateRecords(candidates, existingRecords = []) {
    const existing = new Set((Array.isArray(existingRecords) ? existingRecords : [])
      .filter((record) => record && String(record.content || '').trim())
      .map(fingerprintRecord));
    const seenInFile = new Set();
    let duplicateInFileCount = 0;
    let duplicateExistingCount = 0;

    const normalized = (Array.isArray(candidates) ? candidates : []).map((candidate) => {
      const record = candidate && typeof candidate === 'object' ? candidate : {};
      const hasContent = Boolean(String(record.content || '').trim());
      const fingerprint = fingerprintRecord(record);
      const duplicateInFile = hasContent && seenInFile.has(fingerprint);
      if (hasContent && !duplicateInFile) seenInFile.add(fingerprint);
      const duplicateExisting = hasContent && existing.has(fingerprint);
      if (duplicateInFile) duplicateInFileCount += 1;
      if (duplicateExisting) duplicateExistingCount += 1;

      let warning = String(record.warning || '');
      if (duplicateInFile) warning = 'CSV 안에서 중복된 기록';
      else if (duplicateExisting) warning = '이미 보관된 기록과 동일한 내용';
      else if (!hasContent) warning = '응답 내용이 비어 있음';

      return {
        ...record,
        duplicateInFile,
        duplicateExisting,
        selected: (record.selected === undefined || Boolean(record.selected)) && !duplicateInFile && !duplicateExisting && hasContent,
        warning
      };
    });

    return { candidates: normalized, duplicateInFileCount, duplicateExistingCount };
  }

  function dayNumber(date) {
    const normalized = normalizeDate(date);
    if (!normalized) return NaN;
    const [year, month, day] = normalized.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  }

  function longestConsecutiveRun(dates) {
    const numbers = Array.from(new Set(dates.map(dayNumber).filter(Number.isFinite))).sort((a, b) => a - b);
    if (!numbers.length) return 0;
    let longest = 1;
    let current = 1;
    for (let index = 1; index < numbers.length; index += 1) {
      current = numbers[index] === numbers[index - 1] + 1 ? current + 1 : 1;
      if (current > longest) longest = current;
    }
    return longest;
  }

  function recentConsecutiveRun(dates) {
    const numbers = Array.from(new Set(dates.map(dayNumber).filter(Number.isFinite))).sort((a, b) => a - b);
    if (!numbers.length) return 0;
    let count = 1;
    for (let index = numbers.length - 1; index > 0; index -= 1) {
      if (numbers[index] - numbers[index - 1] !== 1) break;
      count += 1;
    }
    return count;
  }

  function calculateStats(records) {
    const entries = Array.isArray(records) ? records : [];
    const dated = entries.filter((record) => record && normalizeDate(record.date));
    const allDates = Array.from(new Set(dated.map((record) => normalizeDate(record.date))));
    const morningDates = Array.from(new Set(dated
      .filter((record) => normalizeType(record.type) === '아침')
      .map((record) => normalizeDate(record.date))));
    const closingDates = Array.from(new Set(dated
      .filter((record) => normalizeType(record.type) === '마무리')
      .map((record) => normalizeDate(record.date))));
    return {
      recordCount: entries.length,
      activeDays: allDates.length,
      morningDays: morningDates.length,
      closingDays: closingDates.length,
      longestStreak: longestConsecutiveRun(allDates),
      recentStreak: recentConsecutiveRun(allDates)
    };
  }

  const api = {
    MAX_CSV_CHARACTERS,
    MAX_CSV_ROWS,
    MAX_FIELD_CHARACTERS,
    parseCsv,
    normalizeDate,
    normalizeType,
    canonicalText,
    fingerprintRecord,
    mapCsvRows,
    deduplicateRecords,
    calculateStats
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.plenRitualCore = api;
})();
