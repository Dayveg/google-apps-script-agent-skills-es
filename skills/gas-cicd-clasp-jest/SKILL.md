---
name: gas-cicd-clasp-jest
description: >-
  Integración Continua y Despliegue Continuo (CI/CD) para Google Apps Script mediante
  @google/clasp, suites de prueba con Jest, emuladores (Mocks) y GitHub Actions.
---

# CI/CD y Desarrollo Local con Clasp y Jest (`gas-cicd-clasp-jest`)

Esta habilidad estandariza el flujo de trabajo profesional para desarrollar, testear en local y desplegar soluciones de Google Apps Script utilizando **`@google/clasp`** y **`Jest`**.

---

## 1. Estructura de Entornos y Archivos de Configuración

Para evitar sobreescritura accidental entre ambientes de Desarrollo y Producción, se desacoplan los manifiestos de Clasp:

```
mi-proyecto-gas/
├── .clasp.dev.json         # scriptId y rootDir para ambiente DEV
├── .clasp.prod.json        # scriptId y rootDir para ambiente PROD
├── .claspignore            # Archivos excluidos del push (tests/, .git/, docs/)
├── package.json            # Scripts de test, lint y despliegue
├── src/                    # Código fuente desplegado a Google Apps Script
│   ├── appsscript.json
│   └── Main.js
└── tests/                  # Pruebas unitarias de Jest y mocks locales
    ├── gasMockHarness.js
    └── logicaNegocio.test.js
```

---

## 2. Archivo `.claspignore` Canónico

```text
# Excluir dependencias y pruebas del despliegue a Google Apps Script
**/**
!src/**
!src/appsscript.json

node_modules/**
tests/**
coverage/**
.git/**
.github/**
*.md
package.json
package-lock.json
```

---

## 3. Emulador Local de APIs de Google (`gasMockHarness.js`)

Para ejecutar pruebas unitarias con Jest en local sin requerir conexión a internet ni agotar cuotas:

```javascript
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
    formatDate: jest.fn((date, tz, format) => date.toISOString())
  }
};

module.exports = gasMockHarness;
```

---

## 4. Pipeline de GitHub Actions (`.github/workflows/gas-ci.yml`)

```yaml
name: Google Apps Script CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repositorio
        uses: actions/checkout@v4

      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Instalar dependencias
        run: npm ci

      - name: Ejecutar pruebas unitarias con Jest
        run: npm test -- --coverage

      - name: Despliegue automático a DEV (Solo en develop)
        if: github.ref == 'refs/heads/develop' && success()
        env:
          CLASPRC_ACCESS_TOKEN: ${{ secrets.CLASPRC_ACCESS_TOKEN }}
        run: |
          cp .clasp.dev.json .clasp.json
          npx @google/clasp push --force
```

