import { Logger } from '@nestjs/common';
import { Pay2sRequestError } from './pay2s.errors';
import {
  createPay2sCollectionLink,
  PAY2S_REQUEST_TIMEOUT_MS,
} from './pay2s.util';

jest.mock('uuid', () => ({ v4: () => 'req-1' }));

const ACCESS_KEY = 'ACCESS-KEY-VALUE';
const SECRET_KEY = 'SECRET-KEY-VALUE';

const baseInput = {
  amount: 100000,
  orderId: 'COMVIA_SUB_AB12CD34',
  orderInfo: 'COMVIASUBAB12CD34',
  bankAccounts: [{ account_number: '123', bank_id: 'ACB' }],
  redirectUrl: 'https://fe.example/subscription/success',
  ipnUrl: 'https://be.example/api/v1/webhooks/pay2s',
  pay2sConfigData: {
    partner_code: 'PARTNER',
    api_key: ACCESS_KEY,
    api_secret: SECRET_KEY,
    api_url: 'https://pay2s.example/create',
  },
};

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPay2sCollectionLink', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function catchError(): Promise<Pay2sRequestError> {
    try {
      await createPay2sCollectionLink(baseInput);
    } catch (error) {
      return error as Pay2sRequestError;
    }
    throw new Error('expected createPay2sCollectionLink to throw');
  }

  it('trả body JSON của Pay2S khi thành công', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ resultCode: 0, qrList: [{ qrCode: 'x' }] }),
    );

    await expect(createPay2sCollectionLink(baseInput)).resolves.toEqual({
      resultCode: 0,
      qrList: [{ qrCode: 'x' }],
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('http: ném lỗi kind=http, che accessKey/secret/signature và log kèm orderId + requestId', async () => {
    fetchSpy.mockResolvedValue(
      new Response(`bad request echo ${ACCESS_KEY} and ${SECRET_KEY}`, {
        status: 502,
        statusText: 'Bad Gateway',
      }),
    );

    const error = await catchError();

    expect(error).toBeInstanceOf(Pay2sRequestError);
    expect(error.kind).toBe('http');
    expect(error.httpStatus).toBe(502);
    expect(error.detail).toContain('[redacted]');
    expect(error.detail).not.toContain(ACCESS_KEY);
    expect(error.detail).not.toContain(SECRET_KEY);

    expect(errorLog).toHaveBeenCalledTimes(1);
    const logged = String((errorLog.mock.calls as unknown[][])[0][0]);
    expect(logged).toContain('kind=http');
    expect(logged).toContain('orderId=COMVIA_SUB_AB12CD34');
    expect(logged).toContain('requestId=req-1');
    expect(logged).toContain('httpStatus=502');
    expect(logged).not.toContain(ACCESS_KEY);
    expect(logged).not.toContain(SECRET_KEY);
  });

  it('http: cắt body dài tới 500 ký tự', async () => {
    fetchSpy.mockResolvedValue(new Response('x'.repeat(5000), { status: 500 }));

    const error = await catchError();

    expect(error.kind).toBe('http');
    expect(error.detail!.length).toBeLessThanOrEqual(501);
  });

  it('network: lỗi kết nối → kind=network', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const error = await catchError();

    expect(error.kind).toBe('network');
    expect(error.message).toBe('fetch failed');
  });

  it('timeout: không phản hồi sau 15s → kind=timeout', async () => {
    jest.useFakeTimers();
    fetchSpy.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    expect(PAY2S_REQUEST_TIMEOUT_MS).toBe(15_000);
    const pending = catchError();
    await jest.advanceTimersByTimeAsync(PAY2S_REQUEST_TIMEOUT_MS);
    const error = await pending;

    expect(error.kind).toBe('timeout');
  });

  it('invalid_response: 200 nhưng body không phải JSON', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>oops</html>'));

    const error = await catchError();

    expect(error.kind).toBe('invalid_response');
    expect(error.httpStatus).toBe(200);
  });

  it.each([
    ['quá ngắn', 'SHORT'],
    ['có ký tự đặc biệt', 'COMVIA-SUB-AB12CD34'],
  ])(
    'validation: orderInfo %s → kind=validation, không gọi Pay2S',
    async (_label, orderInfo) => {
      let error: Pay2sRequestError | undefined;
      try {
        await createPay2sCollectionLink({ ...baseInput, orderInfo });
      } catch (e) {
        error = e as Pay2sRequestError;
      }

      expect(error).toBeInstanceOf(Pay2sRequestError);
      expect(error!.kind).toBe('validation');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledTimes(1);
    },
  );
});
