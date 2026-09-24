# Experimentos — aprender rompiendo

Nueve roturas deliberadas sobre el código de esta PoC. Cada una dice qué tocar,
qué pasa cuando lo tocás, qué te enseña el resultado y cómo volver atrás. Todas
se corrieron antes de escribirse y lo que está en los bloques de salida es lo que
imprimió la máquina, recortado pero no retocado.

El orden no es el de las tareas ni el de los documentos: es el de lo que enseña
cada uno. Los cuatro primeros son la misma lección vista desde cuatro lugares y
son la razón de que este archivo exista. Si vas a hacer uno solo, hacé el 2.

**Lo que tienen en común los cuatro primeros**: el sistema se ve bien y no lo
está. No hay excepción, no hay mensaje rojo, no hay test que falle. En un stack
de ZK eso no es mala suerte: es el modo de falla por defecto, porque casi todo lo
que hacés produce un objeto opaco —un `.r1cs`, una `zkey`, una prueba de 224
bytes— que nadie puede mirar y decir "esto está mal". Los controles que atrapan
esa clase de error no vienen con las herramientas: los escribe uno, y este
documento es el catálogo de los que hay acá y de los agujeros que quedan.

## Antes de empezar

Los experimentos 1, 2 y 3 necesitan el circuito compilado y el trusted setup
hecho; los demás, además, el juego de datos que viene commiteado.

```bash
npm install
npm run circuito:pertenencia
npm run setup
```

`npm run setup` tarda menos de un minuto y no hace falta repetirlo: **ningún
experimento de acá invalida `build/setup/`**, ni siquiera el 3, que es
justamente el que juega con una `zkey` vieja.

Los experimentos 2, 3 y 7 usan un script que no está en el repo. Están enteros en
el apéndice: se guardan en la raíz, se corren y se borran, igual que el
`correlacion.mjs` de `docs/11-cierre-de-la-escalera.md`.

## Los nueve, de un vistazo

| # | Qué rompe | Tarda | Al terminar |
|---|---|---|---|
| 1 | La restricción que ata la raíz (`circuitos/pertenencia.circom:57`) | ~10 s | hay que restaurar a mano |
| 2 | El `<==` del nulificador (`circuitos/pertenencia.circom:62`) | ~15 s | hay que restaurar a mano |
| 3 | La binariedad del índice, con la `zkey` vieja (`:38`) | ~20 s | hay que restaurar a mano |
| 4 | Nada: el atacante juega con las reglas | ~5 s | seguro |
| 5 | La validación de rango del organizador | ~5 s | hay que restaurar a mano |
| 6 | El `null` de la fuente (`fuentes/json.mjs:57`) | ~5 s | hay que restaurar a mano |
| 7 | La guarda del ptau (`scripts/setup-groth16.mjs:37`) | 2 s + 16 s | hay que restaurar a mano |
| 8 | Nada: el contrato hace lo que dice | ~15 s | hay que restaurar a mano |
| 9 | Nada: un comprador que no hace su parte | ~10 s | hay que restaurar a mano |

Los tiempos son de cómputo en la máquina de `docs/05-prover.md` (Intel
i5-14400F, 16 GB, Windows 11, Node v24.21.0, snarkjs 0.7.6) y no incluyen leer el
resultado, que es la parte que importa. "Seguro" quiere decir que no deja nada
que restaurar; el resto tiene su camino de vuelta escrito en cada sección y
probado.

**La trampa que más caro sale, y la pisé escribiendo esto**: en los experimentos
1, 2 y 3 no alcanza con restaurar el archivo del circuito. Mientras no vuelvas a
compilar, `build/` sigue teniendo el `.r1cs` y el `.wasm` del circuito roto, y
todo lo que corras después —el prover, la suite, el ataque— va a usarlos sin
decir una palabra. Por eso los tres terminan con dos comandos y no con uno.

---

# Parte I — Cuatro maneras de verse bien y no estarlo

## 1. El conteo de restricciones no se mueve

**Qué tocar.** En `circuitos/pertenencia.circom:57`, comentá la línea que ata la
raíz que sale de subir el árbol con la raíz que el verificador declara pública:

```circom
    // raiz === arbol.out;
```

**Qué esperar.** Compila sin una advertencia y el compilador informa esto:

```
template instances: 146
non-linear constraints: 1212
linear constraints: 1301
public inputs: 2
private inputs: 7
public outputs: 1
wires: 2519
labels: 3727
Everything went okay
```

```
snarkjs r1cs info
  restricciones     2513
  cables            2519
```

Y la batería de testigos inválidos:

```
  raiz que no es la del arbol
    rechazado         NO  <- el circuito acepto un testigo invalido

  secreto que no esta en el arbol
    rechazado         NO  <- el circuito acepto un testigo invalido

  un hermano del camino cambiado
    rechazado         NO  <- el circuito acepto un testigo invalido

  indices que apuntan a otra posicion
    rechazado         NO  <- el circuito acepto un testigo invalido

CIRCUITO NO VALIDADO.

  - algun testigo invalido fue aceptado
```

Código de salida 1.

**Qué te enseña.** Dos cosas, y la segunda es la que vale.

La primera es para qué sirve esa línea: sin ella, cualquiera con un secreto
inventado y una raíz inventada entra a cualquier evento, y el circuito sigue
calculando un nulificador impecable mientras tanto. El testigo válido pasa,
`wtns.check` dice que satisface el sistema, el nulificador coincide con el que
calcula JavaScript. Todo bien salvo lo único que el circuito tenía que probar.

La segunda es el número: **2513 restricciones antes y 2513 después**. Sacaste la
restricción de seguridad del circuito y el contador no se movió ni una unidad.
La razón es que `raiz === arbol.out` es una igualdad entre dos señales, y circom
la resuelve sustituyendo una por la otra en lugar de agregar una fila al sistema;
lo que cambia es el número de cables, de 2518 a 2519. Si alguna vez pensaste en
usar el conteo de restricciones como control de regresión —"si el número no
cambió, el circuito es el mismo"—, este experimento es la respuesta: no sirve
para eso.

Lo que sí lo atrapó fue la batería de testigos inválidos, que es código que
alguien escribió a propósito. El experimento 3 muestra el caso contrario: una
rotura que el conteo ve y la batería no.

**Cómo volver.**

```bash
git checkout -- circuitos/pertenencia.circom
npm run circuito:pertenencia
```

El segundo comando no es opcional: sin él, `build/` se queda con el circuito
roto.

---

## 2. La señal sub-restringida: nada lo ve

Es el experimento central de este documento.

**Qué tocar.** En `circuitos/pertenencia.circom:62`, cambiá `<==` por `<--`:

```circom
    nulificador <-- hasherNulificador.out;
```

Los dos operadores asignan el mismo valor. `<==` además **restringe**: deja
grabado en el sistema de ecuaciones que esa señal tiene que valer eso. `<--`
solo asigna: el valor queda libre.

**Qué esperar.** Primero el control, con el circuito intacto:

```bash
npm run circuito:pertenencia
node tocar-nulificador.mjs
```

```
nulificador que calculo el circuito  13958008681850683262116059744170178113099221759039031649483790525027830032801
nulificador puesto a mano            13958008681850683262116059744170178113099221759039031649483790525027830032802

witness original
  Vars (wires):   2518
  Constraints:    2513
WITNESS IS CORRECT
  satisface el r1cs   true
witness con el nulificador cambiado
  Vars (wires):   2518
  Constraints:    2513
··· aborting checking process at constraint 2341
WITNESS IS NOT CORRECT
  satisface el r1cs   false
```

Ahora hacé el cambio y repetí los dos comandos. `npm run circuito:pertenencia`
**pasa entero**, con código 0:

```
non-linear constraints: 1212
linear constraints: 1301
wires: 2519
Everything went okay
```

```
  restricciones     2513
  cables            2519
```

```
Circuito compilado y validado: 1 testigo valido, 5 invalidos rechazados.
```

Mismo nulificador, los cinco testigos inválidos rechazados, ninguna advertencia
del compilador. Y el script:

```
witness con el nulificador cambiado
  Vars (wires):   2519
  Constraints:    2513
WITNESS IS CORRECT
  satisface el r1cs   true
```

**Qué te enseña.** Un número que el circuito nunca calculó satisface el sistema
de restricciones. Traducido: quien genera la prueba puede poner en el nulificador
lo que se le antoje. Puede entrar todas las veces que quiera con la misma
entrada, porque cada vez presenta un nulificador nuevo y la lista de la puerta
nunca lo vio. El resto del circuito sigue siendo correcto —la pertenencia al
árbol se sigue probando— así que no es una entrada falsa: es una entrada
verdadera con el candado de un solo uso arrancado.

Y ahora lo que importa de verdad: **enumerá qué te avisó**. El compilador, nada.
El conteo de restricciones, nada: 2513 en los dos casos. La batería de testigos
inválidos, nada: los cinco siguen siendo rechazados. `wtns.check`, nada: dice
`WITNESS IS CORRECT` sobre un witness inventado. El código de salida, 0.

Queda un solo rastro, y es una trampa: `wires` pasa de 2518 a 2519. No sirve
como huella, porque **el experimento 1 produce exactamente el mismo número**. Las
dos roturas son distintas —una saca una restricción de seguridad, la otra suelta
una señal— y el reporte del compilador es idéntico carácter por carácter en las
ocho líneas. Un cable de más significa "algo cambió", nunca "esto cambió".

Lo único que encuentra este agujero es leer el circuito señal por señal
preguntándose qué ecuación ata cada una. En un circuito de sesenta líneas eso se
hace; en uno de dos mil, es el trabajo de una auditoría, y por eso las auditorías
de circuitos cuestan lo que cuestan. Es también el argumento más concreto a favor
de las alternativas de la pieza 1 de `INTERCAMBIABLES.md`: lenguajes que no dejan
escribir `<--` por accidente.

**De yapa, un fallo silencioso adentro del fallo silencioso.** El script le pasa
`console` como tercer argumento a `snarkjs.wtns.check`. Si no se lo pasás, la
llamada sobre un witness que **no** satisface muere con
`Cannot read properties of undefined (reading 'warn')`: snarkjs intenta avisarte
por un logger que no existe. Un `try/catch` alrededor convierte esa excepción en
"hubo un error al chequear", que es otra cosa distinta de "el witness está mal".

**Cómo volver.**

```bash
git checkout -- circuitos/pertenencia.circom
npm run circuito:pertenencia
rm tocar-nulificador.mjs
```

El script deja `build/tocar-original.wtns` y `build/tocar-tocado.wtns`, que son
inofensivos y se van con `build/`.

---

## 3. La `zkey` que quedó vieja: una herramienta lo ve y la otra no

**Qué tocar.** En `circuitos/pertenencia.circom:38`, comentá la restricción que
obliga a cada índice del camino a ser 0 o 1:

```circom
        // indices[i] * (indices[i] - 1) === 0;
```

Y **no** corras `npm run setup`. La idea es exactamente la situación de la vida
real: tocaste el circuito y te olvidaste de rehacer la fase 2.

**Qué esperar.** Primero el control, con el circuito intacto:

```bash
node zkey-vieja.mjs
```

```
circuito que hay ahora en build/
  restricciones     2513
  cables            2518

snarkjs zkey verify (r1cs de ahora, ptau, zkey vieja)
  resultado         true

groth16 prove (zkey vieja, witness del circuito de ahora)
  genero prueba     si
  nulificador       13958008681850683262116059744170178113099221759039031649483790525027830032801
  verifica          true
```

Ahora comentá la línea 38 y recompilá:

```bash
npm run circuito:pertenencia
```

```
  restricciones     2510
  cables            2518
```

```
Circuito compilado y validado: 1 testigo valido, 5 invalidos rechazados.
```

Leelo dos veces: sacaste una restricción de seguridad y **la batería de testigos
sigue dando 5 de 5**, con código 0. El testigo del índice que no es 0 ni 1 se
sigue rechazando, pero ya no en la línea 38 sino en la 57: un índice raro da una
raíz distinta y lo caza la igualdad de raíces. La restricción que sacaste era
redundante para ese testigo en particular. Acá el que avisa es el contador —2513
pasó a 2510— que en el experimento 1 no había dicho nada. Ninguno de los dos
controles alcanza solo.

Y ahora la parte de la `zkey`:

```bash
node zkey-vieja.mjs
```

```
circuito que hay ahora en build/
  restricciones     2510
  cables            2518

snarkjs zkey verify (r1cs de ahora, ptau, zkey vieja)
  resultado         false

groth16 prove (zkey vieja, witness del circuito de ahora)
  genero prueba     si
  nulificador       13958008681850683262116059744170178113099221759039031649483790525027830032801
  verifica          true
```

Si al script le pasás `console` como cuarto argumento de `verifyFromR1cs`,
snarkjs escribe el hash del circuito que tiene grabado la `zkey` y cierra con
`INVALID:  Circuit does not match`.

**Qué te enseña.** Las dos mitades no se pueden mezclar.

La mitad buena: existe una herramienta que detecta el desfasaje, se llama
`zkey verify`, y usarla es gratis. `scripts/setup-groth16.mjs` la corre en cada
`npm run setup`.

La mitad que duele: **el prover no la necesita y no se entera**. Generó una
prueba, la prueba verifica, no hubo un solo error. Lo que probó es el circuito
viejo —la `zkey` tiene grabado el sistema de ecuaciones de las 2513
restricciones, y el witness del circuito de 2510 también lo satisface—. Dicho
como duele de verdad: si mañana agregás al circuito una restricción para tapar un
agujero de seguridad y no rehacés la fase 2, el sistema sigue andando, las
pruebas siguen verificando, los tests siguen pasando y **la restricción nueva no
se aplica en ninguna parte**. Nada, en ninguna capa, te lo dice.

La otra cara, para completar el panorama, está medida en `docs/03-setup.md` §5:
si el cambio en el circuito agrega o saca una **señal** en vez de una ecuación,
el prover muere en el acto con `Invalid witness length`. El caso ruidoso es el de
la forma del witness; el silencioso es el de las ecuaciones. El silencioso es
también el más común, porque agregar una restricción sobre señales que ya
existen es exactamente lo que uno hace cuando arregla un agujero.

La conclusión operativa es una línea: `zkey verify` contra el `.r1cs` actual va
en el despliegue, no en la buena memoria de nadie.

**Cómo volver.**

```bash
git checkout -- circuitos/pertenencia.circom
npm run circuito:pertenencia
rm zkey-vieja.mjs
```

`build/setup/` no se tocó en ningún momento: la `zkey` de siempre vuelve a
corresponderse con el circuito apenas recompilás.

---

## 4. El validador que le cree a la prueba

Acá no se rompe nada. Todo el software funciona perfecto y el sistema igual deja
entrar a cualquiera.

**Qué correr.**

```bash
npm run puerta:provisionar -- --puerta 1
npm run ataque:raiz-propia
```

(Si la cadena local no está levantada, `FUENTE=json` adelante del primer comando
lo resuelve sin levantarla. En PowerShell, `$env:FUENTE="json"` y después
`Remove-Item Env:FUENTE`.)

**Qué esperar.**

```
Paso 1 - el atacante arma su arbol

  8 secretos inventados por el, profundidad 3
  raiz propia       20015225524063974638380943110570875067346502649548216576988022975831689873684
  es la del evento  NO

Paso 2 - genera la prueba, con el mismo wasm y la misma zkey

  tardo             399.4 ms
  nulificador       12115142414612258272405646303150015227266162071362698335317241677166818136380
  verifica contra la verification key DEL EVENTO   SI

Paso 3 - la misma prueba, contra dos validadores

  Validador INGENUO (verifica la prueba y lleva la lista, nada mas)
    1  la raiz es la que descargo esta puerta          NO LO HACE
    2  el scope es el del evento de esta puerta        NO LO HACE
    3  la prueba verifica contra su verification key   OK
    4  el nulificador no esta en su lista local        OK
    => PASE. El atacante entra.

  Validador de la puerta 1 (los cuatro chequeos, en orden)
    1  la raiz es la que descargo esta puerta          FALLA
    => RECHAZADA en el chequeo 1 (raiz).
```

El ataque deja el sobre en `salidas/ataque/`, así que se puede presentar en la
puerta de verdad y ver el rechazo con sus propios ojos:

```bash
npm run validar -- --puerta 1 --prueba salidas/ataque/sobre-atacante.bin
```

```
Chequeos

  1  la raiz es la que descargo esta puerta          FALLA otra raiz

  los 3 chequeos siguientes no se corrieron: la puerta ya rechazo.

RECHAZADA por el chequeo 1 (raiz).

  la prueba trae    20015225524063974638380943110570875067346502649548216576988022975831689873684
  esta puerta tiene 21742806920683719786915181996178546158207976983808212562412387320164881855720
```

**Qué te enseña.** La prueba del atacante no está rota ni falsificada: es una
prueba correcta de un enunciado verdadero. El enunciado es "conozco un secreto
del árbol cuya raíz es X", y es cierto, porque el árbol de raíz X lo armó él con
ocho secretos suyos. Groth16 hizo su trabajo y lo hizo bien.

La lección es qué **no** dice una verificación exitosa. Dice "existe un witness
que satisface el circuito con estas señales públicas". No dice nada sobre si esas
señales públicas son las correctas, y no puede decirlo: la raíz llega en el mismo
paquete que la prueba, y una prueba no puede certificar su propio contexto. Quién
decide cuál es la raíz buena es el verificador, con un dato que consiguió por su
cuenta y antes. Por eso la puerta descarga la raíz en el provisionamiento y por
eso el chequeo 1 va **primero**.

Y el daño, si falta: el atacante no entra una vez. Con ocho secretos propios
genera ocho entradas, u ochocientas si arma un árbol más grande, y la lista de
nulificadores no lo frena nunca porque cada secreto suyo da un nulificador nuevo.

Los cuatro experimentos de esta parte terminan en el mismo lugar desde cuatro
puntos distintos: en este stack, que algo se vea correcto no significa nada. Lo
único que vale es lo que se ejecuta, y lo único que atrapa esta familia de
errores son controles que alguien decidió escribir.

**Cómo volver.** No hace falta: nada quedó modificado. El sobre del atacante vive
en `salidas/`, que no se commitea, y la puerta rechazó en el chequeo 1, así que
tampoco anotó el nulificador en su lista.

---

# Parte II — Las guardas que ya están, y qué pasaría sin ellas

Los tres de esta parte tienen la misma forma: hay un control escrito a propósito
que corta la corrida, y abajo del control hay un agujero silencioso. Correr la
guarda toma un segundo; lo que enseña es lo de abajo.

## 5. El secreto que se pasa del campo

**Qué correr.**

```bash
FUENTE=json npm run organizador -- --romper rango
```

El flag le suma `p` —el primo del campo BN254— al secreto de la posición 3.

**Qué esperar.**

```
VALOR INVALIDO:
secreto de la posicion 3: el valor esta fuera del campo.
  valor    35643682154966047156268696500342295500339131112703318788563628848613638807758
  p        21888242871839275222246405745257275088548364400416034343698204186575808495617
  valor%p  13755439283126771934022290755085020411790766712287284444865424662037830312141
  Poseidon lo reduciria en silencio: este valor y 13755439283126771934022290755085020411790766712287284444865424662037830312141 producirian
  el mismo compromiso y el mismo nulificador.
```

Código de salida 1, y no escribe ningún artefacto.

**Ahora sacá la guarda**, que es lo que vale la pena ver. En
`scripts/organizador.mjs:73` comentá la línea:

```js
    // exigirEnCampo(valor, `secreto de la posicion ${posicion}`);
```

y corré lo mismo. Termina con código 0 y el padrón es este:

```
Identidades

  pos  compromiso = Poseidon(secreto)
    0  15918769836395550309736939745083792671257046049922626050264434764490712315832
    1  19098309875104881602814935123510219206248158037904700664102177808860445083035
    2  2544992810996557086126118583310846491421512950928938870161895915223694855178
    3  21630521322428614492072238094553662178591068764296528687525646144397449139327
    ...
Arbol

  raiz              21742806920683719786915181996178546158207976983808212562412387320164881855720
  caminos validos   si (8/8)
```

**Qué te enseña.** Compará esa salida con la de `FUENTE=json npm run organizador`
sin el flag: los ocho compromisos son los mismos y la raíz es la misma, hasta el
último dígito. El árbol quedó igual con un secreto distinto adentro, porque
Poseidon trabaja módulo `p` y `s` y `s + p` son el mismo elemento del campo.

La consecuencia no es un número feo en un archivo: son **dos personas con
secretos distintos que comparten compromiso y comparten nulificador**. La primera
que llega entra; la segunda rebota en el chequeo 4 con "esta entrada ya se usó",
y no hizo nada mal. Desde la puerta es indistinguible de alguien que fotocopió un
QR ajeno.

Y todo esto pasa sin un solo error, en una capa donde no hay nada raro que mirar.
El número grande es un `bigint` perfectamente válido en JavaScript; el único
lugar del sistema que puede notar algo es el que compara contra `p`, y hay que
escribirlo. Está en `lib/campo.mjs` y también, en Solidity, en
`RegistroDeRaiz.sol:20`: el mismo primo, en los dos únicos lugares donde aparece.

**Cómo volver.**

```bash
git checkout -- scripts/organizador.mjs datos/
```

## 6. La fuente que devuelve 0 en vez de `null`

**Qué tocar.** En `fuentes/json.mjs:57`, que es la línea que contesta cuando se
pregunta por un evento que nadie publicó, cambiá `return null;` por
`return 0n;`. Después:

```bash
FUENTE=json npm run organizador
```

**Qué esperar.**

```
  leerRaiz(scope) == raiz publicada   si
  leerRaiz(otro scope) == null        NO (devolvio 0)

ORGANIZADOR NO VALIDADO.

  - la fuente devolvio una raiz para un scope que no se publico
```

Código de salida 1.

**Qué te enseña.** Ese control lo dejó puesto T05, cuando la fuente era un
archivo JSON y el caso no podía pasar, pensando en T09, cuando la fuente pasó a
ser un `mapping` de Solidity. Un `mapping` sin entrada no falla: devuelve el cero
del tipo. `RegistroDeRaiz` devuelve `(0, false)` y es `fuentes/contrato-raiz.mjs`
el que tiene que traducir ese `false` a `null`; si devolviera el cero a secas, la
fuente estaría afirmando que el evento existe y que su raíz es 0.

Qué pasaría entonces: el prover armaría pruebas contra un árbol de raíz cero, que
no es el árbol de nadie, todas las verificaciones locales darían bien, y el error
aparecería en la puerta como un rechazo sin explicación, a un comprador honesto,
el día del evento. Distancia entre la causa y el síntoma: dos subsistemas y
varias horas.

Es la versión de tipos del mismo problema que los cuatro primeros: "ausente" y
"vale cero" son cosas distintas, y el lenguaje no las distingue por vos. La
interfaz de `fuentes/` obliga a `null` justamente porque `0` es un valor legítimo
de una raíz —`npm run contrato:medir` tiene un control que publica una raíz que
vale 0 y comprueba que se lee como `0` y no como `null`—.

**Cómo volver.**

```bash
git checkout -- fuentes/json.mjs datos/
```

## 7. El ptau que no alcanza

**Qué tocar.** En `scripts/setup-groth16.mjs:37`, bajá la potencia del Powers of
Tau de 12 a 11: `2^11 = 2048` casilleros para un circuito de 2513 restricciones.

```js
const POTENCIA = 11;
```

```bash
npm run setup
```

**Qué esperar.** La guarda corta antes de hacer nada, en dos segundos:

```
Tamano del circuito
  restricciones     2513
  entradas publicas 2
  salidas           1
  potencia minima   2**12 = 4096
  potencia usada    2**11 = 2048

El ptau de 2**11 no alcanza para este circuito.
Subi POTENCIA a 12 en scripts/setup-groth16.mjs.
```

Código de salida 1, y `build/setup/` no se tocó.

**Qué pasa sin la guarda.** Restaurá la línea y corré el script del apéndice C,
que arma un ptau de 2^11 y llama a `snarkjs.zKey.newZKey` directamente:

```bash
node ptau-chico.mjs
```

```
zKey.newZKey(r1cs de 2513 restricciones, ptau de 2**11) CON logger
circuit too big for this power of tau ceremony. 2513*2 > 2**11
  devuelve          -1
  lanzo excepcion   no
  dejo archivo      true, 0 bytes

lo mismo SIN logger
  devuelve          -1
  imprimio algo     no
  dejo archivo      true, 0 bytes
```

**Qué te enseña.** snarkjs sabe perfectamente qué está mal —el mensaje lo dice
con las dos cantidades— y aun así: no lanza ninguna excepción, devuelve `-1`
como valor de retorno, y deja un `.zkey` de cero bytes en el disco. El mensaje
solo aparece si le pasaste un logger, y en el uso normal de la biblioteca no se
le pasa.

Un script que llama a `newZKey` y sigue adelante —que es lo natural en JavaScript
con una función `async` que no tira— se lleva un archivo que existe, que se llama
como corresponde y que está vacío. El error va a aparecer varios pasos después,
en el momento de generar una prueba, con un mensaje que no habla del ptau. Ese es
el argumento entero a favor de escribirse la guarda uno mismo: no porque snarkjs
esté mal, sino porque su contrato de error es "devuelvo un número", y nadie mira
el número.

**Cómo volver.**

```bash
git checkout -- scripts/setup-groth16.mjs
rm -rf build/ptau-chico ptau-chico.mjs
```

El directorio ocupa 3,8 MB y vive adentro de `build/`, que no se commitea.

---

# Parte III — Lo que el contrato decide sin que se note

Los dos últimos no rompen nada: ejecutan el sistema tal como está y muestran que
una decisión de diseño que se ve razonable en el contrato deja gente afuera del
evento. Los dos necesitan la cadena local, la levantan solos y la dejan
levantada.

## 8. La entrada revendida se lleva el compromiso del vendedor

**Qué correr.**

```bash
npm run flujo
```

**Qué esperar.** Al final, después de las ocho emisiones y los ocho compromisos:

```
La reventa: el NFT cambia de duenio y el compromiso no

  token 1 vendido       de 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
                      a  0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
  el NFT es del comprador nuevo                         OK     ownerOf(1)
  el comprador nuevo no puede poner su compromiso       OK     revirtio con CompromisoYaEnviado(1)
  la hoja sigue siendo la del vendedor                  OK     hoja 5, token 1
  prueba del vendedor                     npm run probar -- --identidad 5
  otra puerta, sin historia               npm run puerta:provisionar -- --puerta flujo-reventa
  el que VENDIO la entrada entra igual                  OK     codigo 0: PASE
```

**Qué te enseña.** El que tiene el NFT no entra. El que lo vendió, sí.

No es un bug de esta corrida ni un descuido de `EntradaNFT.sol`: es la
consecuencia aritmética de dos decisiones que por separado parecen obvias. Una,
que el compromiso se envía una sola vez por token —si se pudiera reemplazar,
cualquiera que recupere el token podría invalidar la entrada del que la está
usando—. Otra, que la raíz ya está publicada: el árbol se congeló con la hoja del
vendedor adentro, y agregarle una hoja nueva significa otra raíz, que hay que
volver a publicar y a distribuir a todas las puertas.

El punto para el TPF es cuál es la pieza responsable, y no es el ZK. El contrato
transfiere el token sin problema porque para eso es un ERC-721; el circuito prueba
pertenencia al árbol sin problema porque la hoja del vendedor sigue estando ahí.
Lo que falta es un mecanismo de rotación del compromiso, que es una decisión de
diseño de la capa de identidad y toca el ADR-005. Es la clase de cosa que un
jurado pregunta como "¿y si revendo la entrada?", y la respuesta honesta de esta
PoC es "el sistema como está no lo resuelve, y acá está el comando que lo
muestra".

**Cómo volver.**

```bash
npm run cadena:abajo
git checkout -- datos/
```

`npm run flujo` reescribe `datos/arbol.json` y `datos/secretos.json` con lo que
salió de la cadena, así que el `git checkout` es obligatorio si querés volver al
padrón de la parte base.

## 9. El dueño que no envía su compromiso

**Qué correr.**

```bash
npm run flujo -- --sin-enviar 5
```

**Qué esperar.**

```
Un duenio que nunca envia su compromiso (token 5)

  entradas emitidas   8
  compromisos en la cadena   7
  el token 5 tiene duenio, tiene entrada y no tiene hoja.
  el organizador no arma el arbol                       OK     salio con codigo 1
  y dice por que                                        OK     armarArbol: se esperaba una potencia de dos de hojas y llegaron 7. Un arbol incompleto necesita una hoja de relleno definida, y eso es una decision, no un default.
```

Código de salida 0: lo que se esperaba que pasara pasó, así que el comando
termina bien.

**Qué te enseña.** Una persona que compró su entrada, pagó, es dueña del NFT y
no hizo un paso opcional deja a las otras siete sin evento. Ese es el tamaño real
del acoplamiento: el árbol necesita las ocho hojas, y las ocho hojas dependen de
ocho personas distintas haciendo una transacción cada una.

Lo que el experimento no resuelve, a propósito, es qué hacer. Rellenar con una
hoja fija (¿cuál? ¿quién conoce su secreto?), armar un árbol de profundidad
variable, cerrar el padrón con los que enviaron, poner una fecha límite: son
todas respuestas posibles con consecuencias distintas sobre el tamaño del
conjunto de anonimato, que es lo único que hace que el ZK sirva de algo. Ocho
personas ya es un conjunto ridículamente chico; siete es peor. `armarArbol` se
niega a elegir por nadie, y el mensaje de error lo dice con todas las letras:
"un árbol incompleto necesita una hoja de relleno definida, y eso es una
decisión, no un default".

Es también el mejor ejemplo del corte "es NFT" contra "es ZK". El contrato hace
todo bien: emitió las ocho entradas y las ocho tienen dueño verificable. Lo que
se cae es la capa de privacidad, que necesita que todos participen para poder
esconder a cualquiera. Un sistema de entradas NFT sin ZK no tendría este
problema, y esa es exactamente la clase de costo que hay que poder nombrar en la
defensa.

**Cómo volver.**

```bash
npm run cadena:abajo
git checkout -- datos/
```

---

# El camino de vuelta, completo

Si perdiste la cuenta de qué tocaste, esto deja el repositorio como estaba, sin
importar por dónde andabas:

```bash
npm run cadena:abajo
git checkout -- circuitos/ scripts/ fuentes/ lib/ contratos/ datos/
rm -f tocar-nulificador.mjs zkey-vieja.mjs ptau-chico.mjs
rm -rf build/ptau-chico
npm run circuito:pertenencia
npm test
```

`npm test` es el control de que volviste al punto de partida. Tarda unos doce
segundos y tiene que terminar así:

```
  OK     1  una entrada legitima entra por la puerta A1
  OK     2  la misma prueba, otra vez, en la misma puerta
  OK     3  la misma prueba entra por la puerta A2
  OK     4  la misma identidad con otro scope da otro nulificador
  OK     5  una prueba del evento B en una puerta del evento A
  OK     6  un sobre con un byte alterado
  OK     7  un secreto que no esta en el arbol no llega a generar prueba

  7 de 7 casos dan lo esperado.
```

Tres aclaraciones sobre el estado del repositorio, para que no busques problemas
donde no hay:

- **`git status` va a mostrar `datos/arbol.json` modificado** después de cualquier
  cosa que regenere el padrón, incluido `npm test`. La única diferencia es el
  campo `generado`, que lleva la fecha de la corrida. `git checkout -- datos/` lo
  deja como estaba.
- **`build/`, `salidas/`, `puertas/` y `cadena/` no se commitean.** Lo que quede
  ahí no ensucia el repositorio, pero sí afecta a la corrida siguiente: `build/`
  guarda el circuito compilado y `puertas/` guarda las listas de nulificadores.
  Si una puerta rechaza una entrada legítima con "ya pasó", la lista local tiene
  historia vieja: `npm run validar -- --puerta 1 --olvidar`.
- **Los tres scripts del apéndice no van al repositorio.** No están en `scripts/`
  ni expuestos como `npm run` a propósito: son andamios de un rato, no parte de
  la PoC.

---

# Apéndice — Los tres scripts

Se guardan en la raíz del repositorio, se corren con `node <nombre>` y se borran
después.

## A. `tocar-nulificador.mjs` (experimento 2)

Genera el witness válido de `npm run circuito:pertenencia` —las mismas ocho
identidades de juguete—, le cambia a mano el valor del nulificador y pregunta si
el witness resultante sigue satisfaciendo el sistema de restricciones.

```js
import { readFileSync, writeFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { construirHashes, armarArbol, caminoDe } from "./lib/merkle.mjs";

const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const R1CS = "build/pertenencia.r1cs";
const WASM = "build/pertenencia_js/pertenencia.wasm";
const ORIGEN = "build/tocar-original.wtns";
const TOCADO = "build/tocar-tocado.wtns";

const secretos = [11n, 22n, 33n, 44n, 55n, 66n, 77n, 88n];
const POSICION = 5;
const SCOPE = 1234n;

const { hash1, hash2 } = await construirHashes();
const { niveles, raiz } = armarArbol(secretos.map(hash1), hash2);
const { camino, indices } = caminoDe(niveles, POSICION);
await snarkjs.wtns.calculate(
  {
    secreto: String(secretos[POSICION]),
    camino: camino.map(String),
    indices: indices.map(String),
    raiz: String(raiz),
    scope: String(SCOPE),
  },
  WASM,
  ORIGEN
);

// El .wtns es un binfile: magic(4) version(4) nSections(4) y despues
// [id(4) largo(8) datos]. La seccion 1 trae n8 (bytes por señal); la 2, las
// señales crudas en little-endian. El indice de cada señal sale del .sym:
// main.nulificador es el 1.
const buf = readFileSync(ORIGEN);
let off = 12;
let n8 = 0;
let datos = 0;
for (let s = 0; s < buf.readUInt32LE(8); s++) {
  const id = buf.readUInt32LE(off);
  const largo = Number(buf.readBigUInt64LE(off + 4));
  if (id === 1) n8 = buf.readUInt32LE(off + 12);
  if (id === 2) datos = off + 12;
  off = off + 12 + largo;
}

const leer = (i) =>
  BigInt("0x" + Buffer.from(buf.subarray(datos + i * n8, datos + (i + 1) * n8)).reverse().toString("hex"));
const escribir = (i, v) =>
  Buffer.from(v.toString(16).padStart(n8 * 2, "0"), "hex").reverse().copy(buf, datos + i * n8);

const antes = leer(1);
const despues = (antes + 1n) % P;
escribir(1, despues);
writeFileSync(TOCADO, buf);

// wtns.check con un witness que NO satisface llama a logger.warn: sin logger
// revienta con "Cannot read properties of undefined". Por eso va console.
const revisar = async (archivo) => {
  try {
    return String(await snarkjs.wtns.check(R1CS, archivo, console));
  } catch (e) {
    return `excepcion: ${(e.message || String(e)).split("\n")[0]}`;
  }
};

console.log(`nulificador que calculo el circuito  ${antes}`);
console.log(`nulificador puesto a mano            ${despues}`);
console.log(`\nwitness original`);
console.log(`  satisface el r1cs   ${await revisar(ORIGEN)}`);
console.log(`witness con el nulificador cambiado`);
console.log(`  satisface el r1cs   ${await revisar(TOCADO)}`);
process.exit(0);
```

## B. `zkey-vieja.mjs` (experimento 3)

Pregunta dos cosas sobre la `zkey` que quedó en `build/setup/` y el circuito que
hay ahora en `build/`: si `zkey verify` nota que no se corresponden, y si el
prover nota algo.

```js
import * as snarkjs from "snarkjs";
import { readFileSync } from "node:fs";
import { construirHashes, armarArbol, caminoDe } from "./lib/merkle.mjs";

const R1CS = "build/pertenencia.r1cs";
const WASM = "build/pertenencia_js/pertenencia.wasm";
const PTAU = "build/setup/pot_final.ptau";
const ZKEY = "build/setup/pertenencia.zkey";
const VKEY = "build/setup/verification_key.json";

const info = await snarkjs.r1cs.info(R1CS);
console.log(`circuito que hay ahora en build/`);
console.log(`  restricciones     ${info.nConstraints}`);
console.log(`  cables            ${info.nVars}`);

// Con `console` como cuarto argumento, snarkjs imprime el hash del circuito y
// la linea "INVALID:  Circuit does not match". Sin el, solo el false.
console.log(`\nsnarkjs zkey verify (r1cs de ahora, ptau, zkey vieja)`);
let coincide;
try {
  coincide = await snarkjs.zKey.verifyFromR1cs(R1CS, PTAU, ZKEY);
} catch (e) {
  coincide = `excepcion: ${(e.message || String(e)).split("\n")[0]}`;
}
console.log(`  resultado         ${coincide}`);

const { hash1, hash2 } = await construirHashes();
const secretos = [11n, 22n, 33n, 44n, 55n, 66n, 77n, 88n];
const { niveles, raiz } = armarArbol(secretos.map(hash1), hash2);
const { camino, indices } = caminoDe(niveles, 5);
const entrada = {
  secreto: "66",
  camino: camino.map(String),
  indices: indices.map(String),
  raiz: String(raiz),
  scope: "1234",
};

console.log(`\ngroth16 prove (zkey vieja, witness del circuito de ahora)`);
try {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(entrada, WASM, ZKEY);
  const vkey = JSON.parse(readFileSync(VKEY, "utf8"));
  console.log(`  genero prueba     si`);
  console.log(`  nulificador       ${publicSignals[0]}`);
  console.log(`  verifica          ${await snarkjs.groth16.verify(vkey, publicSignals, proof)}`);
} catch (e) {
  console.log(`  EXCEPCION: ${(e.message || String(e)).split("\n")[0]}`);
}
process.exit(0);
```

## C. `ptau-chico.mjs` (experimento 7)

Arma un ptau de 2^11 —que no alcanza para las 2513 restricciones— y llama a
`zKey.newZKey` directamente, sin la guarda que tiene
`scripts/setup-groth16.mjs`. Primero con logger y después sin él. Tarda 16
segundos la primera vez, casi todos en armar el ptau.

```js
import { mkdirSync, existsSync, statSync } from "node:fs";
import * as snarkjs from "snarkjs";

const D = "build/ptau-chico";
mkdirSync(D, { recursive: true });
const ptau = `${D}/pot11_final.ptau`;
const zkey = `${D}/salida.zkey`;

if (!existsSync(ptau)) {
  console.log("armando un ptau de 2**11 (tarda)...");
  await snarkjs.powersOfTau.newAccumulator(await snarkjs.curves.getCurveFromName("bn128"), 11, `${D}/pot11_0000.ptau`);
  await snarkjs.powersOfTau.beacon(`${D}/pot11_0000.ptau`, `${D}/pot11_beacon.ptau`, "beacon", "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20", 10);
  await snarkjs.powersOfTau.preparePhase2(`${D}/pot11_beacon.ptau`, ptau);
}

console.log("\nzKey.newZKey(r1cs de 2513 restricciones, ptau de 2**11) CON logger");
const conLogger = await snarkjs.zKey.newZKey("build/pertenencia.r1cs", ptau, zkey, console);
console.log(`  devuelve          ${conLogger}`);
console.log(`  lanzo excepcion   no`);
console.log(`  dejo archivo      ${existsSync(zkey)}, ${existsSync(zkey) ? statSync(zkey).size : 0} bytes`);

console.log("\nlo mismo SIN logger");
const otro = `${D}/salida2.zkey`;
const sinLogger = await snarkjs.zKey.newZKey("build/pertenencia.r1cs", ptau, otro);
console.log(`  devuelve          ${sinLogger}`);
console.log(`  imprimio algo     no`);
console.log(`  dejo archivo      ${existsSync(otro)}, ${existsSync(otro) ? statSync(otro).size : 0} bytes`);
process.exit(0);
```

---

*Todas las salidas de este documento se obtuvieron corriendo los experimentos el
2026-09-24 sobre la rama `feat/fase-2-contratos`, en la máquina de
`docs/05-prover.md`. Asistido por Claude Code (Opus 5); la verificación de cada
resultado es la corrida, no la memoria del modelo.*
