// @ts-nocheck
/**
 * LLM Configuration for TuskerBrain
 *
 * This module provides centralized configuration for LLM API access.
 * It supports both environment variables and a .env.llm config file.
 *
 * Configuration Priority:
 * 1. Environment variables (highest priority)
 * 2. .env.llm file in project root
 * 3. Default values (lowest priority)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

export interface LLMConfig {
  /** API authentication token */
  authToken: string;
  /** Base URL for API requests */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Default model for Haiku-level tasks (fast, cheap) */
  defaultHaikuModel: string;
  /** Default model for Sonnet-level tasks (balanced) */
  defaultSonnetModel: string;
  /** Default model for Opus-level tasks (most capable) */
  defaultOpusModel: string;
}

// Default configuration values
const DEFAULT_CONFIG: Omit<LLMConfig, 'authToken'> = {
  baseUrl: 'https://api.anthropic.com',
  timeoutMs: 300000, // 5 minutes default
  defaultHaikuModel: 'claude-haiku-4-5-20251001',
  defaultSonnetModel: 'claude-sonnet-4-6',
  defaultOpusModel: 'claude-opus-4-6',
};

// ZAI API configuration for GLM coding plan (Anthropic-compatible)
const ZAI_GLM_CONFIG: Omit<LLMConfig, 'authToken'> = {
  baseUrl: 'https://api.z.ai/api/anthropic',
  timeoutMs: 3000000, // 50 minutes for long-running operations
  defaultHaikuModel: 'glm-4.5-air',
  defaultSonnetModel: 'glm-4.7',
  defaultOpusModel: 'glm-5',
};

/**
 * Load configuration from .env.llm file
 */
function loadEnvFile(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../../.env.llm');
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn('Failed to load .env.llm file:', result.error.message);
      return {};
    }
    return result.parsed || {};
  }
  return {};
}

/**
 * Get a configuration value from environment or config file
 */
function getConfigValue(
  envKey: string,
  configValue: string | undefined,
  defaultValue: string
): string {
  // First check process.env (highest priority)
  if (process.env[envKey]) {
    return process.env[envKey]!;
  }
  // Then use config file value
  if (configValue) {
    return configValue;
  }
  // Fall back to default
  return defaultValue;
}

/**
 * Get the LLM configuration
 *
 * This function loads configuration from:
 * 1. Environment variables (for production/secrets)
 * 2. .env.llm file (for local development)
 * 3. Default values
 *
 * To use the ZAI API with GLM coding plan:
 * 1. Copy .env.llm.example to .env.llm
 * 2. Add your API key to ANTHROPIC_AUTH_TOKEN
 */
export function getLLMConfig(): LLMConfig {
  const envConfig = loadEnvFile();

  // Detect if using ZAI API based on base URL
  const baseUrl = getConfigValue(
    'ANTHROPIC_BASE_URL',
    envConfig['ANTHROPIC_BASE_URL'],
    DEFAULT_CONFIG.baseUrl
  );

  const isZaiApi = baseUrl.includes('api.z.ai');
  const baseDefaults = isZaiApi ? ZAI_GLM_CONFIG : DEFAULT_CONFIG;

  const authToken = getConfigValue(
    'ANTHROPIC_AUTH_TOKEN',
    envConfig['ANTHROPIC_AUTH_TOKEN'],
    ''
  );

  if (!authToken) {
    console.warn(
      'WARNING: ANTHROPIC_AUTH_TOKEN not set. LLM features will not work.'
    );
  }

  return {
    authToken,
    baseUrl,
    timeoutMs: parseInt(
      getConfigValue(
        'API_TIMEOUT_MS',
        envConfig['API_TIMEOUT_MS'],
        String(baseDefaults.timeoutMs)
      ),
      10
    ),
    defaultHaikuModel: getConfigValue(
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      envConfig['ANTHROPIC_DEFAULT_HAIKU_MODEL'],
      baseDefaults.defaultHaikuModel
    ),
    defaultSonnetModel: getConfigValue(
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      envConfig['ANTHROPIC_DEFAULT_SONNET_MODEL'],
      baseDefaults.defaultSonnetModel
    ),
    defaultOpusModel: getConfigValue(
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      envConfig['ANTHROPIC_DEFAULT_OPUS_MODEL'],
      baseDefaults.defaultOpusModel
    ),
  };
}

/**
 * Create an Anthropic SDK client with the configured settings
 */
export function createAnthropicClient(): import('@anthropic-ai/sdk').default {
  const config = getLLMConfig();

  // Dynamic import to avoid bundling issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Anthropic = require('@anthropic-ai/sdk').default;

  return new Anthropic({
    apiKey: config.authToken,
    baseURL: config.baseUrl,
    timeout: config.timeoutMs,
  });
}

// Export a singleton config for convenience
export const llmConfig = getLLMConfig();
