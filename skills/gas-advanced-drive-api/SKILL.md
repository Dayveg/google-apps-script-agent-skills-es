---
name: gas-advanced-drive-api
description: >-
  Patrones canónicos de alto rendimiento con Google Drive API v3 (Servicio Avanzado):
  soporte total de Unidades Compartidas (Shared Drives), consultas indexadas q, proyección fields, carga multipart y gestión de permisos.
  Usar cuando: se manipulen archivos, carpetas, permisos o Shared Drives desde Google Apps Script.
  NO usar cuando: se consuma Drive API desde Node.js/Python fuera de GAS o solo se necesiten operaciones triviales sin Shared Drives.
---

# Google Drive API v3 — Servicio Avanzado (`gas-advanced-drive-api`)

Directrices para gestión documental en Google Apps Script mediante **Drive API v3**, garantizando compatibilidad completa con **Unidades Compartidas (*Shared Drives*)** y payloads mínimos.

Para implementaciones completas (`appsscript.json`, búsqueda paginada `Drive.Files.list`, creación de carpetas, carga multipart y `Drive.Permissions.create`), consultar [`references/drive-v3-patterns.md`](./references/drive-v3-patterns.md).

---

## 1. Cuándo Elegir `Drive API v3` sobre `DriveApp`

| Criterio | `DriveApp` (Nativo) | `Drive API v3` (Avanzado) |
| :--- | :--- | :--- |
| **Shared Drives** | Soporte incompleto; ignora o falla con archivos compartidos. | **Soporte 100%** con `supportsAllDrives: true` e `includeItemsFromAllDrives: true`. |
| **Payload de Red** | Descarga metadatos completos por archivo. | Proyección estricta con `fields` (solo atributos necesarios). |
| **Búsquedas** | `getFilesByName()` secuencial e ineficiente. | Consultas indexadas `q` con paginación `nextPageToken`. |

---

## 2. Reglas Obligatorias

1. **Habilitar servicio en `appsscript.json`**: declarar `enabledAdvancedServices` con `"serviceId": "drive"`, `"version": "v3"` y scopes mínimos (`drive.readonly` / `drive.file`).
2. **Proyección `fields` obligatoria**: nunca omitir `fields` en `Drive.Files.list`, `create` o `Permissions.create`.
3. **Soporte de Shared Drives**: incluir `supportsAllDrives: true` (y en `list`: `includeItemsFromAllDrives: true`, `corpora: 'allDrives'`).
4. **Paginación completa**: iterar mientras exista `nextPageToken` hasta alcanzar el límite deseado.

---

## 3. Checklist de Verificación

- Todas las llamadas incluyen `supportsAllDrives: true` y parámetro `fields`.
- Las consultas `q` filtran explícitamente `trashed = false`.
- Cada función retorna `ServiceResponse` sin propagar excepciones crudas.
