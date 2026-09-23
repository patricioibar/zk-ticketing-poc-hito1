# Organizador

## 1. Qué hace

`npm run organizador` genera ocho identidades sintéticas —un secreto al azar y su
**compromiso**, que es `Poseidon(secreto)`—, arma con los ocho compromisos el árbol
de Merkle de profundidad 3 que espera el circuito de T03, y publica la raíz a
través de una pieza intercambiable llamada `fuenteDeRaiz`. Deja tres archivos: el
padrón público del evento, la raíz publicada, y los secretos en un archivo aparte
que representa lo que cada comprador guardaría para sí.

Es determinista: la misma semilla produce siempre los mismos ocho secretos y la
misma raíz, para que las mediciones de más adelante sean reproducibles.

## 2. Cómo lo hace

Son cuatro archivos. El script `scripts/organizador.mjs` es el que se ejecuta;
`lib/campo.mjs` y `lib/merkle.mjs` son las piezas compartidas con el resto de la
PoC; `fuentes/json.mjs` es la primera de las tres implementaciones de
`fuenteDeRaiz` que va a tener el proyecto.

### La constante que no es opción

`scripts/organizador.mjs:24` fija `PROFUNDIDAD = 3` y de ahí salen las ocho hojas.
No es un parámetro de línea de comandos a propósito: la profundidad está compilada
adentro de `circuitos/pertenencia.circom` —`Pertenencia(3)`— y un árbol de otra
profundidad produce caminos que el circuito no puede recorrer. Cambiar una de las
dos cosas sin la otra da el peor error posible: uno que aparece recién cuando la
prueba no verifica, sin decir por qué.

`scripts/organizador.mjs:28` fija el scope por defecto en `evento-A`, que es el
evento commiteado en `datos/` y el que deja publicado `npm test`. Hasta T11 el
default era `1234` —el mismo número que usan el banco de pruebas de T03 y la
ceremonia de T04—, pero esos dos no escriben en `datos/`: lo único que conseguía esa
coincidencia era que `npm run organizador` sin argumentos pisara el juego de datos
del repositorio con otro evento. El arreglo está contado en
`docs/09-entrada-nft.md`, sección 2. Las salidas de la sección 5 de este documento
son anteriores a ese cambio y muestran `1234`.

### De dónde salen los compromisos

`scripts/organizador.mjs:98` es la línea que ordena todo el proyecto:

```js
const compromisosDeLaFuente = await fuente.leerCompromisos(opciones.scope);
```

Primero se le pregunta a la fuente si ella sabe qué compromisos hay. La fuente
JSON contesta `null` (`fuentes/json.mjs:30`) y entonces el organizador los inventa
(`scripts/organizador.mjs:105`). En T12, el contrato de entradas va a contestar con
los compromisos que efectivamente enviaron los compradores, y **esta línea no
cambia**. La rama del `if` que hoy se ejecuta es la que va a dejar de ejecutarse;
el organizador no se reescribe.

### La generación de un secreto

`lib/campo.mjs:47` (`secretoDeterminista`) deriva el secreto de la posición `i`
como `sha256("semilla|i|intento")`, interpretado como un número de 256 bits. Ese
número casi nunca entra en el campo: `p` es apenas menor que `2^254` y el
candidato tiene 256 bits, así que la probabilidad de que caiga adentro es
`p / 2^256 ≈ 0,19`. Cuando no entra, `lib/campo.mjs:48` incrementa el contador de
intento y vuelve a hashear.

Eso es **rechazo**, y es la parte no obvia. La alternativa evidente —tomar el
resto módulo `p`— produce un valor que sí entra en el campo, pero sesgado: los
valores más chicos tendrían cinco preimágenes de 256 bits y el resto cuatro. Para
un secreto criptográfico, un sesgo conocido es información que el atacante no
tendría que tener. Y además enseña el hábito equivocado, que es justamente el que
esta tarea tiene que desarmar: en este sistema, reducir módulo `p` en silencio es
el error.

La corrida real descarta 18 candidatos para conseguir los 8 secretos. El número es
estable porque la semilla es fija.

### La validación de rango

`scripts/organizador.mjs:67` llama a `exigirEnCampo` con cada secreto antes de
hashearlo, y `lib/campo.mjs:21` es la función que decide. Si el valor no está en
`[0, p)` tira un `RangeError` que imprime el valor, `p`, el resto, y qué implica:
que ese valor y su resto producirían **el mismo compromiso y el mismo
nulificador**. El script no lo atrapa para seguir; lo deja subir hasta el `catch`
final y sale con código 1.

Por qué esta validación vive acá y no adentro del circuito, en la sección 3. La
misma llamada protege el scope (`scripts/organizador.mjs:84`) y la raíz que se
publica (`fuentes/json.mjs:35`).

### El árbol

`lib/merkle.mjs:27` (`armarArbol`) hashea los compromisos de a pares con
`Poseidon(2)` hasta llegar a un solo valor, guardando todos los niveles.
`lib/merkle.mjs:49` (`caminoDe`) devuelve, para una hoja, los hermanos que hay que
hashear y el bit que dice de qué lado está en cada nivel: eso es exactamente lo que
el prover de T06 le va a pasar al circuito como `camino[3]` e `indices[3]`.

`lib/merkle.mjs:65` (`raizDesdeCamino`) hace en JavaScript lo mismo que hace el
circuito adentro: sube desde la hoja aplicando el camino. `scripts/organizador.mjs:146`
lo usa para comprobar que **las ocho** hojas llegan a la raíz publicada. Es un
control barato que cierra el ciclo sin generar ninguna prueba: si esto no da, no
tiene sentido intentar probar nada en T06.

Estas tres funciones son nuevas en su ubicación pero no en su contenido: hasta T04
`armarArbol` y `caminoDe` estaban duplicadas en dos scripts. La razón de la
duplicación y por qué se salda acá, en la sección 3.

### Los artefactos

`scripts/organizador.mjs:157` escribe `datos/arbol.json`: el **padrón** del evento
—scope, profundidad, raíz y los ocho compromisos en orden—. Es público por
definición: cualquiera tiene que poder armar su camino de Merkle con esto, y que
sea público no revela quién es quién.

`scripts/organizador.mjs:171` escribe `datos/secretos.json`, con los ocho secretos
y su posición. Es un archivo distinto porque es una cosa distinta: el padrón se
publica, esto no. Lleva adentro una advertencia que dice que en el sistema real
este archivo no existiría.

Los dos guardan cada elemento de campo como **string decimal**. JSON no tiene
BigInt, y guardarlos como `number` perdería precisión arriba de `2^53` sin avisar:
el valor se redondearía, el compromiso daría distinto y el síntoma aparecería
recién en la puerta.

`scripts/organizador.mjs:188` publica la raíz por la fuente, que en esta
implementación escribe `datos/raiz.json` (`fuentes/json.mjs:48`).

### Los controles del final

Tres, y los tres imprimen `si` o `NO` y suman a una lista de fallas que decide el
código de salida:

- **Determinismo** (`scripts/organizador.mjs:133`): rehace las ocho identidades y
  el árbol entero desde cero y compara la raíz. No alcanza con confiar en que el
  código es puro; se comprueba.
- **Caminos** (`scripts/organizador.mjs:146`): las ocho hojas contra la raíz.
- **Ida y vuelta por la interfaz** (`scripts/organizador.mjs:198` y `:205`):
  `leerRaiz(scope)` tiene que devolver exactamente la raíz que se publicó, y
  `leerRaiz(otro_scope)` tiene que devolver `null`. Este segundo control parece
  trivial y no lo es: es el que va a atrapar a la implementación de T09, porque un
  `mapping` de Solidity sin entrada devuelve 0, y ese 0 no puede llegar al prover
  disfrazado de raíz válida.

## 3. Por qué está hecho así

### Por qué el árbol se arma con compromisos y no con secretos

Un **compromiso** es el hash de un secreto: `Poseidon(secreto)`. Tiene dos
propiedades que lo hacen útil. No se puede invertir —de `Poseidon(s)` no se saca
`s`— y no se puede cambiar de opinión: dado el compromiso, es inviable encontrar
otro secreto que dé el mismo valor. Publicar el compromiso es decir "me
comprometo a un valor que no te muestro, y no voy a poder cambiarlo después".

Si el árbol se armara con los secretos, sería público: el padrón se publica, y con
el padrón en la mano cualquiera podría probar pertenencia haciéndose pasar por
cualquiera. El secreto dejaría de ser secreto en el mismo momento en que el árbol
se publica, que es siempre. Con compromisos, el árbol se publica entero y sigue sin
revelar nada útil: el único que puede generar la prueba de la hoja `i` es quien
conoce el secreto cuyo hash es esa hoja.

Ese es el reparto exacto de esta PoC: **el árbol es público, el secreto no**, y la
prueba de T06 conecta los dos sin mostrar cuál de las ocho hojas es.

### Qué es el conjunto de anonimato, y por qué 8 es ridículamente chico

El **conjunto de anonimato** es el conjunto de personas entre las que el que entra
se confunde. La prueba de pertenencia dice "soy una de las hojas de este árbol", y
nada más. Con ocho hojas, el validador sabe que quien está entrando es una de ocho
personas: la probabilidad de acertar quién es, adivinando, es 1/8.

Dicho al revés, que es como lo va a decir el jurado: **el ZK no aporta privacidad
por sí mismo, aporta la privacidad que le permita el tamaño del conjunto.** Un
árbol de ocho es una demostración del mecanismo, no una demostración de
privacidad. Y no es solo cuestión de agrandar el árbol: si el evento vende ocho
entradas, el conjunto es ocho aunque el árbol tenga profundidad 20, porque las
hojas vacías no son nadie. La cantidad que importa es cuántas personas *reales* hay
adentro.

Esto engancha directo con **ADR-001** (*Claim de privacidad: no vinculabilidad del
portador en la puerta*, `../zk-ticketing-docs/docs/decisiones/ADR-001-claim-de-privacidad.md`),
que está `aceptada` con `revision_pendiente: true`. Ese ADR ya acota el claim por
esta razón: registra entre los puntos en contra que la privacidad depende del
tamaño del conjunto de anonimato, que el sistema no controla, y que en eventos
chicos la privacidad es pobre y hay que declararlo como limitación. Esta PoC es el
caso extremo de ese límite, y sirve como ilustración concreta de por qué el ADR
dice lo que dice. **No lo modifica ni aporta evidencia nueva**: ocho hojas no
miden nada sobre el tamaño de conjunto que tendría un evento real.

### La interfaz `fuenteDeRaiz`, y qué tiene que cumplir una implementación nueva

Es la pieza de arquitectura más importante del proyecto. T09 y T12 van a enchufar
otras dos implementaciones —un contrato que guarda la raíz, y un contrato que emite
NFTs y recibe compromisos— **sin tocar el organizador, el prover ni los
validadores**. Que la escalera se suba cambiando un archivo es la demostración
literal de qué es intercambiable y qué no.

El contrato completo, que es lo que hay que cumplir para escribir la próxima:

| Miembro | Firma | Qué tiene que hacer |
|---|---|---|
| `nombre` | `string` | Identificarse en los mensajes. Es para el humano que lee la salida. |
| `leerCompromisos(scope)` | `async → BigInt[] \| null` | Devolver los compromisos que la fuente **origina**, en el orden que fija la posición de cada hoja, o `null` si no origina ninguno. |
| `publicarRaiz({scope, raiz, profundidad})` | `async → { referencia }` | Dejar la raíz donde el resto del sistema la va a leer. `referencia` es dónde quedó: una ruta, un hash de transacción. |
| `leerRaiz(scope)` | `async → BigInt \| null` | Devolver la raíz publicada para ese scope, o `null` si no hay ninguna. |

Y las reglas que no se ven en la tabla:

1. **Todo elemento de campo entra y sale como `BigInt`.** Ni strings hexadecimales,
   ni `Uint8Array` de circomlibjs, ni los objetos `BigNumber` de ethers. La
   conversión es responsabilidad de la implementación, no de quien la usa. Si esto
   no se respeta, el organizador compara un string contra un BigInt, la comparación
   da falso y el mensaje de error manda a buscar al lugar equivocado.
2. **Todos los métodos son `async`, aunque la implementación sea síncrona.** La
   fuente JSON lee un archivo y podría ser síncrona; un contrato no puede. La
   interfaz se escribe para la implementación más exigente, no para la más cómoda,
   porque si no T09 obliga a reescribir a todos los llamadores.
3. **Ausente es `null`, nunca cero.** Un `mapping` de Solidity sin entrada devuelve
   `0`, y `0` es un elemento de campo perfectamente válido. Traducirlo a `null` es
   trabajo de la implementación. El organizador comprueba esto en cada corrida.
4. **El orden de `leerCompromisos` es el orden de las hojas.** La posición `i` del
   array es la hoja `i` del árbol, y de esa posición dependen los `indices` del
   camino de cada comprador. Una fuente que devuelva los compromisos en otro orden
   entre dos corridas cambia la raíz y rompe los caminos de todos, sin ningún
   error visible hasta la puerta. Para un contrato, eso significa leerlos por
   índice de emisión, no por el orden de un evento indexado.
5. **La fuente nunca ve un secreto.** Ni lo recibe ni lo guarda. Es lo que permite
   que en T12 la fuente sea un contrato público sin que eso comprometa nada.
6. **Los errores se tiran, no se devuelven.** Una raíz mal formada, un archivo
   corrupto o una transacción que falló tienen que cortar el comando, no producir
   un valor por defecto.

Una implementación nueva está bien enchufada cuando `npm run organizador` pasa sus
dos controles de ida y vuelta sin que haya que tocar `scripts/organizador.mjs`.

### Por qué la raíz y el padrón son dos artefactos distintos

Podrían ser uno: un solo JSON con la raíz y los compromisos adentro. Están
separados porque **solo la raíz cambia de lugar** cuando se sube la escalera. En
T09 la raíz pasa a vivir en un contrato y `datos/raiz.json` desaparece, mientras
que el padrón sigue publicándose igual, porque el prover necesita los compromisos
para armar su camino y ponerlos on-chain no aportaría nada. Separarlos hace que el
cambio de T09 sea literalmente cambiar de fuente, y hace visible cuál es la porción
mínima que necesita estar en la cadena: la raíz, y nada más.

### Por qué la validación de rango está acá y no en el circuito

T02 dejó establecido que las dos implementaciones de Poseidon reducen módulo `p` en
silencio: `Poseidon(p + 1)` y `Poseidon(1)` dan el mismo número. La consecuencia es
que dos secretos que difieran en un múltiplo exacto de `p` producen el **mismo
nulificador**, y un nulificador repetido es una entrada que el validador rechaza
—o, según de qué lado se mire, un secreto que se puede hacer pasar por otro—.

Adentro del circuito el chequeo no es caro: es imposible. Las señales *son*
elementos del campo; cuando el calculador de witness recibe `p + 1`, lo que entra
al sistema es `1`, y no queda rastro de que alguna vez fue otra cosa. La comparación
siempre daría que sí. Está explicado en la sección 3 de `docs/02-circuito.md`.

Entonces el control va donde el valor todavía es un entero de JavaScript o un
`uint256` de Solidity: acá, en el organizador que genera los secretos, y en el
prover de T06 que arma el input. Con secretos al azar el riesgo es despreciable;
con secretos que vengan de afuera —un hash de 256 bits, un `uint256` de un
contrato, un identificador armado a mano— no lo es, porque ahí el valor lo elige
alguien, y ese alguien puede ser un atacante. Por eso la validación se aplica a
todo lo que cruza la frontera, incluido el scope y la raíz que devuelve la fuente,
y no solo a lo que el organizador genera.

### Por qué determinista, y por qué con semilla y no con `randomBytes`

Las mediciones de la PoC —MED-001, tiempo y tamaño de prueba— tienen que ser
reproducibles, y una medición sobre un árbol distinto en cada corrida no se puede
comparar consigo misma. Con semilla fija, la raíz
`21742806920683719786915181996178546158207976983808212562412387320164881855720` es
la misma en cualquier máquina, y eso permite que T06, T07 y T08 esperen valores
concretos en vez de recalcularlos.

El precio es que estos secretos **no son secretos**: están derivados de una cadena
que está escrita en el repositorio y además quedan en `datos/secretos.json`. Para
una PoC de ocho identidades de juguete está bien y es deliberado. Para cualquier
otra cosa sería un agujero, y es una de las razones por las que la parte base no se
parece al sistema real.

### Por qué se unificaron `armarArbol` y `caminoDe`

T03 las escribió en su banco de pruebas y T04 las copió, a propósito: extraerlas a
un módulo común en ese momento habría movido las líneas que `docs/02-circuito.md`
cita por número, y un documento que apunta a la línea equivocada es peor que
treinta líneas repetidas. La deuda quedó anotada con fecha de vencimiento en
`bitacora/T04-setup.md`, y el vencimiento era esta tarea.

El motivo no es estético. Tres copias de la definición del árbol son tres raíces
que pueden divergir, y el día que una diverja el síntoma va a ser "la prueba no
verifica", sin más información. Ahora hay una sola definición en `lib/merkle.mjs`,
la usan el organizador, el banco de pruebas de T03 y la ceremonia de T04, y las
citas de `docs/02-circuito.md` y `docs/03-setup.md` se actualizaron en la misma
tarea. La comprobación de que la mudanza no cambió nada es que `npm run setup`
sigue imprimiendo la misma raíz y el mismo nulificador que ya estaban escritos en
`docs/03-setup.md`.

`lib/merkle.mjs:28` agregó además una guarda que no estaba: si la cantidad de hojas
no es una potencia de dos, falla. Un árbol incompleto necesita una hoja de relleno
definida, y qué valor va ahí es una decisión —no un default silencioso—, porque de
ese valor depende la raíz.

## 4. Qué podrías cambiar

**La fuente: `fuentes/json.mjs` → `fuentes/contrato-raiz.mjs` o
`fuentes/contrato-nft.mjs`.** Es el cambio para el que está construido todo esto, y
son T09 y T12. Se gana que la raíz deje de ser un archivo que cualquiera edita y
pase a ser un dato con autoridad: publicado por el organizador, verificable por
todos, imposible de cambiar sin dejar rastro. Se pierde inmediatez —hay que levantar
una cadena local y esperar transacciones— y aparece el costo en gas. Toca un archivo
nuevo en `fuentes/` y una línea en `scripts/organizador.mjs:86`, que es la que elige
la implementación. Si hay que tocar algo más, la interfaz está mal diseñada.

**El compromiso: `Poseidon(secreto)` → `Poseidon(secreto, titular)`.** Atar la hoja
a la dirección del titular del NFT, como plantea el documento de Hito 1. Se gana que
el árbol no se pueda armar con hojas de cualquiera: hoy, cualquiera que conozca *un*
secreto del padrón prueba pertenencia, sea o no el comprador. Se pierden 27
restricciones en el circuito y la simplicidad de que el comprador solo tenga que
guardar un número. Toca `circuitos/pertenencia.circom`, `scripts/organizador.mjs:68`,
el prover y el contrato de T11. Es una decisión de diseño del TPF, no de acá.

**La profundidad: 3 → 20.** Ocho identidades alcanzan para la demo y para nada más.
T03 midió el costo: 11438 restricciones contra 2513. Toca la constante de
`circuitos/pertenencia.circom:67`, `scripts/organizador.mjs:24`, el tamaño del ptau
de T04, y obliga a decidir qué se pone en las hojas vacías de un árbol que no se
llena. Antes de prometer nada sobre el tiempo de prueba conviene medirlo: eso es
MED-001.

**Quién genera los secretos: el organizador → cada comprador.** Es T12 y es el
cambio que más acerca la PoC al sistema real. Se gana lo único que importa: que el
organizador no pueda hacerse pasar por ninguno de sus compradores. Se pierde la
simplicidad de tener los ocho secretos en un archivo, y aparece el problema de
verdad, que es la custodia: qué pasa si el comprador pierde su secreto. Eso es
**ADR-012** (*Modelo de billeteras: custodial vs autocustodia*, en estado
`propuesta`), y no se decide acá.

**El formato de los artefactos: JSON con strings decimales → hexadecimal, o un
binario.** Decimal es lo que espera snarkjs y lo que se lee de un vistazo contra la
salida de los scripts; hexadecimal es lo que hablan los contratos y evitaría una
conversión en T09. Cambiarlo toca `scripts/organizador.mjs:157` y a todo el que lea
esos archivos, que hoy es nadie y desde T06 son tres. Si se cambia, conviene que
sea antes de T06.

**El árbol: completo → disperso (SMT).** Un árbol disperso permite altas y bajas sin
recalcular todo, y prueba también la *no* pertenencia, que sirve para listas negras.
A cambio cuesta más por nivel, el organizador tendría que mantener una estructura en
vez de un array, y el circuito cambia entero. Es la alternativa a mirar si el TPF
decide que el padrón tiene que ser actualizable en vivo.

## 5. Probalo vos

Desde la raíz del repo:

```bash
npm run organizador
```

Tarda alrededor de un segundo. Salida real, tal como quedó el 2026-09-23:

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

Volvé a correrlo: los ocho compromisos y la raíz son idénticos. Eso es el
determinismo, y es lo que permite que las mediciones de más adelante se puedan
comparar entre sí.

Ahora corré el mismo comando con otro evento:

```bash
npm run organizador -- --scope 1235
```

Los compromisos y la raíz son los mismos: ni el secreto ni el árbol dependen del
evento. Lo único que cambia es el `scope` que queda escrito en `datos/arbol.json` y
en `datos/raiz.json`. Dónde entra realmente el scope es en el nulificador
—`Poseidon(secreto, scope)`—, que esta tarea no calcula: es T06.

**Rotura deliberada: un secreto fuera del campo.** El flag `--romper rango` le suma
`p` al secreto de la posición 3. Poseidon lo reduciría en silencio y produciría
exactamente el mismo compromiso que el secreto original; sin la validación, la
corrida terminaría bien y con un árbol que tiene dos identidades distintas que
comparten nulificador:

```bash
npm run organizador -- --romper rango
```

```
Organizador v0 - parte base (fuente JSON)

  fuente de raiz    json (datos/raiz.json)
  scope del evento  1234
  semilla           tpf211-hito1-parte-base
  profundidad       3 (8 identidades)

VALOR INVALIDO:
secreto de la posicion 3: el valor esta fuera del campo.
  valor    35643682154966047156268696500342295500339131112703318788563628848613638807758
  p        21888242871839275222246405745257275088548364400416034343698204186575808495617
  valor%p  13755439283126771934022290755085020411790766712287284444865424662037830312141
  Poseidon lo reduciria en silencio: este valor y 13755439283126771934022290755085020411790766712287284444865424662037830312141 producirian
  el mismo compromiso y el mismo nulificador. Ver docs/04-organizador.md.
```

El comando sale con código 1 y no escribe ningún artefacto. Para ver qué pasaría
sin la defensa, comentá la línea `scripts/organizador.mjs:67` y volvé a correrlo
con el flag: termina con éxito, imprime una raíz, y el compromiso de la posición 3
es el mismo de siempre. Nada avisa. Ese es exactamente el tipo de bug que esta
validación existe para que no ocurra. Restaurá la línea.

**Segunda rotura: la fuente que devuelve cero en vez de `null`.** En
`fuentes/json.mjs:57`, que es la línea que contesta cuando se pregunta por un
evento que no es el publicado, cambiá

```js
      if (documento.scope !== scope.toString()) return null;
```

por

```js
      if (documento.scope !== scope.toString()) return 0n;
```

Corré `npm run organizador`. El primer control sigue pasando —la raíz del evento
1234 es la que se acaba de publicar— pero el segundo falla y el comando sale con
código 1:

```
  leerRaiz(otro scope) == null        NO (devolvio 0)

ORGANIZADOR NO VALIDADO.

  - la fuente devolvio una raiz para un scope que no se publico
```

Es la simulación de lo que va a hacer un `mapping` de Solidity vacío en T09.
Importa porque un 0 que se cuela como raíz no rompe nada visible: el prover
generaría pruebas contra un árbol que no existe, y recién fallarían en la puerta.
Restaurá el `null`.

## 6. Qué NO hace

**No hay compradores, y el organizador conoce todos los secretos.** Es *la*
limitación de la parte base y conviene decirla sin adornos: en esta versión el
organizador genera los ocho secretos, los escribe en `datos/secretos.json` y podría
generar la prueba de cualquiera de las ocho identidades. Un organizador que conoce
los secretos puede hacerse pasar por cualquiera de sus compradores, así que la
privacidad frente a él es **cero**. Lo único que esta versión demuestra es el
mecanismo: que un árbol de compromisos y un camino alcanzan para probar pertenencia
sin decir cuál.

Eso cambia en **T12**, y ese es el punto de toda la escalera: cada comprador va a
generar su secreto localmente y a enviar solo su compromiso desde su propia cuenta,
el organizador va a armar el árbol con los compromisos que llegaron, y no va a
conocer ningún secreto. El archivo `datos/secretos.json` deja de existir. Todo lo
demás —el circuito, el prover, los validadores, la interfaz— queda igual.

**No autentica nada del padrón.** `datos/arbol.json` y `datos/raiz.json` son
archivos locales que cualquiera edita con un editor de texto. Una raíz inventada en
`datos/raiz.json` es tan válida como la buena, y una prueba generada contra un árbol
que armó un atacante verifica perfectamente. Que la raíz sea *la del evento* es lo
que resuelve `RegistroDeRaiz.sol` en T09, publicándola on-chain. Hasta entonces, la
confianza en la raíz es confianza en el sistema de archivos.

**No genera ni verifica ninguna prueba, y no calcula ningún nulificador.** El
`scope` viaja en los artefactos y ahí termina su trabajo en esta tarea. La prueba es
T06 y la lista de nulificadores es T07.

**No ata la hoja a nada del mundo real.** El compromiso es `Poseidon(secreto)` y
nada más: no hay ninguna relación entre una hoja y un NFT, una billetera o un pago.
Hoy cualquiera que conozca un secreto del padrón prueba pertenencia, sea o no el
comprador. Esa relación la construyen T11 y T12.

**No resuelve altas ni bajas.** El árbol se arma una vez y se publica. Agregar un
comprador cambia la raíz, y cambiar la raíz invalida los caminos que ya repartió.
Un evento real vende entradas durante semanas, así que esto es una simplificación
grande, y la alternativa —un árbol disperso, o publicar una raíz nueva por tanda—
está en la sección 4.

**No dice nada sobre la custodia del secreto.** Qué pasa si el comprador lo pierde,
si se lo roban, o si lo comparte con alguien para que entre en su lugar, es el
frente de **ADR-012** (*Modelo de billeteras: custodial vs autocustodia*, en estado
`propuesta`). Acá el secreto es un número en un archivo.

**El conjunto de anonimato es de 8 personas.** Está explicado en la sección 3. Se
engancha con **ADR-001** (*Claim de privacidad*, `aceptada` con revisión
pendiente), que ya acota el claim por esta razón. Esta PoC **no aporta evidencia**
sobre el tamaño de conjunto de un evento real: lo ilustra, que es otra cosa.

Y la distinción que este proyecto se debe en cada documento: de todo lo que hace el
organizador, **nada es ZK**. Armar un árbol de hashes y publicar una raíz es lo que
haría cualquier sistema con NFT para probar que una entrada es auténtica. Lo único
que aporta el ZK aparece en T06, cuando alguien demuestre que su hoja está en este
árbol sin decir cuál es. El organizador solo prepara el terreno para que eso sea
posible.
