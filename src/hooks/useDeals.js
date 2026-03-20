var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { useState, useEffect, useCallback, useMemo } from 'react';
import { filterDeals, sortDeals, extractCategories, extractBrands, groupDealsByStatus, toDealDataList, } from '../../database/deals';
/**
 * Custom hook for fetching and managing deals data from the database.
 *
 * Features:
 * - Fetches deals from the database via IPC
 * - Provides filtered and sorted data
 * - Handles loading and error states
 * - Provides actions for marking deals as used/dismissed
 *
 * @param options - Hook configuration options
 * @returns Deals state and actions
 */
export function useDeals(options) {
    var _this = this;
    if (options === void 0) { options = {}; }
    var _a = options.autoFetch, autoFetch = _a === void 0 ? true : _a, initialFilters = options.initialFilters, _b = options.sortBy, sortBy = _b === void 0 ? 'expiry_asc' : _b, _c = options.pageSize, pageSize = _c === void 0 ? 50 : _c;
    var _d = useState([]), rawDeals = _d[0], setRawDeals = _d[1];
    var _e = useState(autoFetch), isLoading = _e[0], setIsLoading = _e[1];
    var _f = useState(null), error = _f[0], setError = _f[1];
    var _g = useState(0), totalCount = _g[0], setTotalCount = _g[1];
    var _h = useState(true), hasMore = _h[0], setHasMore = _h[1];
    // Debug: Track rawDeals changes
    useEffect(function () {
        console.log('[useDeals] rawDeals changed, count:', rawDeals.length);
        console.log('[useDeals] rawDeals statuses:', rawDeals.map(function (d) { return ({ id: d.id.slice(0, 8), status: d.status }); }));
    }, [rawDeals]);
    /**
     * Fetch deals from the database
     */
    var fetchDeals = useCallback(function () { return __awaiter(_this, void 0, void 0, function () {
        var response, deals, mockDeals, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setIsLoading(true);
                    setError(null);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 6, 7, 8]);
                    if (!(typeof window !== 'undefined' && 'electronAPI' in window)) return [3 /*break*/, 3];
                    return [4 /*yield*/, window.electronAPI.listDeals()];
                case 2:
                    response = _a.sent();
                    if (response.success && response.data) {
                        deals = toDealDataList(response.data.deals);
                        setRawDeals(deals);
                    }
                    else {
                        throw new Error(response.error || 'Failed to fetch deals');
                    }
                    return [3 /*break*/, 5];
                case 3: 
                // Development/preview environment - use mock data
                // This simulates a delay to show loading states
                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 300); })];
                case 4:
                    // Development/preview environment - use mock data
                    // This simulates a delay to show loading states
                    _a.sent();
                    mockDeals = getMockDeals();
                    setRawDeals(mockDeals);
                    _a.label = 5;
                case 5: return [3 /*break*/, 8];
                case 6:
                    err_1 = _a.sent();
                    setError(err_1 instanceof Error ? err_1.message : 'Failed to load deals');
                    console.error('Failed to fetch deals:', err_1);
                    return [3 /*break*/, 8];
                case 7:
                    setIsLoading(false);
                    return [7 /*endfinally*/];
                case 8: return [2 /*return*/];
            }
        });
    }); }, []);
    /**
     * Mark a deal as used
     */
    var markAsUsed = useCallback(function (dealId) { return __awaiter(_this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[useDeals] markAsUsed called with dealId:', dealId);
                    // Optimistically update local state
                    setRawDeals(function (prev) {
                        console.log('[useDeals] Previous rawDeals count:', prev.length);
                        var updated = prev.map(function (deal) {
                            if (deal.id === dealId) {
                                console.log('[useDeals] Found deal to update:', deal.title, 'current status:', deal.status);
                                return __assign(__assign({}, deal), { usedAt: new Date(), status: 'used' });
                            }
                            return deal;
                        });
                        console.log('[useDeals] Updated deal status to used');
                        return updated;
                    });
                    if (!(typeof window !== 'undefined' && 'electronAPI' in window)) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, window.electronAPI.markDealAsUsed(dealId)];
                case 2:
                    _a.sent();
                    console.log('[useDeals] IPC call succeeded');
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error('[useDeals] IPC call failed, rolling back:', error_1);
                    // Rollback on failure
                    setRawDeals(function (prev) {
                        return prev.map(function (deal) {
                            return deal.id === dealId ? __assign(__assign({}, deal), { usedAt: undefined, status: 'active' }) : deal;
                        });
                    });
                    throw error_1;
                case 4: return [3 /*break*/, 6];
                case 5:
                    console.log('[useDeals] No electronAPI - running in dev mode');
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); }, []);
    /**
     * Dismiss a deal
     */
    var dismiss = useCallback(function (dealId) { return __awaiter(_this, void 0, void 0, function () {
        var error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[useDeals] dismiss called with dealId:', dealId);
                    // Optimistically update local state
                    setRawDeals(function (prev) {
                        console.log('[useDeals] dismiss - Previous rawDeals count:', prev.length);
                        var updated = prev.map(function (deal) {
                            if (deal.id === dealId) {
                                console.log('[useDeals] dismiss - Found deal to update:', deal.title, 'current status:', deal.status);
                                return __assign(__assign({}, deal), { dismissedAt: new Date(), status: 'dismissed' });
                            }
                            return deal;
                        });
                        console.log('[useDeals] dismiss - Updated deal status to dismissed');
                        return updated;
                    });
                    if (!(typeof window !== 'undefined' && 'electronAPI' in window)) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, window.electronAPI.dismissDeal(dealId)];
                case 2:
                    _a.sent();
                    console.log('[useDeals] dismiss - IPC call succeeded');
                    return [3 /*break*/, 4];
                case 3:
                    error_2 = _a.sent();
                    console.error('[useDeals] dismiss - IPC call failed, rolling back:', error_2);
                    // Rollback on failure
                    setRawDeals(function (prev) {
                        return prev.map(function (deal) {
                            return deal.id === dealId
                                ? __assign(__assign({}, deal), { dismissedAt: undefined, status: 'active' }) : deal;
                        });
                    });
                    throw error_2;
                case 4: return [3 /*break*/, 6];
                case 5:
                    console.log('[useDeals] dismiss - No electronAPI - running in dev mode');
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); }, []);
    /**
     * Undo mark as used
     */
    var undoMarkUsed = useCallback(function (dealId) { return __awaiter(_this, void 0, void 0, function () {
        var error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[useDeals] undoMarkUsed called with dealId:', dealId);
                    // Optimistically update local state
                    setRawDeals(function (prev) {
                        console.log('[useDeals] undoMarkUsed - Previous rawDeals count:', prev.length);
                        var updated = prev.map(function (deal) {
                            if (deal.id === dealId) {
                                console.log('[useDeals] undoMarkUsed - Found deal to update:', deal.title, 'current status:', deal.status);
                                return __assign(__assign({}, deal), { usedAt: undefined, status: 'active' });
                            }
                            return deal;
                        });
                        console.log('[useDeals] undoMarkUsed - Updated deal status to active');
                        return updated;
                    });
                    if (!(typeof window !== 'undefined' && 'electronAPI' in window)) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, window.electronAPI.undoMarkDealAsUsed(dealId)];
                case 2:
                    _a.sent();
                    console.log('[useDeals] undoMarkUsed - IPC call succeeded');
                    return [3 /*break*/, 4];
                case 3:
                    error_3 = _a.sent();
                    console.error('[useDeals] undoMarkUsed - IPC call failed, rolling back:', error_3);
                    // Rollback on failure - restore used status
                    setRawDeals(function (prev) {
                        return prev.map(function (deal) {
                            return deal.id === dealId ? __assign(__assign({}, deal), { usedAt: new Date(), status: 'used' }) : deal;
                        });
                    });
                    throw error_3;
                case 4: return [3 /*break*/, 6];
                case 5:
                    console.log('[useDeals] undoMarkUsed - No electronAPI - running in dev mode');
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); }, []);
    /**
     * Undo dismiss
     */
    var undoDismiss = useCallback(function (dealId) { return __awaiter(_this, void 0, void 0, function () {
        var error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[useDeals] undoDismiss called with dealId:', dealId);
                    // Optimistically update local state
                    setRawDeals(function (prev) {
                        console.log('[useDeals] undoDismiss - Previous rawDeals count:', prev.length);
                        var updated = prev.map(function (deal) {
                            if (deal.id === dealId) {
                                console.log('[useDeals] undoDismiss - Found deal to update:', deal.title, 'current status:', deal.status);
                                return __assign(__assign({}, deal), { dismissedAt: undefined, status: 'active' });
                            }
                            return deal;
                        });
                        console.log('[useDeals] undoDismiss - Updated deal status to active');
                        return updated;
                    });
                    if (!(typeof window !== 'undefined' && 'electronAPI' in window)) return [3 /*break*/, 5];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, window.electronAPI.undoDismissDeal(dealId)];
                case 2:
                    _a.sent();
                    console.log('[useDeals] undoDismiss - IPC call succeeded');
                    return [3 /*break*/, 4];
                case 3:
                    error_4 = _a.sent();
                    console.error('[useDeals] undoDismiss - IPC call failed, rolling back:', error_4);
                    // Rollback on failure - restore dismissed status
                    setRawDeals(function (prev) {
                        return prev.map(function (deal) {
                            return deal.id === dealId
                                ? __assign(__assign({}, deal), { dismissedAt: new Date(), status: 'dismissed' }) : deal;
                        });
                    });
                    throw error_4;
                case 4: return [3 /*break*/, 6];
                case 5:
                    console.log('[useDeals] undoDismiss - No electronAPI - running in dev mode');
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    }); }, []);
    /**
     * Copy promo code to clipboard
     */
    var copyCode = useCallback(function (code) {
        navigator.clipboard.writeText(code);
    }, []);
    // Fetch on mount if autoFetch is enabled
    useEffect(function () {
        if (autoFetch) {
            fetchDeals();
        }
    }, [autoFetch, fetchDeals]);
    // Compute derived state
    var filteredDeals = useMemo(function () {
        console.log('[useDeals] Computing filteredDeals, rawDeals count:', rawDeals.length);
        console.log('[useDeals] rawDeals statuses:', rawDeals.map(function (d) { return ({ id: d.id.slice(0, 8), status: d.status }); }));
        console.log('[useDeals] rawDeals full objects:', rawDeals.map(function (d) { return ({ id: d.id, title: d.title, status: d.status, usedAt: d.usedAt, dismissedAt: d.dismissedAt }); }));
        var deals = rawDeals;
        if (initialFilters) {
            console.log('[useDeals] Applying initialFilters:', initialFilters);
            deals = filterDeals(deals, initialFilters);
            console.log('[useDeals] After filtering:', deals.length, 'deals');
        }
        var result = sortDeals(deals, sortBy);
        console.log('[useDeals] filteredDeals result:', result.map(function (d) { return ({ id: d.id.slice(0, 8), title: d.title.slice(0, 20), status: d.status }); }));
        return result;
    }, [rawDeals, initialFilters, sortBy]);
    var _j = useMemo(function () { return groupDealsByStatus(filteredDeals); }, [filteredDeals]), activeDeals = _j.active, expiredDeals = _j.expired;
    var categories = useMemo(function () { return extractCategories(rawDeals); }, [rawDeals]);
    var brands = useMemo(function () { return extractBrands(rawDeals); }, [rawDeals]);
    return {
        // State
        deals: filteredDeals,
        activeDeals: activeDeals,
        expiredDeals: expiredDeals,
        categories: categories,
        brands: brands,
        isLoading: isLoading,
        error: error,
        totalCount: rawDeals.length,
        activeCount: activeDeals.length,
        expiredCount: expiredDeals.length,
        // Actions
        refresh: fetchDeals,
        markAsUsed: markAsUsed,
        dismiss: dismiss,
        undoMarkUsed: undoMarkUsed,
        undoDismiss: undoDismiss,
        copyCode: copyCode,
    };
}
/**
 * Mock deals data for development/preview
 */
function getMockDeals() {
    var now = new Date();
    var in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    var in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    var in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    var in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    var yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    var lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return [
        {
            id: 'deal-1',
            title: '50% Off Electronics',
            brand: 'Amazon',
            description: 'Save big on electronics today only!',
            code: 'SAVE50',
            value: '50',
            valueType: 'percentage',
            expiry: in3Days,
            isActive: true,
            status: 'active',
            category: 'Electronics',
            minimumPurchase: '$100',
            createdAt: now,
            emailId: 'email-1',
        },
        {
            id: 'deal-2',
            title: 'Free Shipping on Orders $50+',
            brand: 'Target',
            code: 'FREESHIP',
            expiry: in14Days,
            isActive: true,
            status: 'active',
            category: 'General',
            minimumPurchase: '$50',
            createdAt: now,
            emailId: 'email-2',
        },
        {
            id: 'deal-3',
            title: '$20 Off Your Order',
            brand: 'Best Buy',
            code: 'SAVE20',
            value: '20',
            valueType: 'fixed_amount',
            expiry: in7Days,
            isActive: true,
            status: 'active',
            category: 'Electronics',
            minimumPurchase: '$100',
            createdAt: now,
            emailId: 'email-3',
        },
        {
            id: 'deal-4',
            title: '30% Off Fashion Items',
            brand: 'Nordstrom',
            code: 'FASHION30',
            value: '30',
            valueType: 'percentage',
            expiry: in30Days,
            isActive: true,
            status: 'active',
            category: 'Fashion',
            createdAt: now,
            emailId: 'email-4',
        },
        {
            id: 'deal-5',
            title: 'Free Month Apple Music',
            brand: 'Apple',
            code: 'APPLEMUSIC',
            expiry: in7Days,
            isActive: true,
            status: 'active',
            category: 'Entertainment',
            createdAt: now,
            emailId: 'email-5',
        },
        {
            id: 'deal-6',
            title: 'BOGO Pizza Special',
            brand: 'Dominos',
            code: 'BOGO2024',
            expiry: yesterday,
            isActive: false,
            status: 'expired',
            category: 'Food',
            createdAt: lastWeek,
            emailId: 'email-6',
        },
        {
            id: 'deal-7',
            title: 'Flash Sale - 40% Off',
            brand: 'Walmart',
            code: 'FLASH40',
            value: '40',
            valueType: 'percentage',
            expiry: lastWeek,
            isActive: false,
            status: 'expired',
            category: 'General',
            createdAt: lastWeek,
            emailId: 'email-7',
        },
        {
            id: 'deal-8',
            title: 'Member Exclusive: $50 Off',
            brand: 'Costco',
            code: 'MEMBER50',
            value: '50',
            valueType: 'fixed_amount',
            expiry: in30Days,
            isActive: true,
            status: 'active',
            category: 'General',
            minimumPurchase: '$200',
            createdAt: now,
            emailId: 'email-8',
        },
        {
            id: 'deal-9',
            title: 'New User: 25% Off First Order',
            brand: 'Uber Eats',
            code: 'NEWUSER25',
            value: '25',
            valueType: 'percentage',
            expiry: in14Days,
            isActive: true,
            status: 'active',
            category: 'Food',
            createdAt: now,
            emailId: 'email-9',
        },
        {
            id: 'deal-10',
            title: 'Travel Deal: $100 Off Flights',
            brand: 'Expedia',
            code: 'FLY100',
            value: '100',
            valueType: 'fixed_amount',
            expiry: in30Days,
            isActive: true,
            status: 'active',
            category: 'Travel',
            minimumPurchase: '$500',
            createdAt: now,
            emailId: 'email-10',
        },
    ];
}
export default useDeals;
