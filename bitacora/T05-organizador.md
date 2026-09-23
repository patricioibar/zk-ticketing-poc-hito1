---
tarea: T05
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`scripts/organizador.mjs`, expuesto como `npm run organizador`, genera ocho
identidades sintéticas (secreto determinista + compromiso `Poseidon(secreto)`),
arma el árbol de profundidad 3 y publica la raíz a través de una `fuenteDeRaiz`.
Deja tres artefactos en `datos/`: `arbol.json` (padrón público: scope,
profundidad, raíz y los ocho compromisos), `secretos.json` (lo que cada comprador
guardaría, en archivo aparte) y `raiz.json` (lo que escribe la fuente).

Piezas nuevas:

- `fuentes/json.mjs`: primera implementación de `fuenteDeRaiz`. Cuatro miembros:
  `nombre`, `leerCompromisos(scope)`, `publicarRaiz({scope, raiz, profundidad})`,
  `leerRaiz(scope)`. Todo asíncrono, todo en `BigInt`, ausente es `null` y nunca 0.
- `lib/campo.mjs`: `P`, `estaEnCampo`, `exigirEnCampo` (la validación de rango que
  T02 dejó pendiente y T03 delegó acá) y `secretoDeterminista`, que deriva el
  secreto por rechazo en vez de reducir módulo `p`.
- `lib/merkle.mjs`: `construirHashes`, `armarArbol`, `caminoDe` y `raizDesdeCamino`.
  Es donde se saldó la deuda de T03/T04.

El comando corre tres controles y sale con código 1 si alguno falla: determinismo
(rehace todo y compara la raíz), caminos (las ocho hojas llegan a la raíz por su
camino, calculado en JS como lo hace el circuito) e ida y vuelta por la interfaz
(`leerRaiz(scope)` devuelve la raíz publicada; `leerRaiz(otro_scope)` devuelve
`null`).

`docs/04-organizador.md` con las seis secciones.

### Deuda saldada: `armarArbol` y `caminoDe`

T03 las escribió en su banco de pruebas y T04 las copió a propósito, para no mover
las líneas que `docs/02-circuito.md` cita por número. Ahora viven en
`lib/merkle.mjs` y las importan los tres: `scripts/organizador.mjs`,
`scripts/circuito-pertenencia.mjs` y `scripts/setup-groth16.mjs`. Se agregó una
guarda que antes no existía: `armarArbol` falla si la cantidad de hojas no es
potencia de dos.

Las citas que quedaron corridas se corrigieron en la misma tarea:

- `docs/02-circuito.md`: `armarArbol` y `caminoDe` pasan a `lib/merkle.mjs:27` y
  `:49`; `wtns.check` de `:185` a `:153`; los testigos inválidos de `:200`–`:224`
  a `:167`–`:196`. Se agregó un párrafo que explica la mudanza.
- `docs/03-setup.md`: la sección "Por qué las funciones del árbol están
  duplicadas" pasó a contar que la deuda se saldó y dónde están ahora.

La comprobación de que la unificación no cambió nada es que `npm run setup` sigue
imprimiendo la raíz `18671017…60499` y el nulificador `13958008…32801`, los mismos
que ya estaban escritos en `docs/03-setup.md` antes de tocar nada.

### Verificación

`npm run organizador` (hardware: Intel Core i5-14400F, 16 GB, Windows 11 Pro
10.0.26200, node v20.19.2):

```
Organizador v0 - parte base (fuente JSON)

  fuente de raiz    json (datos/raiz.json)
  scope del evento  1234
  semilla           tpf211-hito1-parte-base
  profundidad       3 (8 identidades)

  la fuente no origina compromisos: los genera el organizador (limitacion de la parte base)

Identidades

  pos  compromiso = Poseidon(secreto)
    0  15918769836395550309736939745083792671257046049922626050264434764490712315832
    1  19098309875104881602814935123510219206248158037904700664102177808860445083035
    2  2544992810996557086126118583310846491421512950928938870161895915223694855178
    3  21630521322428614492072238094553662178591068764296528687525646144397449139327
    4  14392218551139526367731354156731259625073304122021843615440904735399927358708
    5  20945866081501801126286288618599458466175263336405047461250066892851845033474
    6  14152032715784181287200691946179947743516525511695315688830633533817948821301
    7  19884859320392554586064214742353253967104713907369474728727134350269031367039

  candidatos descartados por caer fuera de [0, p): 18

Arbol

  raiz              21742806920683719786915181996178546158207976983808212562412387320164881855720
  determinista      si (misma semilla, misma raiz)
  caminos validos   si (8/8)

Artefactos

  padron publico    datos/arbol.json
  secretos          datos/secretos.json  <- lo que guardaria cada comprador
  raiz publicada    datos/raiz.json

  leerRaiz(scope) == raiz publicada   si
  leerRaiz(otro scope) == null        si

Arbol publicado. El conjunto de anonimato de este evento es de 8 personas:
ridiculamente chico, y por que importa esta en docs/04-organizador.md.
```

Dos corridas seguidas dan la misma raíz, que es lo que pedía "determinista con
semilla fija".

La rotura deliberada, `npm run organizador -- --romper rango`, suma `p` al secreto
de la posición 3 y termina con código 1:

```
VALOR INVALIDO:
secreto de la posicion 3: el valor esta fuera del campo.
  valor    35643682154966047156268696500342295500339131112703318788563628848613638807758
  p        21888242871839275222246405745257275088548364400416034343698204186575808495617
  valor%p  13755439283126771934022290755085020411790766712287284444865424662037830312141
  Poseidon lo reduciria en silencio: este valor y 13755439283126771934022290755085020411790766712287284444865424662037830312141 producirian
  el mismo compromiso y el mismo nulificador. Ver docs/04-organizador.md.
```

Regresión de las tareas anteriores, después del refactor:

- `npm run circuito:pertenencia`: código 0, 1 testigo válido y 5 inválidos
  rechazados, misma raíz `18671017…60499` de siempre.
- `npm run setup`: código 0, ceremonia completa, mismas señales públicas que
  `docs/03-setup.md`, 43,0 s en total.

## Decisiones que tomé y por qué

**La fuente es solo la raíz; el padrón lo escribe el organizador.** Podrían ser un
solo artefacto. Los separé porque lo único que cambia de lugar al subir la escalera
es la raíz: en T09 vive en un contrato y `datos/raiz.json` desaparece, mientras que
el padrón se sigue publicando igual porque el prover necesita los compromisos y
ponerlos on-chain no aportaría nada. Además hace visible cuál es la porción mínima
que necesita estar en la cadena.

**`leerCompromisos` devuelve `null` en la fuente JSON, no los compromisos que el
propio organizador escribió.** Devolverlos sería un espejo, no una fuente, y
escondería justamente la diferencia que T12 tiene que hacer evidente. `null`
significa "no origino compromisos, generalos vos", y es la rama que va a dejar de
ejecutarse cuando la fuente sea el contrato de entradas.

**Ausente es `null` y nunca 0.** Un `mapping` de Solidity vacío devuelve 0 y 0 es
un elemento de campo válido: si se cuela como raíz, el prover genera pruebas contra
un árbol que no existe y el error aparece recién en la puerta. El organizador
comprueba en cada corrida que `leerRaiz` de un scope no publicado dé `null`. Es el
control que va a atrapar a la implementación de T09 si se escribe de la forma
ingenua.

**Todos los métodos de la interfaz son `async`, aunque la fuente JSON sea
síncrona.** La interfaz se escribe para la implementación más exigente. Si no, T09
obliga a reescribir a todos los llamadores, que es exactamente lo que la interfaz
tiene que evitar.

**Los secretos se derivan por rechazo, no por reducción.** `sha256(semilla|i|n)`
hasta que el candidato caiga en `[0, p)`; con `p` apenas menor que `2^254` y
candidatos de 256 bits, la aceptación es ~0,19 y se descartan unos cuatro por
secreto. Tomar el resto habría sido una línea menos y habría sesgado la
distribución, además de enseñar el hábito que esta PoC tiene que desarmar.

**La profundidad no es opción de línea de comandos.** Está compilada en
`Pertenencia(3)`; que sea una constante del script evita el caso donde alguien
cambia una de las dos cosas y el error aparece recién cuando la prueba no verifica.

**`datos/` se commitea.** Son tres archivos chicos y deterministas. Committearlos
deja el repo consistente con lo que dicen los docs y permite que T06 arranque
leyendo artefactos en vez de tener que regenerarlos. Los secretos son de juguete y
derivados de una semilla que está en el código: no hay nada que proteger, y el
archivo lleva la advertencia adentro.

## Con qué me tropecé

**El nombre de la fuente imprimía la ruta absoluta**, con `C:\Users\…` adentro, que
es ruido específico de la máquina en una salida que después se pega en un doc.
Agregué `etiqueta` a `fuenteJson`: la ruta sigue siendo absoluta para el sistema de
archivos y lo que se muestra es `datos/raiz.json`.

**Calculé mal la tasa de rechazo la primera vez.** Había escrito en un comentario
que la aceptación era ~0,76, confundiendo `p / 2^254` con `p / 2^256`. Es 0,19, y
la corrida lo confirma: 18 descartes para 8 secretos, contra los ~2,5 que habría
predicho el número equivocado. Corregido en `lib/campo.mjs`. Vale como recordatorio
de que un número plausible no es un número verificado.

**La segunda rotura del doc, la primera vez, no rompía nada.** Había escrito que
cambiar `if (!documento) return null` por `return 0n` en `fuentes/json.mjs` hacía
fallar el control del scope ajeno. La corrí para pegar la salida real y terminó con
código 0: para cuando el organizador pregunta, el archivo ya existe, así que esa
rama nunca se ejecuta y la respuesta la da la comparación de scope de la línea
siguiente. La rotura correcta es sobre esa línea, y así quedó documentada, con su
salida. Moraleja del método: una rotura deliberada que no se corre es una
afirmación sin verificar, igual que un número.

**El refactor salió limpio** porque había con qué comprobarlo: las dos
tareas anteriores dejan escritas en sus docs la raíz y el nulificador que producen,
y eso convierte "mover treinta líneas" en una operación verificable en vez de un
acto de fe. Es un argumento a favor de escribir los valores reales en los docs.

## Qué dejo pendiente o candidato a ADR

**Candidato a ADR: qué entra en el compromiso.** Hoy la hoja es
`Poseidon(secreto)`, así que no hay ninguna relación entre una hoja y el NFT, la
billetera o el pago: cualquiera que conozca *un* secreto del padrón prueba
pertenencia, sea o no el comprador. El documento de Hito 1 plantea
`Poseidon(secreto, titular)`. Cuesta 27 restricciones más y obliga al prover a
conocer la dirección. Ya estaba anotado en `bitacora/T03-circuito.md` desde el lado
del circuito; desde el lado del organizador la pregunta es la misma y hay que
cerrarla antes de T11.

**Candidato a ADR: altas y bajas del padrón.** El árbol se arma una vez y se
publica; agregar un comprador cambia la raíz e invalida los caminos ya repartidos.
Un evento real vende durante semanas. Las opciones son un árbol disperso, publicar
una raíz nueva por tanda, o aceptar una ventana de cierre de ventas. Toca el
circuito, el organizador y el contrato de T09, así que conviene decidirlo antes de
T09 y no después.

**Relación con ADR-001, sin tocarlo.** El conjunto de anonimato de esta PoC es de
ocho personas. ADR-001 (`aceptada`, `revision_pendiente: true`) ya acota el claim de
privacidad por esta razón: registra que la privacidad depende del tamaño del
conjunto y que en eventos chicos es pobre. La PoC **ilustra** ese límite; no aporta
evidencia sobre el tamaño de conjunto de un evento real y no habilita a reabrir
nada.

**Pendiente para T06: la misma validación de rango del lado del prover.**
`exigirEnCampo` está en `lib/campo.mjs` y el prover tiene que aplicarla al input
que arma, no solo confiar en que el organizador generó bien. El valor que el prover
recibe puede venir de un archivo editado a mano.

**Pendiente de despliegue, heredado: `datos/` versus lo que va a escribir el
contrato.** Cuando la raíz viva on-chain, `datos/raiz.json` deja de tener sentido y
hay que decidir si el archivo se borra o queda como caché local. Es una decisión de
T09, no de acá.

**Lo que esta tarea no hizo a propósito:** no generó ninguna prueba (es T06), no
calculó ningún nulificador, no puso nada on-chain (T09) y no hizo que los
compradores generen sus propios secretos (T12). La limitación grande de la parte
base —el organizador conoce los ocho secretos y por lo tanto puede hacerse pasar por
cualquiera de los ocho— está escrita sin adornos en la sección 6 del doc.
