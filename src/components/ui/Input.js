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
 * Text input component following design system.
 */
export function Input(_a) {
    var label = _a.label, error = _a.error, icon = _a.icon, _b = _a.className, className = _b === void 0 ? '' : _b, props = __rest(_a, ["label", "error", "icon", "className"]);
    return (_jsxs("div", { className: "flex flex-col gap-1.5", children: [label && (_jsx("label", { className: "text-sm font-medium text-text-primary", children: label })), _jsxs("div", { className: "relative", children: [icon && (_jsx("span", { className: "absolute left-3 top-1/2 -translate-y-1/2 text-text-muted", children: icon })), _jsx("input", __assign({ className: "\n            w-full h-10 px-3 py-2 text-sm\n            bg-white rounded-lg border border-border\n            text-text-primary placeholder:text-text-subtle\n            focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent\n            transition-all duration-200\n            ".concat(icon ? 'pl-10' : '', "\n            ").concat(error ? 'border-red-300 focus:ring-red-500' : '', "\n            ").concat(className, "\n          ") }, props))] }), error && (_jsx("span", { className: "text-xs text-red-600", children: error }))] }));
}
/**
 * Select dropdown component.
 */
export function Select(_a) {
    var label = _a.label, options = _a.options, _b = _a.className, className = _b === void 0 ? '' : _b, props = __rest(_a, ["label", "options", "className"]);
    return (_jsxs("div", { className: "flex flex-col gap-1.5", children: [label && (_jsx("label", { className: "text-sm font-medium text-text-primary", children: label })), _jsx("select", __assign({ className: "\n          w-full h-10 px-3 py-2 text-sm\n          bg-white rounded-lg border border-border\n          text-text-primary\n          focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent\n          transition-all duration-200\n          appearance-none cursor-pointer\n          ".concat(className, "\n        ") }, props, { children: options.map(function (option) { return (_jsx("option", { value: option.value, children: option.label }, option.value)); }) }))] }));
}
/**
 * Textarea component.
 */
export function Textarea(_a) {
    var label = _a.label, error = _a.error, _b = _a.className, className = _b === void 0 ? '' : _b, props = __rest(_a, ["label", "error", "className"]);
    return (_jsxs("div", { className: "flex flex-col gap-1.5", children: [label && (_jsx("label", { className: "text-sm font-medium text-text-primary", children: label })), _jsx("textarea", __assign({ className: "\n          w-full px-3 py-2 text-sm\n          bg-white rounded-lg border border-border\n          text-text-primary placeholder:text-text-subtle\n          focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent\n          transition-all duration-200\n          resize-none\n          ".concat(error ? 'border-red-300 focus:ring-red-500' : '', "\n          ").concat(className, "\n        ") }, props)), error && (_jsx("span", { className: "text-xs text-red-600", children: error }))] }));
}
/**
 * Toggle switch component.
 */
export function Toggle(_a) {
    var label = _a.label, checked = _a.checked, onChange = _a.onChange, description = _a.description;
    return (_jsxs("label", { className: "flex items-center justify-between cursor-pointer group", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-medium text-text-primary group-hover:text-brand", children: label }), description && (_jsx("p", { className: "text-xs text-text-muted mt-0.5", children: description }))] }), _jsx("button", { type: "button", role: "switch", "aria-checked": checked, onClick: function () { return onChange(!checked); }, className: "\n          relative w-11 h-6 rounded-full transition-colors duration-200\n          ".concat(checked ? 'bg-brand' : 'bg-border', "\n        "), children: _jsx("span", { className: "\n            absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm\n            transition-transform duration-200\n            ".concat(checked ? 'left-6' : 'left-1', "\n          ") }) })] }));
}
