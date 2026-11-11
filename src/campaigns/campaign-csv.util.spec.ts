import {
  buildCsvTemplateContent,
  parseCampaignCsv,
  parseReconcileCsv,
} from './campaign-csv.util';

const placeholders = { name: 'string', orderId: 'string' };

describe('buildCsvTemplateContent', () => {
  it('uses slug-based headers when no labels are set', () => {
    const csv = buildCsvTemplateContent(placeholders, null);

    expect(csv.split('\n')[0]).toBe('row_id,Phone,Name,OrderId');
  });

  it('uses labels as headers and keeps slugs for keys without a label', () => {
    const csv = buildCsvTemplateContent(placeholders, {
      name: 'Tên khách hàng',
    });

    expect(csv.split('\n')[0]).toBe('row_id,Phone,Tên khách hàng,OrderId');
  });

  it('quotes labels that contain commas', () => {
    const csv = buildCsvTemplateContent(placeholders, {
      orderId: 'Mã đơn, VIP',
    });

    expect(csv.split('\n')[0]).toBe('row_id,Phone,Name,"Mã đơn, VIP"');
  });

  it('falls back to the slug header when a label collides with Phone', () => {
    const csv = buildCsvTemplateContent(placeholders, { name: 'phone' });

    expect(csv.split('\n')[0]).toBe('row_id,Phone,Name,OrderId');
  });

  it('writes the sample value stored in placeholdersJson as the demo row', () => {
    const csv = buildCsvTemplateContent(
      { date: '12/12/2024', service_name: 'Dịch vụ khám tổng quát' },
      null,
    );

    expect(csv.split('\n')[1]).toBe(
      ',="0901234567",12/12/2024,Dịch vụ khám tổng quát',
    );
  });

  it('quotes a sample value that contains a comma', () => {
    const csv = buildCsvTemplateContent({ addr: 'Số 1, Hà Nội' }, null);

    expect(csv.split('\n')[1]).toBe(',="0901234567","Số 1, Hà Nội"');
  });

  it('falls back to demo_<key> when the template stores no usable sample', () => {
    const csv = buildCsvTemplateContent({ name: '', orderId: null }, null);

    expect(csv.split('\n')[1]).toBe(',="0901234567",demo_name,demo_orderId');
  });

  it('writes existing rows with their row_id', () => {
    const csv = buildCsvTemplateContent(placeholders, null, [
      {
        id: 'cuid-a',
        phoneNumber: '84901234567',
        payloadData: { name: 'Minh', orderId: 'A1' },
      },
    ]);

    expect(csv.split('\n')).toEqual([
      'row_id,Phone,Name,OrderId',
      'cuid-a,84901234567,Minh,A1',
    ]);
  });

  it('round-trips the unedited demo template through import', () => {
    const csv = '﻿' + buildCsvTemplateContent(placeholders, null);

    const result = parseCampaignCsv(csv, placeholders, null);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].phoneNumber).toBe('84901234567');
  });

  it('round-trips an existing-rows template through reconcile', () => {
    const csv =
      '﻿' +
      buildCsvTemplateContent(placeholders, null, [
        {
          id: 'cuid-a',
          phoneNumber: '84901234567',
          payloadData: { name: 'Minh', orderId: 'A1' },
        },
      ]);

    const result = parseReconcileCsv(csv, placeholders, null);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      rowId: 'cuid-a',
      phoneNumber: '84901234567',
    });
  });
});

describe('parseCampaignCsv', () => {
  it('accepts the label header written in the template', () => {
    const labels = { name: 'Tên khách hàng' };
    const result = parseCampaignCsv(
      'Phone,Tên khách hàng,OrderId\n0901234567,Minh,A1',
      placeholders,
      labels,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0].payloadData).toEqual({ name: 'Minh', orderId: 'A1' });
  });

  it('still accepts the slug header for files downloaded before labels were set', () => {
    const labels = { name: 'Tên khách hàng' };
    const result = parseCampaignCsv(
      'Phone,Name,OrderId\n0901234567,Minh,A1',
      placeholders,
      labels,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0].payloadData).toEqual({ name: 'Minh', orderId: 'A1' });
  });

  it('reports a missing column using the label', () => {
    const result = parseCampaignCsv(
      'Phone,OrderId\n0901234567,A1',
      placeholders,
      { name: 'Tên khách hàng' },
    );

    expect(result.errors).toContain('Missing required column: Tên khách hàng');
  });
});

describe('parseCampaignCsv phone normalization', () => {
  it('converts a 0-prefixed number to the 84 form', () => {
    const result = parseCampaignCsv(
      'Phone,Name,OrderId\n0707210690,Minh,A1',
      placeholders,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0].phoneNumber).toBe('84707210690');
    expect(result.rows[0].rawImportRow.Phone).toBe('0707210690');
  });

  it('normalizes separators and a leading plus sign', () => {
    const result = parseCampaignCsv(
      'Phone,Name,OrderId\n+84 707-210-690,Minh,A1\n0707.210.690,An,A2',
      placeholders,
    );

    expect(result.errors).toEqual([]);
    expect(result.rows.map((row) => row.phoneNumber)).toEqual([
      '84707210690',
      '84707210690',
    ]);
  });

  it('accepts 9 digits without the leading 0', () => {
    const result = parseCampaignCsv(
      'Phone,Name,OrderId\n707210690,Minh,A1',
      placeholders,
    );

    expect(result.rows[0].phoneNumber).toBe('84707210690');
  });

  it('reports an invalid number on its row and skips it', () => {
    const result = parseCampaignCsv(
      'Phone,Name,OrderId\n12345,Minh,A1\n0707210690,An,A2',
      placeholders,
    );

    expect(result.errors).toEqual([
      'Row 2: Phone is not a valid Vietnamese mobile number',
    ]);
    expect(result.rows).toHaveLength(1);
  });
});
