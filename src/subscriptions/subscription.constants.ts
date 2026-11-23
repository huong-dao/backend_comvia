/** Prefix mã đơn mua subscription: COMVIA_SUB_<8 hex>. */
export const SUBSCRIPTION_CODE_PREFIX = 'COMVIA_SUB';

/**
 * Nội dung chuyển khoản (orderInfo) = mã đơn bỏ ký tự đặc biệt: COMVIASUB<8 hex>.
 * Khác hẳn nội dung đơn nạp ví (COMVIA<8 hex>, hex không chứa chữ "S") nên
 * webhook phân biệt được hai loại đơn.
 */
export const SUBSCRIPTION_BANK_CONTENT_PREFIX = 'COMVIASUB';

export const SUBSCRIPTION_PROVIDER = 'PAY2S';

/** Lý do tạm dừng campaign khi workspace hết hạn subscription (resume được sau khi gia hạn). */
export const PAUSE_REASON_SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED';
