# Circuito de pertenencia

## 1. Qué hace

`circuitos/pertenencia.circom` es la pieza central de la PoC: demuestra que quien
genera la prueba conoce un secreto cuya hoja está en el árbol de compromisos de un
evento, sin revelar cuál de las hojas es, y publica un **nulificador**
—`Poseidon(secreto, scope)`— que es siempre el mismo para ese secreto en ese
evento y distinto en cualquier otro.

De afuera se ven tres números: la raíz del árbol, el scope del evento y el
nulificador. El secreto y la posición de la hoja no se ven. Eso es lo único que
aporta el ZK acá; todo lo demás del sistema —que la entrada sea auténtica, que no
se pueda falsificar, el tope de reventa— lo da el contrato, no esto.

## 2. Cómo lo hace

### Antes del código: qué es una restricción

Un circuito de circom **no es un programa**. Parece uno —tiene `for`, variables y
llamadas— pero lo que produce al compilar no es algo que se ejecute: es un sistema
de ecuaciones llamado R1CS. Cada ecuación es de la forma `(combinación lineal de
señales) × (combinación lineal de señales) = (combinación lineal de señales)`, y
se llama **restricción**.

La diferencia práctica es esta. Un programa, con una entrada, produce una salida.
Un circuito, con un conjunto de valores para *todas* sus señales —eso se llama el
**witness** o testigo—, solo dice "sí, estos números satisfacen las 2513
ecuaciones" o "no". La prueba de conocimiento cero que se genera después (T04 y
T06) demuestra exactamente eso: *conozco un witness que satisface este sistema*,
sin mostrar el witness.

De ahí sale la regla que gobierna todo lo que sigue: **lo que no está escrito como
restricción, no está probado**. El compilador genera además un `.wasm` que calcula
el witness a partir de las entradas, y ese wasm sí se ejecuta paso a paso; pero el
wasm es una comodidad para el que prueba honestamente. Un atacante no lo usa:
arma el witness a mano como quiera. Lo único que lo limita son las ecuaciones.

### Señal privada, pública y salida

`circuitos/pertenencia.circom:13` a `:22` declara las señales de entrada y la de
salida. La diferencia entre privada y pública **no la declara ahí**: la declara la
última línea del archivo.

`circuitos/pertenencia.circom:67`:

```
component main {public [raiz, scope]} = Pertenencia(3);
```

En circom, toda señal de entrada es privada salvo que esté en esa lista. Las
salidas son siempre públicas. Entonces:

- **Privadas** (`secreto`, `camino[3]`, `indices[3]`): forman parte del witness,
  entran en las ecuaciones, pero no salen en la prueba ni el verificador las ve.
  Son "lo que sé y no muestro".
- **Públicas** (`raiz`, `scope`): las ve el verificador y tiene que estar de
  acuerdo con ellas. Son el contexto contra el que se prueba algo.
- **Salida** (`nulificador`): la calcula el circuito y queda pública. A efectos de
  la verificación, una salida es una entrada pública más: el verificador la recibe
  junto con la prueba.

Un error de diseño clásico es poner como pública una señal que no hacía falta que
lo fuera. Acá, si `indices` fuera público, la prueba diría *qué posición del árbol*
está entrando, y con eso el anonimato se cae aunque el secreto siga oculto.

### El recorrido, en orden

**La hoja.** `circuitos/pertenencia.circom:27` a `:29` calcula
`hoja = Poseidon(secreto)` con la implementación de circomlib, la misma que T02
verificó contra circomlibjs. Es `Poseidon` de **una** entrada; la razón está en la
sección 3.

**Los índices.** `circuitos/pertenencia.circom:35` a `:42` es la parte menos obvia
y va línea por línea.

- `var acumulador = 0;` y `var peso = 1;` son `var`, no `signal`. Un `var` es una
  variable del compilador: existe mientras circom construye el circuito y
  desaparece después. No es parte del sistema de ecuaciones. Sirve para acumular
  una expresión que al final se convierte en una sola restricción.
- `indices[i] * (indices[i] - 1) === 0;` es una restricción escrita a mano, con
  `===`, que no asigna nada: solo exige. La ecuación `x(x-1) = 0` tiene exactamente
  dos soluciones, 0 y 1. Es la forma canónica de decir "esta señal es un bit".
- `acumulador += indices[i] * peso;` arma, en el compilador, la expresión
  `indices[0]·1 + indices[1]·2 + indices[2]·4`.
- `signal indice <== acumulador;` recién acá aparece una señal, y el operador
  `<==` deja la restricción que la liga a esa suma.

Por qué hay que componer un número a partir de bits: el template del camino de
Merkle que se usa acá toma la posición de la hoja como **un solo número decimal**,
no como un array de bits, mientras que la interfaz que fija `PLAN.md` para este
circuito son `indices[3]`. Estas ocho líneas son el adaptador entre las dos cosas.

**El camino de Merkle.** `circuitos/pertenencia.circom:47` a `:53` instancia
`BinaryMerkleRoot(3)` de `@zk-kit/binary-merkle-root.circom` y le pasa la hoja, la
profundidad, el índice compuesto y los tres hermanos. El template sube el árbol:
en cada nivel elige el orden de los dos hijos según el bit correspondiente,
calcula `Poseidon(izquierdo, derecho)` y sigue. Devuelve la raíz en `arbol.out`.

El template acepta una profundidad **dinámica** —está pensado para árboles que
crecen— y acá se la fija en `PROFUNDIDAD`, que es el mismo valor que su parámetro
`MAX_DEPTH`. Cuál es el costo de esa flexibilidad que no usamos, medido, está en
la sección 4.

**La línea que hace que todo esto sea una prueba.**
`circuitos/pertenencia.circom:57`:

```
raiz === arbol.out;
```

Sin esa línea el circuito compila, calcula la raíz correctamente y **no prueba
nada**: el valor calculado se quedaría adentro sin que nadie lo compare contra la
raíz pública. La sección 5 tiene la rotura deliberada que lo muestra.

**El nulificador.** `circuitos/pertenencia.circom:59` a `:62` calcula
`Poseidon(secreto, scope)` con `Poseidon` de **dos** entradas y lo asigna a la
salida con `<==`. El orden de los argumentos importa —`Poseidon(a, b)` no es
`Poseidon(b, a)`, y el control de T02 lo verifica con un vector específico—, así
que el prover y el contrato tienen que usar el mismo.

### El script que lo compila y lo prueba

`scripts/circuito-pertenencia.mjs` no forma parte del sistema: es el banco de
pruebas de esta tarea. Compila el circuito, imprime el número real de
restricciones, arma un árbol de ocho identidades en JavaScript y calcula witnesses.

`scripts/circuito-pertenencia.mjs:70` (`armarArbol`) y `:86` (`caminoDe`) son el
lado JavaScript del árbol. Vale la pena ver los dos lados juntos: el árbol entero
se arma **afuera** del circuito, porque es trabajo de servidor y meterlo adentro
costaría restricciones sin ganar nada; el circuito solo recalcula el camino de una
hoja, que es lo único que hay que demostrar. Que las dos implementaciones de
Poseidon den el mismo número es lo que establece `npm run control:poseidon`.

`scripts/circuito-pertenencia.mjs:185` usa `snarkjs.wtns.check`, que no compara
contra JavaScript sino que comprueba que el witness satisface las 2513
restricciones del `.r1cs`. Es la verificación que corresponde a lo dicho arriba:
el `.wasm` calcula, el `.r1cs` es el que manda.

`scripts/circuito-pertenencia.mjs:200` a `:224` son los cinco testigos inválidos.
Un circuito que acepta lo que tiene que aceptar no está probado; lo que hay que
demostrar es que rechaza. Los cinco están en la sección 5 con su salida real.

### El número de restricciones

Salida real del compilador (circom 2.2.3, circomlib 2.0.5,
`@zk-kit/binary-merkle-root.circom` 2.0.0):

```
template instances: 146
non-linear constraints: 1212
linear constraints: 1301
public inputs: 2
private inputs: 7
public outputs: 1
wires: 2518
labels: 3727
```

y `snarkjs r1cs info` sobre el `.r1cs` resultante:

```
# of Wires: 2518
# of Constraints: 2513
# of Private Inputs: 7
# of Public Inputs: 2
# of Labels: 3727
# of Outputs: 1
```

**2513 restricciones.** Los dos números del compilador no se suman para llegar a
ese total: snarkjs reporta el sistema ya simplificado, que es el que va a consumir
el trusted setup de T04.

El desglose de las no lineales, con los costos que midió T02: `Poseidon(1)` de la
hoja, 216; los tres `Poseidon(2)` del camino, 243 cada uno; el `Poseidon(2)` del
nulificador, otros 243. Suman 1188 de las 1212 que reporta el compilador. Las 24
restantes son el multiplexor de cada nivel, el `Num2Bits` del índice, los
comparadores de la profundidad dinámica y las tres restricciones de binariedad.

El reparto importa para leer el diseño: **el 98% de la parte cara del circuito es
hash**. Si mañana hay que bajar el costo, se baja cambiando la primitiva o la
profundidad del árbol, no puliendo la lógica de alrededor.

## 3. Por qué está hecho así

### Por qué no se escribió el camino de Merkle a mano

`AGENTS.md` lo exige: las primitivas van de un template existente y auditado, y si
hubo que escribir una a mano, se justifica. El orden de búsqueda que fija
`PLAN.md` es circomlib primero, el port de Semaphore después, a mano como último
recurso.

**circomlib 2.0.5 no trae un camino de Merkle binario.** Lo verifiqué leyendo el
paquete instalado, no la documentación: en `node_modules/circomlib/circuits/` lo
único relacionado con árboles es la carpeta `smt/`, que implementa un *Sparse
Merkle Tree* —`SMTVerifier`, `SMTProcessor`— con una interfaz completamente
distinta: clave-valor, con la posición derivada de los bits de la clave, sin
índices explícitos, y con señales `enabled`, `fnc`, `oldKey`, `oldValue` e
`isOld0` que resuelven también la prueba de **no** pertenencia. Usarlo habría
significado cambiar la estructura del árbol del organizador (T05) y arrastrar
cinco señales de control cuya semántica hay que entender bien para no dejar un
agujero. Para un árbol chico y denso, donde las ocho hojas existen, es la
herramienta equivocada.

**La alternativa que sí corresponde es el port de Semaphore**, y por eso el
circuito depende de `@zk-kit/binary-merkle-root.circom` 2.0.0 (MIT). Es el mismo
paquete que usa Semaphore v4: lo verifiqué en el `package.json` de
`@semaphore-protocol/circuits` 4.14.3, que lo lista como dependencia exacta
`"@zk-kit/binary-merkle-root.circom": "2.0.0"`. Su única dependencia es circomlib,
el archivo son cuarenta líneas legibles, y es código que corre hoy en producción en
el sistema de pertenencia anónima más usado del ecosistema. No hubo que escribir
nada a mano.

Un detalle del template que conviene tener escrito porque es una trampa: su propio
comentario avisa que **verifica `out = 0` para `depth > MAX_DEPTH`**, y que eso hay
que impedirlo desde afuera. Acá no aplica, porque `circuitos/pertenencia.circom:49`
pasa `depth <== PROFUNDIDAD`, que es una constante igual al `MAX_DEPTH` con el que
se instancia el template, y la constante queda fijada por una restricción. Si
alguna vez la profundidad pasa a ser una señal de entrada —un árbol que crece— hay
que agregar la comparación.

### Por qué la separación de dominio: Poseidon de 1 para la hoja y de 2 para el nulificador

Poseidon no es una función sino una familia: `Poseidon(1)`, `Poseidon(2)`,
`Poseidon(3)` cargan constantes distintas y son, a todos los efectos, funciones
distintas. `npm run control:poseidon` ahora lo comprueba explícitamente:
`Poseidon(1)([x])` y `Poseidon(2)([x, 0])` dan números diferentes para los tres
valores que prueba.

Eso es lo que hace que el diseño de acá sea seguro, y conviene ver primero el
problema que evita. Supongamos que la hoja fuera `Poseidon(secreto, 0)` y el
nulificador `Poseidon(secreto, scope)`: son la *misma* función con argumentos
distintos. Un evento cuyo `scope` fuera 0 produciría un nulificador idéntico a una
hoja del árbol. Peor todavía es el caso general: si el mismo hash se usa para
construir nodos internos y para producir valores públicos, un atacante puede
intentar hacer pasar un valor de un rol por un valor del otro rol —presentar un
nulificador como si fuera un nodo, o al revés—. Esa clase de ataque se llama
confusión de dominio y es vieja: es la misma razón por la que los protocolos serios
prefijan una etiqueta antes de firmar.

Acá los dos usos viven en funciones distintas por construcción. Una hoja sale de
`Poseidon(1)`, un nodo interno y un nulificador salen de `Poseidon(2)`; ningún
valor puede cumplir los dos roles por casualidad. Entre el nodo interno y el
nulificador, que comparten aridad, la separación la da la estructura: un nodo es
`Poseidon(izquierdo, derecho)` de dos valores que ya son hashes, y el nulificador
es `Poseidon(secreto, scope)` donde el secreto nunca es público y el scope lo fija
el organizador. Es una separación más débil que la de aridad, y una alternativa más
explícita —prefijar una constante de dominio en cada uso— está en la sección 4.

### Qué es una señal sub-restringida

Es **el** bug de seguridad propio de Circom, y es peligroso por una razón
específica: no rompe nada. El circuito compila, el witness se calcula, la prueba se
genera, el verificador la acepta. Todo funciona. Lo único que pasa es que el
sistema demuestra menos de lo que el autor cree.

Circom tiene dos operadores que parecen el mismo:

- `<==` **asigna y restringe**. Le da el valor a la señal y agrega la ecuación al
  sistema.
- `<--` **solo asigna**. Le da el valor al witness cuando corre el `.wasm`, y no
  agrega ninguna ecuación.

`<--` existe porque hay cálculos que no se pueden expresar como restricciones
—una división, una raíz, una descomposición en bits— y el patrón correcto es
calcular con `<--` y después *demostrar* el resultado con una o más restricciones
escritas aparte. Usado sin esa segunda parte, deja un agujero.

Mirá este código, que es el final de nuestro circuito con un solo carácter
cambiado:

```circom
    component hasherNulificador = Poseidon(2);
    hasherNulificador.inputs[0] <== secreto;
    hasherNulificador.inputs[1] <== scope;
    nulificador <-- hasherNulificador.out;    // <-- en vez de <==
```

Se ve bien. Calcula el Poseidon correcto, el `npm run circuito:pertenencia` pasa
entero, el nulificador que imprime es el mismo número de siempre. Y sin embargo el
circuito quedó roto de la peor manera: **`nulificador` ya no está atado a nada**.
Cualquiera que genere el witness a mano, en vez de con el wasm, puede poner en esa
posición el número que quiera y la prueba sigue siendo válida. En este sistema eso
significa entrar con la misma entrada todas las veces que quiera, inventando un
nulificador nuevo en cada puerta. El anonimato se mantiene intacto; lo que se cae
es la defensa contra el doble uso, que es justamente la otra mitad del mecanismo.

No es una especulación. Lo medí: compilé esa variante, generé el witness válido,
reemplacé a mano la posición del nulificador por el número 42 y evalué las 2513
restricciones del `.r1cs` una por una. **Restricciones violadas: cero.** El sistema
de ecuaciones acepta el nulificador falso sin protestar.

Y acá está la parte que más conviene retener, porque contradice la intuición
razonable de buscar el bug contando restricciones:

| Variante | Restricciones | Cables |
|---|---|---|
| Circuito correcto | 2513 | 2518 |
| `nulificador <-- ...` | 2513 | 2519 |
| Sin `raiz === arbol.out` | 2513 | 2519 |

El conteo de restricciones **no bajó en ninguno de los dos casos**. Con `<==`, el
compilador se da cuenta de que la salida y el resultado del Poseidon son el mismo
valor y los fusiona en un cable; con `<--` quedan dos cables, uno de ellos libre.
La firma del bug es un cable de más, no una ecuación de menos, y circom 2.2.3 lo
compila **sin ninguna advertencia**. Un circuito no se audita contando: se audita
preguntándose, señal por señal, qué ecuación la ata.

Las dos formas que toma el bug, para saber qué buscar:

1. **`<--` sin la restricción que lo acompañe.** Es la versión visible: el
   operador está ahí y se puede buscar con grep.
2. **La restricción que falta del todo.** Es peor porque no hay nada que buscar.
   Un valor se calcula, se usa, y nadie exige que sea igual a lo que tendría que
   ser igual. `circuitos/pertenencia.circom:57` es exactamente esa línea: sacarla
   no cambia el conteo de restricciones, no produce ninguna advertencia y convierte
   el circuito en uno que acepta cualquier raíz. La sección 5 lo hace correr.

### Por qué los índices se restringen a ser bits

`circuitos/pertenencia.circom:38` exige `indices[i] * (indices[i] - 1) === 0`.
Conviene ser preciso sobre qué aporta, porque es un buen ejemplo de cómo se razona
la seguridad de estas cosas.

Adentro del template, el que elige entre las dos ramas es `MultiMux1` de circomlib,
que calcula `out = (c1 - c0)·s + c0`. Esa fórmula **no verifica que `s` sea 0 o 1**:
con `s = 1/2` devuelve el promedio de las dos ramas, y con un `s` elegido con
cuidado devuelve lo que el atacante quiera. Un selector sin restringir en un
multiplexor es un agujero de libro, y lo sería acá si el índice llegara crudo.

No llega crudo por dos razones independientes. La primera es que el template pasa
el índice por `Num2Bits(MAX_DEPTH)` y usa los bits que salen de ahí, y `Num2Bits`
restringe cada bit a 0 o 1 y exige que se recompongan en el número original: un
índice de más de 3 bits ni siquiera produce witness. La segunda es esta línea
nuestra. O sea que la línea 38 no es lo que tapa el agujero —el template ya se
defiende solo—, y es honesto decirlo así.

Lo que sí garantiza es que los `indices[3]` que entran sean literalmente los bits
del camino y no otra codificación que dé el mismo número. Cuestan tres
restricciones sobre 2513 y hacen que la interfaz del circuito signifique
exactamente lo que dice. En criptografía, dos defensas independientes para lo
mismo no son un desperdicio: son lo que mantiene el sistema en pie cuando una
actualización de una dependencia se lleva puesta la primera.

### Qué queda afuera a propósito: el rango de las entradas

T02 dejó registrado que las dos implementaciones de Poseidon reducen módulo `p` en
silencio, y que por lo tanto dos secretos que difieran en un múltiplo exacto de `p`
producen el mismo nulificador. Este circuito **no valida eso** y no es un descuido.

Adentro de un circuito no existe "el número que me pasaron": las señales *son*
elementos del campo, siempre en `[0, p)`. Cuando el calculador de witness recibe
`p + 1`, lo que entra al sistema es `1`, y el circuito no tiene forma de saber que
alguna vez fue otra cosa. El chequeo acá adentro no sería caro, sería **imposible**:
no hay nada que comparar, porque la comparación siempre daría que sí.

Como dato de contexto sobre lo que cuestan las comparaciones, que son lo caro de
un circuito: `LessThan(252)` de circomlib son 256 restricciones —más que un
`Poseidon(2)` entero— y ni siquiera acepta 254 bits, porque el template tiene un
`assert(n <= 252)` en `node_modules/circomlib/circuits/comparators.circom:90`.
Comparar es caro; hashear es barato. Es al revés que en un procesador y conviene
tenerlo incorporado.

El control va donde el valor todavía es un entero de JavaScript o un `uint256` de
Solidity: el organizador que genera los secretos (T05) y el prover que arma el
input (T06). `PLAN.md` lo asigna ahí y esta tarea lo respeta.

## 4. Qué podrías cambiar

**El template del camino: `@zk-kit/binary-merkle-root.circom` → escrito a mano con
`Switcher` de circomlib.** El template que usamos soporta profundidad dinámica y
nosotros la fijamos, así que pagamos flexibilidad que no usamos: un `IsEqual` por
nivel más el `Num2Bits` del índice. Lo medí escribiendo la versión fija —un
`Switcher` y un `Poseidon(2)` por nivel, tres restricciones de binariedad— y
compilándola: **2495 restricciones contra 2513**. Dieciocho menos, un 0,7%. No
alcanza ni de lejos para justificar reemplazar código de Semaphore por código
propio; si la profundidad subiera a 20, la diferencia seguiría siendo del orden de
cien restricciones sobre más de diez mil. El cálculo cambia solamente si algún día
se busca el último punto de rendimiento con una auditoría que respalde el código
propio. Tocaría `circuitos/pertenencia.circom` y sacaría la dependencia de
`package.json`.

**El template: → `SMTVerifier` de circomlib.** Un árbol disperso permite altas y
bajas de una entrada sin recalcular todo el árbol y prueba también la *no*
pertenencia, que es útil para listas negras. A cambio, cuesta bastante más por
nivel, el organizador (T05) tendría que mantener un SMT en vez de un array, y
aparecen cinco señales de control cuyo mal uso es un agujero. Tocaría el circuito,
el organizador y el prover. Es la alternativa a mirar si el TPF decide que el
árbol tiene que ser actualizable en vivo, que es una decisión de ADR y no de acá.

**La profundidad: 3 → 20.** Ocho identidades alcanzan para la demo y para nada
más. Cada nivel cuesta un `Poseidon(2)` más su multiplexor. Lo medí compilando el
mismo circuito con `Pertenencia(20)` —un millón de entradas—: **11438
restricciones contra las 2513 de hoy**, unas 4,5 veces. Crece lineal con la
profundidad y logarítmico con la cantidad de entradas, que es justamente la gracia
del árbol de Merkle. Es un cambio de un carácter en
`circuitos/pertenencia.circom:67`, más el árbol del organizador y el tamaño del
`ptau` de T04. Conviene medirlo antes de prometer nada sobre el tiempo de prueba:
eso es MED-001.

**La hoja: `Poseidon(secreto)` → `Poseidon(secreto, titular)`.** El documento de
Hito 1 plantea un compromiso que ata el secreto a la dirección del titular del NFT,
para que el árbol no se pueda armar con hojas de cualquiera. Cuesta 243
restricciones en vez de 216 y obliga a que el prover conozca y pase la dirección.
Es una decisión de diseño del TPF, no de esta tarea: `PLAN.md` fija la hoja simple
para T03 y el tema reaparece en T05 y T11.

**La separación de dominio: aridad → etiqueta explícita.** En vez de confiar en
que `Poseidon(1)` y `Poseidon(2)` son funciones distintas, se puede prefijar una
constante de dominio en cada uso: la hoja como `Poseidon(1, secreto)` y el
nulificador como `Poseidon(2, secreto, scope)`. Es la práctica estándar y hace la
intención legible en el código en vez de depender de una propiedad de la
primitiva. Cuesta pasar a aridades más altas —unas 250 restricciones más— y tiene
que quedar igual en el circuito, en el organizador, en el prover y en el contrato,
o nada verifica. Candidato a ADR; está anotado en la bitácora.

**El nulificador: `Poseidon(secreto, scope)` → incluir la hoja o el `tokenId`.**
Tal como está, el nulificador depende solo del secreto, así que si una misma
persona tuviera dos entradas para el mismo evento con el mismo secreto, las dos
darían el mismo nulificador y solo una podría pasar. Es correcto para "una
identidad, una entrada" y equivocado para "una billetera, cuatro entradas".
Arreglarlo es agregar una entrada al hash, y decidir qué valor va ahí es
exactamente el tipo de pregunta que corresponde a un ADR.

## 5. Probalo vos

Desde la raíz del repo:

```bash
npm run circuito:pertenencia
```

Compila el circuito, imprime las restricciones, arma el árbol de ocho identidades
y corre seis testigos. Salida real, tal como quedó el 2026-09-23 (se le quitaron
las advertencias de descriptores de archivo que imprime snarkjs de a ratos):

```
Compilando circuitos/pertenencia.circom

template instances: 146
non-linear constraints: 1212
linear constraints: 1301
public inputs: 2
private inputs: 7
public outputs: 1
wires: 2518
labels: 3727
Written successfully: build\pertenencia.r1cs
Written successfully: build\pertenencia.sym
Written successfully: build\pertenencia_js\pertenencia.wasm
Everything went okay

snarkjs r1cs info
  restricciones     2513
  cables            2518
  entradas privadas 7
  entradas publicas 2
  salidas           1

Arbol de 8 identidades, profundidad 3
  raiz              18671017815487546595076512029472066822531342561155042486011578944804634860499
  posicion probada  5 (secreto 66)
  indices           [1, 0, 1]

Testigo valido

  nulificador (circuito)    13958008681850683262116059744170178113099221759039031649483790525027830032801
  Poseidon(secreto, scope)  13958008681850683262116059744170178113099221759039031649483790525027830032801
  iguales                   si
  satisface el r1cs         si
  con scope 1235           16590052635936699682963547047810559130268076229021458648145983998001581776906

Testigos invalidos (tienen que ser rechazados)

ERROR:  4 Error in template Pertenencia_145 line: 57

  raiz que no es la del arbol
    rechazado         si (Error: Assert Failed. Error in template Pertenencia_145 line: 57)

ERROR:  4 Error in template Pertenencia_145 line: 57

  secreto que no esta en el arbol
    rechazado         si (Error: Assert Failed. Error in template Pertenencia_145 line: 57)

ERROR:  4 Error in template Pertenencia_145 line: 57

  un hermano del camino cambiado
    rechazado         si (Error: Assert Failed. Error in template Pertenencia_145 line: 57)

ERROR:  4 Error in template Pertenencia_145 line: 57

  indices que apuntan a otra posicion
    rechazado         si (Error: Assert Failed. Error in template Pertenencia_145 line: 57)

ERROR:  4 Error in template Pertenencia_145 line: 38

  un indice que no es 0 ni 1
    rechazado         si (Error: Assert Failed. Error in template Pertenencia_145 line: 38)

Circuito compilado y validado: 1 testigo valido, 5 invalidos rechazados.
Ver docs/02-circuito.md.
```

Dos cosas para mirar además del "rechazado si". La primera: el mensaje dice la
**línea** que falló. Los cuatro primeros fallan en la 57 —la igualdad de raíces— y
el quinto en la 38 —la binariedad del índice—, que es donde tiene que fallar cada
uno. La segunda: `con scope 1235` muestra el mismo secreto produciendo otro
nulificador en otro evento. Esa es la propiedad que permite que una misma identidad
entre a dos eventos sin que nadie pueda cruzar los dos nulificadores y descubrir que
es la misma persona.

**Rotura deliberada: sacar la restricción que ata la raíz.** Abrí
`circuitos/pertenencia.circom:57` y comentá la línea:

```circom
    // raiz === arbol.out;
```

Compila igual, sin advertencias, y con las mismas 2513 restricciones. Corré
`npm run circuito:pertenencia` y mirá los testigos inválidos:

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

El comando sale con código 1. Lo importante no es que falle: es **qué sigue
funcionando**. El testigo válido pasa, el nulificador es correcto, `wtns.check`
dice que el witness satisface el sistema. Un circuito que hace todo bien salvo lo
único que tenía que probar. Cualquiera con un secreto inventado y una raíz
inventada entra a cualquier evento.

Restaurá la línea y volvé a correrlo antes de seguir.

**Segunda rotura, la de la señal sub-restringida.** En
`circuitos/pertenencia.circom:62`, cambiá `<==` por `<--`:

```circom
    nulificador <-- hasherNulificador.out;
```

Corré `npm run circuito:pertenencia`: **pasa entero**. Mismo nulificador, mismos
rechazos, código de salida 0. La única diferencia visible está en la salida del
compilador: `wires: 2519` en vez de `2518`, con las mismas 2513 restricciones y
sin ninguna advertencia.

Ese cable de más es el agujero, y no hay ninguna herramienta acá que te lo diga.
Para verlo de verdad hay que hacer lo que hice al escribir la sección 3: generar el
witness, reemplazar a mano el valor del nulificador y evaluar las restricciones del
`.r1cs` una por una. Con `<==` ese witness viola una restricción; con `<--` no
viola ninguna. El único control que sirve en el día a día es leer el circuito
preguntando, señal por señal, qué ecuación la ata.

Restaurá el `<==`.

## 6. Qué NO hace

**No genera ni verifica ninguna prueba.** Todo lo de acá es witness: valores que
satisfacen un sistema de ecuaciones. Convertir eso en una prueba que se pueda
mandar a un verificador necesita el trusted setup de Groth16, que es T04, y el
prover, que es T06. El tiempo y el tamaño de esa prueba —los dos números que esta
PoC tiene que medir— todavía no existen.

**No impide el doble uso por sí solo.** El circuito garantiza que el nulificador es
`Poseidon(secreto, scope)` y nada más. Quien tiene que acordarse de los
nulificadores ya vistos y rechazar el repetido es el validador de la puerta (T07),
y el problema difícil —dos molinetes sin conexión entre ellos— es un problema de
sincronización, no de criptografía. El ZK hace que el nulificador no delate quién
sos; que no pases dos veces lo hace una lista.

**No valida que las entradas estén en `[0, p)`.** Por qué es imposible hacerlo
acá y dónde va el control, en la sección 3. Queda pendiente en T05 y T06.

**No ata la hoja a nada del mundo real.** La hoja es `Poseidon(secreto)` y punto: no
hay ninguna relación entre esa hoja y el NFT, la billetera del titular o el precio
pagado. Esa relación la construye el organizador cuando arma el árbol (T05) y el
contrato cuando emite (T11). Hoy, cualquiera que conozca *un* secreto del árbol
puede probar pertenencia, sea o no el comprador.

**No dice nada sobre quién arma el árbol ni sobre si la raíz es la correcta.** El
circuito prueba pertenencia a *la raíz que le pasen*. Que esa raíz sea la del evento
real es lo que resuelve `RegistroDeRaiz.sol` en T09, publicándola on-chain. Sin ese
registro, la prueba es válida contra un árbol que el atacante puede haber armado él.

**No prueba nada sobre la privacidad frente a la cadena.** Que el nulificador no
revele el secreto es cierto; que nadie pueda correlacionar quién entró mirando
*cuándo* se publicó cada nulificador, o desde qué IP llegó la prueba, es otro
problema entero —metadatos, no criptografía— y no lo toca esta PoC.

Los frentes del TPF con los que se engancha: **ADR-008, ADR-009, ADR-010 y
ADR-011** en `../zk-ticketing-docs`, como evidencia instrumental de que el
mecanismo central es implementable y de cuánto cuesta. **No cierra ninguno.** Las
dos decisiones que esta tarea dejó a la vista —la etiqueta de dominio explícita y
qué entra exactamente en el nulificador para soportar varias entradas por
billetera— están anotadas como candidatas a ADR en `bitacora/T03-circuito.md`.
