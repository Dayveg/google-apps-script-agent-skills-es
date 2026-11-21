---
name: gas-state-cache-properties
description: >-
  Gestión de estado y configuración en Apps Script: PropertiesService (Script/User/Document), CacheService
  (Script/User/Document), límites oficiales, patrones de caché con invalidación y manejo de objetos JSON.
  Usar cuando: se persistan secretos, configuración o caché temporal en PropertiesService o CacheService de GAS.
  NO usar cuando: se use Redis, Memcached, SQLite o variables de entorno .env en servidores externos.
---

# Estado, Configuración y Caché (`gas-state-cache-properties`)

---

## 1. Selección del Almacén

| Almacén | Alcance | Persistencia | Límites (verificar en documentación vigente) |
| :--- | :--- | :--- | :--- |
| `PropertiesService.getScriptProperties()` | Todos los usuarios del script | Permanente | ~9 KB por valor; ~500 KB por almacén |
| `PropertiesService.getUserProperties()` | Un usuario del script | Permanente | Mismos límites, por usuario |
| `PropertiesService.getDocumentProperties()` | Documento contenedor | Permanente | Mismos límites |
| `CacheService.getScriptCache()` | Todos los usuarios | Volátil, TTL máx. 6 h (21600 s) | ~100 KB por valor |
| `CacheService.getUserCache()` | Un usuario | Volátil | Igual |
| `CacheService.getDocumentCache()` | Documento contenedor | Volátil | Igual |

Reglas de decisión:
* **Configuración, secretos, cursores de reanudación** → `PropertiesService` (nunca `CacheService`: puede desaparecer en cualquier momento).
* **Resultados recomputables** (mapas de columnas, catálogos, respuestas de APIs) → `CacheService`.
* **Secretos**: usar Script Properties; no usar `getUserProperties` para claves compartidas de integración.

---

## 2. Configuración Tipada con Valores por Defecto

```javascript
const Configuracion = Object.freeze({
  /**
   * Lee una propiedad de script con valor por defecto.
   * @param {string} clave
   * @param {string} [porDefecto='']
   * @returns {string}
   */
  obtener: function (clave, porDefecto = '') {
    const valor = PropertiesService.getScriptProperties().getProperty(clave);
    return valor === null ? porDefecto : valor;
  },

  /**
   * Exige una propiedad obligatoria; falla con mensaje accionable.
   * @param {string} clave
   * @returns {string}
   * @throws {Error} Si la propiedad no está configurada.
   */
  exigir: function (clave) {
    const valor = PropertiesService.getScriptProperties().getProperty(clave);
    if (!valor) throw new Error('Propiedad obligatoria no configurada: ' + clave);
    return valor;
  },

  /** @returns {boolean} true si ENVIRONMENT es PRODUCTION. */
  esProduccion: function () {
    return this.obtener('ENVIRONMENT', 'DEVELOPMENT') === 'PRODUCTION';
  }
});
```

> Por defecto, cuando `ENVIRONMENT` no esté definido asumir `DEVELOPMENT` (fallo seguro: no producir efectos sobre producción).

---

## 3. Caché de JSON con Invalidación por Versión

`CacheService` solo almacena cadenas: serializar con `JSON.stringify`. Para invalidar todo un grupo de claves sin enumerarlas, usar una **versión** en la clave.

```javascript
const CacheJson = Object.freeze({
  /**
   * Obtiene de caché o calcula y guarda.
   * @param {string} clave
   * @param {number} ttlSegundos - Máximo 21600.
   * @param {function(): *} calcular
   * @returns {*}
   */
  obtenerOCalcular: function (clave, ttlSegundos, calcular) {
    const cache = CacheService.getScriptCache();
    const version = PropertiesService.getScriptProperties().getProperty('CACHE_VERSION') || '1';
    const claveFinal = 'v' + version + ':' + clave;

    const enCache = cache.get(claveFinal);
    if (enCache !== null) return JSON.parse(enCache);

    const valor = calcular();
    const serializado = JSON.stringify(valor);
    if (serializado.length < 90000) { // margen bajo el límite de ~100 KB
      cache.put(claveFinal, serializado, Math.min(ttlSegundos, 21600));
    }
    return valor;
  },

  /** Invalida toda la caché lógica incrementando la versión. */
  invalidarTodo: function () {
    const props = PropertiesService.getScriptProperties();
    const actual = parseInt(props.getProperty('CACHE_VERSION') || '1', 10);
    props.setProperty('CACHE_VERSION', String(actual + 1));
  }
});
```

---

## 4. Valores Mayores de 100 KB

Trocear el JSON en partes numeradas (`clave:0`, `clave:1`, …) con `cache.putAll`, o mantenerlo en una hoja oculta de parámetros. Si el dato es más grande que unos cientos de KB, la caché deja de ser el mecanismo adecuado.

---

## 5. Concurrencia sobre Propiedades

`setProperty` no es atómico respecto a un ciclo leer-modificar-escribir. Si varios procesos actualizan el mismo contador o cursor, envolver la secuencia en `LockService` (skill `gas-concurrency-chunking`). Para varias claves a la vez usar `setProperties(objeto)` (una sola llamada).

---

## 6. Higiene

* No guardar datos personales ni de negocio en propiedades o caché: su ciclo de vida es difícil de auditar.
* Documentar en el README cada propiedad de script requerida (nombre, propósito, ejemplo de formato **sin valores reales**).
* Para auditar el entorno, listar solo nombres de claves (`getKeys()`), nunca valores.

