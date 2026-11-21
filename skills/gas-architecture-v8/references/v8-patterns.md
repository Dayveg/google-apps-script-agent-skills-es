# Patrones de Referencia V8 (`gas-architecture-v8`)

Implementaciones canónicas listas para integrar en proyectos Google Apps Script con motor V8.

---

## 1. Estructura de Archivos por Prefijo de Carga

```text
src/
├── 00_Namespace.js        # Declaración segura de App en globalThis
├── 01_Errors.js           # Jerarquía BaseAppError con Error.captureStackTrace
├── 02_Util.js             # ServiceResponseFactory y utilidades puras
├── 10_Infra_Config.js     # Configuración y ScriptProperties
├── 11_Infra_Lock.js       # Cerrojos de concurrencia (LockService)
├── 12_Infra_Security.js   # Sanitización OWASP y validación
├── 13_Infra_Logger.js     # Telemetría estructurada
├── 20_Repo_SheetTable.js  # SheetTableMapper (DAL dinámico)
├── 30_Svc_Gestion.js      # Servicios de dominio
├── 40_Container.js        # Composition Root (Lazy Container)
├── 50_Ctl_Api.js          # Controladores HTTP (doGet / doPost)
├── 51_Ctl_Sheet.js        # Controladores de triggers instalables
└── 99_EntryPoints.js      # Puntos de entrada globales de Apps Script
```

---

## 2. Verificación de Runtime V8 y Contenedor Perezoso (`Lazy Container`)

```javascript
/**
 * @fileoverview Inicialización segura de entorno V8 y contenedor con resolución perezosa.
 */
(function (globalContext) {
  'use strict';

  const esV8 = (function () {
    try {
      return typeof (() => {}) === 'function';
    } catch (_) {
      return false;
    }
  })();

  if (!esV8) {
    throw new Error('ENTORNO NO SOPORTADO: El proyecto requiere "runtimeVersion": "V8" en appsscript.json.');
  }

  if (typeof globalContext.App === 'undefined') {
    Object.defineProperty(globalContext, 'App', {
      value: {},
      writable: true,
      configurable: false,
      enumerable: true
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * Contenedor de servicios con instanciación diferida (evita errores de TDZ).
 * @namespace
 */
const AppContainer = (function () {
  'use strict';

  /** @type {Map<string, Object>} */
  const _singletons = new Map();

  return Object.freeze({
    /**
     * Resuelve una dependencia garantizando instanciación bajo demanda.
     * @param {string} clave - Identificador del servicio en el contenedor.
     * @returns {Object} Instancia congelada del servicio solicitado.
     */
    get: function (clave) {
      if (_singletons.has(clave)) {
        return _singletons.get(clave);
      }

      let instancia;
      switch (clave) {
        case 'Config':
          instancia = new AppConfigProvider();
          break;
        case 'Security':
          instancia = new AppSecurityService();
          break;
        case 'Lock':
          instancia = new AppLockManager();
          break;
        default:
          throw new ReferenceError(`[Container] Dependencia no registrada en V8: "${clave}"`);
      }

      const congelada = Object.freeze(instancia);
      _singletons.set(clave, congelada);
      return congelada;
    }
  });
})();
```

---

## 3. Jerarquía de Errores Tipados (`Error.captureStackTrace`)

```javascript
/**
 * Clase base de error arquitectónico para Google Apps Script V8.
 */
class BaseAppError extends Error {
  /**
   * @param {string} mensaje - Mensaje descriptivo para el log o el usuario.
   * @param {string} [codigo='INTERNAL_ERROR'] - Código identificador único del error.
   * @param {boolean} [esReintentable=false] - Indica si admite reintento transaccional.
   */
  constructor(mensaje, codigo = 'INTERNAL_ERROR', esReintentable = false) {
    super(mensaje);
    this.name = this.constructor.name;
    this.codigo = codigo;
    this.esReintentable = esReintentable;
    this.marcaTiempo = new Date().toISOString();

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(mensaje)).stack;
    }
  }

  /**
   * Serializa el error para Google Cloud Logging.
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      codigo: this.codigo,
      mensaje: this.message,
      esReintentable: this.esReintentable,
      marcaTiempo: this.marcaTiempo,
      traza: this.stack
    };
  }
}

class ValidacionDatosError extends BaseAppError {
  constructor(mensaje) {
    super(mensaje, 'VALIDACION_DATOS_ERROR', false);
  }
}

class ConcurrenciaLockError extends BaseAppError {
  constructor(mensaje) {
    super(mensaje, 'CONCURRENCIA_LOCK_ERROR', true);
  }
}

class CuotaExcedidaGoogleError extends BaseAppError {
  constructor(mensaje) {
    super(mensaje, 'CUOTA_EXCEDIDA_ERROR', true);
  }
}
```

---

## 4. Fábrica Inmutable `ServiceResponse`

```javascript
/**
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - Estado booleano de la operación.
 * @property {*} data - Carga útil devuelta o null en error.
 * @property {string|null} error - Mensaje descriptivo en caso de error o null en éxito.
 * @property {string|null} [errorCode] - Código estructurado de BaseAppError.
 * @property {string} timestamp - Marca de tiempo ISO-8601 de la resolución.
 */
const ServiceResponseFactory = Object.freeze({
  /**
   * Genera una respuesta exitosa sellada e inmutable.
   * @param {*} [data=null]
   * @returns {ServiceResponse}
   */
  ok: function (data = null) {
    return Object.freeze({
      success: true,
      data: data !== undefined ? data : null,
      error: null,
      errorCode: null,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Genera una respuesta de error formal a partir de una excepción o cadena.
   * @param {string|Error|BaseAppError} error
   * @param {string} [codigoPorDefecto='ERROR_GENERAL']
   * @returns {ServiceResponse}
   */
  fail: function (error, codigoPorDefecto = 'ERROR_GENERAL') {
    const mensaje = error instanceof Error ? error.message : String(error);
    const codigo = error instanceof BaseAppError ? error.codigo : codigoPorDefecto;

    return Object.freeze({
      success: false,
      data: null,
      error: mensaje,
      errorCode: codigo,
      timestamp: new Date().toISOString()
    });
  }
});

// Alias canónico utilizado en controladores y servicios del catálogo
const Response = ServiceResponseFactory;
```

---

## 5. Mapeo Dinámico de Columnas (`SheetTableMapper`)

```javascript
/**
 * Capa de Acceso a Datos (DAL) dinámica en V8 con caché en memoria.
 */
const SheetTableMapper = (function () {
  'use strict';

  /** @type {Map<number, Object.<string, number>>} */
  const _cacheLocalEncabezados = new Map();

  return Object.freeze({
    /**
     * Construye un mapa dinámico { 'ENCABEZADO_NORMALIZADO': numeroColumna1Based }.
     *
     * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
     * @param {boolean} [forzarLectura=false]
     * @returns {Object.<string, number>}
     */
    obtenerIndicesColumnas: function (hoja, forzarLectura = false) {
      if (!hoja) {
        throw new ValidacionDatosError('Instancia de Sheet no válida.');
      }

      const idHoja = hoja.getSheetId();
      if (!forzarLectura && _cacheLocalEncabezados.has(idHoja)) {
        return _cacheLocalEncabezados.get(idHoja);
      }

      const ultimaColumna = hoja.getLastColumn();
      if (ultimaColumna < 1) {
        return Object.freeze({});
      }

      const filaEncabezados = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
      const mapa = {};

      for (let c = 0; c < filaEncabezados.length; c++) {
        const celda = filaEncabezados[c];
        if (celda !== null && celda !== undefined && String(celda).trim() !== '') {
          const clave = String(celda)
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

          mapa[clave] = c + 1;
        }
      }

      const mapaInmutable = Object.freeze(mapa);
      _cacheLocalEncabezados.set(idHoja, mapaInmutable);
      return mapaInmutable;
    },

    /**
     * Limpia la caché en memoria cuando se realizan mutaciones estructurales de columnas.
     */
    invalidarCache: function () {
      _cacheLocalEncabezados.clear();
    }
  });
})();
```

---

## 6. Desreferenciación de Memoria (GC) en Procesos Masivos

```javascript
/**
 * Procesa una hoja grande liberando la matriz cruda inmediatamente tras transformarla.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @returns {ServiceResponse}
 */
function procesarPlanillaMasiva(hoja) {
  const cols = SheetTableMapper.obtenerIndicesColumnas(hoja);
  const idxId = (cols['ID'] || 1) - 1;
  const idxValor = (cols['VALOR'] || 2) - 1;

  let datosEnBruto = hoja.getDataRange().getValues();
  const filasValidas = [];

  for (let i = 1; i < datosEnBruto.length; i++) {
    if (datosEnBruto[i][idxId] !== '') {
      filasValidas.push({
        id: datosEnBruto[i][idxId],
        valor: datosEnBruto[i][idxValor]
      });
    }
  }

  // Liberar memoria del montón antes de persistir
  datosEnBruto = null;

  return ServiceResponseFactory.ok(filasValidas);
}
```

---

## 7. Tabla Comparativa: V8 vs Rhino y Antipatrones

| Comportamiento / API | Motor Antiguo (Rhino) | Motor Moderno (V8) | Impacto Arquitectónico en V8 |
| :--- | :--- | :--- | :--- |
| **Declaración de Variables** | `var` (*Hoisting* con `undefined`). | `const` y `let` (*Temporal Dead Zone*). | Las dependencias globales no pueden usarse antes de su línea de inicialización. |
| **Fechas (`Date`)** | Parsing laxo de formatos locales. | Parsing conforme a ECMAScript. | Usar ISO 8601 o `Utilities.formatDate`/`parseDate`. |
| **Iteración de propiedades** | Orden no garantizado. | Orden conforme a ES2015+. | Preferir `for...of` sobre `Object.keys()` / `Object.entries()`. |
| **Colecciones nativas** | Solo `Array` / `Object`. | `Map`, `Set`, `WeakMap`, `WeakSet`. | Búsquedas O(1) en lugar de O(N) con `indexOf` o `filter`. |
| **`JSON.stringify`** | Formateo básico. | Soporta `toJSON()` y replacers. | Las clases de dominio pueden gobernar su serialización declarando `toJSON()`. |

| Antipatrón | Impacto en Producción | Corrección Canónica |
| :--- | :--- | :--- |
| `var globalData = [];` | Fugas entre ejecuciones del contenedor V8. | `const` / `let` dentro de funciones o `AppContainer`. |
| `hoja.getRange(row, 4).setValue(val);` | Corrupción silenciosa si insertan columnas. | `const col = cols['ESTADO']; hoja.getRange(row, col).setValue(val);` |
| `throw new Error('Fallo');` en `doPost` | Rompe el contrato JSON de la Web App. | Retornar `ServiceResponseFactory.fail(error)`. |
| `getValue()` / `setValue()` en bucles | Agota el límite de 6 minutos y cuotas. | Lectura única `getValues()` y escritura única `setValues()`. |
