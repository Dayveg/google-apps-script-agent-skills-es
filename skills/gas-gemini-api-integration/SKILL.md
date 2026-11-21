---
name: gas-gemini-api-integration
description: >-
  Integración de la Gemini API en Google Apps Script mediante UrlFetchApp: autenticación por cabecera,
  salida JSON estructurada con responseSchema, reintentos, manejo de cuotas y buenas prácticas de seguridad.
  Usar cuando: se consuma la API REST de Gemini desde Google Apps Script con UrlFetchApp.
  NO usar cuando: se use el SDK oficial de Gemini en Python, TypeScript/Node.js o Vertex AI fuera de GAS.
---

# Integración de Gemini API en Apps Script (`gas-gemini-api-integration`)

Patrón para invocar modelos Gemini desde Apps Script sin bibliotecas externas, usando la API REST (`generateContent`) con salida estructurada.

> [!NOTE]
> Los nombres de modelo cambian con frecuencia. **No fijar un modelo en el código**: configurarlo en `ScriptProperties` (`GEMINI_MODEL`) y consultar la lista vigente en la documentación oficial de Gemini API antes de desplegar.

---

## 1. Principios

1. **API key en cabecera `x-goog-api-key`**, nunca en la URL (las URL pueden quedar en logs).
2. La clave vive solo en `PropertiesService.getScriptProperties()`; jamás en código ni en la hoja.
3. `muteHttpExceptions: true` y validación explícita del código HTTP.
4. Temperatura baja (`0` a `0.2`) para extracción determinista.
5. **Nunca enviar datos personales o sensibles** sin base legal y política de datos aprobada; minimizar y enmascarar antes de enviar.
6. Tratar la salida del modelo como **entrada no confiable**: validar contra el esquema y sanitizar (`sanitizarEntradaTexto`) antes de escribir en Sheets.

---

## 2. Cliente Canónico

```javascript
/**
 * Invoca Gemini (generateContent) con salida de texto o JSON estructurado.
 *
 * @param {string} prompt - Instrucción para el modelo.
 * @param {Object} [responseSchema] - Esquema (subconjunto OpenAPI) para forzar salida JSON.
 * @returns {ServiceResponse} data: texto o JSON parseado.
 */
function consultarGemini(prompt, responseSchema) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  const modelo = props.getProperty('GEMINI_MODEL');
  if (!apiKey || !modelo) {
    return { success: false, data: null, error: 'Configure GEMINI_API_KEY y GEMINI_MODEL en ScriptProperties.' };
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(modelo) + ':generateContent';

  const generationConfig = { temperature: 0.1 };
  if (responseSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = responseSchema;
  }

  const opciones = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: generationConfig
    }),
    muteHttpExceptions: true
  };

  try {
    const respuesta = fetchConReintentos_(url, opciones, 3);
    const codigo = respuesta.getResponseCode();
    const cuerpo = respuesta.getContentText();
    if (codigo !== 200) {
      return { success: false, data: null, error: 'Gemini HTTP ' + codigo + ': ' + cuerpo.substring(0, 500) };
    }

    const json = JSON.parse(cuerpo);
    const candidato = json.candidates && json.candidates[0];
    const texto = candidato && candidato.content && candidato.content.parts &&
      candidato.content.parts[0] && candidato.content.parts[0].text;
    if (!texto) {
      return { success: false, data: null, error: 'Respuesta sin contenido (posible bloqueo de seguridad).' };
    }

    return { success: true, data: responseSchema ? JSON.parse(texto) : texto, error: null };
  } catch (error) {
    return { success: false, data: null, error: 'Excepción Gemini: ' + error.message };
  }
}

/**
 * Reintenta ante 429 y 5xx con retroceso exponencial y jitter.
 * @private
 * @param {string} url
 * @param {Object} opciones - Opciones de UrlFetchApp (con muteHttpExceptions: true).
 * @param {number} maxIntentos
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse}
 */
function fetchConReintentos_(url, opciones, maxIntentos) {
  let respuesta;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    respuesta = UrlFetchApp.fetch(url, opciones);
    const codigo = respuesta.getResponseCode();
    if (codigo !== 429 && codigo < 500) return respuesta;
    if (intento < maxIntentos) {
      Utilities.sleep(1000 * Math.pow(2, intento - 1) + Math.floor(Math.random() * 500));
    }
  }
  return respuesta;
}
```

---

## 3. Salida Estructurada (ejemplo de esquema)

```javascript
const ESQUEMA_CLASIFICACION = {
  type: 'OBJECT',
  properties: {
    categoria: { type: 'STRING' },
    confianza: { type: 'NUMBER' },
    justificacion: { type: 'STRING' }
  },
  required: ['categoria', 'confianza']
};
```

---

## 4. Consideraciones de Cuotas y Costos

* La Gemini API impone límites por minuto y por día según modelo y plan: consultar la tabla de *rate limits* vigente.
* Cada llamada cuenta como `UrlFetchApp.fetch` en las cuotas de Apps Script y consume tiempo del límite de 6 minutos: procesar por lotes pequeños y usar *chunking* (skill `gas-concurrency-chunking`) para volúmenes grandes.
* Cachear resultados idempotentes con `CacheService` (hash del prompt como clave) para evitar llamadas repetidas.

