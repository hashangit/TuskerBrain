export type DealValueType = 'percentage' | 'fixed_amount' | 'other';

export type DealStatus = 'active' | 'expired' | 'used' | 'dismissed';

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

export interface DealRecord {
  id: string;
  emailId: string;
  dealTitle: string;
  brandName?: string | null;
  dealDescription?: string | null;
  dealCode?: string | null;
  dealValue?: string | null;
  dealValueType?: DealValueType | null;
  dealExpiry?: Date | string | null;
  dealCategory?: string | null;
  dealLink?: string | null;
  minimumPurchase?: string | null;
  isActive?: boolean | null;
  usedAt?: Date | string | null;
  dismissedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface DealsFilterOptions {
  status?: DealStatus | 'all';
  category?: string;
  brand?: string;
  excludeDismissed?: boolean;
  excludeUsed?: boolean;
}

export type DealsSortOption = 'expiry_asc' | 'expiry_desc' | 'created_asc' | 'created_desc';

export function isDealExpired(expiry: Date | string | null | undefined): boolean {
  if (!expiry) return false;
  const expiryDate = expiry instanceof Date ? expiry : new Date(expiry);
  if (isNaN(expiryDate.getTime())) return false;
  return expiryDate < new Date();
}

export function isDealExpiringSoon(expiry: Date | string | null | undefined): boolean {
  if (!expiry) return false;
  const now = new Date();
  const expiryDate = expiry instanceof Date ? expiry : new Date(expiry);
  if (isNaN(expiryDate.getTime())) return false;
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 0 && diffDays <= 7;
}

export function getDealStatus(deal: {
  isActive: boolean;
  dealExpiry: Date | string | null | undefined;
  usedAt: Date | string | null | undefined;
  dismissedAt: Date | string | null | undefined;
}): DealStatus {
  if (deal.dismissedAt) {
    const dismissedDate =
      deal.dismissedAt instanceof Date ? deal.dismissedAt : new Date(deal.dismissedAt);
    if (!isNaN(dismissedDate.getTime())) return 'dismissed';
  }

  if (deal.usedAt) {
    const usedDate = deal.usedAt instanceof Date ? deal.usedAt : new Date(deal.usedAt);
    if (!isNaN(usedDate.getTime())) return 'used';
  }

  if (!deal.isActive || isDealExpired(deal.dealExpiry)) return 'expired';
  return 'active';
}

function toDateOrUndefined(value: Date | string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? undefined : date;
}

export function toDealData(record: DealRecord): DealData {
  const expiryDate = toDateOrUndefined(record.dealExpiry);
  const usedDate = toDateOrUndefined(record.usedAt);
  const dismissedDate = toDateOrUndefined(record.dismissedAt);
  const createdDate = toDateOrUndefined(record.createdAt) ?? new Date();

  const status = getDealStatus({
    isActive: record.isActive ?? true,
    dealExpiry: expiryDate,
    usedAt: usedDate,
    dismissedAt: dismissedDate,
  });

  return {
    id: record.id,
    title: record.dealTitle,
    brand: record.brandName ?? '',
    description: record.dealDescription ?? undefined,
    code: record.dealCode ?? undefined,
    value: record.dealValue ?? undefined,
    valueType: record.dealValueType ?? undefined,
    expiry: expiryDate,
    isActive: record.isActive ?? true,
    status,
    category: record.dealCategory ?? undefined,
    link: record.dealLink ?? undefined,
    minimumPurchase: record.minimumPurchase ?? undefined,
    usedAt: usedDate,
    dismissedAt: dismissedDate,
    createdAt: createdDate,
    emailId: record.emailId,
  };
}

export function toDealDataList(records: DealRecord[]): DealData[] {
  return records.map(toDealData);
}

export function filterDeals(deals: DealData[], options: DealsFilterOptions): DealData[] {
  let filtered = [...deals];

  if (options.status && options.status !== 'all') {
    filtered = filtered.filter((deal) => deal.status === options.status);
  } else {
    if (options.excludeDismissed !== false) {
      filtered = filtered.filter((deal) => deal.status !== 'dismissed');
    }

    if (options.excludeUsed !== false) {
      filtered = filtered.filter((deal) => deal.status !== 'used');
    }
  }

  if (options.category && options.category !== 'all') {
    filtered = filtered.filter((deal) => deal.category === options.category);
  }

  if (options.brand && options.brand !== 'all') {
    filtered = filtered.filter((deal) => deal.brand === options.brand);
  }

  return filtered;
}

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

export function extractCategories(deals: DealData[]): string[] {
  const categories = new Set<string>();
  deals.forEach((deal) => {
    if (deal.category) categories.add(deal.category);
  });
  return Array.from(categories).sort();
}

export function extractBrands(deals: DealData[]): string[] {
  const brands = new Set<string>();
  deals.forEach((deal) => {
    if (deal.brand) brands.add(deal.brand);
  });
  return Array.from(brands).sort();
}

export function groupDealsByStatus(deals: DealData[]): {
  active: DealData[];
  expired: DealData[];
  used: DealData[];
  dismissed: DealData[];
} {
  return {
    active: deals.filter((deal) => deal.status === 'active'),
    expired: deals.filter((deal) => deal.status === 'expired'),
    used: deals.filter((deal) => deal.status === 'used'),
    dismissed: deals.filter((deal) => deal.status === 'dismissed'),
  };
}

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

export function formatDealValue(
  value: string | undefined,
  valueType: DealValueType | undefined
): string {
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

export function updateDealById<T extends { id: string }>(
  deals: T[],
  dealId: string,
  update: (deal: T) => T
): T[] {
  return deals.map((deal) => (deal.id === dealId ? update(deal) : deal));
}
