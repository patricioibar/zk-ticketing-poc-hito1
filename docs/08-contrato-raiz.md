# Contrato de raíz

## 1. Qué hace

`RegistroDeRaiz.sol` es un contrato de dos funciones que guarda, para cada evento,
la raíz del árbol de compromisos: `setRaiz` la escribe y `getRaiz` la lee. El
organizador la publica con una transacción de verdad, que cuesta **69.917 de gas**
en la cadena local; el prover y el provisionador de puertas la leen gratis. Nada
más del sistema sube a la cadena: ni el secreto de un comprador, ni la prueba, ni
el nulificador.

Del lado de JavaScript, `fuentes/contrato-raiz.mjs` es una implementación más de la
interfaz `fuenteDeRaiz` que definió T05. Enchufarla es todo el cambio: las siete
demostraciones de T08 pasan contra la raíz que vive en el contrato sin que el
prover, el validador ni el organizador cambien de comportamiento.

## 2. Cómo lo hace

Son siete archivos nuevos y un puñado de líneas modificadas. Se leen en el orden en
que corre una publicación: primero el contrato, después la fuente que lo llama,
después la plomería que hace que la cadena esté ahí cuando hace falta.

### El contrato

`contratos/RegistroDeRaiz.sol:27` declara la estructura que se guarda por evento:

```solidity
struct Publicacion {
    uint256 raiz;
    uint8 profundidad;
    bool publicada;
}
```

El campo `publicada` es la razón de ser del struct y no una comodidad. Un `mapping`
de Solidity no tiene el concepto de "clave ausente": devuelve el valor cero del tipo
para cualquier clave que no se escribió. Como `0` es un elemento de campo
perfectamente válido, sin esa bandera "este evento no publicó raíz" y "la raíz de
este evento es 0" son el mismo dato. La sección 3 explica por qué eso no es
hipotético.

`contratos/RegistroDeRaiz.sol:34` fija al organizador como `immutable`: es la
cuenta que desplegó el contrato, y `:53` es la línea que hace que sea la única que
puede escribir. `:54` y `:57` validan el rango contra `P`, la constante de
`:20` —el mismo número que `lib/campo.mjs` llama `P`—. `:57` rechaza una raíz
`>= P` y **no** rechaza una raíz igual a 0: son dos cosas distintas y confundirlas
es el error que este contrato existe para no cometer.

`contratos/RegistroDeRaiz.sol:60` escribe, y `:61` emite el evento. El storage
guarda la última publicación; el log las guarda todas, incluidas las que pisan una
raíz anterior.

`contratos/RegistroDeRaiz.sol:69` es `getRaiz`, y es `view`: no modifica nada. Eso
es lo que permite llamarla sin transacción, y es la mitad del punto de esta tarea.
Devuelve las tres cosas juntas —`raiz`, `profundidad`, `publicada`— porque quien
pregunta necesita las tres para decidir.

### La fuente

`fuentes/contrato-raiz.mjs:33` arma la conexión una sola vez, al construir la
fuente: levanta la cadena si está baja, compila si el `.sol` cambió y despliega si
en esa cadena no hay contrato. De ahí en más, los tres métodos son llamadas.

`fuentes/contrato-raiz.mjs:53` es la escritura:

```js
const tx = await contrato.setRaiz(scope, raiz, profundidad);
const recibo = await tx.wait();
```

Dos líneas y dos cosas distintas. La primera **firma y manda** la transacción; la
segunda **espera** a que entre en un bloque. Sin el `await tx.wait()` el comando
seguiría antes de que la raíz esté escrita, y la comprobación de ida y vuelta que
hace el organizador tres líneas después leería el estado anterior. En la cadena
local la espera es de milisegundos porque mina un bloque por transacción; en una
cadena de verdad son segundos, y ahí la diferencia entre mandar y esperar deja de
ser sutil.

`fuentes/contrato-raiz.mjs:69` devuelve `{ referencia }`, que es lo que la interfaz
pide. Para esta implementación la referencia es el hash de la transacción: es lo que
permite ir a buscar esa publicación y ver quién la mandó, cuándo y con qué valor.

`fuentes/contrato-raiz.mjs:72` es la lectura, y son tres líneas que valen por toda
la tarea:

```js
const [raiz, , publicada] = await contrato.getRaiz(scope);
if (!publicada) return null;
return exigirEnCampo(BigInt(raiz), `leerRaiz: raiz del contrato para el scope ${scope}`);
```

La decisión de devolver `null` la toma el **booleano**, nunca el valor. Es la regla
3 de la interfaz (`docs/04-organizador.md`, sección 3) aplicada al caso concreto
para el que fue escrita.

### Quién elige la implementación

`fuentes/seleccion.mjs` es un archivo nuevo, y que haya hecho falta crearlo es un
hallazgo de esta tarea, no una decisión de diseño: está contado en la sección 3.
`fuentes/seleccion.mjs:28` lee la variable de entorno `FUENTE` —`contrato` por
defecto, `json` para volver a la fase 1— y devuelve la implementación que
corresponda. El organizador, el prover y el provisionador de puertas piden
`fuenteDeRaiz()` y no saben cuál les tocó.

### La cadena

`lib/cadena.mjs` es la plomería, y no habla con el contrato: solo se ocupa de que
la cadena exista.

`lib/cadena.mjs:59` (`cadenaViva`) pregunta `eth_chainId` por HTTP con un timeout
corto. La pregunta se le hace al nodo y no al sistema operativo a propósito: un pid
guardado en un archivo puede ser de un proceso que ya murió o, peor, de otro
proceso que recicló el número. Lo único que importa es si hay alguien contestando
JSON-RPC en el puerto.

`lib/cadena.mjs:98` arranca el nodo. Lanza `node node_modules/hardhat/dist/src/cli.js
node --port 8545` en vez de `npx hardhat node` porque en Windows `npx` mete un
`cmd.exe` en el medio y el pid que queda es el del shell, no el del nodo: sin el pid
de verdad no hay forma de bajarlo después. El proceso queda `detached` y con
`unref()`, así que sobrevive al comando que lo arrancó.

`lib/cadena.mjs:121` borra `cadena/despliegue.json` cada vez que arranca un nodo
nuevo. Un nodo de Hardhat guarda su mundo en memoria: cuando el proceso muere, el
contrato y todas las raíces se van con él, y un archivo que siga apuntando a la
dirección vieja es peor que no tener archivo.

`lib/cadena.mjs:138` baja el nodo con `taskkill /T /F` en Windows. La rama de
`process.kill(pid, "SIGTERM")` es para los otros sistemas: en Windows no hay
SIGTERM, y matar el proceso padre deja vivos a los hijos.

`lib/cadena.mjs:202` (`clientes`) arma un único proveedor y un único firmante por
proceso, con `cacheTimeout: -1`. Ese parámetro apaga el caché interno de ethers y
no es cosmético: con el caché puesto, dos transacciones seguidas salen con el mismo
nonce y la segunda muere con `nonce has already been used`. Está contado en la
bitácora, porque costó una vuelta entenderlo.

`lib/cadena.mjs:222` (`asegurarDespliegue`) es idempotente y desconfiado: si el
archivo dice que hay un contrato en tal dirección, `:231` comprueba con
`getCode` que en **esta** cadena haya código ahí antes de creerle. Una llamada a
una dirección sin código no falla: devuelve vacío, y el síntoma aparecería mucho
después.

### Lo que cambió en los scripts que ya existían

Seis líneas en tres archivos, todas de la misma forma: donde decía
`import { fuenteJson } from "../fuentes/json.mjs"` ahora dice
`import { fuenteDeRaiz } from "../fuentes/seleccion.mjs"`, y donde decía
`const fuente = fuenteJson({ ... })` ahora dice `const fuente = await fuenteDeRaiz()`.
Son `scripts/organizador.mjs:17` y `:92`, `scripts/prover.mjs:21` y `:144`, y
`scripts/provisionar-puerta.mjs:18` y `:89`. Ninguna lógica cambió. Por qué esas
seis líneas existen —y por qué son un problema y no un detalle— está en la sección 3.

`scripts/demostraciones.mjs` suma dos llamadas: reinicia la cadena en la preparación
y la baja al terminar, para que `npm test` siga siendo un solo comando y siga dando
lo mismo corrido dos veces seguidas. Los siete casos no se tocaron.

## 3. Por qué está hecho así

### Cuál es la porción mínima que tiene que estar on-chain

La raíz, y nada más. Vale la pena decirlo al revés, porque es lo que el jurado va a
preguntar: **qué cosas deliberadamente no están** en el contrato y por qué.

**El secreto no sale del teléfono.** Es lo único que prueba que una hoja es tuya. Si
estuviera en la cadena, cualquiera podría generar la prueba de cualquiera, y todo el
mecanismo se cae. No es que sea caro: es que no existe ninguna versión del sistema
donde el secreto salga del dispositivo del comprador.

**La prueba no toca la cadena.** Verificar Groth16 on-chain se puede —es T10, y es
opcional— pero acá no hace falta: el que verifica es el molinete, offline, con su
copia de la verification key. Poner la prueba en la cadena costaría gas, exigiría
conexión en la puerta y no agregaría ninguna garantía que el molinete no tenga ya.

**El nulificador tampoco.** Este es el caso interesante, porque es el que parece que
debería estar. Un registro on-chain de nulificadores resolvería de una el problema
que demuestra el caso 3 de T08: dos puertas sin canal entre ellas dejan pasar la
misma entrada dos veces. Y el precio sería exactamente el claim de privacidad que
esta PoC existe para sostener. El nulificador es determinista por evento: publicarlo
convierte el registro en la lista pública de quiénes entraron y a qué hora, y hace
vinculable lo que la prueba se ocupó de no vincular. Que ese trade-off sea real, y
que no lo resuelva "más ZK", es el frente **ADR-009** del TPF.

Queda la raíz. Y queda porque es lo único que necesita **autoridad**: el molinete
tiene que poder decir "esta prueba es contra el árbol del evento" y no "contra un
árbol". `docs/04-organizador.md`, sección 6, lo decía sin vueltas: mientras la raíz
vive en `datos/raiz.json`, una raíz inventada es tan válida como la buena, y una
prueba generada contra un árbol que armó un atacante verifica perfectamente. Es lo
que demuestra `npm run ataque:raiz-propia`. El contrato no cambia la criptografía:
cambia de dónde sale el número con el que se compara.

Los compromisos del padrón podrían estar on-chain y **no lo están**: el prover los
necesita para armar su camino, pero ponerlos en la cadena solo agregaría costo. Eso
cambia en T12, no porque haga falta publicarlos, sino porque ahí los originan los
compradores y la cadena es el lugar donde cada uno manda el suyo.

### Qué significa que leer sea gratis y escribir cueste

Son dos operaciones que se parecen en el código y no se parecen en nada abajo.

**Leer** es un `eth_call`: le pedís a *un* nodo que ejecute la función sobre su copia
del estado y te conteste. No hay firma, no hay transacción, no hay bloque, no hay
nada que propagar y no hay nadie a quien cobrarle. El nodo gasta su CPU y ya. Por eso
el prover y el provisionador de puertas leen la raíz sin pagar un centavo, y por eso
`npm run contrato:medir` informa cero gas y cero bloques producidos por la lectura.

**Escribir** es una transacción: la firmás, la mandás, la validan todos los nodos de
la red, y el resultado queda guardado para siempre en el estado de todos. El gas es
el precio de esa redundancia. Medido en la cadena local, publicar una raíz da:

| Operación | Gas |
|---|---|
| Desplegar el contrato (una sola vez) | 429.921 |
| **Publicar la raíz de un evento nuevo** | **69.917** |
| Pisar esa raíz con otra | 32.905 |
| Volver a publicar exactamente la misma raíz | 30.105 |
| La misma lectura, si fuera una transacción | 26.548 |

Los números salen de transacciones reales; el comando que los produce es
`npm run contrato:medir`. Las tres filas de escritura difieren en una sola cosa, y
es lo que hay que entender: **estrenar un casillero de storage cuesta mucho más que
cambiarlo**. Escribir un valor distinto de cero en un casillero que valía cero son
20.000 de gas (`SSTORE_SET_GAS`, [EIP-2200]); cambiar uno que ya tenía algo son 2.900
(`SSTORE_RESET_GAS` ajustado por [EIP-2929]); dejarlo como estaba, 100. Además, el
primer acceso a un casillero en una transacción paga 2.100 de recargo por "frío"
(`COLD_SLOAD_COST`, [EIP-2929]).

La cuenta cierra, y cierra al gas. `Publicacion` ocupa dos casilleros —`raiz` en
uno, `profundidad` y `publicada` empaquetados en el otro—. Con los datos de la
llamada cobrados a 16 por byte distinto de cero y 4 por byte en cero ([EIP-2028]):

| Fila | Base | Datos | Los dos casilleros | Resto |
|---|---|---|---|---|
| Publicar una raíz nueva (69.917) | 21.000 | 868 | 2 × (20.000 + 2.100) = 44.200 | 3.849 |
| Pisar esa raíz con otra (32.905) | 21.000 | 856 | (2.100 + 2.900) + (2.100 + 100) = 7.200 | 3.849 |
| Republicar la misma (30.105) | 21.000 | 856 | (2.100 + 100) × 2 = 4.400 | 3.849 |

El **resto es idéntico en las tres filas**, y eso es la comprobación de que la cuenta
está bien: son el evento que se emite y las instrucciones que ejecuta la función, que
no dependen de en qué estado estaba el storage. Todo lo que varía está en la columna
de los casilleros. Los 12 de diferencia en la columna de datos salen de que las dos
raíces usadas no tienen la misma cantidad de bytes en cero —una los tiene todos
distintos de cero y la otra tiene uno—, y 16 − 4 = 12.

Las dos diferencias que importan se leen directo de la tabla. Entre pisar y
republicar hay exactamente 2.800, que es `SSTORE_RESET_GAS` menos el costo de dejar
el casillero como estaba: 2.900 − 100. Y entre estrenar y pisar hay 37.000 en los
casilleros, que es todo lo que cuesta que un dato pase de no existir a existir.

La lectura de la última fila es lo que **no** se paga. Que `getRaiz` costaría 26.548
si fuera una transacción y cuesta 0 porque no lo es, es la diferencia entera entre
las dos mitades del sistema: **paga el organizador, una vez por evento; no paga
nadie más, nunca**. Cada comprador que arma su prueba y cada puerta que se
provisiona consultan la raíz gratis.

Un aviso de rigor: estos números son de la cadena local de Hardhat, que implementa
las mismas reglas de gas que la red principal pero **no tiene precio**. El gas es una
unidad de trabajo, no de plata: cuánto sale en pesos depende del `gasPrice` de la red
donde se despliegue, que acá no se mide y no se puede estimar honestamente. Lo que
esta medición sostiene es la comparación entre operaciones, no un costo.

### Por qué la bandera `publicada` y no un "si es 0 es que no hay"

Porque `0` es un elemento de campo válido, y la interfaz ya lo tenía anotado como
regla 3 desde T05. Lo que esta tarea agrega es que dejó de ser una precaución
teórica: `npm run contrato:medir` lo comprueba de los dos lados. Pide la raíz de un
evento que no existe y el `mapping` contesta `raiz=0, publicada=false`, que la fuente
traduce a `null`; y después publica una raíz que **vale 0** y comprueba que
`leerRaiz` devuelva `0n` y no `null`.

Las dos mitades importan, y la segunda es la que se olvida. Una implementación que
se defienda haciendo `if (raiz === 0n) return null` pasa el primer control y rompe el
segundo: un evento cuya raíz sea 0 no tendría raíz aunque acabe de publicarla. Con un
árbol de compromisos Poseidon la probabilidad de que la raíz dé exactamente 0 es
despreciable, pero "despreciable" no es "imposible", y el hábito de tratar el cero
como ausencia es el que produce esa clase de bug.

El organizador ya tenía el control puesto desde T05 (`scripts/organizador.mjs:213`),
y `docs/04-organizador.md` decía textualmente que era el que iba a atrapar a la
implementación de T09. Lo atrapó: la rotura deliberada de la sección 5 lo muestra.

### Por qué solo el organizador puede escribir

Sin esa línea, cualquiera podría publicar la raíz de cualquier evento, y el contrato
no sería más confiable que `datos/raiz.json`: pasaríamos de un archivo que cualquiera
edita a un contrato que cualquiera escribe. La restricción es lo que convierte a la
raíz en un dato **con autoridad**.

Y acá conviene ser preciso con la distinción que el proyecto se debe en cada
documento: esto **no es ZK**. Que haya una sola cuenta autorizada a publicar, que la
publicación quede registrada y que nadie pueda cambiarla sin dejar rastro es lo que
da cualquier contrato. Lo que da el ZK sigue siendo una sola cosa: que la puerta no
pueda saber cuál de los ocho compradores es el que está entrando. El contrato no
aporta nada a eso. Aporta que el árbol contra el que se prueba sea el árbol del
evento, que es un problema distinto y anterior.

### Por qué se puede pisar una raíz

`setRaiz` permite publicar dos veces para el mismo evento. La alternativa
—revertir si el evento ya tiene raíz— es más fuerte y tiene su atractivo, pero
rompe algo concreto: un evento real vende entradas durante semanas y cada tanda
nueva cambia la raíz, así que un registro de una sola escritura por evento obliga a
inventar un evento por tanda. También haría que `npm test` no se pudiera correr dos
veces sin reiniciar la cadena.

El precio de permitirlo es que el organizador puede cambiar la raíz debajo de los
pies de una entrada ya vendida, y eso es un poder real que el contrato no limita. Lo
que sí hace es **dejar rastro**: `contratos/RegistroDeRaiz.sol:61` emite un evento en
cada publicación, así que el log tiene la historia completa aunque el storage tenga
solo la última. Quién debería poder cambiar la raíz de un evento en curso, y con qué
aviso, es una decisión de diseño del TPF y no de esta PoC: queda anotada como
candidata a ADR en la bitácora.

### La falla de diseño que encontró esta tarea

El criterio de T09 era que la suite de T08 pasara **cambiando solo la fuente**. Pasa,
pero no fue gratis: hubo que tocar seis líneas en tres scripts que el plan daba por
intocables. Vale la pena decir exactamente por qué, porque el diagnóstico es más útil
que el parche.

La interfaz `fuenteDeRaiz` definía muy bien el **contrato**: qué métodos hay, qué
tipos entran y salen, qué se devuelve cuando no hay nada, que los errores se tiran.
Lo que no definía era el **mecanismo de selección**. Cada consumidor hacía
`import { fuenteJson } from "../fuentes/json.mjs"` por su cuenta, así que la
implementación no estaba enchufada: estaba soldada, en tres lugares. Cambiar de
fuente no era cambiar una pieza, era editar tres archivos —y `docs/04-organizador.md`
lo decía sin darse cuenta de que era un problema: "toca un archivo nuevo en
`fuentes/` y una línea en `scripts/organizador.mjs`".

Una pieza intercambiable que obliga a editar a todos sus usuarios no es
intercambiable. `fuentes/seleccion.mjs` es la indirección que faltaba: un solo lugar
que sabe qué implementaciones hay y cuál se usa. Con ella puesta, T12 va a agregar
`fuentes/contrato-nft.mjs` y una línea en `seleccion.mjs`, y esta vez sí va a ser
cierto que no se toca nada más.

Las seis líneas fueron dos por archivo: el `import` y la construcción de la fuente
(que además pasó a ser `await`, porque conectarse a una cadena no puede ser
síncrono, que es justamente lo que la regla 2 de la interfaz anticipaba). Se
mantuvieron los números de línea de los tres archivos para no romper las citas de
`docs/04-organizador.md` y `docs/05-prover.md`. La séptima línea, en
`scripts/organizador.mjs:89`, es cosmética: el encabezado decía "(fuente JSON)" y
ahora no nombra ninguna, porque el script no sabe cuál le tocó.

### Por qué Hardhat 3 y qué cambió al pasar

Hardhat 2.29.1 estaba clavado en `package.json` por una sola razón, escrita en
`docs/00-entorno.md`: Hardhat 3 pide Node 22.13.0 o posterior y la máquina tenía Node
20.19.2. Patricio actualizó a Node v24.21.0, así que el motivo desapareció y el
proyecto pasó a **Hardhat 3.17.0**, clavado igual que el resto.

Hardhat 3 no es compatible hacia atrás con la configuración de Hardhat 2, y las dos
cosas que cambiaron se descubrieron corriendo la herramienta, no leyendo:

- La configuración se exporta con `defineConfig` desde `hardhat/config`
  (`hardhat.config.js:9`), en vez de exportar un objeto plano.
- Hardhat 3 solo busca `hardhat.config.ts` o `hardhat.config.js`. No mira `.mjs`:
  con el archivo llamado `hardhat.config.mjs`, `npx hardhat` contesta
  `Error HHE3: No Hardhat config file found`. Como `CONTEXTO.md` descarta
  TypeScript, la única opción es `.js`, y para que un `.js` pueda usar `import` el
  `package.json` tiene que declarar `"type": "module"`.

Ese último punto revierte una decisión de T01. `docs/00-entorno.md` explicaba que no
se declaraba `"type": "module"` porque Hardhat 2 esperaba un config en CommonJS y
habría habido que renombrarlo a `.cjs`: "menos piezas raras que justificar en T09".
Con Hardhat 3 el razonamiento se da vuelta —ahora la pieza rara es no declararlo— y
el cambio no rompe nada porque en el repositorio no hay ningún archivo `.js` fuera
del config: todo el código es `.mjs` explícito, como pide `CONTEXTO.md`.

### Por qué Hardhat solo compila y levanta la cadena

De todo Hardhat, esta PoC usa dos tareas: `compile` y `node`. El despliegue y las
llamadas al contrato las hace **ethers** directamente, contra
`http://127.0.0.1:8545`, con el artefacto compilado leído de `artifacts/`.

La alternativa era usar la API de Hardhat 3 desde Node —`hre.network.connect()`, los
plugins de toolbox, Ignition para desplegar—. Se eligió no hacerlo por dos razones.
La primera es que ethers ya estaba en el proyecto y el equipo lo va a usar igual en
la aplicación web: el código que Patricio lee acá es el mismo que va a escribir
después, y no una capa de conveniencia que solo existe adentro de Hardhat. La
segunda es que la API de Hardhat 3 es nueva y cambia; un `JsonRpcProvider` apuntando
a un puerto es la interfaz más estable que hay en Ethereum.

El precio está en la sección 4.

### Por qué la cadena se levanta y se baja desde los scripts

Porque si no, `npm test` deja de ser un comando y pasa a ser un instructivo: abrí una
terminal, levantá el nodo, dejala abierta, abrí otra, corré la suite. Eso se olvida,
y peor, se olvida a medias: un nodo que quedó de anteayer con las raíces de anteayer
hace pasar la suite por el motivo equivocado.

El arreglo tiene dos mitades. `fuentes/contrato-raiz.mjs` levanta la cadena si está
baja, así que cualquier comando suelto —`npm run organizador`, `npm run probar`—
funciona sin preparación. Y `scripts/demostraciones.mjs` la **reinicia** al empezar y
la baja al terminar, que es más fuerte: la suite tiene que correr contra una cadena
vacía para que la raíz que lee sea la que publicó el organizador de esta corrida, y
para que el gas de la primera publicación sea el de una primera publicación.

El costo de que la cadena viva en memoria: cuando el nodo muere, el contrato y todas
las raíces se van con él. Es una característica de la cadena de juguete, no de una
cadena de verdad, y la sección 5 lo muestra.

## 4. Qué podrías cambiar

**El almacenamiento: dos casilleros → uno.** La raíz siempre es menor que `P`, que es
apenas menor que `2^254`, así que los dos bits de arriba de un `uint256` están
libres. Usar el bit 255 como bandera de "publicada" en vez de un campo aparte ahorra
estrenar un segundo casillero: unos 22.100 de gas en cada publicación de un evento
nuevo, casi un tercio del total. Se pierde legibilidad —leer la raíz pasa a ser
enmascarar— y se pierde la profundidad, que habría que guardar en otro lado o dar por
constante. Toca `contratos/RegistroDeRaiz.sol` entero y `fuentes/contrato-raiz.mjs:75`.
Es el ejemplo de manual de por qué el código de los contratos se ve como se ve.

**La política de escritura: pisar → una sola vez por evento, o con timelock.**
Revertir si el evento ya tiene raíz elimina el poder del organizador de cambiarla
debajo de una entrada vendida; un timelock —anunciar la raíz nueva y que entre en
vigencia N bloques después— lo conserva pero lo hace visible con anticipación. Se
pierde poder publicar por tandas sin inventar un evento nuevo, y `npm test` necesita
reiniciar la cadena en cada corrida. Toca `contratos/RegistroDeRaiz.sol:52` y, si hay
timelock, la interfaz entera, porque `leerRaiz` pasaría a tener que decir *cuál* raíz.

**El control de acceso: `immutable` → `Ownable` de OpenZeppelin, o roles.** Una sola
cuenta que no se puede cambiar es lo más simple y lo más frágil: si el organizador
pierde la clave, el evento se queda sin poder publicar. `Ownable` permite transferir,
`AccessControl` permite varias cuentas con el mismo rol, y un multisig permite exigir
dos firmas para publicar. `@openzeppelin/contracts` 5.6.1 ya está instalado. Toca
`contratos/RegistroDeRaiz.sol:34` y `:53`. Es la misma pregunta que **ADR-012** se
hace para los compradores, aplicada al organizador.

**La cadena: local → una testnet pública.** Un despliegue en Sepolia haría que la
raíz sea verificable por alguien que no tiene el repositorio, que es la mitad de lo
que significa "publicar". Se gana realismo y se gana un número de gas con precio
real; se pierde que `npm test` sea un comando que corre sin conexión y sin fondos, y
aparece la necesidad de manejar una clave privada de verdad, que es exactamente lo
que esta PoC evita tener. Toca `hardhat.config.js` (una red `type: "http"`),
`lib/cadena.mjs:35` y la forma de conseguir la clave, que no puede quedar en el repo.

**El acceso a la cadena: ethers directo → la API de Hardhat 3.**
`hre.network.connect()` y los plugins de toolbox dan tests en Solidity, helpers de
red (avanzar bloques, manipular el tiempo) e Ignition para despliegues reproducibles
con estado. Se gana todo eso y se pierde que el código sea el mismo que va a correr
en la aplicación web. Toca `lib/cadena.mjs` entero. Conviene mirarlo si T10 —el
verificador Groth16 on-chain— termina necesitando tests de contrato en serio.

**La fuente: `contrato-raiz.mjs` → `contrato-nft.mjs`.** Es T12, y es el escalón que
sigue. El contrato de entradas va a **originar** los compromisos —`leerCompromisos`
va a dejar de devolver `null`— y el organizador va a armar el árbol con los que
enviaron los compradores en vez de inventarlos. Ahora que existe
`fuentes/seleccion.mjs`, toca un archivo nuevo en `fuentes/` y una línea en
`fuentes/seleccion.mjs:33`. Nada más.

## 5. Probalo vos

Desde la raíz del repo. La primera vez, `npm install` y `npm run setup`.

### El camino completo

```bash
npm run cadena:abajo      # por si habia una de antes
npm run organizador
npm run cadena:estado
npm run probar -- --identidad 3
npm run puerta:provisionar -- --puerta 1
npm run validar -- --puerta 1 --prueba salidas/prueba.json
```

El organizador ahora arranca así:

```
Organizador v0 - parte base

  cadena local      levantada en http://127.0.0.1:8545 (pid 31452, chainId 31337)
  contrato          RegistroDeRaiz desplegado en 0x5FbDB2315678afecb367f032d93F642f64180aa3 (429921 gas)
  fuente de raiz    contrato (RegistroDeRaiz 0x5FbDB2315678afecb367f032d93F642f64180aa3 en http://127.0.0.1:8545)
```

y termina con la raíz publicada como hash de transacción en vez de ruta de archivo,
y con los dos controles de ida y vuelta de la interfaz en `si`:

```
  raiz publicada    0xdcb8901123d2a31b92721f78777199f299af8f12ba3e7beaac9388c537d68e11

  leerRaiz(scope) == raiz publicada   si
  leerRaiz(otro scope) == null        si
```

La dirección del contrato va a ser esa misma en tu máquina. No es casualidad ni está
escrita en ningún lado: la dirección de un contrato se deriva de quién lo despliega y
de cuántas transacciones mandó antes, y acá siempre es la cuenta #0 con nonce 0.

`npm run cadena:estado` muestra qué hay adentro:

```
  rpc               http://127.0.0.1:8545
  viva              si (chainId 31337, pid 31452)
  contrato          RegistroDeRaiz en 0x5FbDB2315678afecb367f032d93F642f64180aa3
  organizador       0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  (la unica cuenta que puede escribir)
  gas de desplegar  429.921

Raices publicadas en esta cadena  (1)

  scope                 gas      bloque  raiz
  74219528497784697916   70277       2  217428069206837197869151...
```

El scope es el de `evento-A` derivado a elemento de campo: hasta T11 el organizador
usaba `1234` por defecto y ahí decía `1234  69917`. El gas subió 360 por ese cambio y
por nada más: `1234` ocupa 30 bytes en cero de los 32 que se mandan, y este número no
tiene ninguno, a 16 − 4 = 12 de gas por byte. La tabla de la sección 3 sigue siendo la
de `npm run contrato:medir`, que publica sobre el scope `1234` y da 69.917. Por qué
cambió el default está en `docs/09-entrada-nft.md`, sección 2.

El prover y el provisionador imprimen ahora `fuente de raiz  contrato (...)` donde
antes decía `json (datos/raiz.json)`, y hacen exactamente lo mismo. El validador no
cambió ni una línea y sigue corriendo con la red bloqueada.

### El gas y los controles, de una

```bash
npm run contrato:medir
```

Reinicia la cadena, despliega, publica cuatro veces y corre los cinco controles del
contrato y de la interfaz. La tabla de gas está en la sección 3. Los controles:

```
  un scope sin publicar: el mapping devuelve 0...         OK     raiz=0, publicada=false
  ...y la fuente lo traduce a null                        OK     leerRaiz devolvio null
  una raiz que vale 0, publicada, se lee 0 y no null      OK     leerRaiz devolvio 0 (bigint)
  otra cuenta no puede publicar una raiz                  OK     revirtio con SoloElOrganizador(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
  una raiz >= p se rechaza on-chain                       OK     revirtio con FueraDelCampo(21888242871839275222246405745257275088548364400416034343698204186575808495617, 21888242871839275222246405745257275088548364400416034343698204186575808495617)
```

### La suite entera contra la raíz del contrato

```bash
npm test
```

Los siete casos de T08 dan lo mismo que daban con el archivo JSON, y en la
preparación aparece una línea nueva:

```
  estado borrado                      puertas/puerta-{demo-a1,demo-a2}/ y salidas/demostraciones/
  cadena reiniciada                   http://127.0.0.1:8545 (pid 36972, chainId 31337)
```

```
  7 de 7 casos dan lo esperado.
```

Corrélo dos veces seguidas: da lo mismo, y al terminar la cadena queda bajada.

### Rotura deliberada: bajá la cadena

```bash
npm run cadena:abajo
npm run probar -- --identidad 3
```

```
Prover / asistente - una prueba de pertenencia

  padron publico    datos/arbol.json (8 compromisos, profundidad 3)
  fuente de raiz    contrato (RegistroDeRaiz 0x5FbDB2315678afecb367f032d93F642f64180aa3 en http://127.0.0.1:8545)
  evento (scope)    7421952849778469791634643529725528999721210991605956451547960136850882987634
  identidad         3

La fuente no tiene ninguna raiz publicada para el scope 7421952849778469791634643529725528999721210991605956451547960136850882987634.
Corre primero:  npm run organizador -- --scope 7421952849778469791634643529725528999721210991605956451547960136850882987634
```

(El scope es el de `evento-A`: el prover lo toma de `datos/arbol.json` cuando no se le
pasa ninguno.)

Vale la pena mirar bien lo que pasó. El comando **sí** levantó una cadena y **sí**
desplegó el contrato —por eso imprime la dirección, y es la misma de siempre— pero es
una cadena nueva: el contrato está vacío y no hay ninguna raíz. El estado de un nodo
de Hardhat vive en memoria y muere con el proceso. En una cadena de verdad esto no
pasa, y esa es justamente la diferencia que la PoC no puede demostrar.

Ahora, sin volver a levantar nada:

```bash
npm run validar -- --puerta 1 --olvidar
npm run validar -- --puerta 1 --prueba salidas/prueba.json
```

Da `PASE`. Sin cadena, sin nodo y sin red: la puerta se provisionó antes y tiene la
raíz guardada. Eso es ADR-002 —validación offline— y el contrato no lo cambió en nada.

### Segunda rotura: la que `docs/04-organizador.md` anunció

En `fuentes/contrato-raiz.mjs:76`, cambiá

```js
      if (!publicada) return null;
```

por

```js
      if (!publicada) return BigInt(raiz);
```

y corré `npm run organizador`:

```
  leerRaiz(scope) == raiz publicada   si
  leerRaiz(otro scope) == null        NO (devolvio 0)

ORGANIZADOR NO VALIDADO.

  - la fuente devolvio una raiz para un scope que no se publico
```

Es el control que T05 dejó puesto pensando exactamente en este momento. Sin él, la
fuente devolvería `0` para cualquier evento que no existe, el prover generaría
pruebas contra un árbol de raíz cero —que no es el árbol de nadie— y el error
aparecería recién en la puerta, como un rechazo sin explicación. Restaurá el `null`.

### Tercera rotura: publicá desde otra cuenta

En `lib/cadena.mjs:44`, cambiá `CLAVE_ORGANIZADOR` por la clave de la cuenta #1 de la
cadena local (`0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`),
bajá la cadena con `npm run cadena:abajo` y corré `npm run organizador`. Anda, y la
dirección del contrato es otra:

```
  contrato          RegistroDeRaiz desplegado en 0x8464135c8F25Da09e49BC8782676a84730C318bC (429921 gas)
```

Es otra porque la dirección se deriva de quién despliega. Y esa cuenta quedó grabada
como organizador. Ahora, **sin** bajar la cadena, volvé a poner la clave original y
corré el organizador de nuevo:

```
VM Exception while processing transaction: reverted with custom error
'SoloElOrganizador("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")'
```

La primera dirección es quien intentó escribir; la segunda, la única que puede. El
comando escupe además el volcado entero del error de ethers, porque
`scripts/organizador.mjs:234` solo resume los errores de rango y de tipo: un fallo
de la cadena no estaba previsto ahí, y se ve. Restaurá la clave y bajá la cadena.

## 6. Qué NO hace

**No verifica ninguna prueba.** El contrato guarda un número. Quién verifica Groth16
es el molinete, offline, con su copia de la verification key (T07). Hacerlo on-chain
es **T10**, que el plan marca como opcional, y que serviría para un caso distinto del
de la puerta: que un tercero cualquiera pueda comprobar una prueba sin tener la vkey.

**No resuelve el doble ingreso entre puertas.** Es el caso 3 de T08 y sigue abierto
exactamente igual. La sección 3 explica por qué un registro on-chain de nulificadores
lo resolvería y por qué el precio sería el claim de privacidad. Ese trade-off es el
frente **ADR-009** del TPF, y esta tarea no lo mueve.

**No ata la raíz a ningún NFT ni a ninguna entrada.** El contrato no sabe qué es una
entrada. Sigue sin haber relación entre una hoja del árbol y un token, una billetera
o un pago: eso es **T11** (`EntradaNFT.sol`) y **T12**.

**No hace que el organizador deje de conocer los secretos.** La limitación grande de
la parte base no se toca: el organizador genera las ocho identidades, las escribe en
`datos/secretos.json` y podría generar la prueba de cualquiera. Que la raíz esté en
un contrato no cambia nada de eso. Lo cambia **T12**.

**No es una cadena.** Es un nodo en esta computadora, sin otros validadores, sin
consenso, sin costo y sin permanencia: se apaga y no queda nada. Las propiedades que
el documento le atribuye a la raíz publicada —que no se pueda cambiar sin dejar
rastro, que cualquiera pueda verificarla— son propiedades de una cadena con varios
participantes, y acá están **supuestas**, no demostradas. Lo que sí se demuestra es
el mecanismo: qué se guarda, qué cuesta, y qué no hace falta guardar.

**No mide ningún costo en plata.** El gas es trabajo, no dinero. Cuánto sale publicar
una raíz depende de la red y del momento, y esta PoC no tiene de dónde sacar ese dato.

**No aporta nada al claim de privacidad.** De todo lo que hace este contrato, nada es
ZK. Publicar una raíz con autoridad es lo que haría cualquier sistema con NFT para
probar que una entrada es auténtica, y lo haría igual sin una sola prueba de
conocimiento cero. Lo único que aporta el ZK sigue siendo que la puerta no sepa cuál
de los ocho compradores entró. El contrato hace que la comparación del chequeo 1 del
validador valga algo; no hace que sea privada.

---

[EIP-2200]: https://eips.ethereum.org/EIPS/eip-2200
[EIP-2929]: https://eips.ethereum.org/EIPS/eip-2929
[EIP-2028]: https://eips.ethereum.org/EIPS/eip-2028
