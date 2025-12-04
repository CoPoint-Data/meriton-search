export interface TransactionMetadata {
  date: string;
  vendor: string;
  amount: number;
  account: string;
  opco_id: string;
  vendor_id?: string;
  role_required: string;
}

export interface SearchRequest {
  query: string;
  role: string;
  opco_id: string;
  top_k?: number;
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: TransactionMetadata;
  score: number;
}

export interface SearchResponse {
  answer: string;
  sources: SearchResult[];
}

export type UserRole = 'admin' | 'finance_manager' | 'employee' | 'vendor_portal';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  finance_manager: 3,
  employee: 2,
  vendor_portal: 1,
};
