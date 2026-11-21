---
name: gas-security-owasp
description: >-
  Estándares de seguridad OWASP para Google Apps Script: prevención de Formula Injection,
  mitigación de XSS en HtmlService y principio de menor privilegio en appsscript.json.
  Usar cuando: se validen entradas hacia Sheets, se renderice HTML en HtmlService o se configuren oauthScopes en GAS.
  NO usar cuando: se audite seguridad de APIs backend Node.js/Go/Python o infraestructura cloud ajena a GAS.
---

# Seguridad OWASP y Sanitización en GAS (`gas-security-owasp`)

Esta habilidad establece las medidas de seguridad obligatorias para prevenir vulnerabilidades de **Inyección de Fórmulas (CSV/Formula Injection)**, **Cross-Site Scripting (XSS)** y exposición indebida de credenciales.

> Plantilla base de manifiesto seguro disponible en [`assets/appsscript.template.json`](./assets/appsscript.template.json).

---

## 1. Mitigación de Inyección de Fórmulas (Formula Injection)

Cuando un usuario envía datos que comienzan con caracteres de ejecución (`=`, `+`, `-`, `@`, `\t`, `\r`), una hoja de cálculo puede interpretar el texto como una fórmula maliciosa (ej. `=IMPORTXML(...)` o `=IMAGE(...)`) extrayendo datos sensibles.

### Función Canónica de Sanitización:

```javascript
/**
 * Sanitiza cualquier valor de texto antes de persistirlo en Google Sheets,
 * mitigando vulnerabilidades de Formula Injection (CSV Injection).
 *
 * @param {*} valor - Entrada a sanitizar.
 * @returns {*} Valor seguro para inserción directa en celda.
 */
function sanitizarEntradaTexto(valor) {
  if (valor === null || valor === undefined) {
    return '';
  }

  // Si no es cadena de texto, retornar inalterado (números, booleanos, fechas)
  if (typeof valor !== 'string') {
    return valor;
  }

  const textoLimpio = valor.trim();

  // Si inicia con caracteres de control de fórmulas o tabulaciones
  if (/^[=+\-@\t\r]/.test(textoLimpio)) {
    // Anteponer comilla simple para forzar interpretación estricta como texto plano
    return `'${textoLimpio}`;
  }

  return textoLimpio;
}
```

---

## 2. Mitigación de XSS en `HtmlService`

En plantillas evaluadas (`HtmlService.createTemplateFromFile`):

1. **Uso de `<?= valor ?>` (Escapado Automático)**:
   * Google Apps Script reemplaza automáticamente caracteres especiales (`<`, `>`, `&`, `"`, `'`).
   * **REGLA OBLIGATORIA**: Usar `<?= variable ?>` para toda variable que contenga datos provistos por usuarios o bases de datos.
2. **Prohibición de `<?!= valor ?>` (Sin Escapar)**:
   * `<?!= variable ?>` inyecta el contenido en crudo. Solo se permite para incluir fragmentos HTML estáticos del proyecto (ej. `<?!= include('EstilosCss'); ?>`).

---

## 3. Principio de Menor Privilegio en `appsscript.json`

Queda prohibido el uso de scopes abiertos. El archivo `appsscript.json` debe listar explícitamente los accesos estrictamente requeridos:

```json
{
  "timeZone": "America/Bogota",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

---

## 4. Endurecimiento de Red y Ejecución (`urlFetchWhitelist` / `executionApi`)

- **`urlFetchWhitelist`**: restringe los dominios HTTPS permitidos para `UrlFetchApp` (obligatorio en Add-ons publicados). Debe usar `https://` con dominio y ruta explícitos (ej. `"https://api.mi-dominio.com/"`).
- **`executionApi`**: solo declarar `"executionApi": { "access": "MYSELF" }` (o `"DOMAIN"`) si el proyecto se invoca externamente vía Apps Script API; evitar `"ANYONE"`.

---

## 5. Gestión Segura de Credenciales y Secretos

* **PROHIBIDO:** Incluir llaves de API, webhooks o contraseñas quemadas (*hardcoded*) en el código fuente.
* **OBLIGATORIO:** Utilizar `PropertiesService.getScriptProperties()`:
  ```javascript
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('La propiedad del script GEMINI_API_KEY no se encuentra configurada.');
  }
  ```

