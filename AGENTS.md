# PoC mini Hito 1 — TPF Ticketing NFT con privacidad ZK

Instrucciones para cualquier agente de IA que trabaje en este repositorio de
código, que es la prueba de concepto del Hito 1 del Trabajo Profesional
(FIUBA, Equipo 211).

**Antes que nada**: leé [CONTEXTO.md](CONTEXTO.md) y la sección de tu tarea en
[PLAN.md](PLAN.md). No leas el plan entero. Si no te asignaron una tarea, corré
`npm run estado` y preguntá.

## Dónde están las decisiones

Este repositorio tiene solo código. Las decisiones (ADR), la base de conocimiento,
las mediciones y el plan del TPF están en el repositorio de documentación:
`../zk-ticketing-docs` (en GitHub: [completar: URL]).

- Antes de implementar algo que dependa de una decisión, leé el ADR
  correspondiente. Si esa carpeta está disponible en tu sesión, leelo de ahí; si
  no, pedile a Patricio que la adjunte. No asumas su contenido.
- **El código actual con decisiones viejas es el error más caro.** Antes de tocar
  algo que implemente un ADR, comprobá su estado, no solo su contenido:
  `python3 scripts/proyecto.py decisiones` en el repo de docs imprime ID, estado,
  título, ruta y commit. Un ADR `reemplazada` o `rechazada` que el código sigue
  implementando es un hallazgo: decilo, no lo arregles por tu cuenta.
- Cuando el código implemente una decisión, citá el ADR por su ID (`ADR-NNN`) en
  el commit o en un comentario. Usá el ID, nunca una copia del texto: la copia
  envejece sin avisar.
- No tomes ni registres decisiones de diseño acá. Si surge una, anotala en tu
  bitácora como candidata a ADR y proponé abrirla en el repo de docs.
- Las reglas generales (rigor de fuentes, uso de IA, idioma) son las del
  `AGENTS.md` del repo de docs, resumidas en `CONTEXTO.md`.

## Qué es

Prueba de concepto mínima de pertenencia anónima a un conjunto con nulificador,
con las entradas emitidas como NFT (ERC-721) y una capa de compromisos que separa
la titularidad pública del secreto privado. Corresponde a la Variación 2 del
documento de Hito 1 de Agustina Fontana. Aporta evidencia a ADR-008, ADR-009,
ADR-010, ADR-011 y a la medición MED-001. **No cierra ninguna decisión.**

## Comandos

Se van completando tarea por tarea. Los que ya existen:

- Estado del plan: `npm run estado`
- Versiones de todas las herramientas: `npm run verificar:entorno` (ver
  `docs/00-entorno.md`)
- Paridad del hash entre JS y circuito: `npm run control:poseidon` (ver
  `docs/01-poseidon.md`)
- Compilar y probar el circuito de pertenencia: `npm run circuito:pertenencia`
  (ver `docs/02-circuito.md`)
- Ceremonia de trusted setup Groth16: `npm run setup` (ver `docs/03-setup.md`).
  Regenera todo en `build/setup/`, que no se commitea. **No es una ceremonia
  segura**: la corre una sola persona en una sola máquina.
- Árbol de compromisos y publicación de la raíz: `npm run organizador` (ver
  `docs/04-organizador.md`). Escribe `datos/`, es determinista con semilla fija, y
  la raíz sale por la interfaz `fuenteDeRaiz`, que es la pieza que T09 y T12
  reemplazan sin tocar el resto.
- Generar una prueba y medir tiempo y tamaño:
  `npm run probar -- --identidad 3 --scope evento-A` (ver `docs/05-prover.md`).
  Escribe `salidas/`, que no se commitea. Los tiempos que imprime son una **cota
  de referencia en hardware de escritorio**: no son MED-001, que pregunta por
  teléfonos de gama media.

## Reglas específicas

- **Tests negativos explícitos.** Un circuito que acepta lo que debe aceptar no
  está probado: hay que demostrar que rechaza testigos inválidos. Ver
  `kb/objeciones-jurado.md` en el repo de docs.
- **Primitivas auditadas.** Poseidon de circomlib, ERC-721 de OpenZeppelin, camino
  de Merkle de un template existente. No se escribe criptografía a mano; si hubo
  que hacerlo, se justifica en la bitácora.
- **Los números se miden.** Tiempo de proving, tamaño de prueba y gas se reportan
  con la salida real del comando, con el hardware anotado. Nada estimado.
- **El trusted setup local no es seguro** y todo doc que lo mencione tiene que
  decirlo.

## Documentación

Es el entregable principal, no un extra. Cada tarea que produce código produce su
`docs/<componente>.md` con las seis secciones de la plantilla de `CONTEXTO.md`, y
su `bitacora/TNN-<slug>.md`. Una tarea sin doc no está hecha.

## Git

Un commit por tarea, con el código, su doc y su bitácora juntos: son los puntos de
retorno si algo se rompe. Mensaje `TNN: <qué hiciste>` y trailer
`Asistido-por: <herramienta>`.

Mientras el repo no tenga remoto en GitHub, los commits van a `main`: sin remoto
no hay PR posible. Cuando Patricio cree el repositorio en la organización, se pasa
al flujo del TPF —rama por tarea y PR revisado— y esta nota se borra.

El agente no hace push ni maneja credenciales: eso lo hace Patricio.
