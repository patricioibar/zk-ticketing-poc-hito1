---
tarea: T03
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`circuitos/pertenencia.circom`: el circuito central de la PoC. Privadas `secreto`,
`camino[3]` e `indices[3]`; públicas `raiz` y `scope`; salida `nulificador`.
Adentro: hoja `= Poseidon(secreto)`, camino de Merkle de profundidad 3 con el
template `BinaryMerkleRoot` de `@zk-kit/binary-merkle-root.circom`, la restricción
`raiz === arbol.out` y el nulificador `= Poseidon(secreto, scope)`.

`scripts/circuito-pertenencia.mjs` y el comando `npm run circuito:pertenencia`:
compila, reporta las restricciones reales, arma un árbol de ocho identidades en
JavaScript con circomlibjs y corre un testigo válido y cinco inválidos.

Se amplió `npm run control:poseidon` a aridad 2, que era lo heredado de T02:
`circuitos/control_poseidon2.circom` nuevo, siete pares de vectores y un chequeo
explícito de separación de dominio. `docs/01-poseidon.md` quedó actualizado (su
sección 1, la descripción del script, las citas de línea que se corrieron y el
"no cubre Poseidon(2)" de la sección 6, que ya no era cierto).

La documentación de la tarea es `docs/02-circuito.md`.

**Resultado del compilador (circom 2.2.3, circomlib 2.0.5,
`@zk-kit/binary-merkle-root.circom` 2.0.0):**

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

**`snarkjs r1cs info` sobre `build/pertenencia.r1cs`:**

```
[INFO]  snarkJS: Curve: bn-128
[INFO]  snarkJS: # of Wires: 2518
[INFO]  snarkJS: # of Constraints: 2513
[INFO]  snarkJS: # of Private Inputs: 7
[INFO]  snarkJS: # of Public Inputs: 2
[INFO]  snarkJS: # of Labels: 3727
[INFO]  snarkJS: # of Outputs: 1
```

**2513 restricciones.** Es el número que va a consumir el trusted setup de T04.

**Salida real de `npm run circuito:pertenencia`, código de salida 0** (se quitaron
las advertencias de descriptores de archivo que imprime snarkjs entre corrida y
corrida del calculador de witness):

```
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

**Salida real de la parte nueva de `npm run control:poseidon`** (aridad 2 y
separación de dominio; la parte de aridad 1 no cambió y está en
`bitacora/T02-poseidon.md`). Código de salida 0:

```
Poseidon(2) sobre cada par

  cero y cero
    a                 0
    b                 0
    h (circuito)      14744269619966411208579211824598458697587494354926760081771325075741142829156
    h (circomlibjs)   14744269619966411208579211824598458697587494354926760081771325075741142829156
    iguales           si

  uno y dos
    a                 1
    b                 2
    h (circuito)      7853200120776062878684798364095072458815029376092732009249414926327459813530
    h (circomlibjs)   7853200120776062878684798364095072458815029376092732009249414926327459813530
    iguales           si

  dos y uno (orden invertido)
    a                 2
    b                 1
    h (circuito)      9708419728795563670286566418307042748092204899363634976546883453490873071450
    h (circomlibjs)   9708419728795563670286566418307042748092204899363634976546883453490873071450
    iguales           si

  dos valores del medio
    a                 1234567890123456789012345678901234567890
    b                 9876543210987654321098765432109876543210
    h (circuito)      19012296415192961858914896754999669765149473559419756317892430444398541131975
    h (circomlibjs)   19012296415192961858914896754999669765149473559419756317892430444398541131975
    iguales           si

  p - 1 en las dos
    a                 21888242871839275222246405745257275088548364400416034343698204186575808495616
    b                 21888242871839275222246405745257275088548364400416034343698204186575808495616
    h (circuito)      20092309280547939997162506796691455192771288143174894022739895715370814071035
    h (circomlibjs)   20092309280547939997162506796691455192771288143174894022739895715370814071035
    iguales           si

  p y p + 1
    a                 21888242871839275222246405745257275088548364400416034343698204186575808495617
    a mod p           0   <- se redujo
    b                 21888242871839275222246405745257275088548364400416034343698204186575808495618
    b mod p           1   <- se redujo
    h (circuito)      12583541437132735734108669866114103169564651237895298778035846191048104863326
    h (circomlibjs)   12583541437132735734108669866114103169564651237895298778035846191048104863326
    iguales           si

  2^256 - 1 en las dos
    a                 115792089237316195423570985008687907853269984665640564039457584007913129639935
    a mod p           6350874878119819312338956282401532410528162663560392320966563075034087161850   <- se redujo
    b                 115792089237316195423570985008687907853269984665640564039457584007913129639935
    b mod p           6350874878119819312338956282401532410528162663560392320966563075034087161850   <- se redujo
    h (circuito)      9616733280632975297228122592319197972402910257791811467459413868931157742288
    h (circomlibjs)   9616733280632975297228122592319197972402910257791811467459413868931157742288
    iguales           si

Separacion de dominio: Poseidon(1)([x]) contra Poseidon(2)([x, 0])

  x = 0
    Poseidon(1)       19014214495641488759237505126948346942972912379615652741039992445865937985820
    Poseidon(2)       14744269619966411208579211824598458697587494354926760081771325075741142829156
    distintos         si

  x = 1
    Poseidon(1)       18586133768512220936620570745912940619677854269274689475585506675881198879027
    Poseidon(2)       18423194802802147121294641945063302532319431080857859605204660473644265519999
    distintos         si

  x = 1234567890123456789012345678901234567890
    Poseidon(1)       17233478352641046290653020355207123739245241129469381061437095172858635059064
    Poseidon(2)       14670751680669692930836092124186083477444884472972377930834362228960699410055
    distintos         si

Control pasado: 9 vectores de aridad 1 y 7 de aridad 2,
mismo hash en circuito y en JS. Las dos aridades son funciones distintas.
```

**Mediciones de variantes**, todas con el mismo compilador y las mismas librerías.
Los circuitos de comparación se compilaron en una carpeta temporal y no quedaron en
el repo:

| Variante | Restricciones | Cables |
|---|---|---|
| `pertenencia.circom` tal como quedó | 2513 | 2518 |
| Con `nulificador <-- ...` en vez de `<==` | 2513 | 2519 |
| Sin la línea `raiz === arbol.out` | 2513 | 2519 |
| Camino escrito a mano con `Switcher` de circomlib | 2495 | 2501 |
| El mismo circuito con `Pertenencia(20)` | 11438 | 11460 |
| `LessThan(252)` de circomlib, suelto | 256 | — |

## Decisiones que tomé y por qué

**El template de Merkle: `@zk-kit/binary-merkle-root.circom` 2.0.0, el port de
Semaphore.** El orden de búsqueda que fija `PLAN.md` es circomlib, después
Semaphore, y a mano solo como último recurso.

Comprobé circomlib 2.0.5 leyendo el paquete instalado, no la documentación: en
`node_modules/circomlib/circuits/` lo único que tiene que ver con árboles es la
carpeta `smt/`, un Sparse Merkle Tree. `SMTVerifier(nLevels)` recibe `enabled`,
`root`, `siblings`, `oldKey`, `oldValue`, `isOld0`, `key`, `value` y `fnc`: es una
estructura clave-valor con la posición derivada de los bits de la clave, sin
índices explícitos, y que resuelve también la no pertenencia. No hay ningún
template de camino binario de profundidad fija en toda la librería. Usar el SMT
habría cambiado la estructura del árbol del organizador (T05) y agregado cinco
señales de control cuyo mal uso es un agujero, a cambio de flexibilidad que esta
PoC no necesita.

Entonces, Semaphore. El paquete `@zk-kit/binary-merkle-root.circom` 2.0.0 es MIT,
depende solo de circomlib y es exactamente el que usa Semaphore v4: lo verifiqué en
el `package.json` de `@semaphore-protocol/circuits` 4.14.3, que lo lista con
versión exacta `2.0.0`. Quedó agregado a `package.json` con versión fija, como el
resto de las dependencias. **No hubo que escribir nada de criptografía a mano.**

**Adaptar `indices[3]` al `index` decimal del template.** El template toma la
posición como un solo número y `PLAN.md` fija `indices[3]` como entrada privada.
Mantuve la interfaz del plan y compongo el número adentro, restringiendo antes cada
índice a ser 0 o 1. Las tres restricciones extra no son lo que tapa el agujero del
multiplexor —el template pasa el índice por `Num2Bits`, que ya restringe los bits—,
así que en el doc lo digo así: son defensa en profundidad y garantía de que la
interfaz significa lo que dice.

**Fijar `depth` en una constante.** El template acepta profundidad dinámica y su
propio comentario avisa que verifica `out = 0` cuando `depth > MAX_DEPTH`, y que
eso hay que impedirlo desde afuera. Pasándole la constante `PROFUNDIDAD`, que es el
mismo valor que el parámetro del template, el caso no puede darse. Queda anotado en
el doc por si algún día la profundidad pasa a ser una señal.

**No escribir el camino a mano aunque salga más barato.** Medí la versión propia
con `Switcher` de circomlib: 2495 contra 2513, dieciocho restricciones menos, un
0,7%. No alcanza para cambiar código de Semaphore por código propio.

**Agregar el banco de pruebas con witness, sin generar pruebas.** Es el mismo
criterio de T02 y mantiene a T03 sin dependencias hacia adelante: el trusted setup
es T04. El árbol de ocho hojas que arma el script es de juguete y está adentro del
script a propósito; el organizador de verdad, con su fuente JSON, es T05.

**Cinco testigos inválidos, no uno.** `AGENTS.md` lo pide explícitamente. Los cinco
fallan, y el mensaje del calculador de witness dice la línea: los cuatro de camino y
raíz en la 57, el del índice no binario en la 38. Que cada uno falle donde
corresponde es parte de lo que se está comprobando.

**Ampliar el control de Poseidon antes de confiar en el nulificador.** Era lo
heredado de T02 y era lo primero: el nulificador usa aridad 2, y las constantes de
cada aridad son distintas. Agregué también la comprobación de separación de
dominio, porque el circuito se apoya en que `Poseidon(1)` y `Poseidon(2)` son
funciones distintas y eso conviene verificarlo en vez de suponerlo.

## Con qué me tropecé

**Dos rutas de librería para compilar.** El template de `@zk-kit` incluye
`"poseidon.circom"` a secas, sin prefijo de paquete, mientras que nuestro circuito
lo incluye por su ruta completa dentro de `node_modules`. Hacen falta los dos `-l`:
`-l node_modules` y `-l node_modules/circomlib/circuits`. Con uno solo, el error es
un "include not found" que apunta a un archivo que sí está.

**El conteo de restricciones no detecta este tipo de bug, y eso era contraintuitivo.**
Esperaba que sacar la restricción `raiz === arbol.out` bajara el total. No baja:
2513 en los tres casos. Lo que cambia es la cantidad de **cables**, 2518 contra
2519, porque con `<==` el compilador fusiona las dos señales iguales en una. La
firma de un circuito sub-restringido es un cable libre de más, no una ecuación de
menos, y circom 2.2.3 no emite ninguna advertencia por eso. Me pareció lo bastante
importante como para que sea el centro de la sección 3 del doc.

**Demostrar el agujero del `<--` requiere salirse de las herramientas.** Con el
`.wasm` no se ve: el calculador de witness pone el valor correcto igual. Para
comprobarlo exporté el `.r1cs` a JSON, reemplacé a mano la posición del nulificador
en el witness por el número 42 y evalué las 2513 restricciones una por una:
**cero violadas**. Con `<==`, el mismo witness falsificado viola una. El script que
usé para eso fue temporal y no quedó en el repo; el procedimiento está descrito en
la sección 5 del doc.

**El calculador de witness imprime en stderr por su cuenta.** Las líneas
`ERROR:  4 Error in template Pertenencia_145 line: 57` no las imprime el script:
las imprime el wasm de circom antes de que snarkjs lance la excepción. Quedan en la
salida, aunque el testigo inválido haya sido rechazado correctamente, que es lo que
tenía que pasar. Dejé el mensaje del script abajo de cada una para que se lea que
el rechazo es el resultado esperado.

**Ampliar el control me obligó a tocar la documentación de T02.** El script se
alargó y las citas `archivo:línea` de `docs/01-poseidon.md` dejaron de apuntar a lo
que decían. Las corregí todas, más la sección 1 y el párrafo de la sección 6 que
decía "no cubre `Poseidon(2)`". Una doc que cita líneas es más útil de leer y más
frágil de mantener; conviene saberlo antes de tocar un script ya documentado.

## Qué dejo pendiente o candidato a ADR

**Candidato a ADR: la separación de dominio explícita.** Hoy la hoja y el
nulificador no pueden colisionar porque usan aridades distintas de Poseidon, que
cargan constantes distintas. Funciona, pero es implícito: depende de una propiedad
de la primitiva y no se lee en el código. La práctica estándar es prefijar una
constante de dominio en cada uso —`Poseidon(1, secreto)` para la hoja,
`Poseidon(2, secreto, scope)` para el nulificador—. Cuesta unas 250 restricciones y
tiene que quedar igual en el circuito, el organizador, el prover y el contrato.
Corresponde al frente del esquema de compromisos y nulificadores en
`../zk-ticketing-docs`.

**Candidato a ADR: qué entra exactamente en el nulificador.** Tal como está,
`Poseidon(secreto, scope)` depende solo del secreto, así que una misma identidad con
dos entradas al mismo evento produce el mismo nulificador y solo puede pasar una
vez. Es correcto para "una identidad, una entrada" y está mal para "una billetera,
cuatro entradas", que es un caso de uso real de un sistema de ticketing. Arreglarlo
es agregar una entrada al hash; qué valor va ahí —el `tokenId`, un índice de
entrada, la hoja— es una decisión de diseño que afecta al contrato (T11) y al
validador (T07).

**Pendiente de T02, sigue abierto: validar que las entradas estén en `[0, p)`.**
Confirmado que no puede hacerse adentro del circuito: cuando el valor llega ahí ya
está reducido y no queda nada que comparar. El control va en el organizador (T05) y
en el prover (T06), como fija el plan.

**Pendiente: la hoja no está atada a nada del mundo real.** Es `Poseidon(secreto)`
y no tiene ninguna relación con el NFT ni con la billetera del titular. El documento
de Hito 1 plantea `Poseidon(secreto, titular)`; `PLAN.md` fija la versión simple
para T03 y el tema reaparece en T05 y T11.

**Para T04:** el circuito tiene 2513 restricciones, así que el `ptau` necesita
soportar al menos 2^12 = 4096. Si alguien sube la profundidad del árbol antes del
setup, con 20 niveles son 11438 y hace falta 2^14.
