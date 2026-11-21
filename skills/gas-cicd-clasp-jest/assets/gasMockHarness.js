// Copyright 2026 Dayana Vega (@Dayveg)
// SPDX-License-Identifier: Apache-2.0
/**
 * Harness mínimo de emulación de APIs de Google Apps Script para Jest.
 */
const gasMockHarness = {
  Logger: {
    log: jest.fn((msg) => console.log('[MOCK Logger]', msg))
  },
  SpreadsheetApp: {
    getActive: jest.fn(),
    openById: jest.fn(),
    flush: jest.fn()
  },
  PropertiesService: {
    getScriptProperties: jest.fn(() => ({
      getProperty: jest.fn((key) => process.env[key] || null),
      setProperty: jest.fn(),
      deleteProperty: jest.fn()
    }))
  },
  LockService: {
    getScriptLock: jest.fn(() => ({
      tryLock: jest.fn(() => true),
      waitLock: jest.fn(),
      releaseLock: jest.fn()
    }))
  },
  Utilities: {
    sleep: jest.fn(),
    formatDate: jest.fn((date) => date.toISOString())
  }
};

module.exports = gasMockHarness;
