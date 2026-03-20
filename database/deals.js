/**
 * Deal types and utilities for mapping between database schema and UI.
 *
 * This module provides:
 * - TypeScript types for deals (DB and UI)
 * - Conversion utilities between DB records and UI data
 * - Query helpers for common deal operations
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
// ============================================================================
// Conversion Utilities
// ============================================================================
/**
 * Check if a deal is expired based on its expiry date
 */
export function isDealExpired(expiry) {
    if (!expiry)
        return false;
    var expiryDate = expiry instanceof Date ? expiry : new Date(expiry);
    if (isNaN(expiryDate.getTime()))
        return false;
    return expiryDate < new Date();
}
/**
 * Check if a deal is expiring soon (within 7 days)
 */
export function isDealExpiringSoon(expiry) {
    if (!expiry)
        return false;
    var now = new Date();
    var expiryDate = expiry instanceof Date ? expiry : new Date(expiry);
    if (isNaN(expiryDate.getTime()))
        return false;
    var diffMs = expiryDate.getTime() - now.getTime();
    var diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 7;
}
/**
 * Determine the display status of a deal
 */
export function getDealStatus(deal) {
    // Check dismissed - convert to Date if string
    if (deal.dismissedAt) {
        var dismissedDate = deal.dismissedAt instanceof Date ? deal.dismissedAt : new Date(deal.dismissedAt);
        if (!isNaN(dismissedDate.getTime()))
            return 'dismissed';
    }
    // Check used - convert to Date if string
    if (deal.usedAt) {
        var usedDate = deal.usedAt instanceof Date ? deal.usedAt : new Date(deal.usedAt);
        if (!isNaN(usedDate.getTime()))
            return 'used';
    }
    // Check expired
    if (!deal.isActive || isDealExpired(deal.dealExpiry))
        return 'expired';
    return 'active';
}
/**
 * Safely convert a date value (Date, string, or null) to a Date object or undefined
 */
function toDateOrUndefined(value) {
    if (!value)
        return undefined;
    var date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
}
/**
 * Convert a database deal record to UI-friendly DealData
 */
export function toDealData(record) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    // Ensure dates are properly converted from ISO strings
    var expiryDate = toDateOrUndefined(record.dealExpiry);
    var usedDate = toDateOrUndefined(record.usedAt);
    var dismissedDate = toDateOrUndefined(record.dismissedAt);
    var createdDate = (_a = toDateOrUndefined(record.createdAt)) !== null && _a !== void 0 ? _a : new Date();
    var status = getDealStatus({
        isActive: (_b = record.isActive) !== null && _b !== void 0 ? _b : true,
        dealExpiry: expiryDate,
        usedAt: usedDate,
        dismissedAt: dismissedDate,
    });
    return {
        id: record.id,
        title: record.dealTitle,
        brand: (_c = record.brandName) !== null && _c !== void 0 ? _c : '',
        description: (_d = record.dealDescription) !== null && _d !== void 0 ? _d : undefined,
        code: (_e = record.dealCode) !== null && _e !== void 0 ? _e : undefined,
        value: (_f = record.dealValue) !== null && _f !== void 0 ? _f : undefined,
        valueType: (_g = record.dealValueType) !== null && _g !== void 0 ? _g : undefined,
        expiry: expiryDate,
        isActive: (_h = record.isActive) !== null && _h !== void 0 ? _h : true,
        status: status,
        category: (_j = record.dealCategory) !== null && _j !== void 0 ? _j : undefined,
        link: (_k = record.dealLink) !== null && _k !== void 0 ? _k : undefined,
        minimumPurchase: (_l = record.minimumPurchase) !== null && _l !== void 0 ? _l : undefined,
        usedAt: usedDate,
        dismissedAt: dismissedDate,
        createdAt: createdDate,
        emailId: record.emailId,
    };
}
/**
 * Convert multiple deal records to DealData array
 */
export function toDealDataList(records) {
    return records.map(toDealData);
}
/**
 * Client-side filter for deals (useful after fetching all deals)
 */
export function filterDeals(deals, options) {
    var filtered = __spreadArray([], deals, true);
    // Status filter - apply first if specified
    if (options.status && options.status !== 'all') {
        filtered = filtered.filter(function (d) { return d.status === options.status; });
    }
    else {
        // Only apply exclusion filters when not filtering by specific status
        // Exclude dismissed by default (unless status is 'dismissed' or 'all')
        if (options.excludeDismissed !== false && options.status !== 'dismissed') {
            filtered = filtered.filter(function (d) { return d.status !== 'dismissed'; });
        }
        // Exclude used by default (unless status is 'used' or 'all')
        if (options.excludeUsed !== false && options.status !== 'used') {
            filtered = filtered.filter(function (d) { return d.status !== 'used'; });
        }
    }
    // Category filter
    if (options.category && options.category !== 'all') {
        filtered = filtered.filter(function (d) { return d.category === options.category; });
    }
    // Brand filter
    if (options.brand && options.brand !== 'all') {
        filtered = filtered.filter(function (d) { return d.brand === options.brand; });
    }
    return filtered;
}
/**
 * Sort deals by specified option
 */
export function sortDeals(deals, sortBy) {
    var sorted = __spreadArray([], deals, true);
    switch (sortBy) {
        case 'expiry_asc':
            return sorted.sort(function (a, b) {
                if (!a.expiry && !b.expiry)
                    return 0;
                if (!a.expiry)
                    return 1;
                if (!b.expiry)
                    return -1;
                return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
            });
        case 'expiry_desc':
            return sorted.sort(function (a, b) {
                if (!a.expiry && !b.expiry)
                    return 0;
                if (!a.expiry)
                    return 1;
                if (!b.expiry)
                    return -1;
                return new Date(b.expiry).getTime() - new Date(a.expiry).getTime();
            });
        case 'created_asc':
            return sorted.sort(function (a, b) { return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); });
        case 'created_desc':
            return sorted.sort(function (a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
        default:
            return sorted;
    }
}
/**
 * Extract unique categories from deals list
 */
export function extractCategories(deals) {
    var categories = new Set();
    deals.forEach(function (deal) {
        if (deal.category)
            categories.add(deal.category);
    });
    return Array.from(categories).sort();
}
/**
 * Extract unique brands from deals list
 */
export function extractBrands(deals) {
    var brands = new Set();
    deals.forEach(function (deal) {
        if (deal.brand)
            brands.add(deal.brand);
    });
    return Array.from(brands).sort();
}
/**
 * Group deals by status
 */
export function groupDealsByStatus(deals) {
    return {
        active: deals.filter(function (d) { return d.status === 'active'; }),
        expired: deals.filter(function (d) { return d.status === 'expired'; }),
        used: deals.filter(function (d) { return d.status === 'used'; }),
        dismissed: deals.filter(function (d) { return d.status === 'dismissed'; }),
    };
}
// ============================================================================
// Formatting Utilities
// ============================================================================
/**
 * Format expiry date for display
 */
export function formatExpiryDate(expiry) {
    if (!expiry)
        return '';
    var now = new Date();
    var expiryDate = new Date(expiry);
    var diffMs = expiryDate.getTime() - now.getTime();
    var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
        return "Expired ".concat(Math.abs(diffDays), " days ago");
    }
    if (diffDays === 0) {
        return 'Expires today';
    }
    if (diffDays === 1) {
        return 'Expires tomorrow';
    }
    if (diffDays <= 7) {
        return "Expires in ".concat(diffDays, " days");
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
export function formatDealValue(value, valueType) {
    if (!value)
        return '';
    switch (valueType) {
        case 'percentage':
            return "".concat(value, "% off");
        case 'fixed_amount':
            return "$".concat(value, " off");
        default:
            return value;
    }
}
