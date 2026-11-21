# Historial de Cambios (`CHANGELOG.md`)

Todos los cambios relevantes de este proyecto se documentan en este archivo siguiendo el formato [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico (SemVer)](https://semver.org/lang/es/).

---

## [1.0.0] - 2026-11-21

### Lanzamiento Oficial (`v1.0.0`)

- **Catálogo Completo de 23 Skills Canónicas (`00` a `22`)**:
  - Punto de entrada y enrutador maestro (`gas-guidance`) con matriz de decisión, control de cuotas (`@gmail.com` vs Google Workspace) y soporte de *Data Regions*.
  - Arquitectura N-Capas sobre motor **V8 moderno** (`gas-architecture-v8`), prevención de *Temporal Dead Zone (TDZ)*, contenedor de resolución perezosa, contrato `ServiceResponse` y mapeo dinámico de columnas.
  - Servicios Avanzados de Google (`gas-advanced-sheets-api` v4, `gas-advanced-drive-api` v3 con *Shared Drives*).
  - Concurrencia (`LockService` con *Decorrelated Jitter*) y *Job Chunking* contra el límite de 6 minutos (`gas-concurrency-chunking`).
  - Ciclo de vida de triggers (`gas-triggers-lifecycle`), Web Apps REST (`gas-webapp-endpoints`), interfaces `HtmlService` (`gas-htmlservice-ui`) y Google Workspace Add-ons con `CardService` (`gas-workspace-addons`).
  - Funciones personalizadas de Sheets `@customfunction` (`gas-sheets-custom-functions`), conectividad SQL con `Jdbc` (`gas-jdbc-cloudsql`), generación de documentos/pestañas y PDFs (`gas-docs-slides-pdf-generation`) y automatización de Google Forms (`gas-forms-automation`).
  - Seguridad OWASP (`gas-security-owasp`), CI/CD con `@google/clasp` y Jest (`gas-cicd-clasp-jest`), ecosistema de bibliotecas y retiros 2025–2026 (`gas-libraries-ecosystem`), `PropertiesService`/`CacheService` (`gas-state-cache-properties`), `UrlFetchApp` y Cloud Logging (`gas-urlfetch-observability`), alertas a Google Chat (`gas-incident-alerting`), plantillas de correo (`gas-email-templating`), auditoría programada (`gas-maintenance-auditor`), Gemini API (`gas-gemini-api-integration`) y OCR documental (`gas-document-ocr-processing`).
- **Divulgación Progresiva (*Progressive Disclosure*)**:
  - Separación de reglas ejecutivas en `SKILL.md` (<200 líneas), implementaciones de referencia en `references/` y plantillas listas para copiar en `assets/`.
- **Herramientas Ejecutables y Evaluación**:
  - Escáner estático de antipatrones GAS (`scripts/gas-scan.mjs`, reglas `GAS001`–`GAS009`).
  - Validador de integridad del catálogo (`scripts/validate-skills.mjs`), suite de pruebas unitarias (`tests/*.test.mjs`) y 10 escenarios de evaluación (`evals/evals.json`).
- **Gobierno y Licenciamiento Dual**:
  - Esquema dual bilingüe (Inglés/Español): **CC BY 4.0** (`LICENSE`) para documentación y **Apache 2.0** (`LICENSE-APACHE` + `NOTICE`) para código ejecutable, plantillas y snippets.
