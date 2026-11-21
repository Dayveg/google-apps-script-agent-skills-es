---
name: gas-guidance
description: >-
  Skill enrutadora y de gobierno para desarrollo enterprise en Google Apps Script (GAS) y Google Workspace.
  Usar SIEMPRE al inicio de cualquier tarea sobre Apps Script (.gs, .js con clasp, appsscript.json, HtmlService, SpreadsheetApp, DriveApp, triggers).
  NO usar cuando: el proyecto sea backend Node.js/Python/Go fuera de GAS, frontend React/Next.js independiente o infraestructura Docker/Terraform.
---

# Google Apps Script Enterprise Guidance (`gas-guidance`)

Punto de entrada único para orquestar las skills de **Google Apps Script (GAS)** con divulgación progresiva, control de cuotas y verificación estática automática.

---

## Flujo de Trabajo Obligatorio

### Paso 1. Enrutar a la(s) Skill(s) Específica(s)

Según la tarea solicitada, cargar únicamente las skills necesarias de la matriz de enrutamiento:

| Capacidad / Intención | Skill(s) a Cargar |
| :--- | :--- |
| Estructura de proyecto, V8, TDZ, `ServiceResponse`, mapeo de columnas | `gas-architecture-v8` |
| Lectura/escritura masiva o formato avanzado en Sheets (API v4) | `gas-advanced-sheets-api` |
| Drive API v3, Shared Drives, paginación, subida multipart | `gas-advanced-drive-api` |
| Triggers `onOpen`/`onEdit`/tiempo, `AuthMode`, límite de 20 triggers | `gas-triggers-lifecycle` |
| Web Apps (`doGet`/`doPost`), APIs REST, `USER_DEPLOYING`, proxy modal | `gas-webapp-endpoints` |
| Modales, sidebars, `google.script.run`, sanitización cliente-servidor | `gas-htmlservice-ui` |
| `LockService` con jitter, *Job Chunking* contra timeout de 6 min | `gas-concurrency-chunking` |
| `PropertiesService`, `CacheService` (100 KB/clave), invalidación | `gas-state-cache-properties` |
| Seguridad OWASP, *Formula Injection*, XSS `<?= ?>`, scopes mínimos | `gas-security-owasp` |
| `clasp`, ambientes DEV/PROD, Jest (`gasMockHarness`), GitHub Actions | `gas-cicd-clasp-jest` |
| Servicios Avanzados, OAuth2, Firestore, BatchRequest, bibliotecas | `gas-libraries-ecosystem` |
| `UrlFetchApp`, `fetchAll`, reintentos, Cloud Logging estructurado | `gas-urlfetch-observability` |
| Alertas a Google Chat Webhook y correo con *debounce* | `gas-incident-alerting` |
| Correos HTML con `HtmlService`, `MailApp` vs `GmailApp`, cuotas | `gas-email-templating` |
| Auditoría programada de duplicados, fórmulas dañadas y SLAs | `gas-maintenance-auditor` |
| Integración con Gemini API (`generateContent`, `responseSchema`) | `gas-gemini-api-integration` |
| OCR de PDFs con Drive API v3 y limpieza de temporales | `gas-document-ocr-processing` |
| Google Workspace Add-ons con `CardService` y bloque `addOns` | `gas-workspace-addons` |
| Funciones personalizadas en celdas de Sheets (`@customfunction`) | `gas-sheets-custom-functions` |
| Conexión SQL / Cloud SQL mediante `Jdbc` y `prepareStatement` | `gas-jdbc-cloudsql` |
| Generación de Docs/Slides desde plantillas, `getTabs()` y exportación a PDF | `gas-docs-slides-pdf-generation` |
| Automatización de Google Forms (`FormApp`) y eventos `onFormSubmit` | `gas-forms-automation` |

---

### Paso 2. Considerar Cuotas de Cuenta (`@gmail.com` vs Google Workspace)

Antes de diseñar flujos batch, triggers o envíos de correo, respetar el entorno objetivo:

- **Tiempo de ejecución por invocación**: máximo **6 minutos** (consumidor y Workspace); usar *Job Chunking* (`gas-concurrency-chunking`) si puede superarlo.
- **Triggers diarios totales**: máximo **1 hora/día** (`@gmail.com`) vs **6 horas/día** (Google Workspace).
- **Correos diarios (`MailApp`/`GmailApp`)**: **100/día** (`@gmail.com`) vs **1.500/día** (Google Workspace).
- **Triggers simultáneos por usuario/script**: máximo **20**.
- **Data Regions (Google Workspace)**: Apps Script respeta políticas de residencia de datos (archivos de script, triggers, `PropertiesService`, `CacheService`) en ediciones Enterprise/Education/Frontline.

---

### Paso 3. Auditar con `gas-scan` antes de Concluir

Después de crear o modificar archivos `.gs`, `.js`, `.html` o `appsscript.json`, ejecutar el escáner estático incluido en el repositorio sobre la carpeta del proyecto:

```bash
node scripts/gas-scan.mjs <ruta-proyecto> --json
```

Verificar cada hallazgo:
- Corregir antipatrones reales (`var`, `getValue()`/`setValue()` en bucles, `<?!=` sin sanitizar, `waitLock` sin `tryLock`/`finally`, scopes excesivos, secretos quemados).
- Si un hallazgo es un falso positivo justificado (ej. `<?!= include('Css') ?>`), documentarlo brevemente.

---

### Paso 4. Divulgar Reglas Aplicadas

Al entregar cambios en código GAS, cerrar la respuesta con una sección `### Estándares GAS Aplicados` listando:
- Las skills consultadas (`gas-*`).
- El resultado de `gas-scan` (0 hallazgos o hallazgos mitigados).
- La confirmación de cumplimiento del contrato `ServiceResponse`, mapeo dinámico de columnas y scopes mínimos en `appsscript.json`.
