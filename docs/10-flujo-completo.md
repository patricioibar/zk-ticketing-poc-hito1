# Flujo completo con compradores

## 1. Qué hace

`npm run flujo` corre el sistema entero de punta a punta con ocho compradores de
verdad: el organizador emite ocho entradas NFT a ocho cuentas distintas, **cada
comprador deriva su secreto en su máquina y manda su propio compromiso firmando con
su propia billetera**, y recién entonces el organizador lee la cadena, arma el árbol
de Merkle con los compromisos que efectivamente llegaron y publica la raíz. Después,
una entrada se prueba y entra por una puerta.

El cambio de fondo es de una sola frase: **el organizador ya no conoce ningún
secreto**. En la parte base los generaba él, los ocho, y podía hacerse pasar por
cualquiera de sus compradores; ahora solo ve ocho números que no puede abrir, y la
única persona capaz de generar la prueba de una entrada es su dueño. La sección 3
explica qué se gana con eso y qué sigue sin estar resuelto.

Todo esto pasa **sin tocar el organizador, el prover ni los validadores**: lo único
que cambia es qué implementación de `fuenteDeRaiz` está enchufada. La suite de siete
casos de T08 pasa entera contra la fuente nueva, y esa es la prueba de que la
escalera que T05 diseñó y T09 empezó a subir era real.

## 2. Cómo lo hace

Dos archivos nuevos hacen el trabajo —`lib/compradores.mjs` y
`fuentes/contrato-nft.mjs`—, un tercero lo narra (`scripts/flujo-completo.mjs`) y el
resto son cuatro retoques a la plomería que ya existía.

### Los compradores: `lib/compradores.mjs`

Es el "afuera" del organizador, la parte del sistema que en la parte base no existía.

`lib/compradores.mjs:56` (`secretoDelComprador`) es la línea que justifica toda la
tarea:

```js
const { secreto } = secretoDeterminista(billetera.privateKey, "compromiso-de-entrada");
```

El secreto sale de la clave privada del comprador y de nada más. El organizador no
tiene esa clave, así que no puede derivar ese número, y sin ese número no hay prueba
posible. Compará con la parte base, donde la misma función `secretoDeterminista` se
llamaba desde `scripts/organizador.mjs:68` con una semilla que elegía el organizador:
ahí los ocho secretos eran suyos.

`lib/compradores.mjs:115` (`asegurarCompradores`) deja la cadena en estado de ser
leída, y no hace nada de lo que ya esté hecho. Por orden de ejecución:

- `:136` despliega `EntradaNFT` si hace falta, con `conectar({ nombre, args })`.
- `:149`–`:153` construyen los ocho compradores: una billetera por cuenta de prueba
  (la 1 a la 8; la 0 es el organizador), su secreto derivado y su compromiso
  `Poseidon(secreto)` calculado **de este lado**. Nada de esto viaja.
- `:157`–`:162` emiten los tokens que falten. Es lo único que hace el organizador, y
  lo paga él.
- `:166`–`:175` envían los compromisos. La línea que importa es `:171`,
  `contrato.connect(comprador.billetera)`: misma dirección de contrato, otra firma.
  Cada transacción la manda —y la paga— el dueño del token. `:168` comprueba antes si
  ese token ya envió, así que correr esto dos veces no intenta un segundo envío, que
  el contrato rechazaría.
- `:177` vuelve a leer lo que quedó en la cadena, que no es lo mismo que lo que se
  creía haber escrito.

`lib/compradores.mjs:66` (`compromisosEnCadena`) es el único lugar donde se decide el
orden de las hojas:

```js
const ordenados = [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
```

Se leen los logs del evento `CompromisoEnviado` y se ordenan por bloque y, dentro del
bloque, por índice del log. Ese par es el único orden total que la cadena define entre
dos transacciones. El organizador no elige nada: la hoja 0 es de quien llegó primero.
Por qué se eligió el orden de llegada y qué se paga por eso, en la sección 3.

`lib/compradores.mjs:83` (`guardarBolsa`) escribe `datos/secretos.json`. El archivo
tiene el mismo nombre que en la parte base y es una cosa completamente distinta: **no
lo escribe el organizador**. Son los ocho secretos de los ocho compradores, juntos en
un archivo porque esta PoC corre en una sola computadora, y el organizador ni lo
escribe ni lo lee. Quien lo lee es el prover, que es el asistente que corre del lado
de cada comprador. El campo `advertencia` del archivo lo dice, para que no se confunda
con el de antes.

### La fuente: `fuentes/contrato-nft.mjs`

Es la tercera implementación de `fuenteDeRaiz`, y lo único que cambia respecto de la
de T09 es un método:

| | `json.mjs` | `contrato-raiz.mjs` | `contrato-nft.mjs` |
|---|---|---|---|
| `leerCompromisos` | `null` | `null` | los que enviaron los compradores |
| `publicarRaiz` | un archivo | `RegistroDeRaiz` | `EntradaNFT`, que lo hereda |
| `leerRaiz` | un archivo | `RegistroDeRaiz` | `EntradaNFT`, que lo hereda |

`fuentes/contrato-nft.mjs:47` (`leerCompromisos`) devuelve el array de compromisos en
orden de llegada, y `:36` reusa los dos métodos de la raíz en vez de copiarlos: como
`EntradaNFT` hereda `RegistroDeRaiz`, la fuente de T09 sabe hablarle. La única
modificación que eso necesitó está en `fuentes/contrato-raiz.mjs:29`, un parámetro
`yaConectado` que evita volver a desplegar. Las reglas de la raíz —el rango contra
`P`, la bandera `publicada`, que escriba solo el organizador— siguen escritas en un
solo lugar.

`fuentes/contrato-nft.mjs:55` corta con un error si no hay ningún compromiso. Es
importante y no es obvio: devolver `null` sería decir "esta fuente no origina
compromisos", el organizador tomaría la rama de la parte base y **se inventaría ocho
secretos sin que nadie se entere**. Cero compromisos no es "no origino": es "todavía
no llegó ninguno".

`fuentes/seleccion.mjs:40` es la rama nueva: `FUENTE=contrato-nft`. Eso es todo lo que
hay que cambiar para subir el escalón.

### La línea que nunca cambió

`scripts/organizador.mjs:106` sigue diciendo exactamente lo que decía en T05:

```js
const compromisosDeLaFuente = await fuente.leerCompromisos(opciones.scope);
```

Desde esa línea, el `if` de `:109` toma por primera vez la rama que estaba escrita
desde la fase 1 y nunca se había ejecutado: si la fuente aportó compromisos, el
organizador no genera identidades, no escribe secretos y se limita a armar el árbol
y publicar la raíz. La salida lo dice sola:

```
  la fuente aporto 8 compromisos: el organizador no genera secretos
```

El prover, los validadores y el provisionador de puertas no se tocaron y no se
enteraron.

### El recorrido narrado: `scripts/flujo-completo.mjs`

`npm run flujo` corre los comandos de verdad —organizador, prover,
provisionar-puerta, validador— como procesos separados, igual que los correría una
persona, con `FUENTE=contrato-nft` en el entorno. Lo único que hace por su cuenta es
la parte que antes no existía: los compradores. Imprime la tabla hoja ↔ token ↔
billetera, y después comprueba cinco cosas de la venta, dos del organizador, una de
la puerta y cuatro de la reventa. Si alguna falla, sale con código 1.

`scripts/flujo-completo.mjs:236` es la reventa: el dueño del token 1 se lo transfiere
a una cuenta nueva, `:248` muestra que el comprador nuevo no puede poner su
compromiso, y después el **vendedor** genera su prueba y entra por una puerta. La
sección 3 explica por qué eso pasa.

### Lo que cambió en lo que ya existía

- `lib/cadena.mjs:222` (`asegurarDespliegue`) ahora toma `nombre` y `args`: un archivo
  de despliegue por contrato y argumentos de constructor, que la V1 no tenía y
  `EntradaNFT` sí. Es la generalización que `docs/09-entrada-nft.md` dejaba anotada
  como trabajo de T12. Los dos archivos se borran juntos cuando arranca o se baja un
  nodo (`limpiarDespliegues`, al final del módulo).
- `lib/cadena.mjs` suma `cuentaLocal(indice)`, las cuentas de prueba de la cadena
  local, que antes vivían adentro de `scripts/contrato-nft.mjs`.
- `fuentes/contrato-raiz.mjs:29` acepta `yaConectado`, como se explicó arriba.
- `contratos/EntradaNFT.sol:38`: un comentario que decía que el `tokenId` coincide con
  la posición de la hoja. No coincide, y este documento explica por qué. Cambiar un
  comentario cambió el gas de despliegue en 12 unidades; el porqué —y está
  comprobado— está en la sección 3 de `docs/09-entrada-nft.md`.
- `package.json` suma `flujo`.

## 3. Por qué está hecho así

### El salto: quién genera el secreto

Es el punto de la Variación 2 y conviene verlo en dos columnas.

| | Parte base (T05) | Con compradores (T12) |
|---|---|---|
| Quién genera el secreto | el organizador, de una semilla suya | cada comprador, de su clave privada |
| Dónde está el secreto | `datos/secretos.json`, que escribe el organizador | en la máquina de cada comprador |
| Quién arma la lista de hojas | el organizador, de la nada | la cadena: los ocho que enviaron |
| Qué puede hacer el organizador | generar la prueba de cualquiera | ninguna |
| Qué paga cada comprador | nada, no existe | 71.515 de gas, de su bolsillo |

La fila que importa es la cuarta. En la parte base, la privacidad frente al
organizador era **cero**: el que arma el evento tiene los ocho secretos, así que puede
generar la prueba de cualquier comprador y puede saber, mirando el nulificador que
usó la puerta, cuál de los ocho entró. Todo el mecanismo ZK funcionaba, pero
protegía a los compradores de todo el mundo menos de quien vende las entradas, que es
justo el que más interés tiene.

Con el flujo completo puesto, el organizador recibe ocho números de 254 bits y no
tiene forma de invertirlos: eso es lo que significa que `Poseidon` sea una función de
un solo sentido. Cuando la puerta acepta una prueba y anota un nulificador, el
organizador puede mirarlo todo lo que quiera; para saber de quién es tendría que poder
calcular `Poseidon(secreto, scope)` para algún secreto, y no tiene ninguno.

Lo que **no** cambia: el organizador sigue decidiendo a quién le emite una entrada, y
nada le impide emitirse una a sí mismo, mandar su propio compromiso y tener una hoja
propia en el árbol. Eso no le sirve para saber quién entró —su hoja es una más—, pero
sí para entrar él. Que el padrón se corresponda con las personas que pagaron es un
problema del contrato, no del ZK, y esta PoC no lo toca.

### Por qué el secreto se deriva de la clave privada y no es aleatorio

Un comprador de verdad tiraría 32 bytes al azar y los guardaría. Acá se deriva de la
clave privada de su billetera, y es una decisión con dos razones y un precio.

Las razones: la corrida entera es **reproducible** —los mismos ocho compromisos, el
mismo árbol y la misma raíz en cualquier máquina, cosa que esta PoC valora desde
T02—, y ningún comprador necesita guardar un archivo para no perder su entrada, que
es el problema de custodia de ADR-012 y no es de esta tarea.

El precio, dicho sin vueltas: **quien tenga la clave privada tiene el secreto**. Y en
esta PoC las claves privadas son las de la cadena local de Hardhat, que son públicas
y las imprime el nodo cada vez que arranca. Es decir: estos "secretos" no son
secretos. Lo que la corrida demuestra es el **recorrido de la información** —quién
calcula qué, qué viaja y qué no—, no su confidencialidad. Que el compromiso sea lo
único que sale de cada máquina es verificable mirando las transacciones; que el
secreto sea inaccesible para el organizador es, en esta PoC, un supuesto.

### Por qué la fuente rehace el mundo si la cadena se reinició

Construir `fuenteContratoNft` despliega el contrato, emite las entradas que falten y
manda los compromisos que falten. Un sistema real no hace nada de eso: las ocho
personas compraron una vez y la cadena se acuerda para siempre.

Está así porque un nodo de Hardhat guarda su mundo en memoria: cuando el proceso
muere, el contrato y los ocho compromisos se van con él, y `npm test` reinicia la
cadena en cada corrida a propósito, para que el gas de la primera escritura sea el de
una primera escritura. Sin esta reconstrucción, `npm test` contra esta fuente sería
dos comandos y un orden que hay que acordarse, y la promesa de que subir la escalera
es cambiar una variable de entorno se caería por un detalle de plomería.

Es el mismo criterio que `asegurarDespliegue` ya usaba desde T09 y tiene el mismo
costo honesto: **la fuente hace más de lo que la interfaz dice**. Separar las dos
cosas —un comando `compradores` aparte y una fuente que solo lee— está en la sección
4, y es lo que habría que hacer si esto fuera a crecer.

### El orden de las hojas: quién lo decide ahora

En la parte base, la hoja `i` era la identidad `i` porque el organizador las generaba
en orden. Ahora la hoja 0 es la del primero que mandó su transacción. La tabla que
imprime `npm run flujo` lo muestra sin que haya que creerlo:

```
  hoja  token  billetera del comprador                     compromiso            bloque
     0      5  0x976EA74026E726554dB657fA54763abd0C3a0aa9  5430403240636096370315...      10
     1      0  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  1074289276230625726229...      11
     2      7  0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f  1083251489194895969416...      12
```

El token 5 es la hoja 0. El orden de envío está salteado a propósito
(`lib/compradores.mjs:42`) para que la diferencia se vea; en el sistema real la
decidirían ocho personas comprando cuando se les da la gana.

Esto **contradice una recomendación escrita**. La regla 4 de la interfaz, en la
sección 3 de `docs/04-organizador.md`, dice que el orden del array es el orden de las
hojas y agrega: "Para un contrato, eso significa leerlos por índice de emisión, no por
el orden de un evento indexado". Acá se hizo lo contrario, y la razón es que lo que
esa regla protege —que dos lecturas del mismo estado den el mismo orden, porque si no
la raíz cambia y se rompen todos los caminos sin ningún error visible hasta la
puerta— se sigue cumpliendo: `(bloque, índice del log)` es un orden total y estable
sobre una cadena que no se reorganiza.

Lo que se gana leyendo por llegada es que el organizador no decide nada, ni siquiera
el orden. Como él es el que emite, leer por `tokenId` sería dejarlo elegir la posición
de cada persona en el árbol. No es que eso rompa el anonimato —la prueba no dice qué
hoja es—, pero es una decisión menos en sus manos y sale gratis.

Lo que se paga es fragilidad, y conviene decirlo: en una cadena de verdad los logs se
pueden reorganizar en los últimos bloques, un nodo podado puede no tenerlos y un
indexador puede devolverlos en otro orden. Leer por `tokenId` con `compromisoDe`
—que es storage, no log— no tiene ninguno de esos problemas. Cuál conviene depende de
cuándo se arme el árbol: si se arma después de un cierre de inscripción y con
confirmaciones suficientes, el orden de llegada es seguro. Es candidato a ADR.

### El dueño que nunca envía su compromiso

`npm run flujo -- --sin-enviar 5` monta exactamente ese caso: ocho entradas emitidas,
siete compromisos en la cadena. Alguien compró, tiene su NFT, y no mandó nada.

La respuesta corta sería "queda afuera del árbol". Lo que pasa de verdad es más
interesante: **no hay árbol**.

```
  el organizador no arma el arbol                       OK     salio con codigo 1
  y dice por que                                        OK     armarArbol: se esperaba una potencia de dos de hojas y llegaron 7.
                                                               Un arbol incompleto necesita una hoja de relleno definida, y eso es
                                                               una decision, no un default.
```

Siete hojas no son un árbol binario completo de profundidad 3, y el circuito compila
con profundidad 3 fija. La guarda de `lib/merkle.mjs:28` —que T05 puso justamente para
esto— corta antes de que el problema se vuelva invisible. Las salidas que hay, y
ninguna es gratis:

- **Rellenar** las hojas que faltan con un valor conocido (cero, o el hash de una
  constante). Es lo que hacen casi todos los sistemas de este tipo. El costo es que
  hay que elegir el relleno con cuidado: si el valor de relleno es un compromiso que
  alguien puede abrir, esa persona tiene entradas gratis.
- **Cerrar la inscripción**: el árbol se arma cuando se publica la raíz, y el que no
  mandó su compromiso a tiempo no entra. Es simple y es una política comercial, no
  técnica: hay que poder explicársela a alguien que pagó su entrada.
- **Un árbol más chico**, de la potencia de dos que dé. Cambia la profundidad, y la
  profundidad está compilada adentro del circuito: habría que tener un circuito por
  profundidad o compilar en el momento.

Esta tarea no elige ninguna, y tampoco puede: es una decisión del TPF, no de la PoC.
Queda como candidata a ADR, y engancha con el frente de altas y bajas (agregar un
comprador cambia la raíz y la raíz vieja queda inválida), que tampoco está resuelto.

Lo que sí deja claro el caso es que **el árbol puede tener menos hojas que entradas
emitidas**, y que las dos cifras no son la misma cosa: `emitidos()` cuenta tokens y
el padrón cuenta compromisos. Un sistema que las confunda va a prometer un conjunto de
anonimato que no tiene.

### La reventa, que ahora es demostrable

T11 lo había encontrado mirando el contrato; con el flujo completo andando se puede
mostrar de punta a punta, y `npm run flujo` lo hace en cada corrida:

```
  el NFT es del comprador nuevo                         OK     ownerOf(1)
  el comprador nuevo no puede poner su compromiso       OK     revirtio con CompromisoYaEnviado(1)
  la hoja sigue siendo la del vendedor                  OK     hoja 5, token 1
  el que VENDIO la entrada entra igual                  OK     codigo 0: PASE
```

Esa última línea es una prueba Groth16 generada con el secreto del vendedor, validada
por una puerta que nunca vio nada antes, con veredicto PASE. **El que vendió la entrada
entra; el que la compró, no.** El comprador nuevo tiene el NFT, y el NFT no sirve para
entrar: lo que sirve es saber el secreto de una hoja del árbol.

No es un bug de esta corrida ni de esta implementación. Es la consecuencia de dos
decisiones que por separado están bien: que el compromiso se pueda enviar una sola vez
por token (`contratos/EntradaNFT.sol:78`, y si no fuera así el nuevo dueño podría
invalidarle la prueba a alguien que ya la tenía) y que la raíz, una vez publicada, sea
la que las puertas llevan adentro. Juntas rompen la reventa, que es una de las cosas
que el NFT venía a habilitar.

Esta tarea no lo resuelve y no debe: es candidato a ADR y toca el **ADR-005** del TPF
(reventa, regalías y tope de precio). Lo que sí puede afirmar, porque lo corrió, es
que el problema es real y no teórico.

### Es NFT / es ZK, otra vez

Vale repetir la distinción con el sistema completo delante, porque es lo que va a
preguntar el jurado.

De este flujo, **es NFT**: que exista una entrada auténtica y no falsificable, que se
sepa quién es su dueño, que se pueda transferir, que el compromiso de cada hoja esté
atado a una entrada emitida y no lo pueda poner cualquiera. Esa última parte importa:
sin el contrato, el padrón sería una lista que el organizador arma con quien quiera.

**Es ZK**, y solo esto: que cuando alguien entra por la puerta, el molinete no aprenda
cuál de las ocho hojas usó. Nada más. La tabla billetera ↔ compromiso está publicada
en la cadena y cualquiera la puede armar, así que el conjunto de anonimato es un
padrón con nombre y apellido. Que eso sea suficiente, y qué costaría romper ese
vínculo, es **T13**.

## 4. Qué podrías cambiar

**El secreto: derivado de la clave privada → aleatorio y guardado.** Un
`crypto.randomBytes(32)` con rechazo, igual que `lib/campo.mjs:47`, escrito en el
dispositivo del comprador. Se gana el modelo real —el secreto deja de depender de la
clave de la billetera, así que vender la billetera no vende la entrada— y se pierde la
reproducibilidad de la corrida y aparece el problema de custodia: si se pierde el
archivo, se pierde la entrada. Toca `lib/compradores.mjs:56` y obliga a persistir algo
por comprador. Es **ADR-012**.

**El orden de las hojas: llegada → índice de emisión.** Reemplazar
`compromisosEnCadena` por un bucle de `compromisoDe(tokenId)` para `tokenId` de 0 a
`emitidos() - 1`. Se gana robustez frente a reorganizaciones y a nodos sin logs, y se
pierde que el organizador no decida el orden. Toca `lib/compradores.mjs:66` y nada
más: es la ventaja de que el orden se decida en un solo lugar.

**Las hojas que faltan: cortar → rellenar.** Definir una hoja de relleno y completar
hasta la potencia de dos. Se gana que el árbol se pueda armar siempre; se pierde
simplicidad, y hay que poder decir en voz alta qué es ese valor y por qué nadie lo
puede abrir. Toca `lib/merkle.mjs:27` y el organizador.

**Un compromiso por token → reemplazable mientras la raíz no esté publicada.** Es la
alternativa que ya proponía `docs/09-entrada-nft.md`, y ahora se puede probar de
verdad: arreglaría la reventa anterior a la publicación y dejaría abierta la
posterior. Toca `contratos/EntradaNFT.sol:78` y el test 12 de `npm run contrato:nft`.

**La fuente no debería desplegar ni emitir.** Hoy construir la fuente monta el mundo
si no está montado. Lo correcto es un comando aparte —`npm run compradores`— que haga
la venta, y una fuente que solo lea. Se gana que la fuente cumpla la interfaz y nada
más; se pierde que `npm test` sea un solo comando, porque la suite reinicia la cadena.
Toca `fuentes/contrato-nft.mjs:32`, un script nuevo y la preparación de
`scripts/demostraciones.mjs`.

**El padrón: `datos/arbol.json` → la cadena.** El prover recalcula el árbol desde el
padrón que publica el organizador. Con los compromisos en la cadena, podría leerlos de
ahí y no necesitar el archivo. Se gana una copia menos que se puede desincronizar; se
pierde que el prover funcione sin conexión, que es lo que hace que se parezca a una
app de teléfono. Toca `scripts/prover.mjs` y sería el primer cambio de esta escalera
que **sí** toca uno de los tres scripts.

**El scope: un padrón para todos los eventos → un contrato por evento.** Hoy
`EntradaNFT` no sabe de eventos: los tokens son una serie sola y las raíces están
indexadas por `scope`, así que los mismos ocho compromisos son el padrón de todos los
eventos. Funciona para la PoC y no para nada más. Toca el contrato entero.

## 5. Probalo vos

Desde la raíz del repo. La primera vez, `npm install` y `npm run setup`.

### El flujo entero

```bash
npm run flujo
```

Unos treinta segundos. Lo que tenés que ver: ocho emisiones que paga el organizador,
ocho envíos que paga cada comprador, la tabla de hojas desordenada respecto de los
tokens, y después:

```
Controles de la venta

  se emitieron las ocho entradas                        OK     emitidos() = 8
  llegaron los ocho compromisos                         OK     8 eventos CompromisoEnviado
  la posicion de la hoja NO es el numero de token       OK     hojas 0..7 = tokens 5,0,7,2,6,1,4,3
  el orden de las hojas es el de llegada a la cadena    OK     orden de envio 5,0,7,2,6,1,4,3
  cada hoja es Poseidon del secreto de su comprador     OK     calculado del lado del comprador

El organizador: lee la cadena, arma el arbol, publica la raiz

  arbol y raiz                            npm run organizador -- --scope evento-A
  el organizador NO genero ningun secreto               OK     la fuente aporto los ocho compromisos
  el padron es la cadena, hoja por hoja                 OK     8 hojas en datos/arbol.json
```

Las direcciones van a ser las mismas en tu máquina: son las cuentas #1 a #8 de la
cadena local de Hardhat, que se derivan de una frase pública.

Al terminar, la cadena queda levantada. Bajala con `npm run cadena:abajo`.

### La suite de T08 contra la cadena

Es el criterio de que esta tarea está hecha:

```bash
FUENTE=contrato-nft npm test
```

Los mismos siete casos de la fase 1, con el árbol saliendo de la cadena en vez de una
semilla:

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

Corrido dos veces seguidas da lo mismo, que es lo que hay que pedirle a una suite que
reinicia la cadena. En PowerShell, `$env:FUENTE="contrato-nft"; npm test` y después
`Remove-Item Env:FUENTE`.

### El dueño que no envía

```bash
npm run flujo -- --sin-enviar 5
```

Ocho entradas, siete compromisos, y el organizador que no puede armar el árbol. La
salida está copiada en la sección 3. El comando termina con código 0 porque lo que se
esperaba que pasara pasó: es una demostración, no una falla.

### Rotura deliberada: que todos usen el mismo secreto

En `lib/compradores.mjs:57`, cambiá la derivación para que no dependa del comprador:

```js
const { secreto } = secretoDeterminista("todos-el-mismo", "compromiso-de-entrada");
```

y corré `npm run flujo`:

```
El paso fallo:  npm run organizador -- --scope evento-A

ORGANIZADOR NO VALIDADO.

  - hay compromisos repetidos
```

Ocho compromisos idénticos son ocho hojas idénticas: la misma entrada contada ocho
veces, y un nulificador compartido por ocho personas, lo que quiere decir que el
primero que entra deja afuera a los otros siete. El control que lo atrapa está en
`scripts/organizador.mjs` desde T05, cuesta una línea, y hasta hoy nunca se había
disparado. Restaurá la línea.

### Volver al estado de la parte base

Correr el flujo reescribe `datos/arbol.json` y `datos/secretos.json` con lo que salió
de la cadena. Para volver a lo que está commiteado:

```bash
git checkout -- datos/
```

## 6. Qué NO hace

**No rompe el vínculo billetera ↔ compromiso.** Sigue publicado en la cadena, y ahora
son ocho en vez de tres. El conjunto de anonimato de la puerta es un padrón con
nombre y apellido: la prueba no dice qué hoja entró, pero cualquiera sabe quiénes son
las ocho candidatas. Es **T13**, y es la pregunta que esta PoC tiene que poder
contestar bien.

**No hace que el secreto sea secreto.** Se deriva de las claves privadas de la cadena
local, que son públicas. Lo demostrado es el recorrido de la información, no su
confidencialidad, y la sección 3 lo dice con todas las letras.

**No resuelve la custodia.** Si un comprador pierde su secreto, pierde su entrada, y
acá eso no se nota porque el secreto se recalcula de la clave privada. En el modelo
real hay que decidir si el secreto lo guarda el usuario o alguien por él: es
**ADR-012**, en estado `propuesta`.

**No resuelve la reventa.** La demuestra rota, que es distinto. Es candidato a ADR y
toca **ADR-005**.

**No decide qué hacer con las hojas que faltan.** Corta con un error y explica por
qué. Elegir el relleno, o cerrar la inscripción, es del TPF.

**No sabe de eventos.** Los mismos ocho compromisos son el padrón del evento A y del
B. Lo único que distingue a un evento de otro es el `scope`, que cambia la raíz y el
nulificador. Un contrato por evento, o un evento por token, es una decisión que no
hizo falta tomar para que esto ande.

**No hay plata.** Emitir es gratis, no hay precio ni regalías ni tope de reventa. Lo
único que cuesta es gas, y el número que importa es que **cada comprador paga 71.515
de gas de su bolsillo** para entrar al árbol: ocho personas necesitan ocho billeteras
con fondos, y eso es un requisito del sistema, no un detalle.

**No resuelve el doble ingreso entre puertas.** Sigue siendo el caso 3 de la suite y
sigue abierto: dos molinetes sin canal entre ellos dejan pasar la misma entrada dos
veces. Es **ADR-009**.

**El conjunto de anonimato sigue siendo de ocho.** Con ocho compradores, "uno de los
ocho" es casi decir el nombre. La profundidad está compilada en el circuito y subirla
cuesta restricciones: eso es MED-001 y no esta tarea.

**No es una cadena.** Es un nodo en esta computadora, sin otros validadores, sin
consenso, sin costo y sin permanencia, y que se pueda rearmar entero en cada corrida
es la prueba de eso. Que el registro sea público e inmutable acá está **supuesto**.
