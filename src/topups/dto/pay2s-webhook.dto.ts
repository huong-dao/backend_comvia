import { IsString } from 'class-validator';

export class Pay2SWebhookDto {
    @IsString()
    partnerCode: string;
    orderId: string;    // Đây chính là topupRequest.id mà bạn đã gửi sang Pay2S
    requestId: string;
    amount: string;     // Pay2S gửi dạng string
    orderInfo: string;
    orderType: string;
    transId: string;    // Mã giao dịch phía Pay2S
    resultCode: number; // 0 là thành công
    message: string;
    payType: string;
    responseTime: string;
    extraData: string;
    signature: string;
}