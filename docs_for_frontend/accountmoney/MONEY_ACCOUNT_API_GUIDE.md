# Money Account API Guide for Frontend

## Overview
API quản lý tài khoản ngân hàng dành cho Admin để tạo và quản lý các tài khoản ngân hàng của công ty. Khách hàng có thể chọn tài khoản ngân hàng khi thực hiện nạp tiền (TOPUP).

## Authentication
Tất cả API requests cần JWT token và role ADMIN:
```typescript
headers: {
  'Authorization': `Bearer ${jwt_token}`,
  'Content-Type': 'application/json'
}
```

## API Endpoints

### 1. Tạo tài khoản ngân hàng
**Endpoint:** `POST /money-accounts`

**Request Body:**
```typescript
{
  "accountNumber": string,      // Số tài khoản (bắt buộc, unique)
  "bankName": string,          // Tên ngân hàng (tùy chọn)
  "bankCode": string,          // Mã ngân hàng (tùy chọn)
  "pay2sBankId": string,       // Bank ID của Pay2S (tùy chọn)
  "isActive": boolean          // Trạng thái active (mặc định: true)
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "id": string,
    "accountNumber": string,
    "bankName": string | null,
    "bankCode": string | null,
    "pay2sBankId": string | null,
    "isActive": boolean,
    "createdAt": string,
    "updatedAt": string
  },
  "message": "Money account created successfully"
}
```

**Example:**
```typescript
// Request
POST /money-accounts
{
  "accountNumber": "1234567890123456",
  "bankName": "Vietcombank",
  "bankCode": "VCB",
  "pay2sBankId": "VCB",
  "isActive": true
}

// Response
{
  "success": true,
  "data": {
    "id": "clx123abc456def789",
    "accountNumber": "1234567890123456",
    "bankName": "Vietcombank",
    "bankCode": "VCB",
    "pay2sBankId": "VCB",
    "isActive": true,
    "createdAt": "2024-03-26T10:00:00.000Z",
    "updatedAt": "2024-03-26T10:00:00.000Z"
  },
  "message": "Money account created successfully"
}
```

### 2. Lấy danh sách tài khoản (chỉ active)
**Endpoint:** `GET /money-accounts`

**Response:**
```typescript
{
  "success": true,
  "data": [
    {
      "id": string,
      "accountNumber": string,
      "bankName": string | null,
      "bankCode": string | null,
      "pay2sBankId": string | null,
      "isActive": boolean,
      "createdAt": string,
      "updatedAt": string
    }
  ],
  "message": "Money accounts retrieved successfully"
}
```

### 3. Lấy danh sách tất cả tài khoản (bao gồm inactive)
**Endpoint:** `GET /money-accounts/all`

**Response:** Tương như endpoint trên nhưng bao gồm cả tài khoản đã bị xóa (isActive: false)

### 4. Lấy danh sách tài khoản active cho TOPUP
**Endpoint:** `GET /money-accounts/active-for-topup`

**Response:**
```typescript
{
  "success": true,
  "data": [
    {
      "id": string,
      "accountNumber": string,
      "bankName": string | null,
      "bankCode": string | null,
      "pay2sBankId": string | null
    }
  ],
  "message": "Active accounts for topup retrieved successfully"
}
```

### 5. Lấy chi tiết tài khoản
**Endpoint:** `GET /money-accounts/:id`

**Response:**
```typescript
{
  "success": true,
  "data": {
    "id": string,
    "accountNumber": string,
    "bankName": string | null,
    "bankCode": string | null,
    "pay2sBankId": string | null,
    "isActive": boolean,
    "createdAt": string,
    "updatedAt": string
  },
  "message": "Money account retrieved successfully"
}
```

### 6. Cập nhật tài khoản
**Endpoint:** `PATCH /money-accounts/:id`

**Request Body:**
```typescript
{
  "accountNumber": string,      // Tùy chọn
  "bankName": string,          // Tùy chọn
  "bankCode": string,          // Tùy chọn
  "pay2sBankId": string,       // Tùy chọn
  "isActive": boolean          // Tùy chọn
}
```

**Response:** Tương như tạo tài khoản

### 7. Xóa tài khoản (soft delete)
**Endpoint:** `DELETE /money-accounts/:id`

**Response:**
```typescript
{
  "success": true,
  "message": "Money account deleted successfully"
}
```

## Frontend Implementation Examples

### 1. React Component - Money Account Management

```typescript
import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

interface MoneyAccount {
  id: string;
  accountNumber: string;
  bankName: string | null;
  bankCode: string | null;
  pay2sBankId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const MoneyAccountManagement: React.FC = () => {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load accounts
  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/money-accounts');
      const result = await response.json();
      
      if (result.success) {
        setAccounts(result.data);
      } else {
        setError('Failed to load accounts');
      }
    } catch (err) {
      setError('Error loading accounts');
    } finally {
      setLoading(false);
    }
  };

  // Create account
  const createAccount = async (accountData: any) => {
    try {
      const response = await fetchWithAuth('/money-accounts', {
        method: 'POST',
        body: JSON.stringify(accountData),
      });
      
      const result = await response.json();
      
      if (result.success) {
        await loadAccounts(); // Reload list
        return result.data;
      } else {
        throw new Error(result.message || 'Failed to create account');
      }
    } catch (err) {
      throw err;
    }
  };

  // Update account
  const updateAccount = async (id: string, accountData: any) => {
    try {
      const response = await fetchWithAuth(`/money-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(accountData),
      });
      
      const result = await response.json();
      
      if (result.success) {
        await loadAccounts(); // Reload list
        return result.data;
      } else {
        throw new Error(result.message || 'Failed to update account');
      }
    } catch (err) {
      throw err;
    }
  };

  // Delete account
  const deleteAccount = async (id: string) => {
    try {
      const response = await fetchWithAuth(`/money-accounts/${id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        await loadAccounts(); // Reload list
      } else {
        throw new Error(result.message || 'Failed to delete account');
      }
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div>
      <h2>Quản lý tài khoản ngân hàng</h2>
      
      {/* Account List */}
      <div>
        <h3>Danh sách tài khoản</h3>
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Số tài khoản</th>
                <th>Tên ngân hàng</th>
                <th>Mã ngân hàng</th>
                <th>Pay2S Bank ID</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.accountNumber}</td>
                  <td>{account.bankName || '-'}</td>
                  <td>{account.bankCode || '-'}</td>
                  <td>{account.pay2sBankId || '-'}</td>
                  <td>{account.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button onClick={() => updateAccount(account.id, { isActive: !account.isActive })}>
                      {account.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => deleteAccount(account.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Account Form */}
      <CreateAccountForm onCreate={createAccount} />
    </div>
  );
};

const CreateAccountForm: React.FC<{ onCreate: (data: any) => Promise<any> }> = ({ onCreate }) => {
  const [formData, setFormData] = useState({
    accountNumber: '',
    bankName: '',
    bankCode: '',
    pay2sBankId: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      
      await onCreate(formData);
      
      // Reset form
      setFormData({
        accountNumber: '',
        bankName: '',
        bankCode: '',
        pay2sBankId: '',
        isActive: true,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3>Tạo tài khoản mới</h3>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Số tài khoản:</label>
          <input
            type="text"
            value={formData.accountNumber}
            onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
            required
          />
        </div>
        
        <div>
          <label>Tên ngân hàng:</label>
          <input
            type="text"
            value={formData.bankName}
            onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
          />
        </div>
        
        <div>
          <label>Mã ngân hàng:</label>
          <input
            type="text"
            value={formData.bankCode}
            onChange={(e) => setFormData({ ...formData, bankCode: e.target.value })}
          />
        </div>
        
        <div>
          <label>Pay2S Bank ID:</label>
          <input
            type="text"
            value={formData.pay2sBankId}
            onChange={(e) => setFormData({ ...formData, pay2sBankId: e.target.value })}
          />
        </div>
        
        <div>
          <label>
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
        
        {error && <p style={{ color: 'red' }}>{error}</p>}
        
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Tạo tài khoản'}
        </button>
      </form>
    </div>
  );
};

export default MoneyAccountManagement;
```

### 2. API Service

```typescript
// services/moneyAccountService.ts
import { fetchWithAuth } from '../utils/api';

export interface MoneyAccount {
  id: string;
  accountNumber: string;
  bankName: string | null;
  bankCode: string | null;
  pay2sBankId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMoneyAccountDto {
  accountNumber: string;
  bankName?: string;
  bankCode?: string;
  pay2sBankId?: string;
  isActive?: boolean;
}

export class MoneyAccountService {
  // Get all active accounts
  static async getActiveAccounts(): Promise<MoneyAccount[]> {
    const response = await fetchWithAuth('/money-accounts');
    const result = await response.json();
    return result.success ? result.data : [];
  }

  // Get all accounts (including inactive)
  static async getAllAccounts(): Promise<MoneyAccount[]> {
    const response = await fetchWithAuth('/money-accounts/all');
    const result = await response.json();
    return result.success ? result.data : [];
  }

  // Get accounts for topup selection
  static async getAccountsForTopup(): Promise<MoneyAccount[]> {
    const response = await fetchWithAuth('/money-accounts/active-for-topup');
    const result = await response.json();
    return result.success ? result.data : [];
  }

  // Get account by ID
  static async getAccountById(id: string): Promise<MoneyAccount | null> {
    const response = await fetchWithAuth(`/money-accounts/${id}`);
    const result = await response.json();
    return result.success ? result.data : null;
  }

  // Create new account
  static async createAccount(data: CreateMoneyAccountDto): Promise<MoneyAccount> {
    const response = await fetchWithAuth('/money-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to create account');
    }
    
    return result.data;
  }

  // Update account
  static async updateAccount(id: string, data: Partial<CreateMoneyAccountDto>): Promise<MoneyAccount> {
    const response = await fetchWithAuth(`/money-accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to update account');
    }
    
    return result.data;
  }

  // Delete account (soft delete)
  static async deleteAccount(id: string): Promise<void> {
    const response = await fetchWithAuth(`/money-accounts/${id}`, {
      method: 'DELETE',
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to delete account');
    }
  }
}
```

### 3. Topup Integration

```typescript
// Trong component topup, load danh sách tài khoản để chọn
const TopupForm: React.FC = () => {
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  // Load active accounts for topup
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const accounts = await MoneyAccountService.getAccountsForTopup();
        setMoneyAccounts(accounts);
      } catch (err) {
        console.error('Failed to load money accounts:', err);
      }
    };
    
    loadAccounts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount) {
      alert('Vui lòng chọn tài khoản ngân hàng');
      return;
    }

    try {
      const response = await fetchWithAuth('/api/v1/topups/create-with-pay2s', {
        method: 'POST',
        body: JSON.stringify({
          amountExclVat: 100000,
          moneyAccountId: selectedAccount,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Hiển thị QR code
        console.log('QR Code:', result.qrContent);
      } else {
        alert('Failed to create topup: ' + result.message);
      }
    } catch (err) {
      alert('Error creating topup');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Chọn tài khoản ngân hàng:</label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          required
        >
          <option value="">-- Chọn tài khoản --</option>
          {moneyAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.bankName} - {account.accountNumber}
            </option>
          ))}
        </select>
      </div>
      
      {/* Các trường khác */}
      
      <button type="submit">Nạp tiền</button>
    </form>
  );
};
```

## Error Handling

### Common Error Responses

```typescript
// 400 Bad Request - Validation Error
{
  "success": false,
  "message": "Account number already exists"
}

// 401 Unauthorized
{
  "success": false,
  "message": "Unauthorized"
}

// 403 Forbidden - Not Admin
{
  "success": false,
  "message": "Forbidden resource"
}

// 404 Not Found
{
  "success": false,
  "message": "Money account not found"
}

// 400 Bad Request - Cannot delete
{
  "success": false,
  "message": "Cannot delete account with pending collection requests"
}
```

### Error Handling in Frontend

```typescript
const handleApiCall = async (apiCall: () => Promise<any>) => {
  try {
    return await apiCall();
  } catch (error: any) {
    if (error.message.includes('Account number already exists')) {
      alert('Số tài khoản đã tồn tại!');
    } else if (error.message.includes('not found')) {
      alert('Không tìm thấy tài khoản!');
    } else if (error.message.includes('pending collection requests')) {
      alert('Không thể xóa tài khoản đang có yêu cầu thanh toán chờ xử lý!');
    } else if (error.message.includes('Unauthorized')) {
      alert('Bạn không có quyền thực hiện thao tác này!');
    } else {
      alert('Đã có lỗi xảy ra: ' + error.message);
    }
    throw error;
  }
};
```

## Testing

### Test Scenarios

1. **Create Account**
   - Valid data → Success
   - Duplicate account number → Error
   - Missing required fields → Error

2. **Update Account**
   - Valid update → Success
   - Update to duplicate account number → Error
   - Update non-existent account → Error

3. **Delete Account**
   - Delete unused account → Success
   - Delete account with pending requests → Error
   - Delete non-existent account → Error

4. **List Accounts**
   - Get active accounts → Success
   - Get all accounts → Success
   - Get accounts for topup → Success

## Security Considerations

1. **Authentication**: All endpoints require JWT token and ADMIN role
2. **Validation**: Server-side validation for all inputs
3. **Authorization**: Only ADMIN users can manage money accounts
4. **Data Privacy**: Account numbers are sensitive data
5. **Audit Trail**: All changes are logged with timestamps

## Best Practices

1. **Error Handling**: Always handle API errors gracefully
2. **Loading States**: Show loading indicators during API calls
3. **User Feedback**: Provide clear success/error messages
4. **Data Validation**: Validate form data before sending
5. **State Management**: Keep local state in sync with server
6. **Security**: Never expose sensitive tokens in client-side code

## Integration Checklist

- [ ] Implement API service functions
- [ ] Create React components for management
- [ ] Add error handling
- [ ] Add loading states
- [ ] Test all CRUD operations
- [ ] Integrate with topup flow
- [ ] Add proper validation
- [ ] Handle edge cases
