---
tarea: T02
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

Un circuito mínimo (`circuitos/control_poseidon.circom`) que expone `Poseidon(1)`
de circomlib, y un script (`scripts/control-poseidon.mjs`) que lo compila, calcula
el witness para nueve vectores y compara la señal de salida contra lo que devuelve
`buildPoseidon()` de circomlibjs. Se agregó `control:poseidon` a los scripts de
`package.json`. La documentación quedó en `docs/01-poseidon.md`.

Los nueve vectores: 0, 1, 2, un valor arbitrario del medio del campo, `p - 1`, `p`,
`p + 1`, `2^253` y `2^256 - 1`.

El script también compara, antes de los hashes, el módulo del campo que declara el
`.r1cs` contra el que expone `poseidon.F.p` de circomlibjs. Si alguna de las dos
librerías cambiara de curva, el mensaje de error dice eso y no "los hashes no
coinciden".

**Resultado: los nueve vectores coinciden.** Salida real de `npm run
control:poseidon`, código de salida 0:

```
Compilando circuitos/control_poseidon.circom

Campo primo (BN254 / Fr): p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
  circom (del .r1cs)      coincide
  circomlibjs (poseidon.F) coincide

Poseidon(1) sobre cada vector

  cero
    x                 0
    h (circuito)      19014214495641488759237505126948346942972912379615652741039992445865937985820
    h (circomlibjs)   19014214495641488759237505126948346942972912379615652741039992445865937985820
    iguales           si

  uno
    x                 1
    h (circuito)      18586133768512220936620570745912940619677854269274689475585506675881198879027
    h (circomlibjs)   18586133768512220936620570745912940619677854269274689475585506675881198879027
    iguales           si

  dos
    x                 2
    h (circuito)      8645981980787649023086883978738420856660271013038108762834452721572614684349
    h (circomlibjs)   8645981980787649023086883978738420856660271013038108762834452721572614684349
    iguales           si

  valor del medio
    x                 1234567890123456789012345678901234567890
    h (circuito)      17233478352641046290653020355207123739245241129469381061437095172858635059064
    h (circomlibjs)   17233478352641046290653020355207123739245241129469381061437095172858635059064
    iguales           si

  p - 1 (maximo del campo)
    x                 21888242871839275222246405745257275088548364400416034343698204186575808495616
    h (circuito)      3366645945435192953002076803303112651887535928162668198103357554665518664470
    h (circomlibjs)   3366645945435192953002076803303112651887535928162668198103357554665518664470
    iguales           si

  p (el modulo exacto)
    x                 21888242871839275222246405745257275088548364400416034343698204186575808495617
    x mod p           0   <- se redujo
    h (circuito)      19014214495641488759237505126948346942972912379615652741039992445865937985820
    h (circomlibjs)   19014214495641488759237505126948346942972912379615652741039992445865937985820
    iguales           si

  p + 1
    x                 21888242871839275222246405745257275088548364400416034343698204186575808495618
    x mod p           1   <- se redujo
    h (circuito)      18586133768512220936620570745912940619677854269274689475585506675881198879027
    h (circomlibjs)   18586133768512220936620570745912940619677854269274689475585506675881198879027
    iguales           si

  2^253 (adentro del campo)
    x                 14474011154664524427946373126085988481658748083205070504932198000989141204992
    h (circuito)      8931450823068383251085042996065638095737645970512690328897802402136999640541
    h (circomlibjs)   8931450823068383251085042996065638095737645970512690328897802402136999640541
    iguales           si

  2^256 - 1 (maximo uint256)
    x                 115792089237316195423570985008687907853269984665640564039457584007913129639935
    x mod p           6350874878119819312338956282401532410528162663560392320966563075034087161850   <- se redujo
    h (circuito)      11254588113248280256028662529799552354366536761492627237202955510067774853962
    h (circomlibjs)   11254588113248280256028662529799552354366536761492627237202955510067774853962
    iguales           si

Control pasado: 9 vectores, mismo hash en circuito y en JS.
Ver docs/01-poseidon.md.
```

La rotura deliberada de `docs/01-poseidon.md` sección 5 (cambiar
`poseidon.inputs[0] <== x;` por `<== x + 1;`) se corrió: el script falla en los
nueve vectores, lista cada diferencia y sale con código 1. La línea se restauró.

Mediciones de restricciones que quedaron citadas en el doc, con circom 2.2.3 y
circomlib 2.0.5 en esta máquina:

| Circuito | No lineales | Lineales | Total |
|---|---|---|---|
| `Poseidon(1)` | 216 | 199 | 415 |
| `Poseidon(2)` | 243 | 274 | 517 |
| `Sha256(256)` | 29412 | 1852 | 31264 |
| 2 × `Num2Bits(254)` + `Sha256(512)` | 59809 | 3229 | 63038 |

Los dos circuitos de SHA-256 eran temporales y no quedaron en el repo; el fuente
exacto para rehacer la medición está en la sección 3 del doc.

## Decisiones que tomé y por qué

**Leer el witness en vez de generar una prueba.** El control necesita saber qué
número calcula el circuito, no demostrarlo. `snarkjs.wtns.calculate` +
`wtns.exportJson` alcanza y no depende del trusted setup, que es T04. Así T02 no
tiene dependencias hacia adelante, que es lo que le permite ser el primer control.

**Recompilar el circuito en cada corrida.** Un `.wasm` viejo de una versión anterior
de circomlib es justamente el escenario que este control existe para detectar.
Reusar el compilado ahorraría unos segundos y perdería el punto.

**Escribir el módulo `p` a mano en el script en vez de leerlo de una librería.** Si
circom o circomlibjs cambiaran de curva, un valor leído de ellas seguiría
coincidiendo consigo mismo. Escrito a mano, no.

**Usar `Poseidon(1)` y no `Poseidon(2)`.** Es el circuito más chico que establece el
punto. Tiene un costo que dejé anotado en la sección 6 del doc: el sistema real va a
usar aridad 2 (`Poseidon(secreto, titular)` y `Poseidon(secreto, scope)`), y la
aridad es una de las cosas que pueden estar desalineadas entre JS y el circuito
—cada aridad usa constantes distintas—. Si T03 o T05 tocan algo del hash, conviene
ampliar el control antes.

**Imprimir los números enteros, sin recortar.** Los recorté en una primera versión
y el resultado era imposible de verificar a ojo o de pegar en otro lado. Para un
control cuyo entregable es la confianza en un número, mostrar el número entero es
parte del trabajo.

## Con qué me tropecé

**La API de circomlibjs 0.1.7 devuelve un buffer, no un número.** `poseidon([x])`
devuelve un `Uint8Array` de 32 bytes en representación de Montgomery. Compararlo
directamente contra un `BigInt` da "distinto" siempre, sin ningún error que
explique por qué. La conversión correcta es `poseidon.F.toString(h)` o
`poseidon.F.toObject(h)`. Lo verifiqué leyendo
`node_modules/circomlibjs/src/poseidon_wasm.js`, que termina en
`bn128.tm.getBuff(pOut, 32)`, no la documentación. Quedó como segunda rotura
deliberada en el doc, porque es el error que más probablemente se repita.

**La entrada va en un array aunque sea una sola.** `poseidon([x])`, no
`poseidon(x)`.

**El orden del witness.** No está documentado de forma obvia: posición 0 es la
constante 1, después las salidas, después las entradas. Lo confirmé empíricamente
antes de escribir el script, comparando `w[2]` contra la entrada que le pasaba.
Ese mismo `w[2]` terminó siendo lo más útil del control, porque es el valor de
entrada **ya reducido módulo p** leído de adentro del circuito.

## Qué dejo pendiente o candidato a ADR

**Candidato a ADR: validar que todo valor que entra al circuito esté en `[0, p)`.**
Las dos implementaciones reducen módulo `p` en silencio: `Poseidon(p)` es
`Poseidon(0)` y `Poseidon(p+1)` es `Poseidon(1)`, en el circuito y en JS. Coinciden,
que es lo que esta tarea tenía que establecer, pero la consecuencia es que **dos
secretos que difieran en un múltiplo exacto de `p` producen el mismo nulificador**.
Con secretos generados al azar dentro del campo la probabilidad es despreciable;
con secretos que vengan de afuera —un `uint256` de un contrato, un hash de 256
bits, un identificador armado a mano— el valor no es al azar y lo puede elegir un
atacante. La defensa le toca a quien genera el secreto: generar siempre en `[0, p)`
y rechazar explícitamente en vez de dejar que se reduzca solo. Afecta al
organizador (T05), al prover (T06) y a la interfaz con los contratos (T09, T11).
No lo decidí acá; corresponde al frente de ADR sobre el esquema de compromisos y
nulificadores en `../zk-ticketing-docs`.

**Pendiente: correctitud, no solo paridad.** El control demuestra que circomlib y
circomlibjs son la *misma* implementación, no que sean la *correcta*. Son del mismo
autor y de las mismas constantes, así que un error compartido pasaría el control.
Contrastar contra los vectores del paper de Poseidon o contra una implementación
independiente queda `[a verificar]`.

**Pendiente: la tercera implementación, la de Solidity.** El contrato va a calcular
Poseidon también. `circomlibjs` exporta `poseidonContract` para generar ese
verificador. Ese paso de control corresponde a T09/T11 y no está hecho.

**Pendiente: ampliar a `Poseidon(2)`.** Ver arriba, en decisiones.
