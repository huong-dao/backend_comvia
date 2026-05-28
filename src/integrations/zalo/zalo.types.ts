export type ZaloTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: string | number;
  error?: number;
  error_name?: string;
  error_description?: string;
};

export type ZaloZnsSendResponse = {
  error: number;
  message: string;
  data?: {
    msg_id?: string;
    sent_time?: string;
    quota?: Record<string, unknown>;
  };
};

export type ZaloOaInfoResponse = {
  error: number;
  message: string;
  data?: {
    oa_id?: string;
    name?: string;
    avatar?: string;
  };
};
