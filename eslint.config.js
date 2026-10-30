import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Layered architecture zones (UI -> Transport -> Domain -> Capabilities -> Vendors,
 * with Foundations importable by all and importing from no one):
 *
 *   src/**          (UI)            may import: @/*, @foundations/*
 *   electron/**     (Transport)     may import: @domain/*, @capabilities/*, @foundations/*, electron
 *   domain/**                       may import: @capabilities/*, @foundations/*, @langchain/* (declarative workflow DSL)
 *   capabilities/**                 may import: @vendors/*, @foundations/* (and sibling @capabilities/*)
 *   vendors/**                      may import: @foundations/* (types only) + its raw SDK
 *   foundations/**                  imports from no one (single exception: foundations/database -> @vendors/libsql)
 *
 * Violations below fail lint via no-restricted-imports. Probe them with:
 *   pnpm test:boundaries
 */

// Shared vendor SDK specifiers that must only appear inside vendors/.
const VENDOR_SDKS = ['/googleapis', '@ai-sdk/*', '/ai', '/@libsql/client'];

// Foundation ban: foundations import from no one. Overridden narrowly for
// foundations/database/** (see below) which may import @vendors/libsql.
const FOUNDATIONS_BAN = {
  '@/*': 'foundations must not import the UI layer (src) — UI depends on foundations, never the reverse',
  '/electron': 'foundations must not import the electron transport layer',
  '../electron': 'foundations must not import the electron transport layer',
  '../src': 'foundations must not import the UI layer via relative paths',
  '../src/*': 'foundations must not import the UI layer via relative paths',
  '@domain': 'foundations must not import the domain layer (upward import)',
  '@domain/*': 'foundations must not import the domain layer (upward import)',
  '../domain': 'foundations must not import the domain layer via relative paths',
  '../domain/*': 'foundations must not import the domain layer via relative paths',
  '@capabilities': 'foundations must not import the capabilities layer (upward import)',
  '@capabilities/*': 'foundations must not import the capabilities layer (upward import)',
  '../capabilities': 'foundations must not import the capabilities layer via relative paths',
  '../capabilities/*': 'foundations must not import the capabilities layer via relative paths',
  '@vendors/*': 'foundations must not import vendors directly (single sanctioned exception: foundations/database -> @vendors/libsql)',
  '../vendors': 'foundations must not import vendors via relative paths',
  '../vendors/*': 'foundations must not import vendors via relative paths',
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'dist-electron/**', 'node_modules/**', '*.config.js', '*.config.ts'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // ------------------------------------------------------------------
  // Zone: src/** (UI layer)
  // ------------------------------------------------------------------
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@domain', '@domain/*', '../domain', '../domain/*'], message: 'UI must not import the domain layer — go through the transport (window.electronAPI) or @foundations.' },
          { group: ['@capabilities', '@capabilities/*', '../capabilities', '../capabilities/*'], message: 'UI must not import the capabilities layer — go through the transport (window.electronAPI) or @foundations.' },
          { group: ['@vendors', '@vendors/*', '../vendors', '../vendors/*'], message: 'UI must not import vendors.' },
          { group: ['/electron', '../electron', '../electron/*'], message: 'UI must not import the electron main/preload process code — use the IPC contracts in @foundations/contracts.' },
          { group: VENDOR_SDKS, message: 'UI must not import vendor SDKs directly.' },
          { group: ['@langchain/*'], message: 'UI must not import langchain.' },
          { group: ['/drizzle-orm', '/drizzle-orm/*'], message: 'UI must not import the ORM — use repositories/IPC.' },
        ],
      }],
    },
  },

  // ------------------------------------------------------------------
  // Zone: domain/**
  // ------------------------------------------------------------------
  {
    files: ['domain/**/*.ts', 'domain/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/*', '../src', '../src/*'], message: 'domain must not import the UI layer (src).' },
          { group: ['/electron', '../electron', '../electron/*'], message: 'domain must not import the electron transport layer — the transport imports domain, never the reverse.' },
          { group: ['@vendors', '@vendors/*', '../vendors', '../vendors/*'], message: 'domain must use capabilities, not vendors.' },
          { group: VENDOR_SDKS, message: 'domain must not import vendor SDKs directly — go through @capabilities.' },
          { group: ['/drizzle-orm', '/drizzle-orm/*'], message: 'domain must not use the ORM directly — use foundations/persistence repositories.' },
          // NOTE: @langchain/* is the sanctioned declarative DSL for domain workflows.
        ],
      }],
    },
  },

  // ------------------------------------------------------------------
  // Zone: capabilities/**
  // ------------------------------------------------------------------
  {
    files: ['capabilities/**/*.ts', 'capabilities/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/*', '../src', '../src/*'], message: 'capabilities must not import the UI layer (src).' },
          { group: ['/electron', '../electron', '../electron/*'], message: 'capabilities must not import the electron transport layer — platform capabilities are injected from the composition root.' },
          { group: ['@domain', '@domain/*', '../domain', '../domain/*'], message: 'capabilities must not import the domain layer (upward import).' },
          { group: VENDOR_SDKS, message: 'capabilities must not import vendor SDKs directly — go through @vendors.' },
        ],
      }],
    },
  },

  // ------------------------------------------------------------------
  // Zone: vendors/**
  // ------------------------------------------------------------------
  {
    files: ['vendors/**/*.ts', 'vendors/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/*', '../src', '../src/*'], message: 'vendors must not import the UI layer (src).' },
          { group: ['/electron', '../electron', '../electron/*'], message: 'vendors must not import the electron transport layer.' },
          { group: ['@domain', '@domain/*', '../domain', '../domain/*'], message: 'vendors must not import the domain layer.' },
          { group: ['@capabilities', '@capabilities/*', '../capabilities', '../capabilities/*'], message: 'vendors must not import the capabilities layer.' },
        ],
      }],
    },
  },

  // ------------------------------------------------------------------
  // Zone: foundations/** (imports from no one; single sanctioned vendor edge)
  // ------------------------------------------------------------------
  {
    files: ['foundations/**/*.ts', 'foundations/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: Object.entries(FOUNDATIONS_BAN).map(([group, message]) => ({ group: [group], message })) }],
    },
  },
  {
    // Narrow exception: foundations/database may import @vendors/libsql
    // (raw driver access lives in vendors/libsql; this is the one
    // foundations -> vendors edge, mirroring foundations/database -> vendors/drizzle).
    files: ['foundations/database/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: Object.entries(FOUNDATIONS_BAN)
          .map(([group, message]) => ({ group: [group], message }))
          .filter(({ group }) => group[0] !== '@vendors/*' && group[0] !== '../vendors' && group[0] !== '../vendors/*')
          .concat([
            { group: ['@vendors/ai-sdk', '@vendors/ai-sdk/*', '../vendors/ai-sdk', '../vendors/ai-sdk/*'], message: 'foundations/database may only import @vendors/libsql from the vendors layer.' },
            { group: ['@vendors/googleapis', '@vendors/googleapis/*', '../vendors/googleapis', '../vendors/googleapis/*'], message: 'foundations/database may only import @vendors/libsql from the vendors layer.' },
          ]),
      }],
    },
  },

  // ------------------------------------------------------------------
  // Zone: electron/** (Transport + composition root)
  // ------------------------------------------------------------------
  {
    files: ['electron/**/*.ts', 'electron/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: VENDOR_SDKS, message: 'transport must not import vendor SDKs — go through @domain/@capabilities/@vendors.' },
          { group: ['@langchain/*'], message: 'transport must not import langchain — workflow DSL stays in the domain layer.' },
        ],
      }],
    },
  }
);
