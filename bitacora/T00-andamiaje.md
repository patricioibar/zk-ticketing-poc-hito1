---
tarea: T00
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

Andamiaje del proyecto: `PLAN.md` (17 tareas en 6 fases), `CONTEXTO.md` (el brief
fijo y mínimo para agentes efímeros), `estado.json` + `scripts/estado.mjs` (el
registro de ejecución y su lectura), `RETOMAR.md`, `AGENTS.md` / `CLAUDE.md`
derivados de la plantilla de subsistema del repo de docs, `README.md` y
`.gitignore`.

No se escribió nada de código de la PoC. El andamiaje termina acá; T01 arranca la
ejecución.

## Decisiones que tomé y por qué

- **Repo separado del de documentación.** El `AGENTS.md` de `zk-ticketing-docs` es
  explícito: ese repo es la fuente de verdad de decisiones, KB, mediciones y plan,
  y el código vive en repos aparte. Carpeta hermana, git propio, todavía sin
  remoto.
- **Circom + snarkjs (Groth16), no Noir.** Agustina lo recomienda por accesible;
  el objetivo pedagógico es entender las restricciones y Circom las expone; la
  prueba de Groth16 es la más chica, que es el número que necesita ADR-011; y
  habilita el extra de exportar el verificador a Solidity. El costo —entender el
  trusted setup— es una ventaja pedagógica acá. **Supuesto a validar con Patricio
  antes de T01.**
- **Escalera de tres escalones** (JSON → contrato con raíz → contrato NFT) en vez
  de ir directo a la Variación 2. La Variación 2 está definida en el documento
  como "un paso más allá de la Variación 1", y cada escalón enseña algo distinto.
- **La fuente de la raíz como módulo intercambiable** (`fuentes/*.mjs`). Así los
  tres escalones se suben cambiando un solo archivo, sin tocar organizador,
  prover ni validadores. Es a la vez buena arquitectura y la demostración literal
  de qué es intercambiable, que es lo que Patricio quiere entender.
- **Un agente por tarea, con contexto mínimo.** Cada tarea de `PLAN.md` es un
  encargo autocontenido que lista qué leer. El agente lee `CONTEXTO.md` + su
  tarea + esos archivos, no el repo entero.
- **La documentación es criterio de terminación, no un extra.** Una tarea no está
  hecha sin su `docs/<componente>.md` con las seis secciones y su bitácora.

## Con qué me tropecé

- El entorno tiene Node v20.19.2, npm 10.8.2, git 2.51.0 y Rust/cargo 1.96.0.
  **Faltan `circom` y `snarkjs`**: los instala T01.
- `circom` se instala con `cargo install`, que en Windows a veces falla. Anotado
  como riesgo en `PLAN.md` con dos alternativas (binario de release, WSL).

## Qué dejo pendiente o candidato a ADR

- **Decisión de Patricio antes de T01**: confirmar Circom y confirmar la escalera
  de tres escalones (o ir directo a la Variación 2).
- **No verificado todavía**: si la versión actual de circomlib trae un template de
  camino de Merkle binario, o si hay que usar el port de Semaphore. T03 lo
  comprueba antes de escribir nada.
- **Candidato a ADR**: nada nuevo. La PoC alimenta ADR-008/009/010/011 y MED-001
  con evidencia; no abre frentes.
- El repo no tiene remoto en GitHub. Cuando se cree, hay que completar la fila del
  subsistema en el `AGENTS.md` del repo de docs (parte de T17).
