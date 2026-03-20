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
 * SearchBar component following TuskerBrain design system.
 */
export function SearchBar(_a) {
    var _b = _a.placeholder, placeholder = _b === void 0 ? 'Search...' : _b, onSearch = _a.onSearch, _c = _a.className, className = _c === void 0 ? '' : _c, props = __rest(_a, ["placeholder", "onSearch", "className"]);
    return (_jsxs("div", { className: "relative ".concat(className), children: [_jsx("svg", { className: "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" }) }), _jsx("input", __assign({ type: "text", placeholder: placeholder, className: "\n          w-full h-10 pl-10 pr-4\n          bg-white rounded-full\n          border border-transparent\n          text-sm text-text-primary placeholder:text-text-subtle\n          shadow-sm\n          focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent\n          transition-all duration-200\n        ", onChange: function (e) { return onSearch === null || onSearch === void 0 ? void 0 : onSearch(e.target.value); } }, props))] }));
}
