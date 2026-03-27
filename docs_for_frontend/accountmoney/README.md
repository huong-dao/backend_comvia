# Money Account Management - Frontend Integration Guide

## 📋 Overview

Module quản lý tài khoản ngân hàng cho phép Admin tạo và quản lý các tài khoản ngân hàng của công ty. Khách hàng có thể chọn tài khoản ngân hàng khi thực hiện nạp tiền (TOPUP).

## 🎯 Use Cases

### For Admin
- **Tạo tài khoản ngân hàng mới**: Thêm các tài khoản ngân hàng của công ty
- **Quản lý danh sách tài khoản**: Xem, sửa, xóa tài khoản
- **Kích hoạt/Vô hiệu hóa**: Control hiển thị trong danh sách nạp tiền
- **Quản lý Pay2S Bank ID**: Cấu hình ID cho hệ thống Pay2S

### For Customers (Users)
- **Chọn tài khoản nạp tiền**: Chọn ngân hàng muốn chuyển tiền
- **Xem thông tin ngân hàng**: Hiển thị tên và mã ngân hàng
- **Lấy danh sách active**: Chỉ thấy các tài khoản đang hoạt động

## 📁 File Structure

```
docs_for_frontend/accountmoney/
├── README.md                              # Overview và hướng dẫn tổng quan
├── MONEY_ACCOUNT_API_GUIDE.md            # Admin API documentation chi tiết
├── MONEY_ACCOUNT_FRONTEND_COMPONENTS.md   # Admin components và code examples
└── PUBLIC_MONEY_ACCOUNT_API.md            # Public API cho frontend users
```

## 🚀 Quick Start

### 1. Backend Setup
✅ **Đã hoàn thành**
- Module `MoneyAccountsModule` đã được tạo
- **Admin API endpoints** sẵn sàng: `/money-accounts/*`
- **Public API endpoint** sẵn sàng: `/public/money-accounts/active-for-topup`
- Database model `MoneyAccount` có sẵn
- Authentication & Authorization implemented

### 2. Frontend Integration
📋 **Cần thực hiện**
- Copy components từ documentation
- Implement API service cho cả admin và public endpoints
- Add routing cho admin pages
- Integrate với topup flow

### 3. Testing
🔧 **Cần kiểm tra**
- Test admin API endpoints
- Test public API endpoint
- Test frontend components
- Test end-to-end flow

## 📚 Documentation Files

### 1. MONEY_ACCOUNT_API_GUIDE.md
**Nội dung:**
- Admin API endpoints đầy đủ (CRUD operations)
- Request/Response formats
- Authentication requirements (Admin only)
- Error handling
- Integration examples

**Dành cho:**
- Admin frontend developers
- API integration teams
- Testing teams

### 2. MONEY_ACCOUNT_FRONTEND_COMPONENTS.md
**Nội dung:**
- Admin React components sẵn sàng
- Custom hooks
- CSS styles
- Testing examples
- Best practices

**Dành cho:**
- Admin frontend developers
- UI/UX teams
- Testing teams

### 3. PUBLIC_MONEY_ACCOUNT_API.md 🆕
**Nội dung:**
- Public API endpoint cho user (không phải admin)
- Lấy danh sách tài khoản active cho topup
- Frontend components cho account selector
- Custom hooks
- Error handling
- Integration với topup flow

**Dành cho:**
- Frontend developers (topup flow)
- User experience teams
- Integration testing

## 🔗 API Endpoints Summary

### Admin Endpoints (Admin Role Required)
| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| POST | `/money-accounts` | Tạo tài khoản mới | ADMIN |
| GET | `/money-accounts` | Lấy danh sách active | ADMIN |
| GET | `/money-accounts/all` | Lấy tất cả tài khoản | ADMIN |
| GET | `/money-accounts/active-for-topup` | Lấy tài khoản cho topup | ADMIN |
| GET | `/money-accounts/:id` | Lấy chi tiết tài khoản | ADMIN |
| PATCH | `/money-accounts/:id` | Cập nhật tài khoản | ADMIN |
| DELETE | `/money-accounts/:id` | Xóa tài khoản (soft delete) | ADMIN |

### Public Endpoints (Any Authenticated User)
| Method | Endpoint | Description | Role Required |
|--------|----------|-------------|---------------|
| GET | `/public/money-accounts/active-for-topup` | Lấy tài khoản active cho topup | Any User |

## 🎨 Frontend Components Overview

### Admin Components
1. **MoneyAccountManagement** - Component chính cho admin dashboard
2. **MoneyAccountList** - Hiển thị danh sách tài khoản
3. **MoneyAccountForm** - Form tạo/cập nhật tài khoản
4. **useMoneyAccounts** - Custom hook cho admin

### User Components (Topup Flow)
1. **MoneyAccountSelector** - Dropdown chọn tài khoản cho topup 🆕
2. **useMoneyAccountsForTopup** - Custom hook cho user 🆕
3. **PublicMoneyAccountService** - API service cho public endpoints 🆕

## 🔧 Implementation Steps

### Step 1: Copy Files
```bash
# Copy documentation files to frontend project
cp -r docs_for_frontend/accountmoney /path/to/frontend/docs/
```

### Step 2: Setup API Services
```typescript
// Admin service
// services/moneyAccountService.ts
export class MoneyAccountService {
  static async getActiveAccounts(): Promise<MoneyAccount[]> { }
  static async createAccount(data: CreateMoneyAccountDto): Promise<MoneyAccount> { }
  // ... other admin methods
}

// Public service (NEW)
// services/publicMoneyAccountService.ts
export class PublicMoneyAccountService {
  static async getActiveAccountsForTopup(): Promise<PublicMoneyAccount[]> { }
}
```

### Step 3: Add Components
```typescript
// Admin components
// components/admin/MoneyAccountManagement.tsx
// components/admin/MoneyAccountList.tsx
// components/admin/MoneyAccountForm.tsx

// User components (NEW)
// components/topup/MoneyAccountSelector.tsx
```

### Step 4: Add Routing
```typescript
// Add admin route
{
  path: '/admin/money-accounts',
  component: MoneyAccountManagement,
  meta: { requiresAuth: true, roles: ['ADMIN'] }
}
```

### Step 5: Integrate with Topup (NEW)
```typescript
// Update topup form to include account selector
<MoneyAccountSelector
  value={selectedAccount}
  onChange={setSelectedAccount}
  error={!selectedAccount ? 'Vui lòng chọn tài khoản' : undefined}
/>
```

## 🧪 Testing Checklist

### Backend Testing
- [x] Test all admin API endpoints
- [x] Test public API endpoint
- [x] Test authentication/authorization
- [x] Test validation rules
- [x] Test error scenarios
- [x] Test database constraints

### Frontend Testing
- [ ] Test admin components
- [ ] Test user components (MoneyAccountSelector)
- [ ] Test API integration (both admin and public)
- [ ] Test error handling
- [ ] Test loading states
- [ ] Test accessibility

### Integration Testing
- [ ] Test admin to user flow (admin creates account → user sees it)
- [ ] Test end-to-end topup flow
- [ ] Test error scenarios
- [ ] Test authentication flows

## 🔐 Security Considerations

### Backend Security
- ✅ JWT Authentication required for all endpoints
- ✅ Admin role validation for admin endpoints
- ✅ Any authenticated user can access public endpoint
- ✅ Input validation
- ✅ SQL injection prevention (Prisma)
- ✅ Account number uniqueness

### Frontend Security
- 📋 Token storage (localStorage/sessionStorage)
- 📋 Input sanitization
- 📋 XSS prevention
- 📋 CSRF protection

## 📊 Data Model

### MoneyAccount Entity
```typescript
interface MoneyAccount {
  id: string;                    // Primary key
  accountNumber: string;         // Số tài khoản (unique)
  bankName?: string;             // Tên ngân hàng
  bankCode?: string;             // Mã ngân hàng
  pay2sBankId?: string;          // Pay2S Bank ID
  isActive: boolean;             // Trạng thái
  createdAt: string;             // Ngày tạo
  updatedAt: string;             // Ngày cập nhật
}
```

### Public Response (truncated for users)
```typescript
interface PublicMoneyAccount {
  id: string;                    // Primary key
  accountNumber: string;         // Số tài khoản
  bankName?: string;             // Tên ngân hàng
  bankCode?: string;             // Mã ngân hàng
  pay2sBankId?: string;          // Pay2S Bank ID
  // isActive, createdAt, updatedAt không trả về cho user
}
```

### Relationships
- `MoneyAccount` → `CollectionRequest` (1-n)
- `MoneyAccount` → `Payment` (1-n)

## 🎯 Business Rules

### Account Management (Admin)
- ✅ Account numbers must be unique
- ✅ Only ADMIN can manage accounts
- ✅ Soft delete for accounts with transactions
- ✅ Active accounts only available for topup

### Public Access (Users)
- ✅ Any authenticated user can view active accounts
- ✅ Only active accounts are returned
- ✅ Limited data exposure (no internal fields)
- ✅ Account selection required for topup

### Topup Integration
- 📋 Only active accounts shown to customers
- 📋 Account selection required for topup
- 📋 Pay2S Bank ID used for QR generation

## 🚀 Deployment Checklist

### Pre-deployment
- [x] All tests passing
- [x] API documentation updated
- [x] Frontend components documented
- [x] Security review completed
- [x] Performance testing done

### Post-deployment
- [ ] Monitor API logs (both admin and public)
- [ ] Check error rates
- [ ] Verify admin access
- [ ] Verify user access
- [ ] Test topup flow
- [ ] Monitor database performance

## 📞 Support

### Common Issues
1. **Account number already exists** → Choose different number
2. **Cannot delete account** → Check for pending transactions
3. **No accounts available for topup** → Admin needs to activate accounts
4. **Pay2S Bank ID missing** → Update account details
5. **401 Unauthorized on public endpoint** → Check JWT token

### Debug Tips
- Check browser console for API errors
- Verify JWT token validity
- Check user role permissions
- Monitor backend logs
- Test with different user roles

## 🔄 Future Enhancements

### Backend
- [ ] Account verification workflow
- [ ] Bank logo integration
- [ ] Account balance tracking
- [ ] Transaction history per account
- [ ] Bulk account operations
- [ ] Workspace-based account filtering

### Frontend
- [ ] Advanced filtering and search
- [ ] Export functionality
- [ ] Account statistics dashboard
- [ ] Mobile responsive design
- [ ] Real-time updates
- [ ] Account preferences per user

---

## 📝 Notes

- ✅ Module đã được implement hoàn chỉnh trên backend
- ✅ **Admin API endpoints** sẵn sàng
- ✅ **Public API endpoint** sẵn sàng cho user
- ✅ Frontend components sẵn sàng để copy-paste
- ✅ Documentation chi tiết cho cả backend và frontend
- ✅ Security và best practices đã được áp dụng
- ✅ Testing checklist đã được chuẩn bị
- ✅ **User flow (admin creates account → user selects for topup)** đã được thiết kế

**Ready for frontend integration!** 🚀

### 🆕 What's New
- **Public API endpoint**: `/public/money-accounts/active-for-topup`
- **User components**: `MoneyAccountSelector`, `useMoneyAccountsForTopup`
- **Public service**: `PublicMoneyAccountService`
- **Complete topup integration guide**
