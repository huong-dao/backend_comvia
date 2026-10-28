const PHONE_COLUMN = 'Phone';
const MAX_IMPORT_ROWS = 10_000;

export type ParsedCampaignCsvRow = {
  phoneNumber: string;
  payloadData: Record<string, string>;
  rawImportRow: Record<string, string>;
};

export type CampaignCsvColumnPlan = {
  phoneColumn: string;
  placeholderColumns: {
    key: string;
    /** Header written to the CSV template. Uses the label when one is set. */
    header: string;
    /** Slug-based header, always accepted on import for backward compatibility. */
    fallbackHeader: string;
  }[];
};

export function placeholderKeysFromJson(
  placeholdersJson: Record<string, unknown>,
): string[] {
  return Object.keys(placeholdersJson);
}

export function buildCsvColumnPlan(
  placeholdersJson: Record<string, unknown>,
  placeholderLabels?: Record<string, unknown> | null,
): CampaignCsvColumnPlan {
  const keys = placeholderKeysFromJson(placeholdersJson);
  const fallbackHeaders = keys.map((key) => placeholderKeyToHeader(key));
  const reserved = new Set([PHONE_COLUMN.toLowerCase()]);
  const placeholderColumns = keys.map((key, index) => {
    const fallbackHeader = fallbackHeaders[index];
    const label = placeholderLabels?.[key];
    const labelHeader = typeof label === 'string' ? label.trim() : '';
    // A label that collides with Phone or another column would make the
    // import header ambiguous, so the slug header is used for that key.
    const useLabel =
      labelHeader.length > 0 && !reserved.has(labelHeader.toLowerCase());
    const header = useLabel ? labelHeader : fallbackHeader;
    reserved.add(header.toLowerCase());
    return { key, header, fallbackHeader };
  });
  return { phoneColumn: PHONE_COLUMN, placeholderColumns };
}

export function placeholderKeyToHeader(key: string): string {
  if (!key) return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function buildCsvTemplateContent(
  placeholdersJson: Record<string, unknown>,
  placeholderLabels?: Record<string, unknown> | null,
): string {
  const plan = buildCsvColumnPlan(placeholdersJson, placeholderLabels);
  const headers = [
    plan.phoneColumn,
    ...plan.placeholderColumns.map((c) => c.header),
  ];
  const demoValues = [
    '0901234567',
    ...plan.placeholderColumns.map((c) => `demo_${c.key}`),
  ];
  return [headers, demoValues]
    .map((cells) => cells.map(escapeCsvCell).join(','))
    .join('\n');
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function parseCampaignCsv(
  csvText: string,
  placeholdersJson: Record<string, unknown>,
  placeholderLabels?: Record<string, unknown> | null,
): { rows: ParsedCampaignCsvRow[]; errors: string[] } {
  const plan = buildCsvColumnPlan(placeholdersJson, placeholderLabels);
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['CSV must include a header row and at least one data row'],
    };
  }

  const headerCells = parseCsvLine(lines[0]);
  const headerIndex = buildHeaderIndex(headerCells, plan);
  if (headerIndex.errors.length > 0) {
    return { rows: [], errors: headerIndex.errors };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [`CSV exceeds maximum of ${MAX_IMPORT_ROWS} data rows`],
    };
  }

  const rows: ParsedCampaignCsvRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const lineNumber = i + 2;
    const cells = parseCsvLine(dataLines[i]);
    const phone = (cells[headerIndex.phoneIdx] ?? '').trim();
    if (!phone) {
      errors.push(`Row ${lineNumber}: Phone is required`);
      continue;
    }

    const payloadData: Record<string, string> = {};
    const rawImportRow: Record<string, string> = { [PHONE_COLUMN]: phone };

    for (const col of plan.placeholderColumns) {
      const value = (cells[headerIndex.placeholderIdx[col.key]] ?? '').trim();
      if (!value) {
        errors.push(`Row ${lineNumber}: ${col.header} is required`);
      }
      payloadData[col.key] = value;
      rawImportRow[col.header] = value;
    }

    if (errors.some((e) => e.startsWith(`Row ${lineNumber}:`))) {
      continue;
    }

    rows.push({ phoneNumber: phone, payloadData, rawImportRow });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No valid data rows found in CSV');
  }

  return { rows, errors };
}

function buildHeaderIndex(
  headerCells: string[],
  plan: CampaignCsvColumnPlan,
): {
  phoneIdx: number;
  placeholderIdx: Record<string, number>;
  errors: string[];
} {
  const normalized = headerCells.map((h) => h.trim().toLowerCase());
  const phoneIdx = normalized.indexOf(plan.phoneColumn.toLowerCase());
  const errors: string[] = [];

  if (phoneIdx < 0) {
    errors.push(`Missing required column: ${plan.phoneColumn}`);
  }

  const placeholderIdx: Record<string, number> = {};
  for (const col of plan.placeholderColumns) {
    let idx = normalized.indexOf(col.header.toLowerCase());
    if (idx < 0 && col.fallbackHeader !== col.header) {
      idx = normalized.indexOf(col.fallbackHeader.toLowerCase());
    }
    if (idx < 0) {
      errors.push(`Missing required column: ${col.header}`);
    } else {
      placeholderIdx[col.key] = idx;
    }
  }

  const expectedCount = 1 + plan.placeholderColumns.length;
  if (headerCells.length !== expectedCount) {
    errors.push(
      `CSV must have exactly ${expectedCount} columns: ${plan.phoneColumn}, ${plan.placeholderColumns.map((c) => c.header).join(', ')}`,
    );
  }

  return { phoneIdx, placeholderIdx, errors };
}

/** Minimal RFC4180-style CSV line parse (quoted fields supported). */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}
