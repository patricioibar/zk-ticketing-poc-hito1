---
tarea: T15
fecha: 2026-09-24
estado: hecha
---

## Qué se hizo

`INTERCAMBIABLES.md` en la raíz: la vista transversal de las piezas reemplazables
del sistema. Cubre las siete que pide `PLAN.md` —lenguaje del circuito, esquema de
prueba, función hash, estructura del padrón, fuente de la raíz, dónde se verifica y
canal en puerta— más tres que la PoC tocó y el plan no nombra (la curva, qué viaja
en el sobre, y la custodia del secreto), y enlaza sin repetir las siete que ya están
bien explicadas en la sección 4 del documento que corresponde.

No se tocó código. El único cambio en el repositorio es el documento nuevo, esta
bitácora y `estado.json`.

### Lo que agrega sobre las secciones 4

Tres cosas que ninguna sección 4 puede dar, porque las tres son transversales:

1. **El mapa de acoplamientos.** Tres cadenas (el tamaño, el campo, la ejecución) y
   dos cortes. La cadena del tamaño es la que manda: el lenguaje casi elige el
   backend, el backend fija el tamaño de la prueba y el tamaño decide si el canal
   puede ser un QR estático. Con los 224 bytes medidos contra los 2953 del QR, el
   umbral queda escrito: un esquema que multiplique el tamaño por más de trece saca
   al QR estático de la mesa.
2. **Qué archivos habría que tocar**, con rutas y conteos de líneas reales de este
   repositorio, no con generalidades.
3. **Un orden de decisión propuesto** para la weekly, que sale del mapa: MED-001
   primero (es el dato que traba tres frentes), después ADR-010 en su parte de
   esquema y curva, después ADR-008, después ADR-011. ADR-009 y ADR-012 en paralelo.
   La fuente de la raíz, cuando se quiera.

### Lo medido para escribir esto

Una sola medición nueva, porque era barata y convertía una fila blanda en una fila
con número: el costo de MiMC **como primitiva**, compilado con circom 2.2.3 contra
circomlib 2.0.5, contando restricciones no lineales (la misma métrica con la que
`docs/02-circuito.md` reporta 216 y 243).

```
== pos1 ==
non-linear constraints: 216
linear constraints: 199
== pos2 ==
non-linear constraints: 243
linear constraints: 274
== mimcsponge1 ==
non-linear constraints: 660
linear constraints: 0
== mimcsponge2 ==
non-linear constraints: 1320
linear constraints: 1
```

Los cuatro circuitos son de cuatro líneas cada uno, quedaron en el directorio
temporal de la sesión y no se commitearon: son `Poseidon(1)`, `Poseidon(2)`,
`MiMCSponge(1,220,1)` y `MiMCSponge(2,220,1)` envueltos en un `template` mínimo,
compilados con `circom <f>.circom --r1cs -l <repo>/node_modules`. De ahí sale que
las cuatro invocaciones de hash del circuito pasarían de 1188 a 5940 restricciones,
cinco veces más.

No compilé el circuito entero con MiMC, y la razón es lo segundo que verifiqué:

### Dos verificaciones que corrigen documentos ya escritos

- **Cambiar el hash obliga a tirar el template del árbol.**
  `@zk-kit/binary-merkle-root.circom/src/binary-merkle-root.circom:46` llama a
  `Poseidon(2)` adentro. Un árbol con otro hash hay que escribirlo a mano con
  `Switcher` —el ejercicio que `docs/02-circuito.md` §4 midió en 2495 restricciones
  y descartó—, y ahí se pierde el código heredado de Semaphore, que es el precedente
  que la KB manda citar en la defensa.
- **Cambiar el hash no toca los contratos**, y `docs/01-poseidon.md` §4 dice que sí
  ("toca … los contratos (T09, T11)"). Por `grep`, las dos únicas apariciones de
  "Poseidon" en `contratos/` son comentarios (`EntradaNFT.sol:64`,
  `RegistroDeRaiz.sol:56`): el contrato guarda un `uint256` opaco y lo único que
  comprueba es que sea menor que `P`, que es una propiedad **de la curva, no del
  hash**. El primo aparece en exactamente dos lugares y es el mismo número:
  `lib/campo.mjs:11` y `contratos/RegistroDeRaiz.sol:20`.

No corregí `docs/01-poseidon.md` porque no es tarea de T15 tocar la documentación de
T02; la corrección está dicha en `INTERCAMBIABLES.md`, en la pieza 3, con la
verificación que la sostiene.

## Decisiones que tomé y por qué

**Dejé filas a la mitad a propósito.** WHIR, Skyscraper, UltraHonk, Noir, Miden y
los canales no tienen ni una medición de esta PoC ni, en varios casos, una fuente en
la KB. El encargo pedía explícitamente no llenar esas celdas con lo que "se sabe", y
no las llené: van con `[a verificar]` o con la cita de dónde salen. Tres
consecuencias concretas:

- **WHIR y Skyscraper no están en la KB del TPF.** No figuran en ninguna entrada ni
  en ningún ADR: los nombra `PLAN.md` y nada más. Busqué la fuente primaria de cada
  uno para no escribirlos de memoria: WHIR es `eprint 2024/1586` (Arnon, Chiesa,
  Fenzi, Yogev; EUROCRYPT 2025) y Skyscraper-v2 es `eprint 2025/058` (Bouvier,
  Grassi, Khovratovich, Koschatko, Rechberger, Schmid, Schofnegger). De cada paper
  tomé lo que dice su propio abstract y marqué `[a verificar]` todo lo demás.
- **Sobre WHIR anoté algo que la fila de una tabla escondería**: no es un reemplazo
  de Groth16 sino de FRI, STIR o BaseFold *adentro* de un prover. Compararlo con
  Groth16 en una fila es comparar una pieza con un sistema, y el plan pedía
  compararlos. Lo dije en el documento en vez de hacer la comparación mal.
- **Sobre Skyscraper**: el número que reporta el paper es de velocidad **nativa**
  (256 ns para dos elementos del campo escalar de BLS12-381, >15× Poseidon2). El
  número que manda adentro de un circuito es el de restricciones, y ese no lo tengo.
  Escribir "es 15 veces más rápida" en una tabla de piezas de circuito habría sido
  exactamente el error que el encargo pedía evitar.

**La advertencia de alcance va arriba de todo y no en una nota al pie.** Esta PoC
subió un solo camino. El documento lo dice en la tercera sección, antes de la
primera tabla, y cada pieza repite de qué lado del corte está.

**El apartado "Piezas explicadas en otro lado" existe para no repetir.** Siete temas
—política de escritura de la raíz, control de acceso, reventa, empaquetado de
casilleros, lista de nulificadores, harness de tests, mitigaciones del vínculo— están
enlazados en una línea cada uno. Agregaban a su documento y no a la vista
transversal.

**El orden de decisión es una propuesta, no una decisión, y lo dice.** Además señala
una tensión real que conviene llevar a la weekly: la prioridad actual del equipo es
ADR-008 (`docs/estado.md`), y ADR-008 depende de MED-001 por un lado —el
desafío-respuesta mueve el proving adentro del presupuesto de puerta— y arrastra a
ADR-011 por el otro. No propongo cambiar la prioridad: propongo que MED-001 salga
antes, porque sin ese número ADR-008 se decide a ciegas.

## Con qué me tropecé

**Un número mal leído, corregido antes de publicarlo.** Escribí "fase 1: 52,8 s, el
68% del setup". Los 52,8 s son el setup **entero** y el 68% es el paso
`prepare phase2` (35,8 s) dentro de ese total; la fase 2 completa son 5,7 s. Lo
verifiqué contra `docs/03-setup.md` §5 y lo corregí. Es la clase de error que la
tabla de un documento transversal propaga a todos lados, así que conviene decir que
pasó.

**El gas de publicar una raíz aparece con tres valores** en los documentos: 69.917,
70.277 y 70.288. No es una inconsistencia: `docs/08-contrato-raiz.md` explica que el
valor depende de cuántos bytes en cero tiene el `scope`, a 12 de gas por byte
distinto de cero ([EIP-2028]). Cité el de `docs/08-contrato-raiz.md` §1 y no inventé
un promedio.

**La cadena no hizo falta.** No corrí nada que la levante, así que no quedó nada que
bajar. `npm run cadena:estado` no se tocó y `datos/` quedó intacto.

## Qué dejo pendiente o candidato a ADR

No abre candidatos nuevos: los que la PoC deja están juntos en el apéndice de
`docs/11-cierre-de-la-escalera.md` y T15 no agrega ninguno. Lo que sí deja son tres
cosas para la weekly, todas ya escritas en el documento:

- **MED-001 traba tres frentes** (ADR-010, ADR-008 y el tamaño del conjunto de
  ADR-001) y sigue sin medirse. Es el dato que más rinde de todo lo que falta.
- **Corregir `docs/01-poseidon.md` §4**: dice que cambiar el hash toca los
  contratos, y no los toca. Es una línea y no la toqué porque no es trabajo de T15.
- **Si el equipo quiere mirar la familia hash-based (WHIR) o Skyscraper en serio**,
  el lugar es una entrada de KB con el procedimiento `entrada-kb`, no una fila de
  `INTERCAMBIABLES.md`. Hoy los dos papers están citados ahí con su `eprint` y con
  todo lo demás en `[a verificar]`.

[EIP-2028]: https://eips.ethereum.org/EIPS/eip-2028
