import { buildCsvTemplateContent, parseCampaignCsv } from './campaign-csv.util';

const placeholders = { name: 'string', orderId: 'string' };

describe('buildCsvTemplateContent', () => {
  it('uses slug-based headers when no labels are set', () => {
    const csv = buildCsvTemplateContent(placeholders, null);

    expect(csv.split('\n')[0]).toBe('Phone,Name,OrderId');
  });

  it('uses labels as headers and keeps slugs for keys without a label', () => {
    const csv = buildCsvTemplateContent(placeholders, {
      name: 'Tên khách hàng',
    });

    expect(csv.split('\n')[0]).toBe('Phone,Tên khách hàng,OrderId');
  });

  it('quotes labels that contain commas', () => {
    const csv = buildCsvTemplateContent(placeholders, {
      orderId: 'Mã đơn, VIP',
    });

    expect(csv.split('\n')[0]).toBe('Phone,Name,"Mã đơn, VIP"');
  });

  it('falls back to the slug header when a label collides with Phone', () => {
    const csv = buildCsvTemplateContent(placeholders, { name: 'phone' });

    expect(csv.split('\n')[0]).toBe('Phone,Name,OrderId');
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
