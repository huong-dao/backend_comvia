import { normalizeVietnamesePhone } from '../common/utils/vn-phone';

const PHONE_COLUMN = 'Phone';
export const ROW_ID_COLUMN = 'row_id';
const MAX_IMPORT_ROWS = 10_000;

export type ParsedCampaignCsvRow = {
  /** Set only when the file is parsed for reconcile. */
  rowId?: string;
  phoneNumber: string;
  payloadData: Record<string, string>;
  rawImportRow: Record<string, string>;
};

export type ExistingCampaignRowForCsv = {
  id: string;
  phoneNumber: string;
  payloadData: unknown;
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
  const reserved = new Set([
    PHONE_COLUMN.toLowerCase(),
    ROW_ID_COLUMN.toLowerCase(),
  ]);
  const placeholderColumns = keys.map((key, index) => {
    const fallbackHeader = fallbackHeaders[index];
    const label = placeholderLabels?.[key];
    const labelHeader = typeof label === 'string' ? label.trim() : '';
    // A label that collides with Phone, row_id or another column would make the
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

/**
 * Template for upload. When the campaign already has rows, each row is written
 * with its `row_id` so a later reconcile upload can match it. Otherwise a single
 * demo line is written with `row_id` left empty and the template's sample
 * values in the placeholder cells.
 */
export function buildCsvTemplateContent(
  placeholdersJson: Record<string, unknown>,
  placeholderLabels?: Record<string, unknown> | null,
  existingRows: ExistingCampaignRowForCsv[] = [],
): string {
  const plan = buildCsvColumnPlan(placeholdersJson, placeholderLabels);
  const headers = [
    ROW_ID_COLUMN,
    plan.phoneColumn,
    ...plan.placeholderColumns.map((c) => c.header),
  ];

  const toLine = (cells: string[]) => cells.map(escapeCsvCell).join(',');

  const dataLines =
    existingRows.length > 0
      ? existingRows.map((row) => {
          const payload = (row.payloadData ?? {}) as Record<string, unknown>;
          return toLine([
            row.id,
            row.phoneNumber,
            ...plan.placeholderColumns.map((c) => String(payload[c.key] ?? '')),
          ]);
        })
      : [
          // The demo phone is written as an Excel text formula so the leading 0
          // survives opening the file in Excel. It is emitted unescaped on
          // purpose: quoting the cell would make Excel show the formula text.
          ['', excelTextCell(DEMO_PHONE)]
            .concat(
              plan.placeholderColumns.map((c) =>
                escapeCsvCell(sampleCellFor(placeholdersJson[c.key], c.key)),
              ),
            )
            .join(','),
        ];

  return [toLine(headers), ...dataLines].join('\n');
}

const DEMO_PHONE = '0901234567';

/** `="0901234567"`: Excel shows the value as text and keeps leading zeros. */
function excelTextCell(digits: string): string {
  return `="${digits}"`;
}

/**
 * Reverses {@link excelTextCell}. Excel saves the formula's value, but a file
 * opened in a tool that does not evaluate formulas keeps the wrapper, which
 * {@link parseCsvLine} reads as `=0901234567` (or `="0901234567"` when quoted).
 */
function unwrapExcelTextCell(value: string): string {
  const match = /^="?([^"]*)"?$/.exec(value);
  return match ? match[1] : value;
}

/**
 * Demo cell for a campaign with no rows yet. `placeholdersJson` holds the
 * sample value the owner typed when creating the template ("Giá trị mẫu"), so
 * that value is written as-is. `demo_<key>` stays as the fallback for
 * templates stored without a usable sample.
 */
function sampleCellFor(sample: unknown, key: string): string {
  if (typeof sample === 'string' && sample.trim().length > 0) return sample;
  if (typeof sample === 'number' || typeof sample === 'boolean') {
    return String(sample);
  }
  return `demo_${key}`;
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Import (first upload). A `row_id` column is accepted but ignored. */
export function parseCampaignCsv(
  csvText: string,
  placeholdersJson: Record<string, unknown>,
  placeholderLabels?: Record<string, unknown> | null,
): { rows: ParsedCampaignCsvRow[]; errors: string[] } {
  return parseCampaignCsvTable(csvText, placeholdersJson, placeholderLabels, {
    requireRowId: false,
  });
}

/** Reconcile (re-upload after execution). Every row must carry a `row_id`. */
export function parseReconcileCsv(
  csvText: string,
  placeholdersJson: Record<string, unknown>,
  placeholderLabels?: Record<string, unknown> | null,
): { rows: ParsedCampaignCsvRow[]; errors: string[] } {
  return parseCampaignCsvTable(csvText, placeholdersJson, placeholderLabels, {
    requireRowId: true,
  });
}

function parseCampaignCsvTable(
  csvText: string,
  placeholdersJson: Record<string, unknown>,
  placeholderLabels: Record<string, unknown> | null | undefined,
  options: { requireRowId: boolean },
): { rows: ParsedCampaignCsvRow[]; errors: string[] } {
  const plan = buildCsvColumnPlan(placeholdersJson, placeholderLabels);
  const lines = csvText
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      errors: ['CSV must include a header row and at least one data row'],
    };
  }

  const allHeaderCells = parseCsvLine(lines[0]);
  const rowIdIdx = allHeaderCells.findIndex(
    (h) => h.trim().toLowerCase() === ROW_ID_COLUMN,
  );
  if (options.requireRowId && rowIdIdx < 0) {
    return { rows: [], errors: [`Missing required column: ${ROW_ID_COLUMN}`] };
  }

  // Every column except row_id, in file order. Data cells are reduced the same way.
  const withoutRowId = (cells: string[]) =>
    cells.filter((_, index) => index !== rowIdIdx);
  const headerCells = withoutRowId(allHeaderCells);
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
  const seenRowIds = new Set<string>();

  for (let i = 0; i < dataLines.length; i++) {
    const lineNumber = i + 2;
    const allCells = parseCsvLine(dataLines[i]);
    const cells = withoutRowId(allCells);

    let rowId: string | undefined;
    if (options.requireRowId) {
      rowId = (allCells[rowIdIdx] ?? '').trim();
      if (!rowId) {
        errors.push(`Row ${lineNumber}: ${ROW_ID_COLUMN} is required`);
        continue;
      }
      if (seenRowIds.has(rowId)) {
        errors.push(`Row ${lineNumber}: duplicate ${ROW_ID_COLUMN}`);
        continue;
      }
      seenRowIds.add(rowId);
    }

    const rawPhone = unwrapExcelTextCell(
      (cells[headerIndex.phoneIdx] ?? '').trim(),
    ).trim();
    if (!rawPhone) {
      errors.push(`Row ${lineNumber}: Phone is required`);
      continue;
    }
    const phone = normalizeVietnamesePhone(rawPhone);
    if (!phone) {
      errors.push(
        `Row ${lineNumber}: Phone is not a valid Vietnamese mobile number`,
      );
      continue;
    }

    const payloadData: Record<string, string> = {};
    const rawImportRow: Record<string, string> = { [PHONE_COLUMN]: rawPhone };

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

    rows.push({ rowId, phoneNumber: phone, payloadData, rawImportRow });
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
