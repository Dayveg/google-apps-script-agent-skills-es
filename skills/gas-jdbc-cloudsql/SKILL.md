---
name: gas-jdbc-cloudsql
description: >-
  Conexión segura a bases de datos relacionales (MySQL, PostgreSQL, SQL Server, Cloud SQL) desde Google Apps Script
  mediante el servicio Jdbc: consultas parametrizadas con prepareStatement, lotes y cierre obligatorio en finally.
  Usar cuando: se conecte Google Apps Script directamente a Cloud SQL o motores SQL externos vía Jdbc.
  NO usar cuando: se consuma una API REST (usar gas-urlfetch-observability) o el backend sea Node.js/Python.
---

# Conectividad SQL y Cloud SQL con `Jdbc` (`gas-jdbc-cloudsql`)

Patrones obligatorios para consultar y escribir en bases de datos SQL desde Google Apps Script usando el servicio **`Jdbc`** (`Jdbc.getCloudSqlConnection` / `Jdbc.getConnection`).

---

## 1. Reglas de Seguridad y Recursos

1. **Prohibida la concatenación SQL**: usar siempre `conn.prepareStatement('SELECT ... WHERE id = ?')` para prevenir **SQL Injection**.
2. **Credenciales en `ScriptProperties`**: jamás hardcodear usuario, contraseña o cadena de conexión en el código.
3. **Cierre garantizado en `finally`**: cerrar en orden inverso `ResultSet` → `Statement` → `Connection` dentro de bloques `try...finally` para evitar fuga de conexiones.
4. **Escrituras por lotes**: usar `stmt.addBatch()` + `stmt.executeBatch()` dentro de una transacción (`conn.setAutoCommit(false)` / `conn.commit()`).

---

## 2. Implementación Canónica

```javascript
/**
 * Consulta registros parametrizados en Cloud SQL / MySQL desde Apps Script.
 *
 * @param {string} estado - Filtro de estado a consultar.
 * @returns {ServiceResponse}
 */
function consultarRegistrosSql(estado) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('JDBC_URL');
  const user = props.getProperty('JDBC_USER');
  const pass = props.getProperty('JDBC_PASS');

  if (!url || !user || !pass) {
    return Response.fail('Faltan credenciales JDBC en ScriptProperties.', 'CONFIG_ERROR');
  }

  let conn = null;
  let stmt = null;
  let rs = null;

  try {
    conn = Jdbc.getCloudSqlConnection(url, user, pass);
    stmt = conn.prepareStatement('SELECT id, codigo, estado FROM solicitudes WHERE estado = ? LIMIT 500');
    stmt.setString(1, String(estado || '').trim());

    rs = stmt.executeQuery();
    const filas = [];
    while (rs.next()) {
      filas.push({
        id: rs.getInt('id'),
        codigo: rs.getString('codigo'),
        estado: rs.getString('estado')
      });
    }

    return Response.ok(filas);
  } catch (error) {
    return Response.fail('Error SQL Jdbc: ' + error.message, 'JDBC_QUERY_ERROR');
  } finally {
    try { if (rs) rs.close(); } catch (_) {}
    try { if (stmt) stmt.close(); } catch (_) {}
    try { if (conn) conn.close(); } catch (_) {}
  }
}
```
