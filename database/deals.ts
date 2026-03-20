/**
 * Deal types and utilities for mapping between database schema and UI.
 *
 * This module provides:
 * - TypeScript types for deals (DB and UI)
 * - Conversion utilities between DB records and UI data
 * - Query helpers for common deal operations
 */

import type { deals } from './schema';

// Re-export the deal record type from schema
export type DealRecord = typeof deals.$inferSelect;

// ============================================================================
// Types
// ============================================================================

/**
 * Database deal insert type (inferred from schema)
 */
export type DealInsert = typeof deals.$inferInsert;

/**
 * Deal value type enum
 */
export type DealValueType = 'percentage' | 'fixed_amount' | 'other';

/**
 * Deal status for UI display
 */
export type DealStatus = 'active' | 'expired' | 'used' | 'dismissed';

/**
 * UI-friendly deal data structure for DealsScreen component.
 * This is the shape expected by the frontend components.
 */
export interface DealData {
  id: string;
  title: string;
  brand: string;
  description?: string;
  code?: string;
  value?: string;
  valueType?: DealValueType;
  expiry?: Date;
  isActive: boolean;
  status: DealStatus;
  category?: string;
  link?: string;
  minimumPurchase?: string;
  usedAt?: Date;
  dismissedAt?: Date;
  createdAt: Date;
  emailId: string;
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Check if a deal is expired based on its expiry date
 */
export function isDealExpired(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  return new Date(expiry) < new Date();
}

/**
 * Check if a deal is expiring soon (within 7 days)
 */
export function isDealExpiringSoon(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  const now = new Date();
  const expiryDate = new Date(expiry);
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 0 && diffDays <= 7;
}

/**
 * Determine the display status of a deal
 */
export function getDealStatus(deal: {
  isActive: boolean;
  dealExpiry: Date | null | undefined;
  usedAt: Date | null | undefined;
  dismissedAt: Date | null | undefined;
}): DealStatus {
  if (deal.dismissedAt) return 'dismissed';
  if (deal.usedAt) return 'used';
  if (!deal.isActive || isDealExpired(deal.dealExpiry)) return 'expired';
  return 'active';
}

/**
 * Convert a database deal record to UI-friendly DealData
 */
export function toDealData(record: DealRecord): DealData {
  const status = getDealStatus({
    isActive: record.isActive ?? true,
    dealExpiry: record.dealExpiry,
    usedAt: record.usedAt,
    dismissedAt: record.dismissedAt,
  });

  return {
    id: record.id,
    title: record.dealTitle,
    brand: record.brandName ?? '',
    description: record.dealDescription ?? undefined,
    code: record.dealCode ?? undefined,
    value: record.dealValue ?? undefined,
    valueType: record.dealValueType ?? undefined,
    expiry: record.dealExpiry ?? undefined,
    isActive: record.isActive ?? true,
    status,
    category: record.dealCategory ?? undefined,
    link: record.dealLink ?? undefined,
    minimumPurchase: record.minimumPurchase ?? undefined,
    usedAt: record.usedAt ?? undefined,
    dismissedAt: record.dismissedAt ?? undefined,
    createdAt: record.createdAt ?? new Date(),
    emailId: record.emailId,
  };
}

/**
 * Convert multiple deal records to DealData array
 */
export function toDealDataList(records: DealRecord[]): DealData[] {
  return records.map(toDealData);
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Filter options for querying deals
 */
export interface DealsFilterOptions {
  /** Filter by status */
  status?: 'active' | 'expired' | 'all';
  /** Filter by category */
  category?: string;
  /** Filter by brand name */
  brand?: string;
  /** Exclude dismissed deals */
  excludeDismissed?: boolean;
  /** Exclude used deals */
  excludeUsed?: boolean;
}

/**
 * Sort options for deals
 */
export type DealsSortOption = 'expiry_asc' | 'expiry_desc' | 'created_asc' | 'created_desc';

/**
 * Client-side filter for deals (useful after fetching all deals)
 */
export function filterDeals(deals: DealData[], options: DealsFilterOptions): DealData[] {
  let filtered = [...deals];

  // Exclude dismissed by default
  if (options.excludeDismissed !== false) {
    filtered = filtered.filter((d) => d.status !== 'dismissed');
  }

  // Exclude used by default
  if (options.excludeUsed !== false) {
    filtered = filtered.filter((d) => d.status !== 'used');
  }

  // Status filter
  if (options.status === 'active') {
    filtered = filtered.filter((d) => d.status === 'active');
  } else if (options.status === 'expired') {
    filtered = filtered.filter((d) => d.status === 'expired');
  }
  // 'all' shows everything

  // Category filter
  if (options.category && options.category !== 'all') {
    filtered = filtered.filter((d) => d.category === options.category);
  }

  // Brand filter
  if (options.brand && options.brand !== 'all') {
    filtered = filtered.filter((d) => d.brand === options.brand);
  }

  return filtered;
}

/**
 * Sort deals by specified option
 */
export function sortDeals(deals: DealData[], sortBy: DealsSortOption): DealData[] {
  const sorted = [...deals];

  switch (sortBy) {
    case 'expiry_asc':
      return sorted.sort((a, b) => {
        if (!a.expiry && !b.expiry) return 0;
        if (!a.expiry) return 1;
        if (!b.expiry) return -1;
        return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
      });
    case 'expiry_desc':
      return sorted.sort((a, b) => {
        if (!a.expiry && !b.expiry) return 0;
        if (!a.expiry) return 1;
        if (!b.expiry) return -1;
        return new Date(b.expiry).getTime() - new Date(a.expiry).getTime();
      });
    case 'created_asc':
      return sorted.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    case 'created_desc':
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    default:
      return sorted;
  }
}

/**
 * Extract unique categories from deals list
 */
export function extractCategories(deals: DealData[]): string[] {
  const categories = new Set<string>();
  deals.forEach((deal) => {
    if (deal.category) categories.add(deal.category);
  });
  return Array.from(categories).sort();
}

/**
 * Extract unique brands from deals list
 */
export function extractBrands(deals: DealData[]): string[] {
  const brands = new Set<string>();
  deals.forEach((deal) => {
    if (deal.brand) brands.add(deal.brand);
  });
  return Array.from(brands).sort();
}

/**
 * Group deals by status
 */
export function groupDealsByStatus(deals: DealData[]): {
  active: DealData[];
  expired: DealData[];
  used: DealData[];
  dismissed: DealData[];
} {
  return {
    active: deals.filter((d) => d.status === 'active'),
    expired: deals.filter((d) => d.status === 'expired'),
    used: deals.filter((d) => d.status === 'used'),
    dismissed: deals.filter((d) => d.status === 'dismissed'),
  };
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format expiry date for display
 */
export function formatExpiryDate(expiry: Date | null | undefined): string {
  if (!expiry) return '';

  const now = new Date();
  const expiryDate = new Date(expiry);
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `Expired ${Math.abs(diffDays)} days ago`;
  }
  if (diffDays === 0) {
    return 'Expires today';
  }
  if (diffDays === 1) {
    return 'Expires tomorrow';
  }
  if (diffDays <= 7) {
    return `Expires in ${diffDays} days`;
  }

  return expiryDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format deal value for display
 */
export function formatDealValue(value: string | undefined, valueType: DealValueType | undefined): string {
  if (!value) return '';

  switch (valueType) {
    case 'percentage':
      return `${value}% off`;
    case 'fixed_amount':
      return `$${value} off`;
    default:
      return value;
  }
}
