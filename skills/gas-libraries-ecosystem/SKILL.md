---
name: gas-libraries-ecosystem
description: >-
  Compendio enciclopédico de bibliotecas y servicios para Google Apps Script: Servicios Nativos Integrados,
  Servicios Avanzados de Google (APIs v1-v4), bibliotecas canónicas de la comunidad (OAuth2, Firestore, BatchRequest)
  y paquetes npm para desarrollo profesional con Clasp y TypeScript.
  Usar cuando: se necesite seleccionar bibliotecas, Servicios Avanzados o tipos npm (@types/google-apps-script) en GAS.
  NO usar cuando: se seleccionen paquetes npm/PyPI para proyectos Node.js o Python sin relación con Apps Script.
---

# Ecosistema Integral de Bibliotecas y Servicios para GAS (`gas-libraries-ecosystem`)

Esta especificación constituye el catálogo exhaustivo de **servicios nativos, servicios avanzados, bibliotecas canónicas de código abierto y paquetes npm** requeridos para el desarrollo enterprise sobre Google Apps Script y Google Workspace.

---

## 1. Clasificación del Ecosistema de Bibliotecas

En Google Apps Script existen cuatro capas diferenciadas de servicios y bibliotecas:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     CAPA 1: SERVICIOS NATIVOS INTEGRADOS (BUILT-IN)                     │
│  Disponibles globalmente sin configuración: SpreadsheetApp, DriveApp, GmailApp, etc.    │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼─────────────────────────────────────────────┐
│                 CAPA 2: SERVICIOS AVANZADOS DE GOOGLE (ADVANCED SERVICES)               │
│  Envoltorios nativos de APIs de Google Cloud activados en appsscript.json:              │
│  Sheets API v4, Drive API v3, Gmail API v1, Calendar API v3, BigQuery v2, Admin SDK.   │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼─────────────────────────────────────────────┐
│                 CAPA 3: BIBLIOTECAS DE LA COMUNIDAD (SCRIPT IDs / GITHUB)               │
│  Librerías externas enlazadas por Script ID o empaquetadas: OAuth2, Firestore, etc.     │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
┌───────────────────────────────────────────▼─────────────────────────────────────────────┐
│                 CAPA 4: PAQUETES NPM PARA DESARROLLO LOCAL Y CI/CD                      │
│  Herramientas de CLI y tipado: @google/clasp, @types/google-apps-script, Jest.          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Servicios Avanzados de Google (Advanced Services)

Se activan en el manifiesto `appsscript.json` bajo la clave `"dependencies.enabledAdvancedServices"`. No requieren gestionar tokens manuales ya que Apps Script inyecta automáticamente la autorización del usuario.

| Símbolo Global | Servicio de Google Cloud | Versión | Caso de Uso Canónico |
| :--- | :--- | :--- | :--- |
| **`Sheets`** | Google Sheets API | `v4` | Mutaciones masivas `batchUpdate`, lecturas multi-rango `batchGet` y formatos atómicos. |
| **`Drive`** | Google Drive API | `v3` | Soporte 100% de Unidades Compartidas (*Shared Drives*), proyección `fields`, consultas `q`. |
| **`Gmail`** | Gmail API | `v1` | Lectura de mensajes sin agotar cuotas, manipulación en lote de etiquetas y borradores. |
| **`Calendar`** | Google Calendar API | `v3` | Consultas de disponibilidad (*Free/Busy*), eventos recurrentes complejos y ACL de calendarios. |
| **`BigQuery`** | Google Cloud BigQuery API | `v2` | Ejecución de consultas analíticas SQL sobre terabytes de datos e ingestión de datasets. |
| **`Docs`** | Google Docs API | `v1` | Inserción y reemplazo de texto estructural, tablas y estilos en documentos por lotes. |
| **`Slides`** | Google Slides API | `v1` | Generación automática de presentaciones y modificación de diapositivas en bloque. |
| **`AdminDirectory`** | Google Workspace Admin SDK | `directory_v1` | Administración de usuarios corporativos, grupos, alias y unidades organizacionales. |
| **`Tasks`** | Google Tasks API | `v1` | Gestión y sincronización de listas de tareas personales y de equipo. |
| **`People`** | Google People API | `v1` | Acceso a contactos corporativos y conexiones del perfil de Google. |

### Configuración Canónica en `appsscript.json`:

```json
{
  "timeZone": "America/Bogota",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Sheets", "serviceId": "sheets", "version": "v4" },
      { "userSymbol": "Drive", "serviceId": "drive", "version": "v3" },
      { "userSymbol": "Gmail", "serviceId": "gmail", "version": "v1" },
      { "userSymbol": "BigQuery", "serviceId": "bigquery", "version": "v2" }
    ]
  },
  "runtimeVersion": "V8"
}
```

---

## 3. Bibliotecas Canónicas de Código Abierto (Script IDs de Google)

### 3.1. `OAuth2 for Apps Script` (Oficial de Google Workspace)
* **Repositorio**: [`googleworkspace/apps-script-oauth2`](https://github.com/googleworkspace/apps-script-oauth2)
* **Script ID Oficial**: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
* **Propósito**: Implementa el flujo completo de autorización OAuth 2.0 (redirecciones, almacenamiento de tokens de actualización *Refresh Tokens* en `PropertiesService` y refresco automático) para conectar Apps Script con APIs externas como GitHub, Slack, Salesforce, Microsoft Graph o APIs de Google externas.

```javascript
/**
 * Configuración del cliente OAuth2 para consumo de APIs de terceros.
 * @returns {OAuth2.Service}
 */
function obtenerServicioOAuth2() {
  return OAuth2.createService('GitHub')
    .setAuthorizationBaseUrl('https://github.com/login/oauth/authorize')
    .setTokenUrl('https://github.com/login/oauth/access_token')
    .setClientId(PropertiesService.getScriptProperties().getProperty('GITHUB_CLIENT_ID'))
    .setClientSecret(PropertiesService.getScriptProperties().getProperty('GITHUB_CLIENT_SECRET'))
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('repo read:user');
}
```

---

### 3.2. `FirestoreGoogleAppsScript` (Base de Datos NoSQL en Tiempo Real)
* **Repositorio**: [`grahamearley/FirestoreGoogleAppsScript`](https://github.com/grahamearley/FirestoreGoogleAppsScript)
* **Script ID**: `1VUSl4b1r1eoNcRWotZM3e87ygkxvXltOgyDZhixqncz9lQ3MjfT1iKFw` *(confirmar en el README del repositorio antes de usar; es la fuente canónica)*
* **Propósito**: Conecta Google Apps Script directamente con **Google Cloud Firestore**, permitiendo leer, escribir, consultar y estructurar documentos NoSQL en la nube sin requerir Google Sheets como base de datos precaria.

```javascript
/**
 * Inicialización y escritura directa en Google Cloud Firestore.
 */
function persistirEnFirestore(coleccion, idDocumento, datos) {
  const email = PropertiesService.getScriptProperties().getProperty('FIREBASE_CLIENT_EMAIL');
  const privateKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_PRIVATE_KEY');
  const projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');

  const firestore = FirestoreApp.getFirestore(email, privateKey, projectId);
  firestore.createDocument(`${coleccion}/${idDocumento}`, datos);
}
```

---

### 3.3. `BatchRequest` (Procesamiento por Lotes HTTP Multipart)
* **Autor / Repositorio**: Kanshi Tanaike ([`tanaikech/BatchRequest`](https://github.com/tanaikech/BatchRequest))
* **Script ID**: consultar en el README del repositorio (no se incluye aquí para evitar identificadores desactualizados).
* **Propósito**: Agrupa hasta 100 llamadas REST arbitrarias a APIs de Google (ej. Drive, Gmail, Calendar) en una **única petición HTTP multipart**, reduciendo drásticamente el tiempo de ejecución y evitando límites de cuota de red.

---

### 3.4. `Cheerio for Google Apps Script` (Web Scraping y Parsing DOM)
* **Repositorio**: [`tani/cheeriogs`](https://github.com/tani/cheeriogs)
* **Script ID**: `1ReeQ6WO8kKNxoaA_O0XEQ589cIrRvEBA9qcWpNqdOP17i47u6N9M5Xh0`
* **Propósito**: Proporciona la sintaxis completa de jQuery (`$`) para analizar, extraer y manipular documentos HTML recibidos vía `UrlFetchApp.fetch()`.

---

## 4. Paquetes npm para Entornos de Desarrollo Local (Clasp + TypeScript)

Para trabajar localmente en VS Code, Cursor o WebStorm con control de versiones y tipado estricto:

```json
{
  "name": "google-apps-script-enterprise-project",
  "version": "1.0.0",
  "scripts": {
    "push": "clasp push",
    "pull": "clasp pull",
    "deploy": "clasp deploy",
    "test": "jest --coverage",
    "lint": "eslint src/ --ext .js"
  },
  "devDependencies": {
    "@google/clasp": "^2.4.2",
    "@types/google-apps-script": "^1.0.86",
    "@types/jest": "^29.5.12",
    "eslint": "^8.57.0",
    "eslint-plugin-googleappsscript": "^0.0.3",
    "jest": "^29.7.0"
  }
}
```

### El Rol de `@types/google-apps-script`:
Permite que el editor proporcione **autocompletado inteligente (IntelliSense)** y validación estricta de tipos en tiempo real para todos los métodos de Google Workspace (`SpreadsheetApp`, `DriveApp`, `LockService`, `Sheets`, `Drive`).

---

## 5. Servicios Retirados (*Sunsets* 2025–2026) — Prohibido su Uso

| Servicio Retirado | Fecha de Retiro | Reemplazo Oficial |
| :--- | :--- | :--- |
| **`ContactsApp`** (Contacts Service) | 31 de enero de 2025 | Servicio Avanzado **`People`** (`Google People API v1`). |
| **`AnalyticsReporting`** (Reporting API v4) | 3 de junio de 2025 | Servicio Avanzado **`AnalyticsData`** (`Google Analytics Data API v1beta`). |
| **`Area120Tables`** | 14 de enero de 2026 | Google Sheets API v4 / Cloud SQL / Firestore. |
| **Motor Rhino (`DEPRECATED_ES5`)** | 31 de enero de 2026 | Motor **`V8`** (`"runtimeVersion": "V8"` en `appsscript.json`). |


