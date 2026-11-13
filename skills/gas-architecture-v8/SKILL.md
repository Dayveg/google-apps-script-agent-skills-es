---
name: gas-architecture-v8
description: >-
  Estándares de arquitectura modular N-Capas, motor V8, espacio de nombres (Namespace),
  contrato ServiceResponse y tipado JSDoc estricto para Google Apps Script.
  Estándares exhaustivos para el motor V8 moderno en Google Apps Script: sintaxis ECMAScript 2015+,
  gestión de la Temporal Dead Zone (TDZ), orden de carga de archivos en clasp, gestión de memoria/GC,
  aislamiento con globalThis, clases, inmutabilidad y contratos tipados ServiceResponse.
---

# Google Apps Script V8 Modern Runtime (`gas-architecture-v8`)

Esta habilidad establece las directrices de diseño de software para proyectos sobre **Google Apps Script** ejecutándose en el motor **V8 moderno**, alineado con las recomendaciones oficiales de Google Workspace Developers.
Esta especificación técnica constituye el manual de ingeniería definitivo para el desarrollo de software sobre el motor **Google Apps Script V8 moderno (Chrome V8 / ECMAScript 2015+)**, alineado con la guía oficial de migración y optimización de [Google Workspace Developers V8 Runtime Overview](https://developers.google.com/apps-script/guides/v8-runtime).

---

## 1. Características Fundamentales del Motor V8 en Apps Script

Para evitar código monolítico en un único archivo `.gs`, todo proyecto debe estructurarse en cuatro capas desacopladas:
La activación de V8 en `appsscript.json` mediante `"runtimeVersion": "V8"` sustituye el antiguo motor Mozilla Rhino (ES5 / JS 1.6) por el compilador **Chrome V8 con optimizador JIT (Just-In-Time)**.

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

## 2. El Problema del Orden de Carga y la *Temporal Dead Zone* (TDZ)

En el motor V8 de Google Apps Script, todos los archivos `.gs` comparten el mismo alcance global. Para evitar colisiones de variables y funciones globales, se debe agrupar la arquitectura bajo un objeto raíz inmutable:
### El Fenómeno Crítico en Apps Script
En Google Apps Script, **no existe el sistema de módulos `import` / `export`**. El compilador V8 concatena e inicializa todos los archivos `.gs` del proyecto en un único contexto global, evaluándolos en **estricto orden alfabético** por nombre de archivo.

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
 * @fileoverview Contenedor de servicios con resolución perezosa (Lazy Resolution).
 * Evita colisiones de Temporal Dead Zone (TDZ) en V8 al diferir la instanciación.
 */

const App = (function (globalContext) {
  'use strict';

  return {
  // Almacén privado de instancias singleton
  const _singletons = new Map();

  return Object.freeze({
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
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

---

## 3. Manejo de Alcance Global y `globalThis`

Toda función de servicio, controlador, API interna o proceso batch debe retornar obligatoriamente una estructura `ServiceResponse` predecible:
En V8 moderno, el objeto global estándar de JavaScript es **`globalThis`**.

```javascript
/**
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

El motor V8 asigna un límite de memoria de montón (*heap memory*) por contenedor en Google Apps Script (típicamente 512 MB). Cuando se procesan matrices masivas de Google Sheets (`getValues()` con miles de filas y columnas):

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
 * Clase base de error arquitectónico para Google Apps Script V8.
 * Captura la traza de ejecución exacta sin contaminar el constructor.
 */
function createSuccessResponse(data) {
  return {
    success: true,
    data: data !== undefined ? data : null,
    error: null
  };
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

## 6. Contrato Inmutable `ServiceResponse`

```javascript
/**
 * Genera una respuesta de error estandarizada.
 * @param {string|Error} error - Mensaje o instancia de error capturada.
 * @returns {ServiceResponse}
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

const ServiceResponseFactory = Object.freeze({
  /**
   * Genera una respuesta exitosa sellada e inmutable.
   * @param {*} [data=null]
   * @returns {ServiceResponse}
   */
  ok: function (data = null) {
    return Object.freeze({
      success: true,
      data: data,
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
```

---

## 4. Acceso a Datos Dinámico (DAL sin Acoplamiento de Índices)
## 7. Mapeo Dinámico de Columnas en V8 con Normalización Unicode

**Prohibido:** Acceder a columnas usando índices numéricos estáticos (como `fila[2]`). Si un usuario inserta una columna en la hoja, el sistema colapsa.
```javascript
/**
 * Genera un mapa asociativo de nombres de columnas normalizados a sus índices 1-based.
 * @fileoverview Capa de Acceso a Datos (DAL) dinámica en V8.
 */

const SheetTableMapper = (function () {
  'use strict';

  // Mapa local para evitar lecturas de cabecera repetitivas en la misma petición
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

      // Lectura en lote de toda la fila 1
      const filaEncabezados = hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0];
      const mapa = {};

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
  });
})();
```

---

## 5. Reglas de Inmutabilidad y Funciones Puras en V8
## 8. Tabla Comparativa: Migración y Diferencias Críticas V8 vs Rhino

1. **Uso estricto de `const` y `let`**: Prohibido el uso de `var` en proyectos modernos.
2. **Desestructuración y Plantillas Literales**: Aprovechar sintaxis ES6+ nativa de V8.
3. **Manejo Estructurado de Errores**: Todo bloque de persistencia debe estar envuelto en `try...catch...finally` garantizando la liberación de recursos.
| Comportamiento / API | Motor Antiguo (Rhino) | Motor Moderno (V8) | Impacto Arquitectónico en V8 |
| :--- | :--- | :--- | :--- |
| **Declaración de Variables** | `var` (Hoisting con `undefined`). | `const` y `let` (Temporal Dead Zone). | Las dependencias globales no pueden usarse antes de su línea de inicialización. |
| **`this` en Ámbito Global** | Referencia al objeto global. | `undefined` en modo estricto o en funciones independientes. | Obligatorio usar `globalThis` para interactuar con el entorno global de Apps Script. |
| **Parsing de Fechas (`Date.parse`)** | Aceptaba formatos no estándar y variables del sistema. | ISO 8601 estricto (RFC 2822). | Fechas no normalizadas devuelven `NaN`. Obligatorio usar `Utilities.formatDate` o ISO 8601. |
| **Iteración con `for...in`** | Iteraba propiedades en orden impredecible. | Conforme a la especificación ES2015+. | Usar `for...of` sobre `Object.keys()` o `Object.entries()`. |
| **Objetos Nativos de Colección** | Arrays tradicionales exclusivamente. | Soporte completo para `Map`, `Set`, `WeakMap`. | O(1) en búsquedas de claves primarias en lugar de O(N) con `indexOf` o `filter`. |
| **`JSON.stringify`** | Formateo básico. | Soporta replacers, `toJSON()` en clases y serialización circular segura. | Las clases de dominio pueden gobernar su serialización declarando `toJSON()`. |
