# Pay2S API Integration - Fix Complete

## Root Cause Identified

The Internal Server Error (500) when calling `/api/v1/topups/create-with-pay2s` was caused by:

1. A **mismatch between the API response and the code expectations** in [`topups.service.ts`](src/topups/topups.service.ts) - the code expected `pay2sResponse.requestId` but the Pay2S API returns `orderId`
2. **Missing `createTopupQr` method** in `TopupsService` that was called by the Quick Chat tool executor

## Fixes Applied

### Fix 1: Response Field Mapping ([`topups.service.ts`](src/topups/topups.service.ts))

Changed from:
```typescript
collectionRequestCode: pay2sResponse.requestId,
```

To:
```typescript
collectionRequestCode: pay2sResponse.orderId,
```

### Fix 2: Add Missing Method ([`topups.service.ts`](src/topups/topups.service.ts))

Added the `createTopupQr` method that was being called by the Quick Chat system but was missing from the service:

```typescript
async createTopupQr(
  workspaceId: string,
  userId: string,
  dto: { amountExclVat: number },
) {
  // Get the owner user for this workspace
  const workspace = await this.prismaService.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerUserId: true },
  });

  if (!workspace) {
    throw new NotFoundException('Workspace not found');
  }

  // Get any active money account with Pay2S configured
  const moneyAccount = await this.prismaService.moneyAccount.findFirst({
    where: {
      isActive: true,
      pay2sBankId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!moneyAccount) {
    throw new BadRequestException('No active money account with Pay2S configured');
  }

  const createDto: CreateTopupPay2sDto = {
    amountExclVat: dto.amountExclVat,
    moneyAccountId: moneyAccount.id,
    vatRate: 10,
  };

  return this.createTopupWithPay2S(
    workspaceId,
    userId,
    createDto,
    moneyAccount.id,
  );
}
```

## Verification

Build succeeded with no errors.

## Action Plan

- [x] Fix the response field mapping - Changed `pay2sResponse.requestId` to `pay2sResponse.orderId`
- [x] Add missing `createTopupQr` method
- [x] Verify build passes
