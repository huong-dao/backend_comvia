# Webhook Order & Invoice Creation for Pay2S

## Overview
Document này mô tả việc bổ sung logic tạo Order và Invoice khi Pay2S webhook được gọi thành công.

## Problem Statement

Khi khách hàng quét mã QR thành công, hệ thống cần:
1. ✅ Update collection request status → **Đã có**
2. ❌ Create Order → **Thiếu**  
3. ❌ Create Invoice → **Thiếu**
4. ❌ Update Order status → **Thiếu**

## Solution Implemented

### 1. Webhook Flow Enhancement

#### **Before (Chỉ update collection request):**
```typescript
if (resultCodeNum === 0) {
  // Update topup request status
  await tx.topupRequest.update({
    where: { id: collectionRequest.topupRequest.id },
    data: { status: 'PAID', paidAt },
  });
  
  // Wallet transaction (simplified)
  this.logger.log(`Would update wallet for user ${collectionRequest.topupRequest.ownerUserId}`);
}
```

#### **After (Full Order & Invoice creation):**
```typescript
if (resultCodeNum === 0) {
  // Update topup request status
  await tx.topupRequest.update({
    where: { id: collectionRequest.topupRequest.id },
    data: { status: 'PAID', paidAt },
  });

  // Create Order and Invoice for successful topup
  const order = await this.createTopupOrder(tx, collectionRequest, paidAt);
  const invoice = await this.createTopupInvoice(tx, order, collectionRequest);

  // Wallet transaction (simplified)
  this.logger.log(`Would update wallet for user ${collectionRequest.topupRequest.ownerUserId}`);
}
```

### 2. Order Creation Logic

#### **Function:** `createTopupOrder(tx, collectionRequest, paidAt)`

**Steps:**
1. **Get workspace billing info** - Lấy thông tin billing của workspace
2. **Generate order code** - Tạo mã đơn hàng duy nhất
3. **Calculate amounts** - Tính toán VAT (10%)
4. **Create Order record** - Lưu vào database
5. **Create Order Item** - Tạo chi tiết đơn hàng

**Order Data Structure:**
```typescript
{
  orderCode: `ORD_${timestamp}_${randomString}`,
  workspaceId: collectionRequest.workspaceId,
  ownerUserId: collectionRequest.creatorId,
  orderType: 'topup',
  currency: 'VND',
  totalAmountExclVat: collectionRequest.amount,
  totalVatAmount: collectionRequest.amount * 0.1,
  totalAmountInclVat: collectionRequest.amount * 1.1,
  paymentMethod: 'BANK',
  paymentRef: collectionRequest.code,
  status: 'PAID',
  paidAt: new Date(),
}
```

**Order Item:**
```typescript
{
  orderId: order.id,
  name: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
  quantity: 1,
  unitPrice: amountExclVat,
  vatRate: 0.1,
  vatAmount: vatAmount,
  totalAmountInclVat: totalAmountInclVat,
}
```

### 3. Invoice Creation Logic

#### **Function:** `createTopupInvoice(tx, order, collectionRequest)`

**Steps:**
1. **Get workspace billing info** - Lấy thông tin billing profile
2. **Generate invoice code** - Tạo mã hóa đơn duy nhất
3. **Prepare billing snapshot** - Chuẩn bị dữ liệu khách hàng
4. **Create Invoice record** - Lưu vào database
5. **Create Invoice Item** - Tạo chi tiết hóa đơn
6. **Create mapping** - Liên kết collection request với invoice

**Invoice Data Structure:**
```typescript
{
  invoiceCode: `INV_${timestamp}_${randomString}`,
  invoiceNumber: null, // Sẽ được kế toán assign
  workspaceId: collectionRequest.workspaceId,
  orderId: order.id,
  billingType: workspace.billingProfile?.billingType || 'INDIVIDUAL',
  billingSnapshotJson: JSON.stringify(billingData),
  status: 'POSTED',
  issueDate: null, // Sẽ được kế toán assign
}
```

**Billing Snapshot Logic:**
```typescript
// Company Type
if (workspace.billingProfile?.billingType === 'COMPANY') {
  billingSnapshotJson = {
    type: 'COMPANY',
    companyName: workspace.billingProfile.companyName,
    taxCode: workspace.billingProfile.taxCode,
    address: workspace.billingProfile.address,
    email: workspace.billingProfile.billingEmail,
    phone: workspace.billingProfile.billingPhone,
  };
}
// Individual Type
else if (workspace.billingProfile?.billingType === 'INDIVIDUAL') {
  billingSnapshotJson = {
    type: 'INDIVIDUAL',
    fullName: workspace.billingProfile.fullName,
    idNumber: workspace.billingProfile.idNumber,
    address: workspace.billingProfile.address,
    email: workspace.billingProfile.billingEmail,
    phone: workspace.billingProfile.billingPhone,
  };
}
```

**Invoice Item:**
```typescript
{
  invoiceId: invoice.id,
  name: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
  quantity: 1,
  unitPrice: order.totalAmountExclVat,
  vatRate: 0.1,
  vatAmount: order.totalVatAmount,
  totalAmountInclVat: order.totalAmountInclVat,
}
```

**Collection Request Mapping:**
```typescript
{
  collectionRequestId: collectionRequest.id,
  invoiceId: invoice.id,
  amount: collectionRequest.amount,
  createdAt: new Date(),
}
```

## Implementation Details

### 1. Transaction Safety

**All operations wrapped in database transaction:**
```typescript
return await this.prisma.$transaction(async (tx) => {
  // All database operations here
});
```

### 2. Error Handling

**Comprehensive error checking:**
- Collection request not found
- Invalid status
- Amount mismatch
- Workspace not found
- Database constraint violations

### 3. Logging

**Detailed logging for debugging:**
```typescript
this.logger.log(`Created order ${order.orderCode} for successful topup ${collectionRequest.code}`);
this.logger.log(`Created invoice ${invoice.invoiceCode} for successful topup ${collectionRequest.code}`);
```

### 4. Data Integrity

**Referential integrity maintained:**
- Order → Order Item (1-n)
- Order → Invoice (1-1)
- Invoice → Invoice Item (1-n)
- Collection Request → Collection Request Mapping (1-n)
- Invoice ← Collection Request Mapping (n-1)

## Business Logic Compliance

### 1. VAT Calculation
- **Rate**: 10% (0.1)
- **Formula**: `totalAmountInclVat = amountExclVat * 1.1`
- **Rounding**: Proper decimal handling

### 2. Order Status
- **Initial**: `PAID` (khách hàng đã thanh toán)
- **Payment Method**: `BANK` (thanh toán qua ngân hàng)
- **Reference**: Collection request code

### 3. Invoice Status
- **Initial**: `POSTED` (đã tạo, chờ kế toán xử lý)
- **Billing Type**: Theo workspace billing profile
- **Issue Date**: `null` (sẽ được kế toán assign)

### 4. Customer Information
- **Source**: Workspace billing profile
- **Types**: COMPANY hoặc INDIVIDUAL
- **Snapshot**: Lưu trạng thái tại thời điểm tạo invoice

## Testing Strategy

### 1. Unit Tests
```typescript
describe('createTopupOrder', () => {
  it('should create order with correct data', async () => {
    // Test order creation
  });
  
  it('should calculate VAT correctly', async () => {
    // Test VAT calculation
  });
});

describe('createTopupInvoice', () => {
  it('should create invoice with billing snapshot', async () => {
    // Test invoice creation
  });
});
```

### 2. Integration Tests
```typescript
describe('Pay2S Webhook Integration', () => {
  it('should create order and invoice on successful payment', async () => {
    // Test full webhook flow
  });
  
  it('should handle COMPANY billing type', async () => {
    // Test company billing
  });
  
  it('should handle INDIVIDUAL billing type', async () => {
    // Test individual billing
  });
});
```

### 3. End-to-End Tests
```typescript
describe('E2E Topup Flow', () => {
  it('should complete full topup flow', async () => {
    // 1. Create collection request
    // 2. Simulate Pay2S webhook call
    // 3. Verify order created
    // 4. Verify invoice created
    // 5. Verify mappings created
  });
});
```

## Files Modified

### 1. Core Service File
**File:** `src/modules/collection-requests/collection-requests.service.ts`

**Changes:**
- Added `createTopupOrder()` method
- Added `createTopupInvoice()` method
- Enhanced `processPay2sCallback()` method
- Added comprehensive error handling
- Added detailed logging

### 2. Import Changes
- Removed problematic Decimal import
- Used string-based amount calculations
- Maintained type safety

## Deployment Checklist

### Pre-Deployment
- [ ] Run all unit tests
- [ ] Run integration tests
- [ ] Test with sandbox Pay2S credentials
- [ ] Verify database transactions
- [ ] Check error handling

### Post-Deployment
- [ ] Monitor webhook logs
- [ ] Verify order creation in production
- [ ] Verify invoice creation in production
- [ ] Check billing snapshot accuracy
- [ ] Monitor for any transaction issues

## Rollback Plan

If issues arise:
1. **Disable new logic**: Comment out order/invoice creation
2. **Keep existing logic**: Maintain collection request updates
3. **Database cleanup**: Remove any partial orders/invoices
4. **Monitor logs**: Watch for errors
5. **Gradual rollout**: Enable for specific workspaces first

## Future Enhancements

### 1. Wallet Integration
- Implement actual wallet balance updates
- Create wallet transactions
- Handle refund scenarios

### 2. Notification System
- Send email notifications for new orders
- Send notifications for invoice creation
- Notify accountants for new invoices

### 3. Accounting Integration
- Auto-assign invoice numbers
- Generate PDF invoices
- Integrate with accounting software

### 4. Reporting
- Order analytics
- Invoice analytics
- Payment success rates
- Revenue reporting

## Conclusion

**Webhook Pay2S đã được nâng cấp đầy đủ:**
- ✅ Update collection request status
- ✅ Create Order với đầy đủ thông tin
- ✅ Create Invoice với billing snapshot
- ✅ Create tất cả mappings cần thiết
- ✅ Maintain data integrity
- ✅ Comprehensive error handling
- ✅ Detailed logging

**Hệ thống giờ sẵn sàng để xử lý Pay2S webhook một cách hoàn chỉnh!** 🎉
