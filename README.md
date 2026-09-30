# PoC mini — Hito 1, Variación 2

Prueba de concepto del Trabajo Profesional del Equipo 211 (FIUBA): **probar que
tenés una entrada válida de un conjunto, sin revelar cuál es ni qué billetera la
controla, y que no se pueda usar dos veces.**

Las entradas se emiten como NFT de verdad (ERC-721) y sobre eso se monta una capa
de compromisos: la titularidad del NFT es pública —sirve para reventa y regalías—
y el secreto que entra al árbol de Merkle es privado —es lo que sostiene el
anonimato en la puerta—. Separar esas dos capas es todo el punto de la Variación 2.

Corre entero en la máquina: sin testnet, sin gas real, sin wallets reales.

## Esto es material de estudio

El código es el vehículo; el entregable es entender. Cada componente tiene su doc
en `docs/` que explica qué hace, cómo, **por qué está hecho así**, qué piezas
podrías reemplazar y qué pagarías por cada cambio.

Si es tu primera vez acá, empezá por [RECORRIDO.md](RECORRIDO.md): es un tour
guiado, en orden de lectura y pensado para hacerlo con la terminal al lado, que
arranca haciendo correr el sistema entero antes de explicar nada. Hoy cubre la
**fase 1** —entorno, Poseidon, circuito, trusted setup, organizador, prover,
validadores y demostraciones— y se extiende cuando estén las fases 2 y 3.

## Empezar

```bash
node scripts/estado.mjs
```

Te dice qué está hecho, qué sigue y con qué encargo arrancar. Después de T01 el
mismo comando es `npm run estado`.

## Mapa

| Archivo | Para qué |
|---|---|
| [RECORRIDO.md](RECORRIDO.md) | el tour guiado: por dónde empezar y en qué orden |
| [PLAN.md](PLAN.md) | el plan completo, tarea por tarea |
| [CONTEXTO.md](CONTEXTO.md) | las reglas que sigue cualquier agente acá |
| [RETOMAR.md](RETOMAR.md) | cómo seguir en una conversación nueva |
| [estado.json](estado.json) | qué está hecho y qué falta |
| `docs/` | cómo funciona cada componente, explicado |
| `bitacora/` | qué pasó en cada tarea |

## Relación con el TPF

Las decisiones, la base de conocimiento y las mediciones viven en el repo de
documentación (`../zk-ticketing-docs`), no acá. Esta PoC **aporta evidencia** a
los frentes ADR-008, ADR-009, ADR-010 y ADR-011 y a la medición MED-001; no cierra
ninguno. Las decisiones se cierran en la weekly del equipo, con revisión de otro
integrante.

Basado en el documento de Hito 1 de Agustina Fontana, sección POC MINI → CIRCOM →
Variación 2.

## Uso de IA

Desarrollado con asistencia de agentes de IA, según la política del equipo en
`docs/uso-de-ia.md` del repo de documentación. Cada tarea deja su registro en
`bitacora/`.
