import type {
  LoginResponse,
  Municipality,
  Ward,
  Locality,
  Property,
  AssessmentRate,
  Bill,
  PaymentTransaction,
  CreateOrderResponse,
  CitizenTrackingSnapshot,
  ChartOfAccount,
  JournalEntry,
} from '../types/api.types';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) || '';

class ApiClient {
  private token: string | null = null;
  private tenantId: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  public setToken(token: string | null): void {
    this.token = token;
  }

  public setTenantId(tenantId: string | null): void {
    this.tenantId = tenantId;
  }

  public setOnUnauthorized(callback: () => void): void {
    this.onUnauthorized = callback;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.tenantId) {
      headers['X-Tenant-Id'] = this.tenantId;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        if (this.onUnauthorized && !endpoint.includes('/auth/login')) {
          this.onUnauthorized();
        }
      }

      if (response.status === 204) {
        return {} as T;
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          data?.error?.message ||
          data?.message ||
          `Request failed with status ${response.status} (${response.statusText})`;
        const error = new Error(errorMsg) as any;
        error.code = data?.error?.code || 'API_ERROR';
        error.status = response.status;
        error.details = data?.error?.details;
        throw error;
      }

      return data as T;
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        const networkError = new Error(
          'Unable to connect to the municipal backend server. Please verify the backend is running.'
        ) as any;
        networkError.code = 'NETWORK_ERROR';
        networkError.status = 0;
        throw networkError;
      }
      throw err;
    }
  }

  // ==========================================
  // Auth Endpoints
  // ==========================================
  public async login(mobileNumber: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, password }),
    });
  }

  public async getMe(): Promise<{ user: any; memberships: any[] }> {
    return this.request<{ user: any; memberships: any[] }>('/api/v1/auth/me');
  }

  // ==========================================
  // Public Discovery
  // ==========================================
  public async getMunicipalities(): Promise<{ count: number; data: Municipality[] }> {
    return this.request<{ count: number; data: Municipality[] }>('/api/v1/municipalities');
  }

  // ==========================================
  // Tenant Master Data
  // ==========================================
  public async getCurrentTenant(): Promise<{ tenant: any }> {
    return this.request<{ tenant: any }>('/api/v1/tenants/current');
  }

  public async getWards(): Promise<{ count: number; data: Ward[] }> {
    return this.request<{ count: number; data: Ward[] }>('/api/v1/tenants/wards');
  }

  public async getLocalities(wardId?: string): Promise<{ count: number; data: Locality[] }> {
    const query = wardId ? `?wardId=${encodeURIComponent(wardId)}` : '';
    return this.request<{ count: number; data: Locality[] }>(`/api/v1/tenants/localities${query}`);
  }

  // ==========================================
  // Property Management
  // ==========================================
  public async listProperties(citizenUserId?: string): Promise<{ count: number; data: Property[] }> {
    const query = citizenUserId ? `?citizenUserId=${encodeURIComponent(citizenUserId)}` : '';
    return this.request<{ count: number; data: Property[] }>(`/api/v1/properties${query}`);
  }

  public async createProperty(payload: {
    localityId: string;
    propertyType: string;
    addressLine: string;
    citizenUserId?: string;
    customIdentifier?: string;
  }): Promise<{ data: Property }> {
    return this.request<{ data: Property }>('/api/v1/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async getAssessmentRates(): Promise<{ count: number; data: AssessmentRate[] }> {
    return this.request<{ count: number; data: AssessmentRate[] }>('/api/v1/properties/rates');
  }

  // ==========================================
  // Bills & Payments
  // ==========================================
  public async listCitizenBills(): Promise<{ status: string; data: { bills: Bill[]; count: number } }> {
    return this.request<{ status: string; data: { bills: Bill[]; count: number } }>('/api/v1/payments/bills');
  }

  public async listPaymentHistory(): Promise<{
    status: string;
    data: { payments: PaymentTransaction[]; count: number };
  }> {
    return this.request<{ status: string; data: { payments: PaymentTransaction[]; count: number } }>(
      '/api/v1/payments/history'
    );
  }

  public async getPaymentDetails(id: string): Promise<{ status: string; data: { payment: PaymentTransaction } }> {
    return this.request<{ status: string; data: { payment: PaymentTransaction } }>(`/api/v1/payments/${id}`);
  }

  public async createPaymentOrder(payload: {
    billId?: string;
    propertyId?: string;
    paymentMethod: string;
    amountMinorUnits: string | number;
    currency?: string;
    idempotencyKey?: string;
  }): Promise<CreateOrderResponse> {
    return this.request<CreateOrderResponse>('/api/v1/payments/create-order', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Helper for sandbox simulator: trigger mock payment capture webhook
   */
  public async simulateMockPaymentCapture(
    gatewayOrderId: string,
    amountMinorUnits: number | string,
    signature: string
  ): Promise<any> {
    const payload = JSON.stringify({
      event: 'payment.captured',
      id: `evt_sim_${Date.now()}`,
      timestamp: new Date().toISOString(),
      payload: {
        payment: {
          entity: {
            id: `pay_sim_${Date.now()}`,
            order_id: gatewayOrderId,
            amount: Number(amountMinorUnits),
            currency: 'INR',
            status: 'captured',
            method: 'upi_mock',
          },
        },
      },
    });

    return this.request<any>('/api/v1/webhooks/payments/mock_gateway', {
      method: 'POST',
      headers: {
        'x-mock-signature': signature,
      },
      body: payload,
    });
  }

  // ==========================================
  // Citizen Vehicle Tracking
  // ==========================================
  public async getCitizenTracking(
    localityId?: string,
    vehicleId?: string
  ): Promise<{ data: CitizenTrackingSnapshot[] }> {
    const params = new URLSearchParams();
    if (localityId) params.append('localityId', localityId);
    if (vehicleId) params.append('vehicleId', vehicleId);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    return this.request<{ data: CitizenTrackingSnapshot[] }>(`/api/v1/citizen/tracking${queryString}`);
  }

  // ==========================================
  // Municipal Admin Accounting
  // ==========================================
  public async getChartOfAccounts(): Promise<{ count: number; data: ChartOfAccount[] }> {
    return this.request<{ count: number; data: ChartOfAccount[] }>('/api/v1/accounting/accounts');
  }

  public async createJournalDraft(payload: {
    postingDate: string;
    businessEventType: string;
    businessEventId: string;
    currency?: string;
    description: string;
    lines: {
      lineNumber: number;
      accountId: string;
      entryType: 'DEBIT' | 'CREDIT';
      amountMinorUnits: string | number;
      memo?: string;
    }[];
  }): Promise<{ data: JournalEntry }> {
    return this.request<{ data: JournalEntry }>('/api/v1/accounting/journals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public async postJournal(id: string): Promise<{ data: JournalEntry }> {
    return this.request<{ data: JournalEntry }>(`/api/v1/accounting/journals/${id}/post`, {
      method: 'POST',
    });
  }

  public async reverseJournal(id: string, reason: string): Promise<{ data: JournalEntry }> {
    return this.request<{ data: JournalEntry }>(`/api/v1/accounting/journals/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}

export const apiClient = new ApiClient();
