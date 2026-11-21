# Evaluaciones (`evals`)

Este directorio contiene escenarios de referencia ([`evals.json`](./evals.json)) para medir si un agente de IA:

1. **Enruta correctamente** mediante `gas-guidance` hacia las skills específicas requeridas.
2. **Respeta triggers negativos** (no activa skills GAS en proyectos Node.js/Express/Python).
3. **Cumple reglas críticas** (`ServiceResponse`, mapeo dinámico, `tryLock` + `finally`, sanitización OWASP).
4. **Pasa el escáner estático** sin hallazgos:

```bash
node scripts/gas-scan.mjs <directorio-codigo-generado> --json
```
