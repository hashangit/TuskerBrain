import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * StatusBadge component for displaying status indicators.
 * Variants: success (teal), warning (amber), error (red)
 */
export function StatusBadge(_a) {
    var _b = _a.variant, variant = _b === void 0 ? 'success' : _b, children = _a.children, _c = _a.className, className = _c === void 0 ? '' : _c;
    var variants = {
        success: 'bg-brand-50 text-brand-700 border-brand-200',
        warning: 'bg-amber-50 text-amber-700 border-amber-200',
        error: 'bg-red-50 text-red-700 border-red-200',
        info: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    var dotColors = {
        success: 'bg-brand',
        warning: 'bg-amber-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
    };
    return (_jsxs("span", { className: "inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold rounded-full border ".concat(variants[variant], " ").concat(className), children: [_jsx("span", { className: "w-1.5 h-1.5 rounded-full ".concat(dotColors[variant]) }), children] }));
}
/**
 * Generic Badge component for labels and categories.
 */
export function Badge(_a) {
    var children = _a.children, _b = _a.className, className = _b === void 0 ? '' : _b, _c = _a.color, color = _c === void 0 ? 'default' : _c;
    var colors = {
        default: 'bg-surface-muted text-text-secondary border-border',
        orange: 'bg-amber-50 text-amber-700 border-amber-200',
        purple: 'bg-purple-50 text-purple-700 border-purple-200',
        teal: 'bg-brand-50 text-brand-700 border-brand-200',
    };
    return (_jsx("span", { className: "inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md border ".concat(colors[color], " ").concat(className), children: children }));
}
