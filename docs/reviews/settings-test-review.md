# Test Review: Settings Resilience (New Tests Only)

## Summary
- File: `__tests__/features-pov/settings.test.ts`
- New tests reviewed: 10 (under "Settings Resilience")
- Existing tests: 25 (not reviewed)
- Date: 2026-03-30

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Nothing -- SettingsManager uses file-based JSON persistence, not SQLite | Real `fs.writeFileSync` / `fs.readFileSync` via temp directory |
| Encryption | Not mocked -- falls back to real base64 encoding in non-Electron test env | Real `encryptSecret`/`decryptSecret` functions run (base64 fallback path) |
| Repositories | N/A -- no database repos involved | N/A |
| External APIs | None | N/A |
| SettingsManager | Not mocked -- real `new SettingsManager()` instances used | Real `SettingsManager` class with real static state and file I/O |
| Internal Logic | None | Real `loadFromDisk()`, `saveToDisk()`, validation, generic get/set |

**Key point:** The Settings Resilience tests run against the actual production `SettingsManager` class. No mocks of the system under test. File I/O is real (temp directory). The only "fake" aspect is that encryption uses base64 fallback instead of Electron safeStorage -- which is the real code path for non-Electron environments.

## Test-by-Test Analysis

### Test: "loads settings from an existing file on disk" (renamed from "migrates settings when version changes")
| Field | Value |
|-------|-------|
| **User Story** | User's previously saved settings should be loadable from disk |
| **What it verifies** | That a settings file written to disk can be loaded and values survive |
| **Code path exercised** | `fs.writeFileSync` (setup) -> `SettingsManager.initializeWithFilePath()` -> `loadFromDisk()` -> `JSON.parse` -> static Map population -> `getProcessingInterval()` / `getLookbackDays()` |
| **Mocked** | Nothing |
| **Real** | `loadFromDisk()` parses real JSON from a real file, populates static Maps, and getters return the loaded values |
| **Verdict** | TESTING REAL |
| **Confidence** | MEDIUM |
| **Verification** | C5 VERIFIED. `SettingsManager` has no version field, no migration function, and no schema evolution logic. `loadFromDisk()` simply does `JSON.parse` and loads keys into Maps. The original test name "migrates settings when version changes" was misleading -- renamed to accurately describe what the test actually does: verify that an existing settings file on disk is correctly loaded. This overlaps with the persistence tests in the existing "Sync Interval Persistence" block ("persists interval across new instances") and "Lookback Period Persistence" block ("persists lookback days across new instances"), but those tests write via the setter then reinitialize, while this test writes directly to the file then reinitializes -- so it tests the `loadFromDisk()` parse path from a raw file rather than from data previously saved by `saveToDisk()`. |

### Test: "preserves unknown keys when loading existing settings" (renamed from "preserves user values during migration")
| Field | Value |
|-------|-------|
| **User Story** | Settings file may contain keys not known to the current code; they should survive loading |
| **What it verifies** | That extra/unknown keys in the settings file survive loading via the generic `get()` method |
| **Code path exercised** | `fs.writeFileSync` -> `initializeWithFilePath()` -> `loadFromDisk()` -> Map population including `onboarding_complete` and `customPreference` -> `getProcessingInterval()` / `getLookbackDays()` / `get('onboarding_complete')` / `get('customPreference')` |
| **Mocked** | Nothing |
| **Real** | Real file I/O, real `loadFromDisk()`, real `get()` generic accessor |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Verification** | C5 VERIFIED. Confirmed that `loadFromDisk()` uses `Object.entries(parsed.settings || {})` to populate the Map, which naturally preserves any keys present in the file. The generic `get()` method retrieves them via `persistentSettings.get(key)`. Renamed from "preserves user values during migration" since there is no migration logic -- this is testing forward-compatible key-value storage. Genuinely useful test with no equivalent in the existing suite. |

### Test: "falls back to defaults when settings are corrupted"
| Field | Value |
|-------|-------|
| **User Story** | User's settings file gets corrupted (disk error, crash during write); app should not crash and should show defaults |
| **What it verifies** | That `loadFromDisk()` catches the JSON parse error and that defaults (30/30) are returned |
| **Code path exercised** | `fs.writeFileSync` (corrupt data) -> `initializeWithFilePath()` -> `loadFromDisk()` -> `JSON.parse` throws -> catch block logs error -> constructor sets defaults -> `getProcessingInterval()` / `getLookbackDays()` return defaults |
| **Mocked** | Nothing |
| **Real** | Real corrupt file on disk, real `JSON.parse` failure, real error handling in `loadFromDisk()`, real default fallback |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Solid test. The corrupt JSON string `'{ "settings": { "processingInterval": "not a number" }, "apiKeys": "broken'` is genuinely malformed. `loadFromDisk()` catches the error silently, so the static Maps remain empty (or at defaults from constructor). This correctly tests the resilience path. |

### Test: "recovers from missing required fields"
| Field | Value |
|-------|-------|
| **User Story** | A partial settings file (e.g., from a failed write) should not break the app; missing fields get defaults |
| **What it verifies** | That `lookbackDays` missing from the file falls back to default 30 while `processingInterval: 60` is preserved |
| **Code path exercised** | `fs.writeFileSync` (partial) -> `initializeWithFilePath()` -> `loadFromDisk()` -> JSON parse succeeds -> Map gets `processingInterval=60` but no `lookbackDays` -> `getLookbackDays()` returns `?? DEFAULT_LOOKBACK_DAYS` (nullish coalescing fallback) |
| **Mocked** | Nothing |
| **Real** | Real partial file, real load, real nullish coalescing fallback in `getLookbackDays()` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Good test. Verifies that the `?? SettingsManager.DEFAULT_LOOKBACK_DAYS` fallback in the getter works correctly when the key is absent from the Map. This is a real defensive coding pattern being tested. |

### Test: "handles empty settings store"
| Field | Value |
|-------|-------|
| **User Story** | First-time user with no settings file should see all defaults |
| **What it verifies** | That with no file on disk, all values return defaults |
| **Code path exercised** | File deleted -> `initializeWithFilePath()` -> `loadFromDisk()` -> `existsSync` returns false -> skip load -> constructor sets defaults -> all getters return defaults |
| **Mocked** | Nothing |
| **Real** | Real filesystem check, real constructor default initialization, real getter defaults |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Clean and valuable. Tests the cold-start path. |

### Test: "rejects invalid setting values with clear error"
| Field | Value |
|-------|-------|
| **User Story** | User or bug tries to set an invalid value; app rejects it with a clear error message |
| **What it verifies** | That `setProcessingInterval(0)` and `setLookbackDays(0)` throw with "Invalid" in the message |
| **Code path exercised** | `setProcessingInterval(0)` -> `VALID_PROCESSING_INTERVALS.includes(0)` returns false -> throws Error / `setLookbackDays(0)` -> `VALID_LOOKBACK_DAYS.includes(0)` returns false -> throws Error |
| **Mocked** | Nothing |
| **Real** | Real validation logic in `setProcessingInterval` and `setLookbackDays` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This test partially duplicates the existing "rejects an invalid interval" and "rejects an invalid lookback value" tests from the older describe blocks, which already test `setProcessingInterval(25)` and `setLookbackDays(20)`. The new test adds coverage for `0` specifically, which is a boundary case not covered by the old tests. Mild duplication but adds value at the boundary. |

### Test: "rejects out-of-range values"
| Field | Value |
|-------|-------|
| **User Story** | Negative or extremely large values should be rejected, not silently accepted |
| **What it verifies** | That `-1`, `-5`, `99999`, `365` all throw with "Invalid" in the message |
| **Code path exercised** | `setProcessingInterval(-1)` / `setProcessingInterval(99999)` -> whitelist check fails -> throws / `setLookbackDays(-5)` / `setLookbackDays(365)` -> whitelist check fails -> throws |
| **Mocked** | Nothing |
| **Real** | Real whitelist validation |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Good boundary testing (negative, large). The existing tests only test values not in the list (25, 20). This adds negative numbers and extreme values. Real value add. |

### Test: "preserves valid settings when one invalid value is rejected"
| Field | Value |
|-------|-------|
| **User Story** | If a user tries to set one invalid setting, their other valid settings should not be corrupted |
| **What it verifies** | After setting valid values, attempting to set an invalid one throws, and previously valid values are intact |
| **Code path exercised** | `setProcessingInterval(60)` -> Map updated -> `setLookbackDays(14)` -> Map updated -> `setProcessingInterval(99999)` -> validation fails, throws BEFORE Map mutation -> `getProcessingInterval()` returns 60 (unchanged) -> `setProcessingInterval(120)` -> Map updated -> `setLookbackDays(100)` -> validation fails, throws -> `getProcessingInterval()` returns 120 (updated), `getLookbackDays()` returns 14 (unchanged) |
| **Mocked** | Nothing |
| **Real** | Real validation-then-mutation ordering, real Map state preservation |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This is a genuinely important resilience test. It verifies that the validation check happens BEFORE the Map mutation. If someone refactored `setProcessingInterval` to update the Map first then validate, this test would catch the regression. No duplication with existing tests. |

### Test: "resets all settings including arbitrary custom keys" (renamed from "resets all settings to defaults", under Settings Resilience)
| Field | Value |
|-------|-------|
| **User Story** | User clicks "Reset to Defaults" -- all settings including custom keys should be cleared |
| **What it verifies** | After setting interval, lookback, API key, active provider, and a custom key, `resetAllSettings()` clears everything back to defaults including the custom key |
| **Code path exercised** | Multiple setters -> `resetAllSettings()` -> `persistentSettings.clear()` + `persistentApiKeys.clear()` + `persistentActiveProvider = null` + `persistentProviderValidationStatus.clear()` + re-init defaults -> all getters return defaults |
| **Mocked** | Nothing |
| **Real** | Real `resetAllSettings()` implementation, real Map clearing, real default re-initialization |
| **Verdict** | TESTING REAL |
| **Confidence** | MEDIUM |
| **Verification** | C6 VERIFIED. Traced the full code path: `resetAllSettings()` calls `persistentSettings.clear()` which removes ALL keys from the Map (including custom keys set via `set()`), then re-initializes only the standard defaults. This test is intentionally differentiated from the existing "resets all settings to defaults" in the "Settings Reset" block: that test does not cover custom/generic keys. This test adds explicit verification that `set('customKey', 'customValue')` is also cleared by `resetAllSettings()`, confirming that `persistentSettings.clear()` removes non-standard keys. Renamed to make the additional coverage explicit. Intentional duplication with added value. |

### Test: "reset is idempotent"
| Field | Value |
|-------|-------|
| **User Story** | Calling "Reset to Defaults" multiple times should be safe and produce identical results |
| **What it verifies** | Two consecutive `resetAllSettings()` calls produce the same default values |
| **Code path exercised** | `setProcessingInterval(1440)` / `setLookbackDays(7)` -> `resetAllSettings()` (first) -> defaults restored -> `resetAllSettings()` (second) -> defaults restored again -> all getters return identical 30/30 |
| **Mocked** | Nothing |
| **Real** | Real `resetAllSettings()` called twice on real state |
| **Verdict** | TESTING REAL |
| **Confidence** | MEDIUM |
| **Concerns** | The test logic is sound and the behavior it checks is real. However, this test is almost trivially true given the implementation: `resetAllSettings()` clears all Maps and sets the same defaults each time. It would be hard for this to NOT be idempotent. Low risk of regression, but harmless to have. |

## Overall Assessment
- [x] Tests validate real application behavior
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only
- Percentage of real behavior tested: ~90%
- Critical gaps:

### Strengths
1. **Zero mocks of the system under test.** Every test creates real `SettingsManager` instances, calls real methods, and asserts on real return values. This is excellent.
2. **Real file I/O.** Tests use `fs.writeFileSync` to set up state and `SettingsManager.initializeWithFilePath()` to trigger real `loadFromDisk()`. Corrupted file recovery is tested with real malformed JSON on disk.
3. **Meaningful coverage additions.** The corrupted recovery tests (corrupt JSON, missing fields, empty store) and the "preserves valid settings when invalid is rejected" test cover genuine resilience paths not tested by the existing suite.
4. **Real encryption path.** While not Electron safeStorage, the base64 fallback in `encryptSecret`/`decryptSecret` is the actual production fallback code path running.

### Weaknesses
1. **RESOLVED -- Misleading "schema migration" framing.** The first two tests were named around migration/version changes, but `SettingsManager` has zero migration logic. Tests have been renamed to accurately describe what they verify: "loads settings from an existing file on disk" and "preserves unknown keys when loading existing settings". The describe block is now "Settings persistence with existing data" with a comment noting the absence of migration logic.
2. **RESOLVED -- Duplication with existing reset test.** The "resets all settings to defaults" test under Resilience was nearly identical to the existing one under "Settings Reset". Renamed to "resets all settings including arbitrary custom keys" to make the additional coverage (custom key clearing) explicit. Intentional duplication with added value.
3. **No test for concurrent writes / race conditions.** `saveToDisk()` uses a `setImmediate` debounce pattern. There is no test that verifies debounced saves actually complete correctly, or that rapid successive writes do not lose data.
4. **No test for the `reset()` (singular) method or `resetSetting()`.** The resilience block tests `resetAllSettings()` but not the per-key reset path.
5. **Static state leakage risk.** `SettingsManager` uses all-static state. The `beforeEach` calls `resetAllSettings()` and `initializeWithFilePath()` to isolate tests, but if any test fails mid-execution, static state could leak to the next test. This is a design smell in the production code, not the tests, but the tests do not guard against it.
