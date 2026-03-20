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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Button component following TuskerBrain Design System.
 * Variants: primary (teal), ghost (transparent with border)
 */
export function Button(_a) {
    var _b = _a.variant, variant = _b === void 0 ? 'primary' : _b, _c = _a.size, size = _c === void 0 ? 'md' : _c, children = _a.children, _d = _a.className, className = _d === void 0 ? '' : _d, disabled = _a.disabled, props = __rest(_a, ["variant", "size", "children", "className", "disabled"]);
    var baseStyles = 'inline-flex items-center justify-center font-semibold rounded-[10px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
    var variants = {
        primary: 'bg-brand text-white shadow-button hover:bg-brand-600 active:bg-brand-700 border border-brand-600',
        ghost: 'bg-white/60 text-text-primary border border-border hover:bg-surface-hover active:bg-surface-muted',
    };
    var sizes = {
        sm: 'px-3 py-1.5 text-xs gap-1.5',
        md: 'px-3.5 py-2.5 text-[13px] gap-2',
        lg: 'px-4 py-3 text-sm gap-2',
    };
    return (_jsx("button", __assign({ className: "".concat(baseStyles, " ").concat(variants[variant], " ").concat(sizes[size], " ").concat(className), disabled: disabled }, props, { children: children })));
}
