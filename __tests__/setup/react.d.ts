import '@testing-library/jest-dom';
import type { Assertion, AsymmetricMatchers } from 'vitest';

declare module 'vitest' {
  interface Assertion<T = any> extends AsymmetricMatchers {
    toBeInTheDocument(): Assertion<T>;
    toBeDisabled(): Assertion<T>;
    toBeEnabled(): Assertion<T>;
    toBeEmpty(): Assertion<T>;
    toBeEmptyDOMElement(): Assertion<T>;
    toBeInvalid(): Assertion<T>;
    toBeRequired(): Assertion<T>;
    toBeValid(): Assertion<T>;
    toBeVisible(): Assertion<T>;
    toContainElement(element: Element | null | undefined): Assertion<T>;
    toContainHTML(html: string): Assertion<T>;
    toHaveAccessibleDescription(description?: string | RegExp): Assertion<T>;
    toHaveAccessibleName(name?: string | RegExp): Assertion<T>;
    toHaveAttribute(attr: string, value?: string | RegExp): Assertion<T>;
    toHaveClass(...classNames: string[]): Assertion<T>;
    toHaveFocus(): Assertion<T>;
    toHaveFormValues(values: Record<string, unknown>): Assertion<T>;
    toHaveStyle(css: Record<string, unknown>): Assertion<T>;
    toHaveText(text: string | RegExp, options?: { normalizeWhitespace: boolean }): Assertion<T>;
    toHaveValue(value?: string | RegExp | number): Assertion<T>;
    toHaveDisplayValue(value?: string | RegExp | Array<string | RegExp>): Assertion<T>;
    toBeChecked(): Assertion<T>;
    toBePartiallyChecked(): Assertion<T>;
    toHaveErrorMessage(message?: string | RegExp): Assertion<T>;
    toHaveAccessibleErrorMessage(message?: string | RegExp): Assertion<T>;
    toBeInViewport(): Assertion<T>;
    toBeScrollable(): Assertion<T>;
    toBeSelected(): Assertion<T>;
  }
}
