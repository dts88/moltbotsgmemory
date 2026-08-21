#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..');
export const PLATTS_CONFIG_FILE = join(WORKSPACE, '.config/spglobal/credentials.json');

const API_BASE = 'https://api.platts.com';
const PASSWORD_SCOPE = 'openid profile api plapi offline_access';
const PASSWORD_CLIENT_ID = 'PL_API_PLATFORM';
const PASSWORD_FALLBACK_MIN_INTERVAL_MS = 60 * 60 * 1000;
const PASSWORD_FALLBACK_COOLDOWN_AFTER_FAILURES = 2;
const PASSWORD_FALLBACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;

const REFRESH_ENDPOINTS = [
  {
    name: 'Platts Auth Token (no client_id)',
    url: `${API_BASE}/auth/api/token`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (refreshToken) => new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  },
  {
    name: 'Okta OAuth2 (no client_id)',
    url: 'https://secure.signin.spglobal.com/oauth2/spglobal/v1/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    buildBody: (refreshToken) => new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString()
  },
  {
    name: 'Platts Auth API (JSON)',
    url: `${API_BASE}/auth/api/refresh`,
    headers: { 'Content-Type': 'application/json' },
    buildBody: (refreshToken) => JSON.stringify({ refresh_token: refreshToken })
  }
];

const PASSWORD_ENDPOINTS = [
  {
    name: 'TokenGeneration /auth/api',
    url: `${API_BASE}/auth/api`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'moltbot/1.0'
    },
    buildBody: (username, password) => new URLSearchParams({
      username,
      password
    }).toString()
  },
  {
    name: 'Okta OAuth2 password grant',
    url: 'https://secure.signin.spglobal.com/oauth2/spglobal/v1/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    buildBody: (username, password) => new URLSearchParams({
      grant_type: 'password',
      username,
      password,
      scope: PASSWORD_SCOPE,
      client_id: PASSWORD_CLIENT_ID
    }).toString()
  }
];

export function loadPlattsConfig() {
  if (!existsSync(PLATTS_CONFIG_FILE)) {
    throw new Error('Platts credentials not found');
  }

  try {
    return JSON.parse(readFileSync(PLATTS_CONFIG_FILE, 'utf8'));
  } catch (e) {
    const raw = readFileSync(PLATTS_CONFIG_FILE, 'utf8').trim();
    if (raw.startsWith('ey')) {
      return {
        token_type: 'Bearer',
        access_token: raw
      };
    }
    throw e;
  }
}

export function savePlattsConfig(config) {
  const dir = dirname(PLATTS_CONFIG_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(PLATTS_CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getPlattsCredentialEnv() {
  return {
    username: process.env.Platts_ACCOUNT || process.env.PLATTS_ACCOUNT || '',
    password: process.env.Platts_PASSWORD || process.env.PLATTS_PASSWORD || ''
  };
}

export function getTokenExpiry(config = {}) {
  if (config.expires_at) {
    return new Date(config.expires_at).getTime();
  }
  if (config.token_updated_at) {
    const updatedAt = new Date(config.token_updated_at).getTime();
    const expiresIn = Number(config.expires_in || 3600) * 1000;
    return updatedAt + expiresIn;
  }
  if (config.updated_at) {
    const updatedAt = new Date(config.updated_at).getTime();
    const expiresIn = Number(config.expires_in || 3600) * 1000;
    return updatedAt + expiresIn;
  }
  return 0;
}

export function isPlattsTokenExpired(config = {}, skewMs = 0) {
  const expiresAt = getTokenExpiry(config);
  return !expiresAt || (Date.now() + skewMs) >= expiresAt;
}

export function plattsTokenNeedsRefresh(config = {}, thresholdMs = 10 * 60 * 1000) {
  const expiresAt = getTokenExpiry(config);
  if (!config.access_token || !expiresAt) return true;
  return (expiresAt - Date.now()) < thresholdMs;
}

function getPasswordFallbackState(config = {}) {
  return config.password_fallback_guard || {};
}

function withPasswordFallbackState(config = {}, state = {}) {
  return {
    ...config,
    password_fallback_guard: state
  };
}

function buildPasswordFallbackBlockedError(message, details = []) {
  const error = new Error(message);
  error.code = 'PLATTS_PASSWORD_FALLBACK_BLOCKED';
  error.details = details;
  return error;
}

function assertPasswordFallbackAllowed(config = {}, quiet = false) {
  const state = getPasswordFallbackState(config);
  const now = Date.now();

  if (state.cooldown_until) {
    const cooldownUntilMs = new Date(state.cooldown_until).getTime();
    if (Number.isFinite(cooldownUntilMs) && now < cooldownUntilMs) {
      const until = new Date(cooldownUntilMs).toISOString();
      throw buildPasswordFallbackBlockedError(
        `Platts password fallback is in cooldown until ${until}`,
        [`连续两次密码兜底失败后已进入冷却期，暂停再次尝试直到 ${until}`]
      );
    }
  }

  if (state.last_attempt_at) {
    const lastAttemptMs = new Date(state.last_attempt_at).getTime();
    if (Number.isFinite(lastAttemptMs) && (now - lastAttemptMs) < PASSWORD_FALLBACK_MIN_INTERVAL_MS) {
      const nextAllowedAt = new Date(lastAttemptMs + PASSWORD_FALLBACK_MIN_INTERVAL_MS).toISOString();
      throw buildPasswordFallbackBlockedError(
        `Platts password fallback was attempted too recently, next allowed at ${nextAllowedAt}`,
        [`为避免短时间重复登录，密码兜底最少间隔 60 分钟，下次最早 ${nextAllowedAt}`]
      );
    }
  }

  if (!quiet) {
    console.error('[Platts Auth] Password fallback allowed under conservative guard');
  }
}

function recordPasswordFallbackAttempt(config = {}, result = {}) {
  const nowIso = new Date().toISOString();
  const prev = getPasswordFallbackState(config);

  if (result.success) {
    return withPasswordFallbackState(config, {
      consecutive_failures: 0,
      last_attempt_at: nowIso,
      last_success_at: nowIso,
      last_failure_at: prev.last_failure_at || null,
      last_error: null,
      last_method: result.method || prev.last_method || null,
      cooldown_until: null
    });
  }

  const consecutiveFailures = Number(prev.consecutive_failures || 0) + 1;
  const cooldownUntil = consecutiveFailures >= PASSWORD_FALLBACK_COOLDOWN_AFTER_FAILURES
    ? new Date(Date.now() + PASSWORD_FALLBACK_COOLDOWN_MS).toISOString()
    : null;

  return withPasswordFallbackState(config, {
    consecutive_failures: consecutiveFailures,
    last_attempt_at: nowIso,
    last_success_at: prev.last_success_at || null,
    last_failure_at: nowIso,
    last_error: result.error || null,
    last_method: result.method || prev.last_method || null,
    cooldown_until: cooldownUntil
  });
}

function buildNormalizedConfig(existingConfig, data, method, extra = {}) {
  const now = new Date();
  const expiresIn = Number(data.expires_in || existingConfig?.expires_in || 3600);
  const refreshToken = data.refresh_token || existingConfig?.refresh_token;
  const refreshTokenChanged = Boolean(data.refresh_token && data.refresh_token !== existingConfig?.refresh_token);
  const refreshTokenObtainedAt = refreshTokenChanged
    ? now.toISOString()
    : (existingConfig?.refresh_token_obtained_at || now.toISOString());

  return {
    ...existingConfig,
    token_type: data.token_type || existingConfig?.token_type || 'Bearer',
    access_token: data.access_token,
    refresh_token: refreshToken,
    refresh_token_obtained_at: refreshTokenObtainedAt,
    expires_in: expiresIn,
    expires_at: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    token_updated_at: now.toISOString(),
    updated_at: now.toISOString(),
    scope: data.scope || existingConfig?.scope,
    id_token: data.id_token || existingConfig?.id_token,
    username: extra.username || existingConfig?.username,
    auth_method: extra.auth_method || existingConfig?.auth_method,
    refresh_method: method
  };
}

async function parseTokenResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { text, data };
}

export async function loginPlattsWithPassword(username, password, options = {}) {
  if (!username || !password) {
    throw new Error('Missing Platts username/password');
  }

  const existingConfig = options.existingConfig || (existsSync(PLATTS_CONFIG_FILE) ? loadPlattsConfig() : {});
  const quiet = options.quiet ?? false;
  const errors = [];

  if (options.enforceGuard ?? true) {
    assertPasswordFallbackAllowed(existingConfig, quiet);
  }

  for (const endpoint of PASSWORD_ENDPOINTS) {
    if (!quiet) console.error(`[Platts Auth] Trying ${endpoint.name}...`);

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body: endpoint.buildBody(username, password)
      });

      const { text, data } = await parseTokenResponse(response);

      if (!response.ok) {
        errors.push(`${endpoint.name}: HTTP ${response.status} - ${text.substring(0, 200)}`);
        continue;
      }

      if (!data?.access_token) {
        errors.push(`${endpoint.name}: No access_token in response`);
        continue;
      }

      const newConfig = buildNormalizedConfig(existingConfig, data, endpoint.name, {
        username,
        auth_method: endpoint.name
      });
      savePlattsConfig(recordPasswordFallbackAttempt(newConfig, { success: true, method: endpoint.name }));
      if (!quiet) console.error(`[Platts Auth] Password login succeeded via ${endpoint.name}`);
      return loadPlattsConfig();
    } catch (e) {
      errors.push(`${endpoint.name}: ${e.message}`);
    }
  }

  savePlattsConfig(recordPasswordFallbackAttempt(existingConfig, {
    success: false,
    error: errors.join(' | ').slice(0, 1000),
    method: 'password-fallback'
  }));

  const error = new Error('All password login methods failed');
  error.code = 'PLATTS_PASSWORD_FALLBACK_FAILED';
  error.details = errors;
  throw error;
}

export async function loginPlattsWithEnv(options = {}) {
  const { username, password } = getPlattsCredentialEnv();
  if (!username || !password) {
    const error = new Error('Platts_ACCOUNT/Platts_PASSWORD env not available');
    error.code = 'PLATTS_ENV_MISSING';
    throw error;
  }
  return loginPlattsWithPassword(username, password, options);
}

export async function refreshPlattsAccessToken(config = null, options = {}) {
  const quiet = options.quiet ?? false;
  const allowPasswordFallback = options.allowPasswordFallback ?? false;
  const existingConfig = config || loadPlattsConfig();
  const errors = [];

  if (!existingConfig.refresh_token) {
    errors.push('No refresh_token available');
  } else {
    for (const endpoint of REFRESH_ENDPOINTS) {
      if (!quiet) console.error(`[Platts Auth] Refresh via ${endpoint.name}...`);

      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: endpoint.headers,
          body: endpoint.buildBody(existingConfig.refresh_token)
        });

        const { text, data } = await parseTokenResponse(response);

        if (!response.ok) {
          errors.push(`${endpoint.name}: HTTP ${response.status} - ${text.substring(0, 200)}`);
          continue;
        }

        if (!data?.access_token) {
          errors.push(`${endpoint.name}: No access_token in response`);
          continue;
        }

        const newConfig = buildNormalizedConfig(existingConfig, data, endpoint.name);
        savePlattsConfig(newConfig);
        if (!quiet) console.error(`[Platts Auth] Refresh succeeded via ${endpoint.name}`);
        return newConfig;
      } catch (e) {
        errors.push(`${endpoint.name}: ${e.message}`);
      }
    }
  }

  if (allowPasswordFallback) {
    try {
      if (!quiet) console.error('[Platts Auth] Refresh failed, trying env password fallback...');
      return await loginPlattsWithEnv({ existingConfig, quiet });
    } catch (e) {
      errors.push(...(e.details || [e.message]));
    }
  }

  const error = new Error('All refresh methods failed');
  error.details = errors;
  throw error;
}

export async function ensureValidPlattsConfig(options = {}) {
  const quiet = options.quiet ?? false;
  const thresholdMs = options.thresholdMs ?? 10 * 60 * 1000;
  const forceRefresh = options.forceRefresh ?? false;
  const allowPasswordFallback = options.allowPasswordFallback ?? true;

  const currentConfig = loadPlattsConfig();
  const tokenExpired = isPlattsTokenExpired(currentConfig);
  const needsRefresh = forceRefresh || plattsTokenNeedsRefresh(currentConfig, thresholdMs);

  if (!needsRefresh) {
    return currentConfig;
  }

  try {
    return await refreshPlattsAccessToken(currentConfig, {
      quiet,
      allowPasswordFallback: false
    });
  } catch (refreshError) {
    if (!allowPasswordFallback) throw refreshError;

    if (forceRefresh || tokenExpired || !currentConfig.access_token) {
      try {
        if (!quiet) console.error('[Platts Auth] Refresh failed on expired token, trying TokenGeneration fallback...');
        return await loginPlattsWithEnv({ existingConfig: currentConfig, quiet });
      } catch (loginError) {
        const error = new Error('Platts refresh and password fallback both failed');
        error.details = [
          ...(refreshError.details || [refreshError.message]),
          ...(loginError.details || [loginError.message])
        ];
        throw error;
      }
    }

    if (!quiet) console.error('[Platts Auth] Refresh failed but current token still valid, continuing with existing token');
    return currentConfig;
  }
}

export async function getPlattsAccessToken(options = {}) {
  const config = await ensureValidPlattsConfig(options);
  return config.access_token;
}
