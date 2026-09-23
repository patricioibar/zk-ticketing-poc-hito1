# Cómo retomar esto

Pensado para el caso concreto: te quedaste sin créditos a mitad de camino, o
pasaron tres días, o abrís una conversación nueva. **Nada de lo que hace falta
para seguir vive en un chat.** Está todo en disco.

## En una conversación nueva

Abrí este repo y pegá esto:

```
Retomo la PoC mini del Hito 1. Corré `npm run estado`, leé CONTEXTO.md y la
sección de la próxima tarea en PLAN.md, y ejecutala.
```

Eso es todo. El agente ve qué está hecho, qué sigue y con qué contexto mínimo
trabajar.

## Si querés ver el estado vos mismo

```bash
npm run estado
```

Imprime las tareas con su marca (`[x]` hecha, `[ ]` pendiente, `[~]` en curso,
`[!]` bloqueada, `[o]` opcional), el progreso, y el encargo literal para pasarle
a un agente nuevo.

Antes de que exista el `package.json` (o sea, antes de T01):

```bash
node scripts/estado.mjs
```

## Dónde está cada cosa

| Qué necesitás | Dónde |
|---|---|
| El plan completo, tarea por tarea | [PLAN.md](PLAN.md) |
| Qué está hecho y qué sigue | [estado.json](estado.json) · `npm run estado` |
| Las reglas que sigue cualquier agente acá | [CONTEXTO.md](CONTEXTO.md) |
| Cómo funciona cada componente, explicado | `docs/` |
| Qué pasó en cada tarea, con qué se tropezó | `bitacora/` |
| Las decisiones del TPF (ADR, KB, mediciones) | `../zk-ticketing-docs` |

## Si una tarea quedó bloqueada

`npm run estado` la marca con `[!]`. Leé su bitácora: ahí está el motivo. Casi
siempre es una decisión que necesita que la tomes vos, no un problema técnico.

## Si algo se rompió y no sabés qué

El árbol de tareas es lineal: cada una depende de la anterior. Volvé a la última
tarea marcada como hecha, corré su verificación (está en su sección de `PLAN.md`,
en "Hecho cuando"), y desde ahí seguí hacia adelante.

## Regla que no conviene romper

Un agente por tarea, y que cada agente lea lo mínimo: `CONTEXTO.md`, su sección
del plan, y los archivos que esa sección lista. Si un agente arranca leyendo todo
el repo, gasta el presupuesto en contexto en vez de en trabajo, y la calidad baja.
