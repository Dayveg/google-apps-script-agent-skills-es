---
name: gas-webapp-endpoints
description: >-
  Arquitectura oficial de Web Apps y APIs REST en Google Apps Script: controladores doGet/doPost,
  modos de ejecución (executeAs), integración de modales HtmlService y patrón de Proxy Institucional.
  Usar cuando: se construyan Web Apps, endpoints REST o webhooks con doGet/doPost en Google Apps Script.
  NO usar cuando: se implementen servidores HTTP en Express, FastAPI, NestJS o Cloudflare Workers.
---

# Web Apps y Endpoints REST en Google Apps Script (`gas-webapp-endpoints`)

Estándares para construir **Web Apps, APIs REST y Webhooks** mediante `doGet` y `doPost` en Google Apps Script.

Para implementaciones completas (`doPost`, `doGet`, `validarAccesoInstitucional_`, estructura del evento `e` y cliente `fetch()`), consultar [`references/webapp-patterns.md`](./references/webapp-patterns.md).

---

## 1. Modos de Ejecución y Seguridad (`appsscript.json`)

```json
{
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "DOMAIN"
  }
}
```

- `executeAs`: `USER_DEPLOYING` (actúa como **Proxy Institucional** con permisos del autor sobre rangos protegidos) | `USER_ACCESSING` (corre con la cuenta del visitante).
- `access`: `MYSELF` | `DOMAIN` | `ANYONE` | `ANYONE_ANONYMOUS`.
- **Regla *Fail-Closed***: con `USER_DEPLOYING`, `Session.getActiveUser().getEmail()` puede venir vacío si el visitante es externo; **rechazar por defecto** si no se verifica identidad y dominio (`WEBAPP_ALLOWED_DOMAIN` en `ScriptProperties`).

---

## 2. Reglas de Controladores y Clientes Web

1. **`doPost` / `doGet` JSON**: envolver todo en `try...catch` y responder siempre vía `ContentService.createTextOutput(JSON.stringify(ServiceResponse)).setMimeType(ContentService.MimeType.JSON)`.
2. **Redirección 302 y CORS**: en clientes `fetch()`, usar `redirect: 'follow'` y `Content-Type: text/plain;charset=utf-8` para evitar *preflights* `OPTIONS` no soportados por GAS.
3. **Sin `?authuser=X`**: nunca hardcodear `?authuser=0` en URLs compartidas (provoca `401`/`404` en sesiones multicuenta).

---

## 3. Checklist de Verificación

- `doPost` valida `e.postData.contents`, parsea JSON de forma segura y verifica autorización antes de mutar datos.
- Ninguna excepción sin capturar escapa de `doGet`/`doPost`.
- El cliente `fetch()` configura `redirect: 'follow'` y evita `OPTIONS` preflight.
