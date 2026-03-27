# Money Account Frontend Components

## Overview
Components và hooks sẵn sàng để sử dụng cho quản lý tài khoản ngân hàng trong frontend.

## 1. Main Management Component

```typescript
// components/admin/MoneyAccountManagement.tsx
import React, { useState, useEffect } from 'react';
import { MoneyAccountService } from '../../services/moneyAccountService';
import { MoneyAccount, CreateMoneyAccountDto } from '../../types/moneyAccount';
import { MoneyAccountForm } from './MoneyAccountForm';
import { MoneyAccountList } from './MoneyAccountList';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface MoneyAccountManagementProps {
  className?: string;
}

export const MoneyAccountManagement: React.FC<MoneyAccountManagementProps> = ({
  className,
}) => {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<MoneyAccount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MoneyAccount | null>(null);

  // Load accounts
  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await MoneyAccountService.getAllAccounts();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Create account
  const handleCreate = async (data: CreateMoneyAccountDto) => {
    try {
      await MoneyAccountService.createAccount(data);
      setShowForm(false);
      await loadAccounts();
    } catch (err: any) {
      throw err;
    }
  };

  // Update account
  const handleUpdate = async (id: string, data: Partial<CreateMoneyAccountDto>) => {
    try {
      await MoneyAccountService.updateAccount(id, data);
      setEditingAccount(null);
      await loadAccounts();
    } catch (err: any) {
      throw err;
    }
  };

  // Delete account
  const handleDelete = async (account: MoneyAccount) => {
    try {
      await MoneyAccountService.deleteAccount(account.id);
      setDeleteConfirm(null);
      await loadAccounts();
    } catch (err: any) {
      throw err;
    }
  };

  // Toggle account status
  const handleToggleStatus = async (account: MoneyAccount) => {
    try {
      await MoneyAccountService.updateAccount(account.id, {
        isActive: !account.isActive,
      });
      await loadAccounts();
    } catch (err: any) {
      throw err;
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  return (
    <div className={`money-account-management ${className || ''}`}>
      <div className="management-header">
        <h2>Quản lý tài khoản ngân hàng</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          + Thêm tài khoản mới
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="loading">
          <span>Đang tải...</span>
        </div>
      ) : (
        <MoneyAccountList
          accounts={accounts}
          onEdit={setEditingAccount}
          onDelete={setDeleteConfirm}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {/* Create/Edit Form Modal */}
      {(showForm || editingAccount) && (
        <MoneyAccountForm
          account={editingAccount}
          onSubmit={editingAccount ? handleUpdate : handleCreate}
          onCancel={() => {
            setShowForm(false);
            setEditingAccount(null);
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Xóa tài khoản ngân hàng"
          message={`Bạn có chắc chắn muốn xóa tài khoản ${deleteConfirm.bankName} - ${deleteConfirm.accountNumber}?`}
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
};
```

## 2. Account List Component

```typescript
// components/admin/MoneyAccountList.tsx
import React from 'react';
import { MoneyAccount } from '../../types/moneyAccount';
import { formatDateTime } from '../../utils/dateUtils';

interface MoneyAccountListProps {
  accounts: MoneyAccount[];
  onEdit: (account: MoneyAccount) => void;
  onDelete: (account: MoneyAccount) => void;
  onToggleStatus: (account: MoneyAccount) => void;
}

export const MoneyAccountList: React.FC<MoneyAccountListProps> = ({
  accounts,
  onEdit,
  onDelete,
  onToggleStatus,
}) => {
  return (
    <div className="money-account-list">
      {accounts.length === 0 ? (
        <div className="empty-state">
          <p>Chưa có tài khoản ngân hàng nào</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Số tài khoản</th>
                <th>Tên ngân hàng</th>
                <th>Mã ngân hàng</th>
                <th>Pay2S Bank ID</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className={!account.isActive ? 'inactive' : ''}>
                  <td className="account-number">
                    <span className="masked-account">
                      {maskAccountNumber(account.accountNumber)}
                    </span>
                    <button
                      className="btn-link btn-sm"
                      onClick={() => navigator.clipboard.writeText(account.accountNumber)}
                      title="Copy số tài khoản"
                    >
                      📋
                    </button>
                  </td>
                  <td>{account.bankName || '-'}</td>
                  <td>{account.bankCode || '-'}</td>
                  <td>{account.pay2sBankId || '-'}</td>
                  <td>
                    <span className={`status-badge ${account.isActive ? 'active' : 'inactive'}`}>
                      {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDateTime(account.createdAt)}</td>
                  <td className="actions">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => onEdit(account)}
                      title="Chỉnh sửa"
                    >
                      ✏️
                    </button>
                    <button
                      className={`btn btn-sm ${account.isActive ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => onToggleStatus(account)}
                      title={account.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
                    >
                      {account.isActive ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => onDelete(account)}
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Utility functions
const maskAccountNumber = (accountNumber: string) => {
  if (accountNumber.length <= 8) return accountNumber;
  const start = accountNumber.substring(0, 4);
  const end = accountNumber.substring(accountNumber.length - 4);
  const middle = '*'.repeat(accountNumber.length - 8);
  return `${start}${middle}${end}`;
};

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('vi-VN');
};
```

## 3. Form Component

```typescript
// components/admin/MoneyAccountForm.tsx
import React, { useState, useEffect } from 'react';
import { MoneyAccount, CreateMoneyAccountDto } from '../../types/moneyAccount';

interface MoneyAccountFormProps {
  account?: MoneyAccount | null;
  onSubmit: (data: CreateMoneyAccountDto | Partial<CreateMoneyAccountDto>) => Promise<void>;
  onCancel: () => void;
}

export const MoneyAccountForm: React.FC<MoneyAccountFormProps> = ({
  account,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState<CreateMoneyAccountDto>({
    accountNumber: '',
    bankName: '',
    bankCode: '',
    pay2sBankId: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data for editing
  useEffect(() => {
    if (account) {
      setFormData({
        accountNumber: account.accountNumber,
        bankName: account.bankName || '',
        bankCode: account.bankCode || '',
        pay2sBankId: account.pay2sBankId || '',
        isActive: account.isActive,
      });
    }
  }, [account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.accountNumber.trim()) {
      setError('Số tài khoản không được để trống');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      if (account) {
        await onSubmit(account.id, formData);
      } else {
        await onSubmit(formData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof CreateMoneyAccountDto, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    setError(null);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{account ? 'Chỉnh sửa tài khoản ngân hàng' : 'Thêm tài khoản ngân hàng mới'}</h3>
          <button className="btn-close" onClick={onCancel}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="accountNumber">Số tài khoản *</label>
            <input
              id="accountNumber"
              type="text"
              value={formData.accountNumber}
              onChange={(e) => handleChange('accountNumber', e.target.value)}
              placeholder="Nhập số tài khoản"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="bankName">Tên ngân hàng</label>
            <input
              id="bankName"
              type="text"
              value={formData.bankName}
              onChange={(e) => handleChange('bankName', e.target.value)}
              placeholder="Ví dụ: Vietcombank"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="bankCode">Mã ngân hàng</label>
            <input
              id="bankCode"
              type="text"
              value={formData.bankCode}
              onChange={(e) => handleChange('bankCode', e.target.value)}
              placeholder="Ví dụ: VCB"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pay2sBankId">Pay2S Bank ID</label>
            <input
              id="pay2sBankId"
              type="text"
              value={formData.pay2sBankId}
              onChange={(e) => handleChange('pay2sBankId', e.target.value)}
              placeholder="Bank ID trong hệ thống Pay2S"
              disabled={loading}
            />
            <small className="form-help">
              Mã ngân hàng theo định dạng của Pay2S
            </small>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => handleChange('isActive', e.target.checked)}
                disabled={loading}
              />
              <span>Kích hoạt tài khoản</span>
            </label>
            <small className="form-help">
              Tài khoản không kích hoạt sẽ không hiển thị trong danh sách nạp tiền
            </small>
          </div>
        </form>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Đang lưu...' : (account ? 'Cập nhật' : 'Thêm mới')}
          </button>
        </div>
      </div>
    </div>
  );
};
```

## 4. Topup Account Selector Component

```typescript
// components/topup/MoneyAccountSelector.tsx
import React, { useState, useEffect } from 'react';
import { MoneyAccountService } from '../../services/moneyAccountService';
import { MoneyAccount } from '../../types/moneyAccount';

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
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const data = await MoneyAccountService.getAccountsForTopup();
        setAccounts(data);
      } catch (err) {
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
        <label>Chọn tài khoản ngân hàng</label>
        <select disabled className="form-control">
          <option>Đang tải...</option>
        </select>
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
        className={`form-control ${error ? 'is-invalid' : ''}`}
      >
        <option value="">-- Chọn tài khoản ngân hàng --</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.bankName || 'Ngân hàng'} - {account.accountNumber}
          </option>
        ))}
      </select>
      {error && <div className="invalid-feedback">{error}</div>}
      
      {accounts.length === 0 && !loading && (
        <small className="text-muted">
          Không có tài khoản ngân hàng nào khả dụng. Vui lòng liên hệ admin.
        </small>
      )}
    </div>
  );
};
```

## 5. Custom Hook

```typescript
// hooks/useMoneyAccounts.ts
import { useState, useEffect } from 'react';
import { MoneyAccountService } from '../services/moneyAccountService';
import { MoneyAccount } from '../types/moneyAccount';

export const useMoneyAccounts = (includeInactive = false) => {
  const [accounts, setAccounts] = useState<MoneyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = includeInactive
        ? await MoneyAccountService.getAllAccounts()
        : await MoneyAccountService.getActiveAccounts();
      
      setAccounts(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async (data: any) => {
    try {
      const newAccount = await MoneyAccountService.createAccount(data);
      setAccounts(prev => [...prev, newAccount]);
      return newAccount;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateAccount = async (id: string, data: any) => {
    try {
      const updatedAccount = await MoneyAccountService.updateAccount(id, data);
      setAccounts(prev => prev.map(acc => acc.id === id ? updatedAccount : acc));
      return updatedAccount;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await MoneyAccountService.deleteAccount(id);
      setAccounts(prev => prev.map(acc => 
        acc.id === id ? { ...acc, isActive: false } : acc
      ));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  useEffect(() => {
    loadAccounts();
  }, [includeInactive]);

  return {
    accounts,
    loading,
    error,
    refresh: loadAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
  };
};
```

## 6. Types Definition

```typescript
// types/moneyAccount.ts
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

export interface UpdateMoneyAccountDto extends Partial<CreateMoneyAccountDto> {}
```

## 7. CSS Styles

```css
/* styles/MoneyAccountManagement.css */
.money-account-management {
  padding: 20px;
}

.management-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.management-header h2 {
  margin: 0;
  color: #333;
}

.table-container {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.table th,
.table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #495057;
}

.table tr:hover {
  background: #f8f9fa;
}

.table tr.inactive {
  opacity: 0.6;
  background: #f8f9fa;
}

.account-number {
  font-family: monospace;
  display: flex;
  align-items: center;
  gap: 8px;
}

.masked-account {
  color: #666;
}

.btn-link {
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}

.btn-link:hover {
  background: #e3f2fd;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.actions {
  display: flex;
  gap: 4px;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-success:hover {
  background: #1e7e34;
}

.btn-warning {
  background: #ffc107;
  color: #212529;
}

.btn-warning:hover {
  background: #e0a800;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #666;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #666;
}

.alert {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.alert-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #333;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-control:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
}

.form-control.is-invalid {
  border-color: #dc3545;
}

.invalid-feedback {
  color: #dc3545;
  font-size: 12px;
  margin-top: 4px;
}

.form-help {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #666;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  margin: 0;
}
```

## Usage Examples

### 1. In Admin Dashboard

```typescript
// pages/admin/MoneyAccountPage.tsx
import React from 'react';
import { MoneyAccountManagement } from '../../components/admin/MoneyAccountManagement';

export const MoneyAccountPage: React.FC = () => {
  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>Quản lý tài khoản ngân hàng</h1>
      </div>
      
      <MoneyAccountManagement />
    </div>
  );
};
```

### 2. In Topup Form

```typescript
// components/topup/TopupForm.tsx
import React, { useState } from 'react';
import { MoneyAccountSelector } from './MoneyAccountSelector';

export const TopupForm: React.FC = () => {
  const [selectedAccount, setSelectedAccount] = useState('');
  const [amount, setAmount] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedAccount) {
      alert('Vui lòng chọn tài khoản ngân hàng');
      return;
    }

    // Create topup with selected account
    console.log('Creating topup with account:', selectedAccount);
  };

  return (
    <form onSubmit={handleSubmit}>
      <MoneyAccountSelector
        value={selectedAccount}
        onChange={setSelectedAccount}
        error={!selectedAccount ? 'Vui lòng chọn tài khoản' : undefined}
      />
      
      <div className="form-group">
        <label>Số tiền nạp</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Nhập số tiền"
          required
        />
      </div>
      
      <button type="submit" className="btn btn-primary">
        Nạp tiền
      </button>
    </form>
  );
};
```

## Testing Components

```typescript
// __tests__/MoneyAccountManagement.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MoneyAccountManagement } from '../components/admin/MoneyAccountManagement';
import { MoneyAccountService } from '../services/moneyAccountService';

// Mock the service
jest.mock('../services/moneyAccountService');
const mockMoneyAccountService = MoneyAccountService as jest.Mocked<typeof MoneyAccountService>;

describe('MoneyAccountManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load and display accounts', async () => {
    const mockAccounts = [
      {
        id: '1',
        accountNumber: '123456789',
        bankName: 'Vietcombank',
        bankCode: 'VCB',
        pay2sBankId: 'VCB',
        isActive: true,
        createdAt: '2024-03-26T10:00:00Z',
        updatedAt: '2024-03-26T10:00:00Z',
      },
    ];

    mockMoneyAccountService.getAllAccounts.mockResolvedValue(mockAccounts);

    render(<MoneyAccountManagement />);

    await waitFor(() => {
      expect(screen.getByText('Vietcombank')).toBeInTheDocument();
      expect(screen.getByText('123456789')).toBeInTheDocument();
    });
  });

  it('should create new account', async () => {
    const mockAccount = {
      id: '2',
      accountNumber: '987654321',
      bankName: 'Techcombank',
      bankCode: 'TCB',
      pay2sBankId: 'TCB',
      isActive: true,
      createdAt: '2024-03-26T10:00:00Z',
      updatedAt: '2024-03-26T10:00:00Z',
    };

    mockMoneyAccountService.getAllAccounts.mockResolvedValue([]);
    mockMoneyAccountService.createAccount.mockResolvedValue(mockAccount);

    render(<MoneyAccountManagement />);

    // Click add button
    fireEvent.click(screen.getByText('+ Thêm tài khoản mới'));

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('Nhập số tài khoản'), {
      target: { value: '987654321' },
    });
    fireEvent.change(screen.getByPlaceholderText('Ví dụ: Vietcombank'), {
      target: { value: 'Techcombank' },
    });

    // Submit form
    fireEvent.click(screen.getByText('Thêm mới'));

    await waitFor(() => {
      expect(mockMoneyAccountService.createAccount).toHaveBeenCalledWith({
        accountNumber: '987654321',
        bankName: 'Techcombank',
        bankCode: '',
        pay2sBankId: '',
        isActive: true,
      });
    });
  });
});
```

## Best Practices

1. **Component Composition**: Build small, reusable components
2. **State Management**: Use custom hooks for complex state
3. **Error Handling**: Handle errors at component level
4. **Loading States**: Show loading indicators during async operations
5. **Accessibility**: Use proper labels and ARIA attributes
6. **Performance**: Use React.memo for expensive components
7. **Testing**: Write unit tests for all components
8. **Styling**: Use CSS modules or styled-components for better maintainability
