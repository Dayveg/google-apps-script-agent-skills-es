---
name: gas-architecture-v8
description: >-
  Estándares de arquitectura modular N-Capas, motor V8, prevención de Temporal Dead Zone (TDZ),
  contrato ServiceResponse, mapeo dinámico de columnas y optimización de memoria en Google Apps Script.
  Usar cuando: se diseñe, estructure o refactorice código .gs/.js para Google Apps Script en V8.
  NO usar cuando: el proyecto sea Node.js/Express, Python, frontend web fuera de HtmlService o scripts sin runtime GAS.
---

# Arquitectura N-Capas y Motor V8 (`gas-architecture-v8`)

Directrices obligatorias para desarrollar sistemas mantenibles en **Google Apps Script** bajo el motor **V8 moderno (ECMAScript 2015+)** (`"runtimeVersion": "V8"` en `appsscript.json`). Desde el **31 de enero de 2026**, Google retiró definitivamente el motor Rhino: V8 es requisito obligatorio de ejecución.

Para implementaciones completas listas para copiar (`App` Lazy Container, `BaseAppError`, `ServiceResponseFactory`, `SheetTableMapper` y tabla V8 vs Rhino), consultar [`references/v8-patterns.md`](./references/v8-patterns.md).

---

## 1. Topología N-Capas

Todo proyecto GAS no trivial debe separar responsabilidades en 4 capas (evitando archivos monolíticos):

1. **Controladores / Entrada (`50_Ctl_*.js`, `99_EntryPoints.js`)**: `doGet`, `doPost`, triggers instalables, menús `onOpen`. Nunca contienen lógica de negocio ni acceso directo a `SpreadsheetApp`.
2. **Servicios / Dominio (`30_Svc_*.js`)**: Reglas de negocio, validaciones y orquestación transaccional. Retornan `ServiceResponse`.
3. **Acceso a Datos / DAL (`20_Repo_*.js`)**: Mapeo dinámico de encabezados, lectura/escritura por lotes (`getValues()` / `setValues()`).
4. **Infraestructura (`10_Infra_*.js`)**: `ConfigProvider`, `LockService`, sanitización OWASP y telemetría.

---

## 2. Reglas Obligatorias de V8 y Prevención de TDZ

En Google Apps Script **no existe `import`/`export`**. Todos los archivos `.gs`/`.js` comparten el mismo `globalThis` y se evalúan en **estricto orden alfabético**. Con `const`/`let` en V8, acceder a una variable antes de su línea de inicialización lanza `ReferenceError: Cannot access '...' before initialization` (*Temporal Dead Zone*).

- **Prohibido `var`**: usar siempre `const` y `let`.
- **Orden de carga determinista**: usar prefijos numéricos (`00_Namespace.js`, `01_Errors.js`, `10_Infra_*.js`, `20_Repo_*.js`, `30_Svc_*.js`, `40_Container.js`, `99_EntryPoints.js`) o `filePushOrder` en `.clasp.json`.
- **Resolución perezosa (*Lazy Container*)**: instanciar servicios bajo demanda en un contenedor (`App.get('Servicio')`) o IIFE sobre `globalThis`, nunca en el nivel superior del archivo.

---

## 3. Contrato Canónico `ServiceResponse`

Toda función de servicio, repositorio o controlador debe retornar una estructura predecible e inmutable en lugar de propagar excepciones sin control:

```javascript
/**
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - Estado booleano de la operación.
 * @property {*} data - Carga útil de datos o null en caso de error.
 * @property {string|null} error - Mensaje descriptivo del error o null si fue exitosa.
 * @property {string|null} [errorCode] - Código estructurado de error (ej. 'VALIDATION_ERROR').
 */
```

---

## 4. Cero Acoplamiento a Índices Estáticos (DAL Dinámico)

```javascript
// ❌ PROHIBIDO: acoplamiento a índices fijos (se rompe si insertan o mueven columnas)
const estado = fila[3];
hoja.getRange(row, 4).setValue('APROBADO');

// ✅ OBLIGATORIO: mapa dinámico encabezado -> índice 1-based con normalización Unicode
const cols = SheetTableMapper.obtenerIndicesColumnas(hoja);
const colEstado = cols['ESTADO'];
hoja.getRange(row, colEstado).setValue('APROBADO');
```

- Normalizar encabezados con `.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')`.
- Cachear el mapa de encabezados en memoria (`Map`) durante la ejecución para evitar lecturas repetitivas de la fila 1.

---

## 5. Rendimiento por Lotes y Memoria (GC)

- **Prohibido `getValue()`, `setValue()` o `appendRow()` dentro de bucles**: leer con `getValues()`, transformar en memoria y escribir en bloque con `setValues()`.
- **Desreferenciación explícita (*Nulling Out*)**: tras procesar matrices grandes de Sheets, asignar `datosEnBruto = null` para liberar memoria en V8.
- **Estructuras O(1)**: usar `Map` y `Set` en lugar de `Array.prototype.find` / `indexOf` dentro de bucles.

---

## 6. Checklist de Verificación antes de Entregar Código

1. `appsscript.json` declara `"runtimeVersion": "V8"`.
2. Ningún archivo usa `var` ni dependencias circulares/TDZ en nivel superior.
3. Toda lectura/escritura en Sheets usa mapeo dinámico por nombre de encabezado y operaciones en lote.
4. Toda función pública de servicio/controlador está documentada con JSDoc (`@param`, `@returns`) y retorna `ServiceResponse`.
