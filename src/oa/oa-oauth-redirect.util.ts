export type OaOAuthRedirectStatus = 'success' | 'error';

export function normalizeAppBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/** Primary redirect: workspace OA page (§6.2.2). */
export function buildWorkspaceOaRedirectUrl(
  appBaseUrl: string,
  workspaceId: string,
  status: OaOAuthRedirectStatus,
  message?: string,
): string {
  const url = new URL(
    `${normalizeAppBaseUrl(appBaseUrl)}/app/w/${workspaceId}/oa`,
  );
  url.searchParams.set('status', status);
  if (message) {
    url.searchParams.set('message', message);
  }
  return url.toString();
}

/** Fallback when workspaceId cannot be resolved (§6.2.4). */
export function buildFallbackOaRedirectUrl(
  fallbackBaseUrl: string,
  status: OaOAuthRedirectStatus,
  options?: { workspaceId?: string | null; message?: string },
): string {
  const url = new URL(fallbackBaseUrl);
  url.searchParams.delete('connected');
  url.searchParams.set('status', status);
  if (options?.workspaceId) {
    url.searchParams.set('workspaceId', options.workspaceId);
  }
  if (options?.message) {
    url.searchParams.set('message', options.message);
  }
  return url.toString();
}

export function resolveOaOAuthRedirectUrl(params: {
  appBaseUrl: string;
  fallbackRedirectUrl: string;
  workspaceId: string | null;
  status: OaOAuthRedirectStatus;
  message?: string;
}): string {
  if (params.workspaceId) {
    return buildWorkspaceOaRedirectUrl(
      params.appBaseUrl,
      params.workspaceId,
      params.status,
      params.message,
    );
  }

  return buildFallbackOaRedirectUrl(params.fallbackRedirectUrl, params.status, {
    message: params.message,
  });
}

export function extractHttpExceptionMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'getResponse' in error &&
    typeof (error as { getResponse: () => unknown }).getResponse === 'function'
  ) {
    const response = (error as { getResponse: () => unknown }).getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.join(', ');
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'OAuth connection failed';
}
