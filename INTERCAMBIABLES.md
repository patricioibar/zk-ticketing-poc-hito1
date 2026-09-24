# Piezas intercambiables

Este sistema está hecho de piezas que se pueden reemplazar, y casi ninguna se
reemplaza sola. Cada documento de `docs/` tiene una sección 4 que enumera las
alternativas de **su** componente; este documento es lo que ninguna de esas
secciones puede dar: la vista de arriba. Qué piezas hay, cuáles se tocan entre
sí, qué cuesta cambiar cada una en archivos concretos de este repositorio, y en
qué orden conviene decidirlas.

No es un resumen de las secciones 4. Cuando una fila no agrega nada sobre lo que
ya dice la sección 4 de su documento, este documento la enlaza en vez de
repetirla. Lo que sí agrega está en tres lugares: el **mapa de acoplamientos**
(qué decisión arrastra a cuál), la columna **qué archivos habría que tocar** —que
esta PoC puede llenar porque subió la escalera de la raíz tres veces y contó las
líneas—, y el **orden de decisión** que se desprende de las dos cosas.

Nada de lo que sigue decide nada. Las decisiones del TPF se registran como ADR en
`../zk-ticketing-docs/docs/decisiones/` y se cierran en la weekly.

---

## Cómo leer las marcas de evidencia

Es tentador llenar una tabla como esta con lo que "se sabe" de estas
herramientas. Cada afirmación numérica de este documento lleva una de estas tres
marcas, y las tres significan cosas muy distintas:

- **Medido acá** — número producido por un comando de este repositorio, con el
  documento o la bitácora que lo contiene. Todo lo medido corre en la misma
  máquina: Intel Core i5-14400F, 16 GB de RAM, Windows 11 Pro 10.0.26200, Node 20,
  snarkjs 0.7.6, circom 2.2.3, circomlib 2.0.5 (`docs/05-prover.md` sección 5).
  El gas sale de una cadena local de Hardhat, que aplica las reglas de gas de la
  red principal pero no tiene precio.
- **KB** — viene de la base de conocimiento del TPF
  (`../zk-ticketing-docs/docs/kb/`). Las ocho entradas están hoy en estado
  `parcial`: ninguna fue verificada de punta a punta por un integrante. Citar la
  KB no es citar una medición.
- **`[a verificar]`** — nadie lo midió acá ni lo citó allá. Está escrito porque el
  hueco importa, no porque el dato esté.

Una fila con la mitad de las celdas y todas verificables vale más que una
completa y blanda. Varias filas de este documento están a la mitad a propósito.

## Advertencia de alcance: esta PoC subió un solo camino

Lo que corre en esta computadora es exactamente un camino: **circom 2.2.3 →
snarkjs 0.7.6 → Groth16 → BN254 → Poseidon → árbol de Merkle completo de
profundidad 3 → verificación en JavaScript en la puerta → Hardhat local**. Ese
camino está medido, roto a propósito y documentado en once documentos.

Todo lo que este documento diga sobre **Noir, UltraHonk, WHIR, Skyscraper, MiMC en
un circuito entero, Miden, SP1, QR animado o NFC es de segunda mano**. En el mejor
caso sale de una entrada de la KB en estado `parcial` o de un paper que se
consultó para escribir esta línea; en el peor, de nada, y entonces dice
`[a verificar]`. Cuando este documento habla de Circom y Groth16 suena seguro
porque hay un comando detrás; cuando habla de lo demás, no tiene derecho a sonar
igual, y trata de no hacerlo.

La única excepción medida de esa lista es el costo de MiMC **como primitiva**, que
se compiló para escribir este documento. Está en la pieza 3, con el método.

---

## El mapa: qué decisión arrastra a cuál

Mirando pieza por pieza, todas parecen independientes. No lo son. Hay tres
cadenas y dos cortes, y son lo más útil que deja este documento.

### La cadena del tamaño

> lenguaje del circuito → esquema de prueba → tamaño de la prueba → canal en
> puerta → si hay ida y vuelta

El lenguaje casi elige el backend: circom con snarkjs da Groth16, PLONK o fflonk
(`docs/03-setup.md` sección 4); un zkVM trae su propio STARK; Noir trae el suyo. El
backend fija el tamaño de la prueba, y el tamaño decide si el canal puede ser un QR
estático. Los números que tensan esta cadena están medidos de un lado y no del
otro:

| Eslabón | Valor | Marca |
|---|---|---|
| Prueba Groth16 comprimida | 128 bytes | medido (`docs/05-prover.md` §5) |
| Sobre completo (prueba + 3 señales) | 224 bytes | medido (íd.) |
| Capacidad útil de un QR estático binario | 2953 bytes (ISO/IEC 18004) | KB `canales-en-puerta` |
| Margen que queda | 13,2× | medido (`scripts/prover.mjs:361`) |
| Tamaño de una prueba UltraHonk | "pocos KB" | KB `proving-movil`, sin fuente enlazada → `[a verificar: fuente primaria]` |
| Tamaño de una prueba de zkVM | "decenas de KB" | KB `proving-movil` → `[a verificar]` |

El umbral se lee solo: **un esquema que multiplique el tamaño por más de trece saca
al QR estático de la mesa**, y con él al ADR-011 tal como está planteado hoy. Esa
es toda la fuerza del argumento de los 128 bytes, y también todo su límite: el
tamaño no depende de la máquina, así que es de las pocas cosas que esta PoC puede
afirmar sin medir en un teléfono.

### La cadena del campo

> curva → primo del campo → función hash → implementaciones disponibles →
> verificación on-chain

El primo `P` de BN254 está escrito en exactamente dos lugares de este repositorio,
y son el mismo número: `lib/campo.mjs:11` y `contratos/RegistroDeRaiz.sol:20`.
Cambiar de curva mueve esos dos, el flag `-p` de circom, y —lo que de verdad
importa— la posibilidad de verificar barato en la EVM, porque los precompilados de
Ethereum son de BN254 (`docs/01-poseidon.md` sección 4). La curva también condiciona
el hash: las constantes de Poseidon son por campo, y Skyscraper-v2 está publicada
sobre el campo escalar de BLS12-381.

### La cadena de la ejecución

> plataforma → qué se puede hacer con el NFT

Elegir un zkVM con red propia no es elegir un prover: es elegir dónde se ejecuta
todo lo demás. Miden no tiene EVM, ni ERC-721, ni marketplaces (KB
`plataformas-y-precedentes`), y esta PoC midió que la capa NFT cuesta 2.341.174 de
gas de despliegue y 71.515 por comprador. Esa capa es la que sostiene **ADR-005**
(regalías y tope de reventa como contrato puro, `aceptada`). Un zkVM sin EVM no
hace más lenta esa decisión: la deja sin piso. Es el acoplamiento más caro de la
lista y el que menos se ve mirando la pieza "lenguaje del circuito".

### Corte 1: la fuente de la raíz no arrastra nada, y está medido

El único acoplamiento que esta PoC puede afirmar que **no existe**. Cambiar de
dónde sale la raíz —de un JSON a un contrato, y de ahí a los compromisos que mandan
los compradores— costó **7 líneas** en los tres consumidores la primera vez y
**0 líneas** la segunda (`git diff --numstat` entre los commits de T09 y T12,
bitácora `T13-cierre.md`). La interfaz `fuenteDeRaiz` aísla el cambio en
`fuentes/`. Es la pieza más barata de mover de todo el sistema, y por eso es la que
menos urge decidir.

### Corte 2: con Groth16, la profundidad del árbol no toca el canal

Subir el conjunto de anonimato de 8 a 2²⁰ multiplica las restricciones por 4,5
(2513 → 11438, medido en `docs/02-circuito.md` §4) y por lo tanto el tiempo de
prueba, que **no está medido y es MED-001**. Pero la prueba sigue pesando 128 bytes,
porque Groth16 da pruebas de tamaño constante. O sea: hoy la privacidad se compra
con tiempo, no con ancho de banda. Ese corte **desaparece** con cualquier esquema
cuyo tamaño crezca con el circuito, que es el caso de las familias hash-based
`[a verificar: cómo crece exactamente en WHIR para un circuito de este tamaño]`.

### Los acoplamientos, de una

| Si cambiás… | Se te mueve… | Marca |
|---|---|---|
| el lenguaje del circuito | el conjunto de backends posibles, y con él el tamaño | KB + `docs/03-setup.md` §4 |
| el esquema de prueba | el tamaño → el canal; el costo de verificar on-chain; la serialización binaria entera | medido (128/224 B) |
| el esquema de prueba | la ceremonia: Groth16 tiene fase 2 por circuito (5,7 s acá), PLONK y fflonk no | medido (`docs/03-setup.md` §5) |
| la función hash | el template del árbol: `@zk-kit/binary-merkle-root.circom/src/binary-merkle-root.circom:46` llama a `Poseidon(2)` adentro | verificado acá |
| la función hash | **nada de `contratos/`**: las dos menciones de Poseidon en Solidity son comentarios, el contrato guarda un `uint256` opaco | verificado acá |
| la curva | `lib/campo.mjs:11`, `contratos/RegistroDeRaiz.sol:20`, el flag de circom, y la verificación en la EVM | verificado acá |
| la profundidad del árbol | restricciones, tiempo de prueba, tamaño del ptau — **no** el tamaño de la prueba | medido + MED-001 pendiente |
| a desafío-respuesta (ADR-008) | el canal pasa a necesitar ida y vuelta, y el tiempo de prueba entra al presupuesto de puerta | KB `canales-en-puerta` + ADR-004 |
| la plataforma a un zkVM con red propia | la capa NFT entera, y con ella ADR-005 | KB `plataformas-y-precedentes` |
| quién custodia el secreto (ADR-012) | la privacidad, porque el nulificador es determinista por evento | medido (experimento de `docs/11-cierre-de-la-escalera.md` §3) |
| la fuente de la raíz | **nada aguas abajo** | medido (7 y 0 líneas) |

---

## La tabla, de una

| # | Pieza | Lo que corre acá | Alternativas | Frente | Evidencia más fuerte |
|---|---|---|---|---|---|
| 1 | Lenguaje del circuito | circom 2.2.3 + circomlib 2.0.5 | Noir, gnark, halo2, zkVM (Miden, SP1) | ADR-010 | medido de este lado; KB del otro |
| 2 | Esquema de prueba | Groth16 (snarkjs) | PLONK, fflonk, UltraHonk, familia hash-based (WHIR) | ADR-010, ADR-011 | 128 B y 157,5 ms medidos; el resto `[a verificar]` |
| 3 | Función hash | Poseidon (circomlib) | MiMC, Poseidon2, Rescue, Skyscraper-v2 | ADR-010, ADR-001 | costo de MiMC medido acá; el resto `[a verificar]` |
| 4 | Estructura del padrón | Merkle completo, profundidad 3 | SMT, profundidad mayor, lista firmada, acumulador | ADR-001, ADR-009 | 2513 vs 11438 restricciones, medido |
| 5 | Fuente de la raíz | los tres escalones, seleccionables | testnet pública, IPFS + firma | ADR-009 | 7 y 0 líneas, medido |
| 6 | Dónde se verifica | JavaScript en la puerta | on-chain (T10), nativo (arkworks, rapidsnark) | ADR-002, ADR-004 | 8 ms en caliente, medido; el resto `[a verificar]` |
| 7 | Canal en puerta | **ninguno**: la PoC escribe un archivo | QR estático, QR animado, NFC | ADR-011, ADR-008 | solo el tamaño; todo lo demás es KB |

---

## 1. El lenguaje del circuito

**Lo que corre acá.** circom 2.2.3 con circomlib 2.0.5 y el template de Merkle de
`@zk-kit/binary-merkle-root.circom` 2.0.0, que es el de Semaphore v4. Son 67 líneas
en `circuitos/pertenencia.circom` que compilan a 2513 restricciones.

| Alternativa | Qué se gana | Qué se pierde | Marca |
|---|---|---|---|
| **Noir** (Aztec) | ergonomía de lenguaje; desacopla la lógica del backend, que es el argumento de la KB para la objeción post-cuántica | la correspondencia directa con el documento de Hito 1 de Agustina Fontana, que es circom; y el precedente de Semaphore, que está escrito en circom | KB `objeciones-jurado` |
| **gnark** (Go) | velocidad de iteración | el ecosistema JS que acá conviene: el prover, el organizador y los contratos comparten código por `ethers` | `docs/00-entorno.md` §4 |
| **zkVM** (Miden, SP1) | escribir la lógica en un lenguaje de propósito general | pruebas de decenas de KB y proving mucho más pesado; con Miden, además, la EVM entera | KB `proving-movil`, `plataformas-y-precedentes` |

**Qué archivos habría que tocar.** Todo lo que está aguas arriba de la prueba y
nada de lo que está aguas abajo del árbol: `circuitos/` entero (104 líneas en tres
archivos), `scripts/circuito-pertenencia.mjs` (217), `scripts/setup-groth16.mjs`
(299), `scripts/prover.mjs` (472), `lib/prueba-binaria.mjs` (138), `lib/senales.mjs`
(93), la parte de verificación de `scripts/validador.mjs` (258) y `package.json`.
Lo que **no** se toca: `contratos/` (174 líneas de Solidity), `fuentes/` (259),
`lib/puerta.mjs` (235) y `lib/cadena.mjs` (334). Es una separación real, no una
esperanza: el contrato guarda números opacos y la puerta guarda nulificadores.

**A qué frente toca.** **ADR-010** (`propuesta`), opción A contra opción C.

**Lo que esta PoC aporta y lo que no.** Aporta que el circuito es chico —2513
restricciones, 67 líneas— y que por lo tanto la elección de lenguaje pesa menos por
expresividad que por ecosistema: acá el trabajo difícil no fue escribir el circuito
sino la ceremonia, la serialización y la puerta. No aporta **nada** sobre la
ergonomía ni el rendimiento de Noir ni de un zkVM, porque no se escribió una línea
de ninguno de los dos.

## 2. El esquema de prueba

**Lo que corre acá.** Groth16 sobre BN254, con la ceremonia completa generada en
esta máquina: 52,8 s el setup entero, de los cuales la fase 2 —lo único que hay que
rehacer cuando cambia el circuito— son 5,7 s (`docs/03-setup.md` §5). Produce una
prueba de 128 bytes comprimida en 157,5 ms de
promedio (± 8,2 ms, diez corridas), que se verifica en ~8 ms en caliente.

| Alternativa | Qué se gana | Qué se pierde | Marca |
|---|---|---|---|
| **PLONK / fflonk** | el setup universal: desaparece la fase 2 por circuito, y con ella la ceremonia cada vez que se toca una línea | pruebas más grandes y verificación más cara; **cuánto, no está medido** | snarkjs los implementa: `docs/03-setup.md` §4. Los tamaños, `[a verificar]` |
| **UltraHonk** (Barretenberg / Noir) | lo mismo, y es la respuesta que la KB propone a la objeción más peligrosa del jurado | ata el lenguaje a Noir; el tamaño es "pocos KB" | KB `objeciones-jurado`, `proving-movil` → `[a verificar: fuente primaria del tamaño]` |
| **WHIR** y la familia hash-based | sin trusted setup de ningún tipo, y verificación muy rápida | tamaño de prueba de otro orden: el paper reporta 63 KiB para grado 2²² con 100 bits de seguridad | paper (ver abajo) |

**Sobre WHIR, con cuidado.** No está en la KB del TPF ni lo tocó esta PoC. Es
`eprint 2024/1586` (Arnon, Chiesa, Fenzi, Yogev; EUROCRYPT 2025,
<https://eprint.iacr.org/2024/1586>), y lo primero que hay que decir es que **no es
un reemplazo directo de Groth16**: es un test de proximidad a Reed–Solomon y un
esquema de compromiso polinomial que ocupa el lugar de FRI, STIR o BaseFold
*adentro* de un prover, no el lugar del SNARK entero. Compararlo con Groth16 en una
fila de tabla es comparar una pieza con un sistema. Del abstract: para grado 2²² y
100 bits, 1,2 s de commit-and-open, 63 KiB de comunicación y 360 µs de verificación.
Ese 63 KiB es más de veinte veces el QR estático; qué tamaño daría para un circuito de 2513
restricciones es **`[a verificar]`** y no se deduce de ahí. Si el equipo quiere
mirar esta familia en serio, el trabajo es una entrada de KB con el procedimiento
`entrada-kb`, no una fila acá.

**Qué archivos habría que tocar.** Cambiar de backend dentro de snarkjs
(Groth16 → PLONK) es más caro de lo que parece, porque la serialización binaria es
específica: `lib/prueba-binaria.mjs` (138 líneas) escribe exactamente **tres puntos
de curva** —G1, G2, G1— y eso es la forma de una prueba Groth16 y de ninguna otra.
Tocaría: `scripts/setup-groth16.mjs` (la fase 2 se borra), la llamada
`snarkjs.groth16.prove` de `scripts/prover.mjs`, la de verificación en
`scripts/validador.mjs` y en `scripts/ataque-raiz-propia.mjs`,
`lib/prueba-binaria.mjs` entero, `lib/sobre.mjs` (155) porque cambia el tamaño fijo
del sobre, y los tres números que `docs/05-prover.md` y `docs/06-validador.md`
publican como medidos, que habría que volver a medir.

**A qué frente toca.** **ADR-010** (`propuesta`) de lleno; **ADR-011**
(`propuesta`) por el tamaño; y **ADR-004** (`aceptada`) por el tiempo.

**Lo que esta PoC aporta.** Los dos números que la KB pedía: 128 bytes y 157,5 ms
de escritorio. Y una cosa que no estaba escrita en ningún lado: el paso más caro del
setup es `prepare phase2` con 35,8 s —el 68% de los 52,8 totales—, **no tiene nada
secreto adentro (es una FFT) y su resultado sirve para cualquier circuito de hasta
2¹²**. O sea que el costo real de iterar el circuito con Groth16 no es la ceremonia
entera sino 5,7 segundos. Eso debilita un poco el argumento operativo a favor del
setup universal —no el argumento de seguridad, que sigue intacto— y conviene decirlo
antes de que lo diga el jurado al revés.

## 3. La función hash

**Lo que corre acá.** Poseidon de circomlib, en tres lenguajes a la vez: el
circuito (`Poseidon(1)` para la hoja, `Poseidon(2)` para los nodos y el
nulificador), `circomlibjs` en el organizador y el prover, y ninguna en Solidity —
ver abajo. El paso de control de T02 existe justamente para establecer que los dos
primeros dan el mismo número.

| Alternativa | Qué se gana | Qué se pierde | Marca |
|---|---|---|---|
| **MiMC** | es la única alternativa que en las dependencias de esta PoC ya tiene las tres implementaciones: `circomlib/circuits/mimc.circom` y `mimcsponge.circom`, `buildMimc7` y `buildMimcSponge` en circomlibjs, y `mimc7Contract` / `mimcSpongecontract` para generar el Solidity | **5,4× más restricciones por nodo** | medido acá (método abajo) |
| **Poseidon2** | menos restricciones que Poseidon, según sus autores | no está en circomlib 2.0.5 (verificado listando `node_modules/circomlib/circuits/`); habría que traer o escribir las tres implementaciones y rehacer T02 | `docs/01-poseidon.md` §4 + `[a verificar: cuánto menos]` |
| **Skyscraper-v2** | velocidad **nativa**: el paper reporta 256 ns para dos elementos del campo escalar de BLS12-381, más de 15× Poseidon2 | el número que manda adentro del circuito es el de restricciones, y ese no lo tengo; y está publicada sobre BLS12-381, no sobre BN254 | paper `eprint 2025/058` + `[a verificar]` |

Ojo con un nombre que se presta: `circuitos/control_poseidon2.circom` de esta PoC
es el control de Poseidon con **aridad** 2 —dos entradas—, no de la función
Poseidon2, que no está en ninguna parte de este repositorio.

**El costo de MiMC, medido para escribir este documento.** Compilé las primitivas
sueltas con circom 2.2.3 contra circomlib 2.0.5 y conté restricciones no lineales,
que es la misma métrica con la que `docs/02-circuito.md` reporta 216 y 243:

| Primitiva | Restricciones no lineales |
|---|---|
| `Poseidon(1)` | 216 |
| `Poseidon(2)` | 243 |
| `MiMCSponge(1, 220, 1)` | 660 |
| `MiMCSponge(2, 220, 1)` | 1320 |

El circuito invoca el hash cuatro veces: la hoja, tres nodos del camino y el
nulificador. Con Poseidon eso son 216 + 3×243 + 243 = **1188** restricciones, que es
lo que `docs/02-circuito.md` §2 ya había contado. Con MiMCSponge serían 660 + 3×1320
+ 1320 = **5940**, cinco veces más, sobre un total de 2513. No compilé el circuito
entero con MiMC, y la razón es el acoplamiento del párrafo siguiente.

**Qué archivos habría que tocar, y la sorpresa.** Cambiar el hash **obliga a tirar
el template del árbol**: `@zk-kit/binary-merkle-root.circom/src/binary-merkle-root.circom:46`
llama a `Poseidon(2)` adentro, así que un árbol con otro hash hay que escribirlo a
mano con `Switcher`, que es exactamente el ejercicio que `docs/02-circuito.md` §4
midió (2495 restricciones) y descartó por no valer la pena. Ahí se pierde el código
heredado de Semaphore, que es el precedente que la KB manda citar en la defensa.
Tocaría además `circuitos/control_poseidon.circom`, `scripts/control-poseidon.mjs`
(215 líneas), `lib/merkle.mjs` (72), `scripts/organizador.mjs` (237),
`scripts/prover.mjs`, `lib/compradores.mjs` (188) y repetir T02 entero antes de
tocar nada más.

Lo que **no** habría que tocar, y `docs/01-poseidon.md` §4 dice que sí: los
contratos. Verifiqué por `grep`: las dos únicas apariciones de "Poseidon" en
`contratos/` son comentarios (`EntradaNFT.sol:64` y `RegistroDeRaiz.sol:56`). El
contrato recibe y guarda un `uint256` opaco y lo único que comprueba es que sea
menor que `P`, que es una propiedad **de la curva, no del hash**. La corrección
importa porque cambia de lugar un costo: cambiar el hash es caro en el circuito y
gratis en la cadena; cambiar la curva es al revés.

**A qué frente toca.** **ADR-010** (`propuesta`) por la elección; **ADR-001**
(`aceptada`, `revision_pendiente: true`) por lo que cuelga de ella: que el control
de T02 demuestre paridad entre implementaciones y no correctitud sigue siendo un
`[a verificar]` contra los vectores del paper.

## 4. La estructura del padrón

**Lo que corre acá.** Un árbol de Merkle completo de profundidad 3 —ocho
identidades— armado en `lib/merkle.mjs` (72 líneas) y verificado en el circuito con
el template de Semaphore v4.

| Alternativa | Qué se gana | Qué se pierde | Marca |
|---|---|---|---|
| **Profundidad 20** (2²⁰ hojas) | el conjunto de anonimato, que es la mitigación que ataca el problema de frente | 11438 restricciones contra 2513 (4,5×), un ptau de 2¹⁴ en vez de 2¹², y un tiempo de prueba que **nadie midió**: es MED-001 | medido (`docs/02-circuito.md` §4, `docs/03-setup.md` §4) |
| **Árbol disperso (SMT)** | altas y bajas sin recalcular, y prueba de **no** pertenencia (listas negras) | más costo por nivel; el organizador mantiene una estructura en vez de un array; cinco señales de control nuevas cuyo mal uso es un agujero | `docs/02-circuito.md` §4, `docs/04-organizador.md` §4 |
| **Lista firmada por el organizador** (sin árbol) | simplicidad total | el circuito tendría que verificar una firma, que es mucho más caro que un camino de Merkle, y vuelve al organizador un tercero de confianza en línea | `[a verificar: costo en restricciones]` |

**Qué archivos habría que tocar.** Para la profundidad: un carácter en
`circuitos/pertenencia.circom:67`, más `scripts/organizador.mjs:24`, el tamaño del
ptau en `scripts/setup-groth16.mjs:36`, y la decisión de qué va en las hojas vacías
—que hoy no existe porque el árbol se llena justo, y que es uno de los frentes sin
ADR abierto del apéndice de `docs/11-cierre-de-la-escalera.md`. El prover **no se
toca**: ya lee la profundidad del padrón. Para el SMT: el circuito, `lib/merkle.mjs`
y el organizador, o sea casi todo aguas arriba.

**A qué frente toca.** **ADR-001** (el tamaño del conjunto de anonimato es el
límite del claim) y **ADR-009** (si el padrón se puede actualizar en vivo, el doble
ingreso y la sincronización cambian de forma).

**Lo que esta PoC aporta.** El precio exacto de subir el conjunto de anonimato, en
restricciones, y la constatación de que ese precio **no** se paga en bytes. Lo que
falta es la mitad que importa: cuánto tarda una prueba de 11438 restricciones en un
teléfono de gama media. Eso es MED-001 y hoy está sin medir.

## 5. La fuente de la raíz

Esta pieza está completamente explicada en otro lado y no la voy a repetir: los
tres escalones —JSON, contrato de raíz, contrato NFT—, qué cambia entre uno y otro
y qué cuesta cada uno están en `docs/11-cierre-de-la-escalera.md`, y las
alternativas que siguen (testnet pública) en su sección 4 y en la de
`docs/08-contrato-raiz.md`.

Lo único que agrego acá es lo transversal: **es la pieza más barata de mover del
sistema entero**, y es el único desacople que esta PoC puede demostrar con un
número en vez de afirmarlo. Siete líneas y cero líneas. Consecuencia para el orden
de decisión: no hay ninguna razón para decidirla temprano, y sí hay una para no
hacerlo, porque el escalón que falta —una testnet pública— es el que convertiría en
medido lo que hoy está supuesto (que el registro sea público, inmutable y
verificable por alguien que no tiene el repositorio).

El gas de cada escalón, medido: desplegar `RegistroDeRaiz` 429.921; publicar una
raíz 69.917; desplegar `EntradaNFT` 2.341.174; emitir ocho entradas 646.040; los
ocho compromisos 572.180, que **los pagan los compradores** a 71.515 cada uno.

**A qué frente toca.** **ADR-009** (quién puede cambiar la raíz de un evento en
curso y con qué aviso) y, por la vía de las nueve billeteras con fondos,
**ADR-012**.

## 6. Dónde se verifica la prueba

**Lo que corre acá.** En la puerta, en JavaScript, contra una `verification_key` de
3,5 kB que el provisionador le dejó al molinete. Medido: ~8 ms en caliente, ~320 ms
la primera verificación de cada proceso —que paga armar la curva— y ~750 ms el
comando entero con el arranque de Node (`docs/06-validador.md` §5).

| Alternativa | Qué se gana | Qué se pierde | Marca |
|---|---|---|---|
| **On-chain** (T10, no hecha) | que cualquiera pueda comprobar la validación, y un registro de nulificadores compartido de verdad | **el offline, que es ADR-002 (`aceptada`)**; y publicar el nulificador es publicar quién entró y a qué hora, que es ADR-001 | `docs/06-validador.md` §4, apéndice de `docs/11` |
| **Nativo** (arkworks en Rust, rapidsnark en C) | que corra en un molinete que no es una PC con Node; probablemente menos que 8 ms y sin el arranque de 750 ms | una implementación más que mantener y que auditar | `[a verificar: cuánto tarda]` |

**Qué archivos habría que tocar.** Para on-chain: un verificador Solidity generado
por snarkjs (`snarkjs zkey export solidityverifier`), la prueba **sin comprimir** de
256 bytes porque el verificador consume los ocho elementos de campo sueltos, y el
camino de `scripts/validador.mjs`, que hoy termina anotando el nulificador en la
lista local de `lib/puerta.mjs`. Para
nativo: nada de este repositorio, porque sería otro programa; lo que sí se lleva es
el formato de `lib/prueba-binaria.mjs`, que ya está en bytes crudos big-endian
justamente para que se pueda.

**A qué frente toca.** **ADR-002** (`aceptada`: la validación offline es el eje) y
**ADR-004** (`aceptada`: menos de 5 s por persona). Contra ese presupuesto, 8 ms es
nada: el cuello de botella de la puerta no es verificar.

**Una advertencia que el número de 8 ms se gana sola.** Verificar es unas veinte
veces más barato que probar (8 ms contra 157,5 ms), los dos en la misma PC de
escritorio. Ninguno de los dos números dice nada sobre un teléfono ni sobre un
molinete real, y el de la puerta tampoco incluye leer un QR, que es la pieza que
esta PoC no tiene.

## 7. El canal en la puerta

**Lo que corre acá: nada.** Es la única pieza de esta lista que la PoC no
implementó. El prover escribe `salidas/sobre.bin` y el validador lo lee de un
archivo; no hay cámara, no hay pantalla, no hay NFC. Lo único que esta PoC aporta a
la decisión del canal es **un tamaño**, y lo aporta bien: 224 bytes contra los 2953
del QR estático, con 13,2× de margen (`scripts/prover.mjs:361`).

Todo lo demás de esta sección es KB, y la entrada correspondiente está en estado
`parcial`:

| Alternativa | Qué se gana | Qué se pierde | Marca |
|---|---|---|---|
| **QR estático** (lo previsto) | funciona con cualquier teléfono y cualquier lector; el sobre entra trece veces | es unidireccional, así que no habilita desafío-respuesta; y la prueba pregenerada es un token al portador: quien le saque una foto y llegue primero, entra | KB `canales-en-puerta`, `doble-ingreso-offline` |
| **QR animado** | capacidad mucho mayor, para pruebas que no entran en uno estático | la cuenta en condiciones reales de la KB es de 2-3 KB/s, o sea 15-25 s para 50 KB: **no cumple el presupuesto de ADR-004**; y el temblor de la mano es el problema principal | KB `canales-en-puerta` (con un `[a verificar]` adentro) |
| **NFC** | kilobytes en fracciones de segundo y **bidireccional**, que es lo que habilita el desafío-respuesta de ADR-008; no depende de luz ni de pantalla | restricciones de NFC en iOS, que la KB marca como riesgo a validar temprano | KB `canales-en-puerta` |

**Qué archivos habría que tocar.** Hoy, ninguno: habría que escribirlos. Lo que ya
está listo para cuando exista es el formato: `lib/sobre.mjs` (155 líneas) produce un
buffer de tamaño fijo y `lib/prueba-binaria.mjs` lo convierte desde y hacia la
prueba, así que un codificador de QR o un lector NFC se enchufan ahí sin tocar el
validador. Si el canal fuera bidireccional, en cambio, el cambio no es de transporte
sino de circuito: el desafío entra como señal pública y toca
`circuitos/pertenencia.circom`, el prover y la puerta.

**A qué frente toca.** **ADR-011** (`propuesta`) y **ADR-008** (`propuesta`, y es
**la prioridad actual del equipo** según `../zk-ticketing-docs/docs/estado.md`).

**La honestidad que corresponde.** Que 224 bytes entren en un QR estático está
medido. Que un molinete lea ese QR en menos de 5 s con gente apurada, con pantallas
rotas y con sol de frente, no lo mide nadie acá.

---

## Tres piezas más que la PoC tocó y el plan no nombra

Van cortas, porque cada una está explicada donde corresponde.

**La curva: BN254 → BLS12-381.** Mejor margen de seguridad contra el único campo
que la EVM verifica barato en un precompilado. Toca dos constantes idénticas
(`lib/campo.mjs:11`, `contratos/RegistroDeRaiz.sol:20`), el flag de circom, y la
posibilidad de verificar on-chain. Detalle en `docs/01-poseidon.md` §4. Toca
**ADR-010**.

**Qué viaja en el sobre: 224 bytes → 160.** La raíz y el scope la puerta ya los
conoce; mandar solo prueba y nulificador es un 29% menos y, sobre todo, convierte el
chequeo de la raíz en algo estructural en vez de un `if` que alguien puede olvidarse
de escribir. Se pierde que la prueba sea autocontenida y que un error de
configuración se diagnostique bien. Está bien explicado en `docs/06-validador.md` §4
y `docs/05-prover.md` §4. Toca **ADR-011**.

**Quién custodia el secreto.** No es una pieza de software sino la pregunta de
**ADR-012**, y esta PoC la movió de casillero: el experimento de
`docs/11-cierre-de-la-escalera.md` §3 muestra que, con los secretos a mano, el
nulificador ata un ingreso a una billetera. Como el nulificador es determinista por
evento, **quien custodie secretos puede reconstruir historiales de ingreso**. Eso
convierte a ADR-012 de una discusión de usabilidad en una de privacidad, y es el
hallazgo que más lejos llega de todo lo que dejó la PoC.

## Piezas explicadas en otro lado, que no repito

Cada una agrega poco a la vista transversal y bastante a la suya:

- La política de escritura de la raíz (pisar, una sola vez, timelock) y el control
  de acceso del organizador (`immutable`, `Ownable`, roles, multisig):
  `docs/08-contrato-raiz.md` §4.
- El reemplazo del compromiso antes de publicar la raíz, y la reventa, que está
  rota y es demostrable: `docs/09-entrada-nft.md` §4 y `docs/10-flujo-completo.md` §4.
- El empaquetado de dos casilleros en uno (~22.100 de gas por escritura, casi un
  tercio): `docs/08-contrato-raiz.md` §4 y `docs/09-entrada-nft.md` §4.
- La lista de nulificadores: JSON contra SQLite o un log con `fsync`, y la lista
  compartida entre puertas, que es **ADR-009** entero: `docs/06-validador.md` §4.
- El harness de tests y el contrato de salida del validador:
  `docs/07-demostraciones.md` §4.
- Las mitigaciones del vínculo billetera ↔ compromiso (billetera sin relación,
  envío en lote con relayer, prueba de propiedad sin revelar el token):
  `docs/11-cierre-de-la-escalera.md` §4.
- Node 24 contra Node 22 LTS, y Hardhat contra Foundry: `docs/00-entorno.md` §4.

---

## En qué orden conviene decidir

Esto es una **propuesta para la weekly**, no una decisión: las prioridades del
equipo se cambian ahí. Sale del mapa de acoplamientos y de una sola regla: primero
lo que arrastra, y antes de eso el dato que falta.

**0. MED-001, que no es una decisión sino el dato que traba tres.** Cuánto tarda
una prueba con el árbol de la profundidad que el TPF quiera, en un teléfono de gama
media y en un navegador. Sin ese número, ADR-010 se decide a ciegas, ADR-008 no
puede saber si el proving entra en el presupuesto de puerta y ADR-001 no puede
decir de qué tamaño puede ser el conjunto de anonimato. Esta PoC dejó el prover
listo para medirlo y midió el caso de escritorio: 157,5 ms con profundidad 3.

**1. ADR-010, en su parte de esquema y curva.** Es el nodo del que cuelgan las dos
cadenas largas: fija el tamaño de la prueba (y con él el canal) y fija el campo (y
con él la verificación on-chain y el hash). Decidir el canal antes que esto es
decidir sobre un tamaño que todavía puede cambiar de orden de magnitud.

**2. ADR-008.** Hoy es la prioridad del equipo, y está bien que lo sea, pero
depende de MED-001 por un lado —el desafío-respuesta mueve el proving adentro del
presupuesto— y arrastra a ADR-011 por el otro, porque el desafío-respuesta exige un
canal bidireccional y el QR estático no lo es.

**3. ADR-011.** Después del tamaño (paso 1) y de si hace falta ida y vuelta
(paso 2). Antes de esos dos, la decisión no tiene entradas.

**4. ADR-009.** Bastante independiente de la cadena cripto: depende de si hay
registro on-chain de nulificadores (que choca con ADR-001) y de cuántas raíces
vigentes tolera una puerta. Se puede avanzar en paralelo.

**5. ADR-012.** Independiente del stack y urgente por otra razón: es el que decide
si alguien puede reconstruir historiales de ingreso. Conviene tratarlo como
decisión de privacidad, no de usabilidad.

**Y en cualquier momento, sin bloquear a nadie:** la fuente de la raíz (medido: 7 y
0 líneas), la política de escritura del contrato y el control de acceso del
organizador. Están desacopladas de todo lo anterior.

## Qué NO dice este documento

**No dice qué conviene elegir.** Dice qué se paga por cada cambio y en qué orden
conviene preguntarse las cosas. Las decisiones se registran como ADR y se cierran
en la weekly, con revisión de otro integrante.

**No compara rendimiento entre alternativas que no corrieron acá.** No hay un
número de Noir, ni de UltraHonk, ni de un zkVM producido por esta PoC, y ninguna de
las filas de este documento pretende que lo haya. Las cuatro cosas medidas que
tocan a una alternativa son: el costo de MiMC como primitiva (acá), las
restricciones a profundidad 20, el costo de la fase 2 de Groth16 y el tamaño del
sobre. Todo lo demás es KB `parcial`, paper citado o `[a verificar]`.

**No mide nada en un teléfono ni en un molinete.** Todos los tiempos son de una PC
de escritorio con Node. El número que el TPF necesita de verdad —proving en gama
media— es MED-001 y está pendiente.

**No aporta evidencia para reabrir un ADR `aceptada`.** ADR-001, ADR-002, ADR-004 y
ADR-005 siguen como están —los cinco primeros ADR están `aceptada` con
`revision_pendiente: true`, que es otra cosa: les falta la validación del equipo,
no una reapertura—. Donde este documento los toca es para decir qué cambio los
rozaría, no para proponer que se los toque.

**No es el lugar donde esto vive.** Cuando alguno de estos análisis sirva para una
decisión, va a un ADR o a una entrada de KB en `../zk-ticketing-docs`. Este archivo
es lo que la PoC aprendió cambiando cosas, no la memoria del proyecto.
