---
name: gas-architecture-v8
description: >-
  Estándares de arquitectura modular N-Capas, motor V8, espacio de nombres (Namespace),
  contrato ServiceResponse y tipado JSDoc estricto para Google Apps Script.
  Estándares de arquitectura modular N-Capas, motor V8, espacio de nombres inmutable (Namespace Pattern),
  contrato canónico ServiceResponse, jerarquía de errores tipados y tipado JSDoc estricto para Google Apps Script.
  Estándares exhaustivos para el motor V8 moderno en Google Apps Script: sintaxis ECMAScript 2015+,
  gestión de la Temporal Dead Zone (TDZ), orden de carga de archivos en clasp, gestión de memoria/GC,
  aislamiento con globalThis, clases, inmutabilidad y contratos tipados ServiceResponse.
---

# Arquitectura N-Capas y Estándares Modernos V8 (`gas-architecture-v8`)
# Google Apps Script V8 Modern Runtime (`gas-architecture-v8`)

Esta habilidad establece las directrices de diseño de software para proyectos sobre **Google Apps Script** ejecutándose en el motor **V8 moderno**, alineado con las recomendaciones oficiales de Google Workspace Developers.
Esta especificación técnica establece las directrices de ingeniería de software para sistemas de misión crítica sobre **Google Apps Script** bajo el motor de ejecución **V8 moderno (ECMAScript 2015+)**, alineado con las directrices oficiales de [Google Workspace Developers](https://developers.google.com/apps-script/guides/v8-runtime).
Esta especificación técnica constituye el manual de ingeniería definitivo para el desarrollo de software sobre el motor **Google Apps Script V8 moderno (Chrome V8 / ECMAScript 2015+)**, alineado con la guía oficial de migración y optimización de [Google Workspace Developers V8 Runtime Overview](https://developers.google.com/apps-script/guides/v8-runtime).

---

## 1. Topología Arquitectónica N-Capas
## 1. Características Fundamentales del Motor V8 en Apps Script

Para evitar código monolítico en un único archivo `.gs`, todo proyecto debe estructurarse en cuatro capas desacopladas:
El desarrollo en Google Apps Script tiende al antipatrón monolítico debido a la ausencia nativa de módulos ESM (`import/export`). Para garantizar alta cohesión, bajo acoplamiento y testeabilidad en local con Jest, todo proyecto debe desacoplarse en cuatro capas estrictas:
La activación de V8 en `appsscript.json` mediante `"runtimeVersion": "V8"` sustituye el antiguo motor Mozilla Rhino (ES5 / JS 1.6) por el compilador **Chrome V8 con optimizador JIT (Just-In-Time)**.

```
┌─────────────────────────────────────────────────────────────────┐
│               1. CAPA DE CONTROLADORES / ENTRADA                │
│   (Main.js, doPost, doGet, handleInstalledEdit, triggers)       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│               2. CAPA DE SERVICIOS / DOMINIO                    │
│   (Procesamiento, validaciones relacionales, orquestación)      │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│               3. CAPA DE ACCESO A DATOS (DAL)                   │
│   (Mapeo dinámico de columnas, lectura/escritura por lotes)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│               4. CAPA DE INFRAESTRUCTURA                        │
│   (ConfigProvider, LockService, CacheService, Telemetría)       │
└─────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│                   1. CAPA DE CONTROLADORES / ENTRADA                   │
│  Controladores HTTP (doGet, doPost), disparadores (handleInstalledEdit,│
│  onOpen, onEditSimple), eventos de formulario e interfaces modales.    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Invocación delegada
┌───────────────────────────────────▼────────────────────────────────────┐
│                    2. CAPA DE SERVICIOS / DOMINIO                      │
│  Reglas de negocio, orquestación transaccional, validaciones de        │
│  integridad, cálculo de métricas y despachos condicionales.           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Consultas / Persistencia
┌───────────────────────────────────▼────────────────────────────────────┐
│                  3. CAPA DE ACCESO A DATOS (DAL / REPO)                │
│  Mapeo dinámico encabezado-columna, abstracción de Sheets y Drive,     │
│  lecturas y escrituras en lote (batching), transformación a entidades. │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Utilidades transversales
┌───────────────────────────────────▼────────────────────────────────────┐
│                      4. CAPA DE INFRAESTRUCTURA                        │
│  LockService canónico, CacheService multinivel, ConfigProvider de      │
│  ambientes (DEV/PROD), sanitización OWASP y telemetría de errores.     │
└────────────────────────────────────────────────────────────────────────┘
```
### Capacidades Modernas Nativas Soportadas:
1. **Alcance de Bloque (`Block Scoping`)**: `const` y `let` con aislamiento léxico. Prohibición terminante de `var`.
2. **Clases con Herencia Real (`class ... extends`)**: Métodos estáticos, constructores formales, getters y setters.
3. **Desestructuración Avanzada (`Destructuring`)**: Extracción de objetos y matrices con valores por defecto y alias.
4. **Operadores Rest y Spread (`...`)**: Manipulación inmutable de objetos y listas.
5. **Estructuras de Datos Nativas de Alta Complejidad**: `Map`, `Set`, `WeakMap`, `WeakSet`, `Symbol`.
6. **Encadenamiento Opcional y Coalescencia Nula**: `objeto?.propiedad?.subpropiedad` y `valor ?? valorPorDefecto`.
7. **Plantillas Literales Multilínea**: Interpolación declarativa `${expresion}` sin concatenación con `+`.
8. **Funciones Flecha (`Arrow Functions`)**: Preservación léxica del contexto `this`.
9. **Iteradores y Generadores**: Bucles `for...of` nativos sobre colecciones iterables.
10. **Trazas de Pila Detalladas**: Propiedad `Error.stack` con números de línea exactos por archivo `.gs`.

---

## 2. Espacio de Nombres Canónico (`Namespace Pattern`)
## 2. El Problema del Orden de Carga y la *Temporal Dead Zone* (TDZ)

En el motor V8 de Google Apps Script, todos los archivos `.gs` comparten el mismo alcance global. Para evitar colisiones de variables y funciones globales, se debe agrupar la arquitectura bajo un objeto raíz inmutable:
En el motor V8, todos los archivos `.gs` residen en un único contexto global (`globalThis`). Las declaraciones libres de funciones como `function procesar()` o variables globales provocan colisiones silenciosas cuando el código crece.
### El Fenómeno Crítico en Apps Script
En Google Apps Script, **no existe el sistema de módulos `import` / `export`**. El compilador V8 concatena e inicializa todos los archivos `.gs` del proyecto en un único contexto global, evaluándolos en **estricto orden alfabético** por nombre de archivo.

### Implementación Canónica:
* **En el viejo Rhino**: `var` se elevaba (*hoisting*) al inicio con valor `undefined`, ocultando errores pero generando comportamientos erráticos.
* **En el moderno V8**: Las declaraciones con `const` y `let` **no se inicializan hasta que el flujo de ejecución llega a su línea**, existiendo en la llamada **Temporal Dead Zone (TDZ)**.
* **El Fallo Común**: Si el archivo `01_Servicio.js` intenta leer una constante o clase declarada con `const` en `02_Config.js` durante la carga inicial global, V8 arroja inmediatamente un error fatal:
  `ReferenceError: Cannot access 'Config' before initialization`.

### Solución Arquitectónica Canónica 1: Prefijos Numéricos de Carga

Organizar los archivos en la estructura del proyecto y en el `filePushOrder` de `.clasp.json`:

```text
src/
├── 00_Namespace.js        # Declaración del namespace raíz App
├── 01_Errors.js           # Jerarquía de clases de error tipadas
├── 02_Util.js             # Contrato Response y utilidades puras
├── 10_Infra_Config.js     # Configuración y ScriptProperties
├── 11_Infra_Lock.js       # Cerrojos de concurrencia
├── 12_Infra_Security.js   # Sanitización OWASP y validación
├── 13_Infra_Logger.js     # Telemetría estructurada
├── 20_Repo_SheetTable.js  # Acceso a datos (DAL dinámico)
├── 30_Svc_Gestion.js      # Servicios de dominio
├── 40_Container.js        # Composition Root (Inyección de dependencias)
├── 50_Ctl_Api.js          # Controladores HTTP (doGet / doPost)
├── 51_Ctl_Sheet.js        # Controladores de triggers instalables
└── 99_EntryPoints.js      # Puntos de entrada globales de Apps Script
```

### Solución Arquitectónica Canónica 2: Inicialización Perezosa (Lazy Container)

Para desacoplar por completo el código del orden de carga de archivos, se implementa el patrón **Composition Root** con resolución diferida mediante funciones o getters:

```javascript
/**
 * Espacio de nombres canónico de la aplicación.
 * @fileoverview Namespace raíz del sistema corporativo.
 * Garantiza aislamiento y previene colisiones en el contexto global de V8.
 * @fileoverview Contenedor de servicios con resolución perezosa (Lazy Resolution).
 * Evita colisiones de Temporal Dead Zone (TDZ) en V8 al diferir la instanciación.
 */

/**
 * Espacio de nombres canónico e inmutable de la aplicación.
 * @namespace
 */
const App = (function () {
const App = (function (globalContext) {
  'use strict';

  return {
  // Almacén privado de instancias singleton
  const _singletons = new Map();

  return Object.freeze({
    Config: {},
    Security: {},
    Lock: {},
    Logger: {},
    Repositories: {},
    Services: {},
    Controllers: {}
    /**
     * Resuelve una dependencia garantizando instanciación bajo demanda.
     * @param {string} clave - Identificador del servicio en el contenedor.
     * @returns {*} Instancia del servicio solicitado.
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

      _singletons.set(clave, Object.freeze(instancia));
      return _singletons.get(clave);
    }
  };
  });
})();
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

---

## 3. Contrato Canónico de Respuesta (`ServiceResponse`)
## 3. Manejo de Alcance Global y `globalThis`

Toda función de servicio, controlador, API interna o proceso batch debe retornar obligatoriamente una estructura `ServiceResponse` predecible:
Toda función de servicio, repositorio, endpoint o API interna debe retornar una estructura inmutable `ServiceResponse`, eliminando el lanzamiento de excepciones no controladas hacia capas superiores:
En V8 moderno, el objeto global estándar de JavaScript es **`globalThis`**.

```javascript
/**
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - Indica si la operación culminó con éxito.
 * @property {*} data - Carga útil de datos retornados o null en caso de error.
 * @property {string|null} error - Mensaje descriptivo del error o null si fue exitosa.
 * @property {boolean} success - Indica si la operación culminó satisfactoriamente.
 * @property {*} data - Carga útil retornada por la lógica de negocio o null en error.
 * @property {string|null} error - Mensaje técnico descriptivo del fallo o null en éxito.
 * @property {string|null} [errorCode] - Código de error estructurado de la jerarquía AppError.
 * @fileoverview Inicialización segura de entorno en motor V8.
 */

(function () {
  'use strict';

  // Verificar que el runtime activo sea V8 y no Rhino
  const esV8 = (function () {
    try {
      // La sintaxis de funciones flecha y parámetros rest valida V8
      return typeof (() => {}) === 'function';
    } catch (_) {
      return false;
    }
  })();

  if (!esV8) {
    throw new Error('ENTORNO NO SOPORTADO: El proyecto requiere el motor V8 moderno activado en appsscript.json.');
  }

  // Registrar el namespace corporativo en globalThis de forma inmutable
  if (typeof globalThis.App === 'undefined') {
    Object.defineProperty(globalThis, 'App', {
      value: {},
      writable: true,
      configurable: false,
      enumerable: true
    });
  }
})();
```

---

## 4. Gestión de Memoria y Recolección de Basura (GC) en V8

Google Apps Script no documenta un límite público de memoria de montón (*heap*) por ejecución; en la práctica, matrices muy grandes provocan errores de memoria. Cuando se procesan matrices masivas de Google Sheets (`getValues()` con miles de filas y columnas):

### Reglas de Optimización de Memoria:
1. **Desreferenciación Explícita (`Nulling Out`)**:
   Las variables locales capturadas por funciones anónimas o cierres (*closures*) no son liberadas por el recolector de basura hasta que la función padre finaliza. Si se procesa un bloque masivo de datos, asignar `null` a la matriz intermedia inmediatamente después de transformarla:
   ```javascript
   function procesarPlanillaMasiva(hoja) {
     let datosEnBruto = hoja.getDataRange().getValues();
     const filasValidas = [];

     for (let i = 1; i < datosEnBruto.length; i++) {
       if (datosEnBruto[i][0] !== '') {
         filasValidas.push({ id: datosEnBruto[i][0], valor: datosEnBruto[i][1] });
       }
     }

     // Liberar la memoria de la matriz gigante inmediatamente
     datosEnBruto = null;

     return ejecutarPersistencia(filasValidas);
   }
   ```
2. **Evitar la Creación de Objetos dentro de Bucles Críticos**:
   Reutilizar objetos de configuración en lugar de instanciar nuevos dentro de iteraciones de 10.000 filas para evitar pausas del Garbage Collector (*GC Stop-the-world*).

---

## 5. Jerarquía de Errores Tipados y `Error.captureStackTrace` en V8

A diferencia del viejo motor Rhino, V8 incluye la API nativa de trazas de pila `Error.captureStackTrace`, permitiendo construir diagnósticos de observabilidad precisos:

```javascript
/**
 * Genera una respuesta exitosa estandarizada.
 * @param {*} data - Datos resultantes del proceso.
 * @returns {ServiceResponse}
 * Jerarquía de Errores Tipados de la Aplicación.
 * Clase base de error arquitectónico para Google Apps Script V8.
 * Captura la traza de ejecución exacta sin contaminar el constructor.
 */
function createSuccessResponse(data) {
  return {
    success: true,
    data: data !== undefined ? data : null,
    error: null
  };
class AppError extends Error {
class BaseAppError extends Error {
  /**
   * @param {string} message - Descripción legible del error.
   * @param {string} [code='APP_ERROR'] - Código de error categórico.
   * @param {boolean} [isRetryable=false] - Indica si la operación admite reintento.
   * @param {string} mensaje - Mensaje descriptivo para el log o el usuario.
   * @param {string} [codigo='INTERNAL_ERROR'] - Código identificador único del error.
   * @param {boolean} [esReintentable=false] - Indica si admite reintento transaccional.
   */
  constructor(message, code = 'APP_ERROR', isRetryable = false) {
    super(message);
  constructor(mensaje, codigo = 'INTERNAL_ERROR', esReintentable = false) {
    super(mensaje);
    this.name = this.constructor.name;
    this.code = code;
    this.isRetryable = isRetryable;
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
   * Serializa el error a un formato apto para registro en Google Cloud Logging.
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

class ValidationError extends AppError {
  constructor(message) {
    super(message, 'VALIDATION_ERROR', false);
class ValidacionDatosError extends BaseAppError {
  constructor(mensaje) {
    super(mensaje, 'VALIDACION_DATOS_ERROR', false);
  }
}

class LockTimeoutError extends AppError {
  constructor(message) {
    super(message, 'LOCK_TIMEOUT_ERROR', true);
class ConcurrenciaLockError extends BaseAppError {
  constructor(mensaje) {
    super(mensaje, 'CONCURRENCIA_LOCK_ERROR', true);
  }
}

class QuotaExceededError extends AppError {
  constructor(message) {
    super(message, 'QUOTA_EXCEEDED_ERROR', true);
class CuotaExcedidaGoogleError extends BaseAppError {
  constructor(mensaje) {
    super(mensaje, 'CUOTA_EXCEDIDA_ERROR', true);
  }
}
```

---

## 6. Contrato Inmutable `ServiceResponse`

```javascript
/**
 * Genera una respuesta de error estandarizada.
 * @param {string|Error} error - Mensaje o instancia de error capturada.
 * @returns {ServiceResponse}
 * Fábrica de respuestas canónicas inmutables.
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - Estado booleano de la operación.
 * @property {*} data - Carga útil devuelta o null en error.
 * @property {string|null} error - Mensaje descriptivo en caso de error o null en éxito.
 * @property {string|null} [errorCode] - Código estructurado de BaseAppError.
 * @property {string} timestamp - Marca de tiempo ISO-8601 de la resolución.
 */
function createErrorResponse(error) {
  const mensaje = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    data: null,
    error: mensaje
  };
}
const Response = Object.freeze({

const ServiceResponseFactory = Object.freeze({
  /**
   * Genera un ServiceResponse exitoso.
   * @param {*} [data=null] - Carga útil de datos.
   * Genera una respuesta exitosa sellada e inmutable.
   * @param {*} [data=null]
   * @returns {ServiceResponse}
   */
  ok: function (data = null) {
    return Object.freeze({
      success: true,
      data: data,
      error: null,
      errorCode: null
      errorCode: null,
      timestamp: new Date().toISOString()
    });
  },

  /**
   * Genera un ServiceResponse fallido a partir de un mensaje o excepción.
   * @param {string|Error|AppError} error - Instancia de error o cadena explicativa.
   * @param {string} [code='OPERATION_FAILED'] - Código de categorización.
   * Genera una respuesta de error formal a partir de una excepción o cadena.
   * @param {string|Error|BaseAppError} error
   * @param {string} [codigoPorDefecto='ERROR_GENERAL']
   * @returns {ServiceResponse}
   */
  fail: function (error, code = 'OPERATION_FAILED') {
    const message = error instanceof Error ? error.message : String(error);
    const resolvedCode = error instanceof AppError ? error.code : code;
  fail: function (error, codigoPorDefecto = 'ERROR_GENERAL') {
    const mensaje = error instanceof Error ? error.message : String(error);
    const codigo = error instanceof BaseAppError ? error.codigo : codigoPorDefecto;

    return Object.freeze({
      success: false,
      data: null,
      error: message,
      errorCode: resolvedCode
      error: mensaje,
      errorCode: codigo,
      timestamp: new Date().toISOString()
    });
  }
});
```

---

## 4. Acceso a Datos Dinámico (DAL sin Acoplamiento de Índices)
## 4. Capa de Acceso a Datos Dinámica (DAL)
## 7. Mapeo Dinámico de Columnas en V8 con Normalización Unicode

**Prohibido:** Acceder a columnas usando índices numéricos estáticos (como `fila[2]`). Si un usuario inserta una columna en la hoja, el sistema colapsa.
### Regla de Oro
**QUEDA ESTRICTAMENTE PROHIBIDO** acoplar la lectura o escritura a índices de columna estáticos quemados en el código (ej. `fila[3]`, `getRange(fila, 5)`). Si un usuario inserta, mueve o renombra una columna en la hoja, el sistema corrompe los datos.

**Obligatorio:** Construir un mapa dinámico encabezado-columna con soporte de caché:
### Implementación del Mapeo Dinámico con Caché en Memoria:

```javascript
/**
 * Genera un mapa asociativo de nombres de columnas normalizados a sus índices 1-based.
 * Almacén en memoria de mapas de encabezados por hoja para evitar lecturas redundantes en la misma invocación.
 * @type {Map<string, Object.<string, number>>}
 * @private
 * @fileoverview Capa de Acceso a Datos (DAL) dinámica en V8.
 */
const _mapasColumnasCache = new Map();

/**
 * Resuelve y normaliza el mapa dinámico de columnas (1-based) para una hoja de Google Sheets.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja - Instancia de la hoja activa.
 * @returns {Object.<string, number>} Mapa { 'NOMBRE_COLUMNA': índiceColumna }
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja - Instancia de la hoja objetivo.
 * @param {boolean} [forzarRefresco=false] - Invalida la caché local si se han insertado columnas dinámicas.
 * @returns {Object.<string, number>} Diccionario donde la clave es el encabezado normalizado y el valor es el índice 1-based.
 */
function obtenerMapaColumnas(hoja) {
function obtenerMapaColumnas(hoja, forzarRefresco = false) {
  if (!hoja) {
    throw new ValidationError('Se requiere una instancia válida de Sheet para resolver columnas.');
  }
const SheetTableMapper = (function () {
  'use strict';

  const hojaId = hoja.getSheetId();
  const cacheKey = `SHEET_HEADER_MAP_${hojaId}`;
  // Mapa local para evitar lecturas de cabecera repetitivas en la misma petición
  const _cacheLocalEncabezados = new Map();

  if (!forzarRefresco && _mapasColumnasCache.has(cacheKey)) {
    return _mapasColumnasCache.get(cacheKey);
  }
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

  const ultimaColumna = hoja.getLastColumn();
  if (ultimaColumna < 1) return {};
  if (ultimaColumna < 1) {
    return {};
  }
      const idHoja = hoja.getSheetId();
      if (!forzarLectura && _cacheLocalEncabezados.has(idHoja)) {
        return _cacheLocalEncabezados.get(idHoja);
      }

  // Leer exclusivamente la primera fila con encabezados
  const encabezados = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
  const mapa = {};
      const ultimaColumna = hoja.getLastColumn();
      if (ultimaColumna < 1) {
        return Object.freeze({});
      }

  for (let c = 0; c < encabezados.length; c++) {
    const nombre = String(encabezados[c] || '').trim().toUpperCase();
    if (nombre) {
      mapa[nombre] = c + 1; // Índices 1-based de Google Sheets
    const nombreLimpio = String(encabezados[c] || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // Remover tildes y caracteres diacríticos
      // Lectura en lote de toda la fila 1
      const filaEncabezados = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
      const mapa = {};

    if (nombreLimpio) {
      mapa[nombreLimpio] = c + 1; // Índices 1-based de Google Sheets
      for (let c = 0; c < filaEncabezados.length; c++) {
        const celda = filaEncabezados[c];
        if (celda !== null && celda !== undefined && String(celda).trim() !== '') {
          // Normalización estricta V8: mayúsculas, sin espacios extras y sin acentos
          const clave = String(celda)
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

          mapa[clave] = c + 1; // Índices 1-based nativos de Sheets
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
  }

  return mapa;
  const mapaInmutable = Object.freeze(mapa);
  _mapasColumnasCache.set(cacheKey, mapaInmutable);
  return mapaInmutable;
}
  });
})();
```

---

## 5. Reglas de Inmutabilidad y Funciones Puras en V8
## 5. Tabla de Antipatrones y Correcciones Oficiales
## 8. Tabla Comparativa: Migración y Diferencias Críticas V8 vs Rhino

1. **Uso estricto de `const` y `let`**: Prohibido el uso de `var` en proyectos modernos.
2. **Desestructuración y Plantillas Literales**: Aprovechar sintaxis ES6+ nativa de V8.
3. **Manejo Estructurado de Errores**: Todo bloque de persistencia debe estar envuelto en `try...catch...finally` garantizando la liberación de recursos.
| Antipatrón Amateur | Impacto en Producción | Corrección Canónica Enterprise |
| :--- | :--- | :--- |
| `var globalData = [];` | Fugas de memoria entre ejecuciones de contenedor V8. | Declaración con `const` / `let` dentro de funciones o en `App.Config`. |
| `hoja.getRange(row, 4).setValue(val);` | Corrupción de registros si se inserta una columna antes de la 4. | `const col = mapa[COLUMNAS.ESTADO]; hoja.getRange(row, col).setValue(val);` |
| `throw new Error('Fallo');` en controladores | Excepción no capturada rompe la ejecución de Web Apps o triggers. | Retornar `Response.fail(error)` asegurando serialización JSON predecible. |
| Invocaciones `getValue()` dentro de bucles `for` | Agota el tiempo de ejecución de 6 minutos y satura cuotas. | Lectura única de matriz con `getValues()`, procesamiento en memoria y `setValues()`. |
| Comportamiento / API | Motor Antiguo (Rhino) | Motor Moderno (V8) | Impacto Arquitectónico en V8 |
| :--- | :--- | :--- | :--- |
| **Declaración de Variables** | `var` (Hoisting con `undefined`). | `const` y `let` (Temporal Dead Zone). | Las dependencias globales no pueden usarse antes de su línea de inicialización. |
| **Fechas (`Date`)** | Parsing laxo de formatos no estándar. | Parsing conforme a ECMAScript. | Usar ISO 8601 o `Utilities.formatDate`/`parseDate`; no depender de formatos locales. |
| **Iteración de propiedades** | Orden no garantizado. | Orden conforme a ES2015+. | Preferir `for...of` sobre `Object.keys()` / `Object.entries()`. |
| **Objetos Nativos de Colección** | Arrays tradicionales exclusivamente. | Soporte completo para `Map`, `Set`, `WeakMap`. | O(1) en búsquedas de claves primarias en lugar de O(N) con `indexOf` o `filter`. |
| **`JSON.stringify`** | Formateo básico. | Soporta replacers, `toJSON()` en clases y serialización circular segura. | Las clases de dominio pueden gobernar su serialización declarando `toJSON()`. |
