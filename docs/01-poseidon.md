# Poseidon — paso de control entre JavaScript y el circuito

## 1. Qué hace

Comprueba que la función de hash Poseidon devuelve exactamente el mismo número
cuando se la calcula adentro de un circuito de circom y cuando se la calcula en
JavaScript con circomlibjs. `npm run control:poseidon` compila dos circuitos
mínimos, corre nueve valores de prueba de una entrada y siete pares de dos por las
dos implementaciones —entre ellos los bordes del campo sobre el que trabajan— y
termina con error si alguno difiere.

La parte de dos entradas la agregó T03, que es la que la necesita: el nodo interno
del árbol y el nulificador usan `Poseidon(2)`, y cada aridad carga constantes
distintas. El control cierra además comprobando que `Poseidon(1)([x])` y
`Poseidon(2)([x, 0])` son números distintos, que es la separación de dominio en la
que se apoya `docs/02-circuito.md`.

No produce ninguna pieza del sistema. Es un instrumento de calibración: se corre
antes de construir nada encima, y se vuelve a correr cada vez que cambie alguna
versión.

## 2. Cómo lo hace

Son tres archivos: dos circuitos —uno por aridad— y el script que los maneja. Los
dos circuitos son iguales salvo por la cantidad de entradas, así que abajo se
recorre el de aridad 1; `circuitos/control_poseidon2.circom` es el mismo con dos.

### El circuito

`circuitos/control_poseidon.circom` es lo más chico que se puede escribir y que
siga siendo el mismo Poseidon que va a usar el resto de la PoC.

`circuitos/control_poseidon.circom:3` incluye `poseidon.circom` de circomlib. Esa
es la implementación auditada que exige `AGENTS.md`: la criptografía no se escribe
a mano.

`circuitos/control_poseidon.circom:9` y `:10` declaran una **señal** de entrada y
una de salida. Una señal no es una variable: es un valor que forma parte del
sistema de ecuaciones que el circuito representa. Lo importante es que una señal,
una vez asignada, no se puede volver a asignar; el circuito no es un programa que
se ejecuta paso a paso sino la descripción de una relación entre números que tiene
que cumplirse.

`circuitos/control_poseidon.circom:12` instancia `Poseidon(1)`: la versión de
Poseidon que toma **un** elemento de campo. El número entre paréntesis es la
cantidad de entradas, y cada cantidad usa constantes distintas, así que
`Poseidon(1)([x])` y `Poseidon(2)([x, 0])` dan resultados diferentes. Esto importa
más adelante: el compromiso del árbol y el nulificador van a usar `Poseidon(2)`,
y si un lado usa una aridad y el otro usa otra, el síntoma es el mismo que si el
hash estuviera mal.

`circuitos/control_poseidon.circom:13` y `:14` son asignaciones con `<==`. Ese
operador hace dos cosas a la vez: le asigna el valor a la señal *y* agrega al
sistema la restricción de que esas dos cosas son iguales. Es la diferencia entre
"calculá esto" y "dejá constancia de que esto vale". Un circuito que calcula bien
pero no deja constancia no prueba nada.

`circuitos/control_poseidon.circom:17` declara el componente principal. Sin esa
línea el archivo es una librería y no compila a un circuito ejecutable.

Compilarlo con `circom --r1cs` informa: 216 restricciones no lineales, 199
lineales, 417 cables. Guardá ese número; la sección 3 lo usa.

### El script

`scripts/control-poseidon.mjs` se lee de arriba hacia abajo en orden de ejecución.

`scripts/control-poseidon.mjs:30` escribe a mano el módulo del campo primo de
BN254. Está clavado a propósito y no leído de ninguna librería: si circom o
circomlibjs cambiaran de curva, un valor leído de ellas seguiría coincidiendo
consigo mismo y el control pasaría igual. Escrito a mano, no.

`scripts/control-poseidon.mjs:36` es la lista de vectores de una entrada y `:50` la
de pares para la aridad 2. En la primera, los tres primeros valores son triviales,
el cuarto es un número cualquiera del medio del campo, y los cinco últimos son los
bordes: `p - 1`, `p`, `p + 1`, `2^253` y `2^256 - 1`. Por qué esos, en la sección 3.
La segunda repite el mismo criterio con pares, y agrega un par invertido —(2, 1)
después de (1, 2)— porque en aridad 2 el orden de los argumentos también importa.

`scripts/control-poseidon.mjs:64` (`compilar`) ejecuta el compilador `circom` con
`-l node_modules` para que encuentre circomlib, y deja el `.r1cs` y el `.wasm` en
`build/`. Se recompila en cada corrida a propósito: un `.wasm` viejo de una versión
anterior de circomlib es exactamente el escenario que este control tiene que
detectar. El flag `shell: process.platform === "win32"` es el mismo truco de
`verificar-entorno.mjs` y por la misma razón.

`scripts/control-poseidon.mjs:92` (`hashDelCircuito`, y `:99` su gemela de dos
entradas) es la parte no obvia y va línea por línea.

- `snarkjs.wtns.calculate({ x }, wasm, wtns)` corre el `.wasm` que produjo circom.
  Ese wasm no genera ninguna prueba: solo **calcula el witness**, que es el vector
  con el valor de todas las señales del circuito para esa entrada. Es el paso
  previo a probar nada, y para este control alcanza y sobra.
- `snarkjs.wtns.exportJson(wtns)` convierte ese vector binario en un array de
  `BigInt` legible.
- El orden del array lo fija circom y no es arbitrario: la posición 0 es siempre
  la constante 1, después vienen las **salidas** y después las **entradas**. Con
  una salida y una entrada, `w[1]` es `h` y `w[2]` es `x`. El detalle que hace
  valioso a `w[2]`: no es el `x` que le pasamos, es el `x` **ya reducido módulo p**
  por el propio calculador de witness. Esa es la evidencia directa de la reducción
  que la sección 3 explica, leída de adentro del circuito en vez de deducida.

`scripts/control-poseidon.mjs:115` construye el Poseidon de JavaScript.
`buildPoseidon()` es asíncrono porque por dentro compila e instancia un módulo
WebAssembly: la implementación de circomlibjs 0.1.7 no es JavaScript puro, es un
wasm generado en tiempo de carga (`node_modules/circomlibjs/src/poseidon_wasm.js`).

`scripts/control-poseidon.mjs:120` a `:131` es el chequeo previo: los dos lados
tienen que estar sobre el mismo campo. El módulo del circuito sale del `.r1cs`
—`snarkjs.r1cs.info()` lo trae en `prime`— y el de JavaScript sale de
`poseidon.F.p`. Comparar hashes de dos campos distintos no tendría sentido, así
que esto va antes.

`scripts/control-poseidon.mjs:136` es la llamada a Poseidon en JavaScript, y tiene
dos trampas de la API vieja de circomlibjs que conviene tener escritas:

- La entrada va **en un array**, incluso para una sola: `poseidonJs([x])`. Pasarle
  el valor suelto no falla con un error claro.
- La salida **no es un número**: es un `Uint8Array` de 32 bytes con el valor en
  representación de Montgomery, que es una forma interna del campo pensada para
  multiplicar rápido. Imprimirlo directamente da bytes sin sentido, y —peor—
  compararlo contra otra cosa sin convertir da "distinto" siempre. `F.toString(h)`
  es la conversión correcta; `F.toObject(h)` devuelve el mismo número como
  `BigInt`. Verificado contra el código del paquete instalado, no contra la
  documentación: `poseidon_wasm.js` devuelve `bn128.tm.getBuff(pOut, 32)`, un
  buffer crudo.

`scripts/control-poseidon.mjs:195` a `:199` es el final ruidoso. Si hay al menos
una diferencia, imprime cuál, dice por qué no hay que seguir, y sale con código 1
para que `npm run` también falle.

## 3. Por qué está hecho así

### Qué es el campo primo, y por qué todo esto es aritmética modular

Un sistema de pruebas de conocimiento cero no trabaja con los enteros de siempre.
Trabaja con un conjunto finito de números: los enteros desde 0 hasta `p - 1`,
donde `p` es un número primo, y donde toda cuenta se hace y después se toma el
resto de dividir por `p`. Ese conjunto se llama **campo primo** y es el universo
entero de valores que puede tomar una señal.

El `p` de esta PoC es el de la curva **BN254**, que es la que usan circom, snarkjs
y el precompilado de verificación de Ethereum:

```
p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

Son 77 dígitos decimales, un poco menos que 2^254. De ahí sale el hecho más
incómodo de trabajar con esto: **un `uint256` de Solidity no entra en el campo**.
El máximo de un `uint256` es `2^256 - 1`, casi cinco veces más grande que `p`. Un
hash de SHA-256, que son 256 bits, tampoco entra. Cualquier valor que venga del
mundo de los contratos y se meta en un circuito puede estar siendo reducido sin
que nadie lo note.

Por qué el campo es así de grande y no más chico: `p` es el orden del grupo donde
vive la criptografía de la curva, y la seguridad de las pruebas depende de ese
tamaño. No es una elección de esta PoC, viene con la curva.

Por qué las cuentas son módulo `p` y no enteras: porque el circuito, al final,
tiene que convertirse en operaciones sobre puntos de esa curva elíptica, y ahí
solo existen esos `p` valores. No hay un "número grande" al que desbordarse:
después de `p - 1` viene 0 otra vez.

### Por qué Poseidon y no SHA-256

La respuesta corta es el costo, y el costo se mide en **restricciones**.

Un circuito no es un programa. Es un sistema de ecuaciones. Cada ecuación de la
forma "este valor por este otro es igual a este tercero" es una restricción, y el
sistema entero es lo que la prueba demuestra que se cumple. El tiempo que tarda
generar una prueba y el tamaño del trusted setup crecen con la cantidad de
restricciones. Es *la* métrica de costo de todo el diseño.

Acá está la clave: las restricciones son sobre **elementos del campo**, no sobre
bits. Sumar y multiplicar números del campo es gratis o casi. Pero SHA-256 no
suma ni multiplica: hace rotaciones, XOR y AND sobre bits individuales. Para
expresar un XOR en un sistema de ecuaciones sobre el campo hay que descomponer
cada número en sus 254 bits, y cada bit necesita su propia restricción que lo
obligue a ser 0 o 1 (`b * (b - 1) = 0`). SHA-256 está diseñada para ser barata en
un procesador, donde XOR es una instrucción; en un circuito, es lo más caro que
hay.

Poseidon se diseñó al revés: sus operaciones internas son sumas y elevar a la
quinta potencia sobre el campo, que es justo lo que las restricciones expresan
barato. Por eso se la llama *ZK-friendly*.

Los números, medidos en esta máquina con circom 2.2.3 y circomlib 2.0.5:

| Circuito | No lineales | Lineales | Total |
|---|---|---|---|
| `Poseidon(1)` sobre 1 elemento | 216 | 199 | 415 |
| `Poseidon(2)` sobre 2 elementos | 243 | 274 | 517 |
| `Sha256(256)` sobre 256 bits | 29412 | 1852 | 31264 |
| 2 × `Num2Bits(254)` + `Sha256(512)` | 59809 | 3229 | 63038 |

La comparación que corresponde es la de las filas 2 y 4, que hacen el mismo
trabajo: tomar dos elementos de campo y devolver un compromiso. **517 contra
63038: unas 122 veces más caro.** Y la cuarta fila ni siquiera incluye volver a
componer el hash de 256 bits en un elemento de campo para poder seguir usándolo
como nodo del árbol.

Llevado a la PoC: el árbol de Merkle de T03 hace un hash por nivel. Con Poseidon,
un árbol de 20 niveles cuesta del orden de diez mil restricciones. Con SHA-256,
más de un millón. Esa es la diferencia entre una prueba que se genera en el
celular de alguien haciendo la fila y una que no.

El costo que se paga: SHA-256 tiene veinte años de criptoanálisis encima y está en
el hardware de todo el mundo; Poseidon es de 2019 y su seguridad descansa en
análisis mucho más recientes. Para un sistema de producción eso es una decisión que
hay que tomar con los ojos abiertos —y no se toma acá, se toma en el ADR que
corresponda del repo de docs—. Para esta PoC viene heredada del documento de
Hito 1.

Para reproducir las dos filas de SHA-256, que no quedaron en el repo porque no son
parte del sistema, alcanza con compilar esto en una carpeta temporal:

```
pragma circom 2.0.0;
include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/bitify.circom";
template M() {
  signal input a; signal input b; signal output out[256];
  component na = Num2Bits(254); component nb = Num2Bits(254);
  na.in <== a; nb.in <== b;
  component s = Sha256(512);
  for (var i = 0; i < 254; i++) { s.in[i] <== na.out[i]; s.in[256+i] <== nb.out[i]; }
  s.in[254] <== 0; s.in[255] <== 0; s.in[510] <== 0; s.in[511] <== 0;
  for (var i = 0; i < 256; i++) { out[i] <== s.out[i]; }
}
component main = M();
```

con `circom archivo.circom --r1cs -l <ruta-al-repo>/node_modules`.

### Por qué esta tarea va antes que el circuito

Poseidon se va a calcular en dos lugares distintos y por dos implementaciones
distintas. El organizador arma el árbol de compromisos **en JavaScript**, fuera del
circuito, porque es una tarea de servidor y meterla en un circuito no tendría
sentido. El circuito, en cambio, recalcula el camino de Merkle **adentro**, porque
de eso se trata la prueba. Si las dos implementaciones difirieran en un solo bit,
el síntoma sería: la prueba no verifica. Sin más información. Sin un lugar donde
mirar. Y el lugar donde está el problema —dos librerías que nadie tocó— es el
último donde uno busca.

El control es barato y el error que evita es carísimo. Por eso es T02 y no un test
más adelante.

### Por qué los vectores son esos

Los valores chicos (0, 1, 2) sirven porque un error de implementación grosero
—constantes mal cargadas, estado inicial equivocado— salta ahí.

Los bordes son el punto interesante y merecen una nota aparte, abajo.

El `2^256 - 1` está porque es el máximo de un `uint256` de Solidity. Cuando T09 y
T11 empiecen a pasar valores entre el contrato y el circuito, ese es el caso que
puede morder.

### El caso de borde: la reducción módulo p es silenciosa en las dos

El resultado más informativo de esta tarea no es que los hashes coincidan, que era
lo esperable, sino **cómo** se comportan los dos lados con un valor que no entra en
el campo.

Las dos implementaciones reducen módulo `p` sin decir nada:

- `Poseidon(p)` da el mismo hash que `Poseidon(0)`, en el circuito y en JS.
- `Poseidon(p + 1)` da el mismo hash que `Poseidon(1)`, en el circuito y en JS.
- `Poseidon(2^256 - 1)` da el hash de `6350874878119819312338956282401532410528162663560392320966563075034087161850`,
  que es `(2^256 - 1) mod p`, en los dos.

Coinciden, que es lo que el control tenía que establecer. Pero la coincidencia
tapa un riesgo que conviene dejar escrito: **dos secretos distintos pueden producir
el mismo nulificador** si difieren en un múltiplo exacto de `p`. Con secretos
generados al azar dentro del campo la probabilidad es despreciable. Con secretos
que vengan de afuera —de un hash de 256 bits, de un `uint256` de un contrato, de
un identificador armado a mano— no lo es, porque ahí el valor no es al azar: es
elegido, y lo puede elegir un atacante.

La defensa es sencilla y le toca a quien genera el secreto, no al circuito:
generar siempre en `[0, p)` y rechazar cualquier valor de entrada que sea mayor o
igual a `p` en vez de dejar que se reduzca solo. Queda anotado en la bitácora como
candidato a ADR; no se decide acá.

Esto no es un defecto de Poseidon. Es lo que significa trabajar en un campo finito,
y aparece igual en cualquier hash ZK-friendly.

### Por qué se compara el módulo del campo antes que los hashes

Si en algún momento circom o circomlibjs pasaran a otra curva —BLS12-381, por
ejemplo— los hashes darían distinto y el control fallaría igual, pero el mensaje
sería "los hashes no coinciden", que manda a buscar en el lugar equivocado.
Comparar primero los módulos convierte ese caso en un mensaje que dice lo que pasa.

### Por qué se lee el witness y no se usa `snarkjs.groth16.fullProve`

Generar una prueba requiere un trusted setup, que es T04. Este control no necesita
probar nada: necesita saber qué número calcula el circuito. El witness es
exactamente eso y no depende de ninguna tarea posterior. Mantiene a T02 sin
dependencias hacia adelante, que es lo que le permite ser el primer control.

## 4. Qué podrías cambiar

**El hash: Poseidon → Poseidon2, Rescue-Prime o MiMC.** Poseidon2 es la revisión
de los mismos autores y es más barata en restricciones; Rescue-Prime tiene otro
balance entre costo de prueba y margen de seguridad; MiMC es más simple y más
vieja. El obstáculo real no es el circuito sino la **paridad entre lenguajes**:
Poseidon es la única de las cuatro que tiene, hoy, implementaciones maduras en
circom, JavaScript y Solidity a la vez, y esta PoC necesita las tres. Cambiarla
toca `circuitos/control_poseidon.circom`, la lista de vectores del script, el
organizador (T05), el prover (T06) y los contratos (T09, T11), y obliga a repetir
esta tarea entera antes de tocar nada más.

**La implementación de JS: `buildPoseidon` → `buildPoseidonReference` o
`buildPoseidonOpt`.** circomlibjs 0.1.7 exporta las tres. `buildPoseidon` usa wasm
y es la rápida; `buildPoseidonReference` es la implementación directa del paper,
mucho más lenta pero legible, y sirve como tercera opinión si alguna vez el control
falla y hay que decidir cuál de los dos lados está mal. Agregarla al script es
cambiar un import y una línea. Vale la pena solo el día que haya una discrepancia.

**La curva: BN254 → BLS12-381.** BLS12-381 tiene mejor margen de seguridad; BN254
es la única que Ethereum verifica barato en un precompilado, y como la validación
on-chain es parte del sistema, esa es la que manda. Cambiarla toca la constante `P`
del script, el flag `-p` de circom y todo lo que después vaya a un contrato. No es
una decisión de esta PoC.

**Verificar con `wtns.check` además de comparar.** `snarkjs.wtns.check` comprueba
que el witness satisface el `.r1cs`, que es otra cosa que comprobar que el
resultado coincide con JS: detectaría un `.wasm` corrupto o desincronizado del
`.r1cs`. Son dos líneas más en `hashDelCircuito` y un poco más de tiempo por
vector.

**Vectores fijos → vectores al azar.** Agregar unos cuantos valores aleatorios del
campo en cada corrida ampliaría la cobertura, a costa de que dos corridas no sean
idénticas. Para un control que corre en segundos, la alternativa razonable es
sumar los aleatorios *además* de los fijos, no en lugar de ellos.

## 5. Probalo vos

Desde la raíz del repo:

```bash
npm run control:poseidon
```

Tarda unos segundos, casi todos en compilar el circuito. La salida real, tal como
quedó el 2026-09-23:

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

Poseidon(2) sobre cada par

  [recortado: los siete pares, con su salida completa, están en
   bitacora/T03-circuito.md]

Separacion de dominio: Poseidon(1)([x]) contra Poseidon(2)([x, 0])

  x = 0
    Poseidon(1)       19014214495641488759237505126948346942972912379615652741039992445865937985820
    Poseidon(2)       14744269619966411208579211824598458697587494354926760081771325075741142829156
    distintos         si

  [recortado: dos vectores más]

Control pasado: 9 vectores de aridad 1 y 7 de aridad 2,
mismo hash en circuito y en JS. Las dos aridades son funciones distintas.
Ver docs/01-poseidon.md.
```

La parte de aridad 1 se muestra entera porque es la que explica el resto de esta
sección; la de aridad 2 se recortó por largo y está completa en la bitácora de T03.

Mirá el vector `p (el modulo exacto)`: la línea `x mod p  0` la imprime el script
leyendo la señal de entrada **de adentro del witness**, no calculándola aparte. Es
el circuito diciendo con qué número trabajó realmente.

**Rotura deliberada.** Abrí `circuitos/control_poseidon.circom:13` y cambiá

```
    poseidon.inputs[0] <== x;
```

por

```
    poseidon.inputs[0] <== x + 1;
```

Con eso el circuito sigue compilando y sigue calculando un Poseidon perfectamente
válido: simplemente no es el mismo que calcula JavaScript. Es la forma más
parecida a un bug real que se puede fabricar, porque nada falla hasta que algo
compara. Corré `npm run control:poseidon`:

```
  cero
    x                 0
    h (circuito)      18586133768512220936620570745912940619677854269274689475585506675881198879027
    h (circomlibjs)   19014214495641488759237505126948346942972912379615652741039992445865937985820
    iguales           NO
```

y al final:

```
CONTROL FALLIDO. El Poseidon de JS y el del circuito NO son el mismo.
No sigas con el resto de la PoC hasta resolverlo: el arbol que arme
el organizador no va a verificar nunca y el error no se ve de atras.

  - cero: circuito 18586133768512220936620570745912940619677854269274689475585506675881198879027 != circomlibjs 19014214495641488759237505126948346942972912379615652741039992445865937985820 (x = 0)
  ...
```

El comando sale con código 1. Restaurá la línea y volvé a correrlo.

Dos cosas que vale la pena mirar en la salida rota, porque enseñan más que el
mensaje de error:

1. El hash que el circuito da para `x = 0` es el que JavaScript da para `x = 1`.
   Está corrido un lugar, que es exactamente el bug que introdujiste. Cuando un
   control falla, comparar contra los *otros* vectores suele decir qué pasó.
2. El vector `p - 1` es el que cierra la lección del campo: el circuito calcula
   `Poseidon(p - 1 + 1) = Poseidon(p)`, y como `p ≡ 0`, devuelve
   `19014214495641488759237505126948346942972912379615652741039992445865937985820`,
   que es el hash de cero. Sumarle uno al número más grande del campo da cero. Eso
   no es un desborde ni un error: es cómo funciona la aritmética modular, y acá se
   ve pasar.

**Segunda rotura, más sutil.** En `scripts/control-poseidon.mjs:136`, cambiá
`BigInt(F.toString(poseidonJs([x])))` por `BigInt(poseidonJs([x])[0])`. El script
va a comparar el primer byte del buffer de Montgomery contra un número de 77
dígitos y va a fallar en todos los vectores con números que no se parecen a nada.
Es el error de API descrito en la sección 2, y verlo una vez ahorra reconocerlo
más adelante.

## 6. Qué NO hace

No prueba que la implementación de Poseidon sea **correcta**. Prueba que las dos
son **la misma**. Si circomlib y circomlibjs compartieran el mismo error —que no
sería raro, son del mismo autor y de las mismas constantes— este control pasaría
igual. Contrastar contra los vectores de prueba del paper original de Poseidon o
contra una tercera implementación independiente (la de Solidity que genera
`poseidonContract` de circomlibjs, por ejemplo) es otra tarea, y hoy no está
hecha. Queda como `[a verificar]`.

No cubre aridades mayores que 2. La 1 y la 2 son las que usa el sistema —la hoja
por un lado, el nodo interno y el nulificador por el otro—, pero si alguna decisión
posterior lleva el compromiso a tres entradas, hay que agregar el circuito y los
vectores correspondientes: cada aridad es una función distinta y la paridad entre
JS y circuito hay que establecerla para cada una por separado.

No verifica nada sobre el hash de Solidity. La tercera implementación —la que va a
correr en el contrato— entra en juego en T09 y T11, y va a necesitar su propio
paso de control contra estas dos.

No rechaza entradas fuera del campo: las reduce, como hacen las dos librerías.
Documentarlo era el objetivo; defenderse es decisión de diseño y no se toma acá.

No mide tiempos. El tiempo de generación de pruebas es MED-001 y se mide sobre el
circuito real, no sobre este.

Nada de esto cierra una decisión del TPF. Aporta a **ADR-008/009/010/011** solo
como evidencia instrumental: fija que la primitiva de hash se comporta igual en las
dos capas donde el sistema la va a usar. La elección de Poseidon viene del
documento de Hito 1 de Agustina Fontana y del frente que corresponda en
`../zk-ticketing-docs`; acá solo se la verifica.

Y una aclaración que este proyecto se debe en cada documento: **nada de esto es
ZK**. Un hash barato de calcular en circuito es una condición necesaria para que la
prueba sea practicable, pero un hash no oculta nada por sí mismo. Lo que va a
ocultar quién entra es la prueba de pertenencia de T03, no Poseidon.
