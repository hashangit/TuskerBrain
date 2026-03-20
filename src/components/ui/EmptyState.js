import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from './Button';
/**
 * EmptyState component for displaying when no data is available.
 */
export function EmptyState(_a) {
    var icon = _a.icon, title = _a.title, description = _a.description, action = _a.action;
    return (_jsxs("div", { className: "flex flex-col items-center justify-center py-16 px-8", children: [icon && (_jsx("div", { className: "w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mb-4 text-text-muted", children: icon })), _jsx("h3", { className: "text-lg font-semibold text-text-primary mb-2", children: title }), description && (_jsx("p", { className: "text-sm text-text-muted text-center max-w-sm mb-6", children: description })), action && (_jsx(Button, { onClick: action.onClick, children: action.label }))] }));
}
