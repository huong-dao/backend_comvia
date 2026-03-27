# Public Money Account API for Frontend Users

## Overview
API dành cho frontend users (không phải admin) để lấy danh sách tài khoản ngân hàng active cho việc nạp tiền (TOPUP).

## Authentication
Cần JWT token (user đã đăng nhập):
```typescript
headers: {
  'Authorization': `Bearer ${jwt_token}`,
  'Content-Type': 'application/json'
}
```

## API Endpoint

### Lấy danh sách tài khoản active cho TOPUP
**Endpoint:** `GET /public/money-accounts/active-for-topup`

**Description:** Lấy danh sách các tài khoản ngân hàng đang active để hiển thị trong form nạp tiền cho user chọn.

**Authentication:** Required (JWT token)

**Roles:** Bất kỳ user đã đăng nhập đều có thể truy cập

**Response:**
```typescript
{
  "success": true,
  "data": [
    {
      "id": string,              // ID của tài khoản
      "accountNumber": string,   // Số tài khoản
      "bankName": string | null, // Tên ngân hàng
      "bankCode": string | null, // Mã ngân hàng
      "pay2sBankId": string | null // Pay2S Bank ID
    }
  ],
  "message": "Active accounts for topup retrieved successfully"
}
```

**Example:**
```typescript
// Request
GET /public/money-accounts/active-for-topup
Headers: {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
}

// Response
{
  "success": true,
  "data": [
    {
      "id": "clx123abc456def789",
      "accountNumber": "1234567890123456",
      "bankName": "Vietcombank",
      "bankCode": "VCB",
      "pay2sBankId": "VCB"
    },
    {
      "id": "clx456def789ghi012",
      "accountNumber": "9876543210987654",
      "bankName": "Techcombank",
      "bankCode": "TCB",
      "pay2sBankId": "TCB"
    }
  ],
  "message": "Active accounts for topup retrieved successfully"
}
```

## Frontend Implementation

### 1. API Service

```typescript
// services/publicMoneyAccountService.ts
import { fetchWithAuth } from '../utils/api';

export interface PublicMoneyAccount {
  id: string;
  accountNumber: string;
  bankName: string | null;
  bankCode: string | null;
  pay2sBankId: string | null;
}

export class PublicMoneyAccountService {
  /**
   * Lấy danh sách tài khoản ngân hàng active cho việc nạp tiền
   */
  static async getActiveAccountsForTopup(): Promise<PublicMoneyAccount[]> {
    const response = await fetchWithAuth('/public/money-accounts/active-for-topup');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to get money accounts');
    }
    
    return result.data;
  }
}
```

### 2. React Component - Account Selector

```typescript
// components/topup/MoneyAccountSelector.tsx
import React, { useState, useEffect } from 'react';
import { PublicMoneyAccountService, PublicMoneyAccount } from '../../services/publicMoneyAccountService';

interface MoneyAccountSelectorProps {
  value: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
  error?: string;
}

export const MoneyAccountSelector: React.FC<MoneyAccountSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  error,
}) => {
  const [accounts, setAccounts] = useState<PublicMoneyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setLoading(true);
        setErrorState(null);
        const data = await PublicMoneyAccountService.getActiveAccountsForTopup();
        setAccounts(data);
      } catch (err: any) {
        setErrorState(err.message);
        console.error('Failed to load money accounts:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, []);

  if (loading) {
    return (
      <div className="form-group">
        <label htmlFor="moneyAccount">Chọn tài khoản ngân hàng *</label>
        <select disabled className="form-control">
          <option>Đang tải danh sách tài khoản...</option>
        </select>
      </div>
    );
  }

  if (errorState) {
    return (
      <div className="form-group">
        <label htmlFor="moneyAccount">Chọn tài khoản ngân hàng *</label>
        <select disabled className="form-control is-invalid">
          <option>Lỗi tải danh sách tài khoản</option>
        </select>
        <div className="invalid-feedback">
          {errorState}
        </div>
      </div>
    );
  }

  return (
    <div className="form-group">
      <label htmlFor="moneyAccount">Chọn tài khoản ngân hàng *</label>
      <select
        id="moneyAccount"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`form-control ${error || errorState ? 'is-invalid' : ''}`}
      >
        <option value="">-- Chọn tài khoản ngân hàng --</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.bankName || 'Ngân hàng'} - {account.accountNumber}
          </option>
        ))}
      </select>
      {(error || errorState) && (
        <div className="invalid-feedback">
          {error || errorState}
        </div>
      )}
      
      {accounts.length === 0 && !loading && !errorState && (
        <small className="text-muted">
          Hiện tại không có tài khoản ngân hàng nào khả dụng. Vui lòng liên hệ quản trị viên.
        </small>
      )}
    </div>
  );
};
```

### 3. Custom Hook

```typescript
// hooks/useMoneyAccountsForTopup.ts
import { useState, useEffect } from 'react';
import { PublicMoneyAccountService, PublicMoneyAccount } from '../services/publicMoneyAccountService';

export const useMoneyAccountsForTopup = () => {
  const [accounts, setAccounts] = useState<PublicMoneyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await PublicMoneyAccountService.getActiveAccountsForTopup();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  return {
    accounts,
    loading,
    error,
    refresh: loadAccounts,
  };
};
```

### 4. Integration với Topup Form

```typescript
// components/topup/TopupForm.tsx
import React, { useState } from 'react';
import { MoneyAccountSelector } from './MoneyAccountSelector';
import { useMoneyAccountsForTopup } from '../../hooks/useMoneyAccountsForTopup';

export const TopupForm: React.FC = () => {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { accounts, loading: accountsLoading } = useMoneyAccountsForTopup();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount) {
      setError('Vui lòng chọn tài khoản ngân hàng');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Gọi API tạo topup request
      const response = await fetchWithAuth('/api/v1/topups/create-with-pay2s', {
        method: 'POST',
        body: JSON.stringify({
          amountExclVat: parseFloat(amount),
          moneyAccountId: selectedAccount,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Hiển thị QR code hoặc chuyển hướng
        console.log('Topup created:', result);
        // Hiển thị QR code
        // window.location.href = `/topup/${result.topupCode}`;
      } else {
        setError(result.message || 'Không thể tạo yêu cầu nạp tiền');
      }
    } catch (err: any) {
      setError('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="topup-form">
      <h2>Nạp tiền vào tài khoản</h2>
      
      <form onSubmit={handleSubmit}>
        <MoneyAccountSelector
          value={selectedAccount}
          onChange={setSelectedAccount}
          disabled={loading}
          error={!selectedAccount && error ? 'Vui lòng chọn tài khoản ngân hàng' : undefined}
        />

        <div className="form-group">
          <label htmlFor="amount">Số tiền nạp (VND) *</label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Nhập số tiền muốn nạp"
            min="10000"
            step="1000"
            required
            disabled={loading}
            className={`form-control ${!amount && error ? 'is-invalid' : ''}`}
          />
          {!amount && error && (
            <div className="invalid-feedback">
              Vui lòng nhập số tiền hợp lệ
            </div>
          )}
          <small className="form-text text-muted">
            Số tiền tối thiểu: 10,000 VND
          </small>
        </div>

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || accountsLoading}
        >
          {loading ? 'Đang xử lý...' : 'Nạp tiền'}
        </button>
      </form>
    </div>
  );
};
```

### 5. Error Handling

```typescript
// utils/errorHandler.ts
export const handleMoneyAccountError = (error: string): string => {
  if (error.includes('Unauthorized')) {
    return 'Bạn cần đăng nhập để thực hiện thao tác này';
  }
  
  if (error.includes('Failed to get money accounts')) {
    return 'Không thể tải danh sách tài khoản ngân hàng. Vui lòng thử lại.';
  }
  
  if (error.includes('network') || error.includes('fetch')) {
    return 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
  }
  
  return error || 'Đã có lỗi xảy ra. Vui lòng thử lại.';
};
```

## Testing

### 1. Unit Tests

```typescript
// __tests__/PublicMoneyAccountService.test.ts
import { PublicMoneyAccountService } from '../services/publicMoneyAccountService';

// Mock fetch
global.fetch = jest.fn();

describe('PublicMoneyAccountService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return active accounts for topup', async () => {
    const mockAccounts = [
      {
        id: '1',
        accountNumber: '123456789',
        bankName: 'Vietcombank',
        bankCode: 'VCB',
        pay2sBankId: 'VCB',
      },
    ];

    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: mockAccounts,
      }),
    });

    const result = await PublicMoneyAccountService.getActiveAccountsForTopup();

    expect(result).toEqual(mockAccounts);
    expect(fetch).toHaveBeenCalledWith('/public/money-accounts/active-for-topup', {
      headers: {
        'Authorization': expect.any(String),
        'Content-Type': 'application/json',
      },
    });
  });

  it('should handle API errors', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        success: false,
        message: 'API Error',
      }),
    });

    await expect(PublicMoneyAccountService.getActiveAccountsForTopup())
      .rejects.toThrow('API Error');
  });
});
```

### 2. Component Tests

```typescript
// __tests__/MoneyAccountSelector.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MoneyAccountSelector } from '../components/topup/MoneyAccountSelector';
import { PublicMoneyAccountService } from '../services/publicMoneyAccountService';

jest.mock('../services/publicMoneyAccountService');

describe('MoneyAccountSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display loading state initially', () => {
    (PublicMoneyAccountService.getActiveAccountsForTopup as jest.Mock).mockResolvedValue([]);

    render(<MoneyAccountSelector value="" onChange={() => {}} />);
    
    expect(screen.getByText('Đang tải danh sách tài khoản...')).toBeInTheDocument();
  });

  it('should display accounts when loaded', async () => {
    const mockAccounts = [
      {
        id: '1',
        accountNumber: '123456789',
        bankName: 'Vietcombank',
        bankCode: 'VCB',
        pay2sBankId: 'VCB',
      },
    ];

    (PublicMoneyAccountService.getActiveAccountsForTopup as jest.Mock).mockResolvedValue(mockAccounts);

    render(<MoneyAccountSelector value="" onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Vietcombank - 123456789')).toBeInTheDocument();
    });
  });

  it('should display error when API fails', async () => {
    (PublicMoneyAccountService.getActiveAccountsForTopup as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(<MoneyAccountSelector value="" onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Lỗi tải danh sách tài khoản')).toBeInTheDocument();
    });
  });
});
```

## Security Considerations

### 1. Authentication
- ✅ JWT token required
- ✅ Token validation in backend
- ✅ Automatic token refresh

### 2. Data Protection
- ✅ Only active accounts returned
- ✅ Sensitive data masked if needed
- ✅ Rate limiting considerations

### 3. Frontend Security
- 📋 Token storage security
- 📋 Input validation
- 📋 XSS prevention

## Performance Considerations

### 1. Caching
- Consider client-side caching for account list
- Implement cache invalidation when accounts change
- Use React Query or SWR for data fetching

### 2. Optimization
- Lazy loading of account selector
- Debounced API calls
- Minimal data transfer

## Integration Checklist

### Backend
- [x] Public endpoint created
- [x] JWT authentication implemented
- [x] Only active accounts returned
- [x] Error handling implemented
- [x] Build successful

### Frontend
- [ ] API service implemented
- [ ] React component created
- [ ] Error handling added
- [ ] Loading states implemented
- [ ] Integration with topup flow
- [ ] Testing completed

### Testing
- [ ] Unit tests for API service
- [ ] Component tests
- [ ] Integration tests
- [ ] End-to-end tests

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check JWT token validity
   - Verify user is logged in
   - Check token expiration

2. **Empty account list**
   - Verify admin has created accounts
   - Check if accounts are active
   - Verify workspace configuration

3. **Network errors**
   - Check API endpoint URL
   - Verify CORS configuration
   - Check network connectivity

4. **Component not updating**
   - Check state management
   - Verify useEffect dependencies
   - Check for stale closures

### Debug Tips

```typescript
// Add logging for debugging
console.log('Loading money accounts...');
console.log('Accounts loaded:', accounts);
console.log('Selected account:', selectedAccount);
```

## Future Enhancements

### Backend
- [ ] Workspace-based account filtering
- [ ] Account preference per user
- [ ] Account usage analytics
- [ ] Real-time updates via WebSocket

### Frontend
- [ ] Account search functionality
- [ ] Recently used accounts
- [ ] Account favorites
- [ ] Mobile optimization

---

**API đã sẵn sàng cho frontend tích hợp!** 🚀
