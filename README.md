# Google Apps Script Enterprise Agent Skills (ES)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![Runtime: V8 Modern](https://img.shields.io/badge/Runtime-V8_Modern-blue.svg)](https://developers.google.com/apps-script/guides/v8-runtime)
[![CI/CD: Clasp + Jest](https://img.shields.io/badge/CI%2FCD-Clasp%20%2B%20Jest-brightgreen.svg)](https://github.com/google/clasp)
[![Standards: OWASP](https://img.shields.io/badge/Security-OWASP_Sanitization-orange.svg)](https://owasp.org)

Catálogo de habilidades (*skills*), especificaciones de arquitectura y estándares de ingeniería enterprise para **agentes de Inteligencia Artificial** (Antigravity, Claude Code, Cursor, Codex) y desarrolladores trabajando sobre el ecosistema **Google Apps Script (GAS)** y **Google Workspace**.

Este marco de referencia sintetiza las mejores prácticas de la documentación oficial de [Google Workspace Developers](https://developers.google.com/apps-script) y el repositorio canónico [`googleworkspace/apps-script-samples`](https://github.com/googleworkspace/apps-script-samples).

---

## Catálogo de Skills Canónicos

| Skill | Nombre Canónico | Descripción Técnica Oficial |
| :--- | :--- | :--- |
| **01** | [`gas-architecture-v8`](./skills/gas-architecture-v8/SKILL.md) | Topología N-Capas, motor V8 moderno, resolución de Temporal Dead Zone (TDZ), gestión de memoria/GC y contratos inmutables `ServiceResponse`. |
| **02** | [`gas-advanced-sheets-api`](./skills/gas-advanced-sheets-api/SKILL.md) | Sheets API v4 (Servicio Avanzado), operaciones `batchGet`/`batchUpdate` masivas, formato con `GridRange` y backoff exponencial con jitter. |
| **03** | [`gas-advanced-drive-api`](./skills/gas-advanced-drive-api/SKILL.md) | Drive API v3 (Servicio Avanzado), soporte completo de Unidades Compartidas (*Shared Drives*), paginación, carga multipart y proyección `fields`. |
| **04** | [`gas-triggers-lifecycle`](./skills/gas-triggers-lifecycle/SKILL.md) | Gobierno de disparadores simples vs instalables, control de `ScriptApp.AuthMode`, prevención de doble ejecución y registro idempotente (máx. 20). |
| **05** | [`gas-webapp-endpoints`](./skills/gas-webapp-endpoints/SKILL.md) | Controladores `doGet`/`doPost`, Web Apps REST, proxy institucional (`executeAs: USER_DEPLOYING`), CORS y modales seguros. |
| **06** | [`gas-concurrency-chunking`](./skills/gas-concurrency-chunking/SKILL.md) | `LockService` multinivel con Decorrelated Jitter y fragmentación de tareas masivas (*Job Chunking*) contra el timeout de 6 minutos. |
| **07** | [`gas-security-owasp`](./skills/gas-security-owasp/SKILL.md) | Sanitización contra *Formula Injection* (`=,+,-,@`), escape XSS en `HtmlService` y menor privilegio en `appsscript.json`. |
| **08** | [`gas-cicd-clasp-jest`](./skills/gas-cicd-clasp-jest/SKILL.md) | Desarrollo local con `@google/clasp`, segregación de ambientes DEV/PROD, emuladores locales (`gasMockHarness`) y GitHub Actions. |
| **09** | [`gas-libraries-ecosystem`](./skills/gas-libraries-ecosystem/SKILL.md) | Compendio enciclopédico de bibliotecas: Servicios Avanzados de Google (APIs v1-v4), OAuth2, Firestore, BatchRequest y paquetes npm. |
| **10** | [`gas-htmlservice-ui`](./skills/gas-htmlservice-ui/SKILL.md) | Modales, barras laterales y plantillas con `HtmlService`, `google.script.run`, límites de serialización y seguridad cliente-servidor. |
| **11** | [`gas-state-cache-properties`](./skills/gas-state-cache-properties/SKILL.md) | `PropertiesService` y `CacheService`: alcances, límites, caché JSON con invalidación por versión y configuración tipada. |
| **12** | [`gas-urlfetch-observability`](./skills/gas-urlfetch-observability/SKILL.md) | `UrlFetchApp` con reintentos y `fetchAll`, logs estructurados con `console.*` y Cloud Logging. |
| **13** | [`gas-incident-alerting`](./skills/gas-incident-alerting/SKILL.md) | Alertas de incidentes vía Webhook de Google Chat y correo, con debounce y sin filtrar datos sensibles. |
| **14** | [`gas-email-templating`](./skills/gas-email-templating/SKILL.md) | Correos con plantillas `HtmlService`, `MailApp` vs `GmailApp`, cuotas y redirección segura en desarrollo. |
| **15** | [`gas-maintenance-auditor`](./skills/gas-maintenance-auditor/SKILL.md) | Auditoría programada: duplicados, errores de fórmula, filas fantasma y alertas de SLA sin borrado a ciegas. |
| **16** | [`gas-gemini-api-integration`](./skills/gas-gemini-api-integration/SKILL.md) | Gemini API desde Apps Script: autenticación por cabecera, salida JSON estructurada, reintentos y seguridad. |
| **17** | [`gas-document-ocr-processing`](./skills/gas-document-ocr-processing/SKILL.md) | OCR con Drive API v3, extracción de campos validada y limpieza de temporales. |

---

## Principios Rectores de Ingeniería

1. **Arquitectura N-Capas Desacoplada**:
   * Separación categórica entre controladores de entrada (`Main.js`), servicios de negocio (`*Service.js`), acceso a datos (`DAL`) e infraestructura.
2. **Motor Moderno V8 y Prevención de TDZ**:
   * Aprovechamiento de sintaxis ES2015+ (`const`, `let`, clases, desestructuración, `Map`, `Set`), desacoplando el orden alfabético de archivos de Apps Script mediante contenedores perezosos (*Lazy Resolution*).
3. **Cero Acoplamiento a Índices Estáticos**:
   * Prohibido el uso de índices fijos de columna (ej. `row[3]`). El mapeo dinámico de encabezados con normalización Unicode es obligatorio.
4. **Control Estricto de Concurrencia**:
   * Toda mutación de datos o generación de consecutivos transaccionales debe gobernarse mediante `LockService` con *Decorrelated Jitter*, asegurando liberación en bloque `finally`.
5. **Principio de Menor Privilegio**:
   * Declaración explícita de `oauthScopes` acotados en `appsscript.json` (ej. `spreadsheets.currentonly` o `drive.file`), erradicando scopes globales indiscriminados.
6. **Rendimiento por Lotes (*Batching*)**:
   * Prohibida la invocación de `getValue()` o `setValue()` dentro de bucles. Agrupación en matrices en memoria o llamadas RPC con Servicios Avanzados (Sheets v4 / Drive v3).

---

## Cómo Utilizar estos Skills en tu Agente de IA

### Instalación Rápida (Universal — `skills.sh`)
Compatible con Antigravity, Claude Code, Cursor, Codex y otros agentes compatibles con `SKILL.md`:

```bash
npx skills add Dayveg/google-apps-script-agent-skills-es
```

### En Google Antigravity
Puedes clonar este repositorio en tu carpeta global de plugins o añadirlo como submódulo en la raíz de tu proyecto:

```bash
# Opción A: Como plugin global de Antigravity
git clone https://github.com/Dayveg/google-apps-script-agent-skills-es.git ~/.gemini/antigravity/plugins/gas-skills

# Opción B: Como submódulo dentro de tu monorepo
git submodule add https://github.com/Dayveg/google-apps-script-agent-skills-es.git .agents/skills
```

### En Claude Code / Cursor / Codex
Agrega la referencia a la carpeta `skills/` en tus instrucciones de sistema (`CLAUDE.md`, `.cursorrules` o `AGENTS.md`):

```markdown
Para cualquier tarea de desarrollo sobre Google Apps Script, sigue estrictamente 
las directrices declarativas ubicadas en:
`google-apps-script-agent-skills-es/skills/`
```

---

## Licencia y Atribución

Este repositorio se distribuye bajo la licencia **Creative Commons Atribución 4.0 Internacional (CC BY 4.0)**.

[![License: CC BY 4.0](https://licensebuttons.net/l/by/4.0/88x31.png)](https://creativecommons.org/licenses/by/4.0/)

### Términos de Atribución Obligatoria
Si utilizas, adaptas, bifurcas o integras estos skills en tus agentes de IA o proyectos de software, **debes otorgar crédito a la autora original**:
* **Autora**: Dayana Vega ([@Dayveg](https://github.com/Dayveg))
* **Repositorio Original**: [https://github.com/Dayveg/google-apps-script-agent-skills-es](https://github.com/Dayveg/google-apps-script-agent-skills-es)
* **Licencia**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode)

Para citación formal en investigaciones, publicaciones o repositorios, consulta el archivo [`CITATION.cff`](./CITATION.cff).
