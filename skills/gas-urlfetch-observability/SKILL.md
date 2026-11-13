---
name: gas-urlfetch-observability
description: >-
  Consumo de APIs externas con UrlFetchApp (fetchAll, reintentos, manejo de errores HTTP, secretos) y
  observabilidad con console.* y Cloud Logging: logs estructurados, niveles, correlación y cuotas.
---

# UrlFetchApp y Observabilidad (`gas-urlfetch-observability`)

---

## 1. Reglas de `UrlFetchApp`

1. Scope requerido: `https://www.googleapis.com/auth/script.external_request`. No funciona en *simple triggers* (use triggers instalables).
2. Siempre `muteHttpExceptions: true` y revisar `getResponseCode()`; sin esa opción un 4xx/5xx lanza excepción y se pierde el cuerpo del error.
3. Secretos en cabecera (`Authorization`, `x-api-key`), nunca en query string.
4. Validar el esquema de la respuesta antes de usarla; una API externa es entrada no confiable.
5. Fijar `followRedirects` según necesidad y considerar `validateHttpsCertificates` (por defecto `true`; no desactivar).
6. Cuotas oficiales de `UrlFetchApp`: **20.000 llamadas/día** (consumidor) y **100.000 llamadas/día** (Google Workspace); tamaño máximo de payload/respuesta **50 MB por llamada** y longitud máxima de URL **2 KB**.

---

## 2. Cliente HTTP con Reintentos

```javascript
/**
 * Solicitud HTTP con reintentos para 429 y 5xx (retroceso exponencial con jitter).
 *
 * @param {string} url
 * @param {GoogleAppsScript.URL_Fetch.URLFetchRequestOptions} [opciones={}]
 * @param {number} [maxIntentos=3]
 * @returns {ServiceResponse} data: {codigo: number, cuerpo: string}
 */
function solicitudHttp(url, opciones = {}, maxIntentos = 3) {
  const config = Object.assign({}, opciones, { muteHttpExceptions: true });
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      const respuesta = UrlFetchApp.fetch(url, config);
      const codigo = respuesta.getResponseCode();
      if (codigo === 429 || codigo >= 500) {
        if (intento < maxIntentos) {
          Utilities.sleep(1000 * Math.pow(2, intento - 1) + Math.floor(Math.random() * 500));
          continue;
        }
      }
      const ok = codigo >= 200 && codigo < 300;
      return {
        success: ok,
        data: { codigo: codigo, cuerpo: respuesta.getContentText() },
        error: ok ? null : 'HTTP ' + codigo
      };
    } catch (error) {
      if (intento === maxIntentos) {
        return { success: false, data: null, error: 'Fallo de red: ' + error.message };
      }
      Utilities.sleep(1000 * intento);
    }
  }
  return { success: false, data: null, error: 'Reintentos agotados.' };
}
```

---

## 3. Peticiones en Paralelo con `fetchAll`

`UrlFetchApp.fetchAll(solicitudes)` ejecuta varias peticiones concurrentemente, reduciendo el tiempo total frente a un bucle secuencial.

```javascript
/**
 * Ejecuta N peticiones GET en paralelo.
 * @param {string[]} urls
 * @param {Object} [cabeceras={}]
 * @returns {Array<{url: string, codigo: number, cuerpo: string}>}
 */
function obtenerEnParalelo(urls, cabeceras = {}) {
  const solicitudes = urls.map((url) => ({ url: url, method: 'get', headers: cabeceras, muteHttpExceptions: true }));
  return UrlFetchApp.fetchAll(solicitudes).map((r, i) => ({
    url: urls[i],
    codigo: r.getResponseCode(),
    cuerpo: r.getContentText()
  }));
}
```

Limitar el tamaño de cada lote (p. ej. 20–50) para respetar límites de la API destino y de memoria.

---

## 4. Observabilidad: `console.*` y Cloud Logging

* `appsscript.json` debe tener `"exceptionLogging": "STACKDRIVER"` para enviar logs y excepciones a **Cloud Logging**.
* `Logger.log` es local a la ejecución; para persistencia y consulta usar **`console.log/info/warn/error`**, visibles en el panel *Executions* y en Cloud Logging.
* Pasar un **objeto** a `console.log` genera un registro estructurado consultable por campos.

```javascript
const Registro = Object.freeze({
  /**
   * Log estructurado con nivel, evento e identificador de correlación.
   * @param {'info'|'warn'|'error'} nivel
   * @param {string} evento - Identificador estable del evento (ej. 'GESTION_SYNC_OK').
   * @param {Object} [datos] - Datos NO sensibles.
   * @param {string} [idCorrelacion] - Une los logs de una misma ejecución.
   */
  escribir: function (nivel, evento, datos, idCorrelacion) {
    const entrada = {
      evento: evento,
      idCorrelacion: idCorrelacion || '',
      ts: new Date().toISOString(),
      datos: datos || {}
    };
    if (nivel === 'error') console.error(entrada);
    else if (nivel === 'warn') console.warn(entrada);
    else console.info(entrada);
  },

  /** @returns {string} Identificador corto de correlación para una ejecución. */
  nuevoIdCorrelacion: function () {
    return Utilities.getUuid().substring(0, 8);
  }
});
```

---

## 5. Buenas Prácticas de Registro

1. **Nunca registrar** secretos, tokens, payloads completos ni datos personales: registrar identificadores técnicos.
2. Usar nombres de evento estables (`MODULO_ACCION_RESULTADO`) para poder filtrar y alertar.
3. Registrar duración de operaciones críticas (`Date.now()` antes/después) para detectar degradación y proximidad al límite de 6 minutos.
4. Registrar cada reintento y cada agotamiento de cuota (`429`) como `warn`.
5. Combinar con `gas-incident-alerting` para escalar solo los eventos `error` críticos y evitar ruido.
6. Para análisis histórico, configurar en el proyecto de Google Cloud asociado un sumidero (*sink*) de logs o alertas basadas en métricas de logs.

