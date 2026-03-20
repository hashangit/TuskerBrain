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
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Card component with design system shadow and border.
 */
export function Card(_a) {
    var children = _a.children, _b = _a.className, className = _b === void 0 ? '' : _b, _c = _a.padding, padding = _c === void 0 ? 'md' : _c, _d = _a.hover, hover = _d === void 0 ? false : _d, props = __rest(_a, ["children", "className", "padding", "hover"]);
    var paddings = {
        none: '',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-5',
    };
    return (_jsx("div", __assign({ className: "\n        bg-white rounded-[14px] border border-border\n        shadow-card ".concat(hover ? 'hover:shadow-card-hover hover:border-border-muted' : '', "\n        transition-all duration-200\n        ").concat(paddings[padding], "\n        ").concat(className, "\n      ") }, props, { children: children })));
}
/**
 * Card header with title and optional action.
 */
export function CardHeader(_a) {
    var title = _a.title, subtitle = _a.subtitle, action = _a.action;
    return (_jsxs("div", { className: "flex items-start justify-between mb-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-display font-semibold text-text-primary", children: title }), subtitle && (_jsx("p", { className: "text-xs text-text-muted mt-0.5", children: subtitle }))] }), action] }));
}
