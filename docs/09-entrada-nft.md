# Entrada NFT

## 1. Qué hace

`EntradaNFT.sol` es la entrada convertida en token: un ERC-721 hecho con la
implementación de referencia de OpenZeppelin 5.6.1, más una función propia,
`enviarCompromiso(tokenId, compromiso)`, que solo puede usar quien sea dueño de ese
token. El compromiso queda guardado en el contrato y queda registrado en un evento.
Enviarlo cuesta **71.515 de gas** y lo paga el comprador, no el organizador.

El contrato conserva la raíz de la V1 porque hereda `RegistroDeRaiz`: es el mismo
registro que puso a andar T09, con la misma cuenta organizadora y las mismas reglas,
no una copia.

Lo que esta tarea deja entendido es una distinción, y es el punto central de toda la
variación: **emitir un NFT no da privacidad**. `ownerOf` devuelve una billetera
pública que cualquiera puede consultar. Lo que hace falta es separar dos capas —quién
es dueño del token, que es público y sirve para la reventa y las regalías, y qué
secreto entra al árbol de Merkle, que es privado y es lo único que sostiene el
anonimato en la puerta—. La sección 3 lo desarrolla, incluida la pregunta incómoda
que queda abierta.

## 2. Cómo lo hace

Son dos archivos nuevos —el contrato y el script que lo aprieta— y unas pocas líneas
en la plomería que ya existía.

### El contrato

`contratos/EntradaNFT.sol:28` es la línea que define de qué está hecho:

```solidity
contract EntradaNFT is ERC721, RegistroDeRaiz {
```

De `ERC721` vienen `ownerOf`, `balanceOf`, `transferFrom`, `safeTransferFrom`, los
`approve`, los eventos del estándar y `supportsInterface`. Nada de eso está escrito en
este repositorio y ese es el punto: la sección 3 explica por qué. De `RegistroDeRaiz`
vienen `setRaiz`, `getRaiz`, la constante `P`, la cuenta `organizador` y los errores
`SoloElOrganizador` y `FueraDelCampo`, que este contrato reusa.

`contratos/EntradaNFT.sol:33` declara lo que se guarda por token:

```solidity
struct Compromiso {
    uint256 valor;
    bool enviado;
}
```

Es la misma forma que `Publicacion` en la V1 y por la misma razón: `0` es un elemento
de campo perfectamente válido y un `mapping` vacío de Solidity también contesta `0`.
Sin la bandera, "este token no envió compromiso" y "el compromiso de este token vale
0" serían el mismo dato. El test 9 lo comprueba de los dos lados.

`contratos/EntradaNFT.sol:56` es `emitir`. `:57` la restringe al organizador —la misma
línea que `setRaiz`, con el mismo error—, `:58` toma el número de token siguiente y
`:59` acuña con `_safeMint`. Los `tokenId` arrancan en 0 para que coincidan con la
posición de la hoja en el árbol, que también se numera desde 0.

`contratos/EntradaNFT.sol:69` es la función que justifica la tarea, y son cuatro
líneas que conviene leer de a una:

```solidity
address duenio = ownerOf(tokenId);
if (duenio != msg.sender) revert SoloElDuenio(tokenId, msg.sender, duenio);
if (compromiso >= P) revert FueraDelCampo(compromiso, P);
if (_compromisos[tokenId].enviado) revert CompromisoYaEnviado(tokenId);
```

`:72` hace dos cosas con una llamada. Averigua de quién es el token y, si el token no
existe, revierte ahí mismo con `ERC721NonexistentToken` —el error de OpenZeppelin—,
así que no hace falta un chequeo propio para ese caso.

`:73` es **la** línea. Sin ella, cualquiera podría meter su propio compromiso a nombre
de una entrada ajena: el dueño de verdad se quedaría afuera y el atacante entraría con
una hoja que sí conoce. Es la regla que el test 4 prueba rompiéndola, y la sección 5
muestra qué pasa cuando se la comenta.

`:77` valida el rango contra `P`, la constante heredada. Un valor `>= P` lo reduciría
el árbol módulo `p` en silencio, y la hoja guardada no sería la enviada. Que el
chequeo esté de los dos lados de la frontera —`lib/campo.mjs` en JavaScript y el
contrato en Solidity— es lo correcto cuando el de enfrente no puede confiar en el de
acá. Igual que en `setRaiz`, un compromiso que **vale 0** no se rechaza: son dos cosas
distintas.

`:78` admite un solo envío por token. Por qué, y qué se paga por eso, está en la
sección 3.

`:80` escribe y `:81` emite el evento. El storage guarda el compromiso; el log guarda
además quién lo mandó y cuándo, y eso es exactamente el problema de la sección 3.

`:88` (`compromisoDe`) y `:94` (`emitidos`) son las dos lecturas: `view`, sin
transacción y sin gas. Son las que va a usar T12 para armar el árbol con lo que
enviaron los compradores.

### El script que lo aprieta

`scripts/contrato-nft.mjs` (`npm run contrato:nft`) reinicia la cadena, despliega,
emite cuatro entradas a tres compradores distintos, hace que manden sus compromisos y
corre doce tests. Sigue la forma de `scripts/contrato.mjs`, que es la que dejó T09:
cada regla se prueba **rompiéndola**, y lo que se comprueba es el estado del contrato
después del intento, no solo que la transacción haya fallado.

`scripts/contrato-nft.mjs:83` y `:85` son el detalle que vale la pena mirar: el
compromiso se calcula con `Poseidon(secreto)` del lado de JavaScript, con las mismas
funciones que usa el organizador, y al contrato le llega **el resultado**. El secreto
no aparece en ninguna transacción.

`scripts/contrato-nft.mjs:259` arma la tabla de la que habla la sección 3 leyendo los
logs de la cadena con `queryFilter`, sin tocar ningún archivo del repositorio.

### Lo que cambió en lo que ya existía

Cuatro cosas, todas chicas:

- `lib/cadena.mjs:178` (`compilarSiHaceFalta`) miraba si `RegistroDeRaiz.sol` era más
  nuevo que su artefacto. Desde esta tarea hay más de un contrato, así que mira todos
  los `.sol` de `contratos/`. Sin este cambio, agregar `EntradaNFT.sol` no disparaba
  ninguna compilación.
- `lib/cadena.mjs` (`abiDelContrato`) toma ahora el nombre del contrato, con
  `"RegistroDeRaiz"` por defecto: nada de lo que ya andaba cambió de comportamiento.
- `motivoDeRevert` —que decodifica los errores propios de un contrato, porque ethers
  trae los bytes pero no los interpreta cuando el rechazo ocurre estimando el gas— se
  mudó de `scripts/contrato.mjs` al final de `lib/cadena.mjs`, y ahora lo importan los
  dos scripts. Tener dos copias de eso es la forma de que una quede vieja.
- `package.json` suma `contrato:nft`.

El despliegue de `EntradaNFT` lo hace el propio script con `ethers` y no
`asegurarDespliegue`, que está escrito para un contrato sin argumentos de constructor
y guarda un único `cadena/despliegue.json`. Generalizarlo es trabajo de T12, que es
cuando va a haber una fuente que necesite el contrato desplegado entre comandos.

### El arreglo del scope por defecto

Aparte de T11, y porque mordió dos veces: `npm run organizador` sin argumentos usaba
el scope `1234`, pero lo que está commiteado en `datos/` es `evento-A`. Correr el
comando tal como lo documentan los docs regeneraba el padrón, los secretos y la raíz
para otro evento y dejaba el árbol de trabajo sucio sin que se notara por qué.

`scripts/organizador.mjs:28` ahora dice `evento-A`. Es el default coherente con lo que
está en el repositorio y con lo que deja `npm test`, que termina corriendo el
organizador sobre `evento-A`. Además es el criterio que el prover y el provisionador
de puertas ya usaban: los dos toman el scope de `datos/arbol.json` cuando no se les
pasa ninguno, así que ahora los tres comandos, sin argumentos, hablan del mismo
evento. Con el cambio puesto, `npm run organizador` deja `git status` limpio.

## 3. Por qué está hecho así

### El punto de toda la variación: el NFT no aporta nada a la privacidad

Conviene decirlo sin rodeos, porque es la pregunta que el jurado va a hacer.

De todo lo que hace este contrato, **nada es ZK**. Que la entrada sea auténtica, que
no se pueda falsificar, que se pueda revender con regalías o con un tope de precio,
que exista un registro público de quién la tiene: eso lo da el ERC-721 y lo daría
igual sin una sola prueba de conocimiento cero. Es la capa "es NFT", y es una capa
útil: es la que sostiene ADR-005.

Lo único que da el ZK es una sola cosa: que la puerta no pueda saber **cuál** de los
compradores es el que está entrando. Eso no sale del token: sale de que la prueba
Groth16 demuestra pertenencia a un árbol sin revelar qué hoja se usó, y de que el
nulificador es determinista por evento sin decir de quién es. Es ADR-001, y el
contrato no aporta nada a eso.

De ahí que el contrato tenga dos cosas y no una. El `tokenId` y su `ownerOf` son la
capa pública: tienen que serlo, porque una entrada que nadie puede ver no se puede
revender ni cobrar regalías. El compromiso es la puerta de entrada a la capa privada:
es `Poseidon(secreto)`, y el secreto —lo único que permite generar la prueba— nunca
sale del dispositivo del comprador. `contratos/EntradaNFT.sol:69` recibe un número y
**no puede** comprobar qué secreto lo produjo. Eso no es una limitación: si el
contrato pudiera verificarlo, el secreto tendría que haber viajado.

### La pregunta incómoda, que esta tarea plantea y no cierra

Si el vínculo billetera ↔ compromiso queda público en la cadena, ¿no se rompe el
anonimato en la puerta?

El comando la deja a la vista. `npm run contrato:nft` termina imprimiendo esto, armado
con los logs de la cadena y nada más:

```
  token  billetera que lo envio                 compromiso
      0  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  128167701322062727050393...
      1  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  138720783476471229638957...
      2  0x90F79bf6EB2c4f870365E785982E1f101E93b906  0
```

Cualquiera puede reconstruir esa tabla: sin el repositorio, sin hablar con el
organizador y sin permiso de nadie.

La respuesta corta y cómoda sería "no, porque la prueba no dice qué hoja se usó, así
que saber de quién es cada hoja no te dice quién entró". Es cierta y es insuficiente,
y conviene ver por qué.

Es cierta en este sentido: el anonimato de la puerta es de conjunto. La prueba
demuestra "una de estas hojas es mía" y el molinete no aprende cuál. Conocer el mapeo
no cambia esa matemática.

Es insuficiente por tres motivos, y ninguno es hipotético. El primero: el conjunto de
anonimato deja de ser un conjunto de desconocidos y pasa a ser un **padrón con nombre
y apellido**. Con ocho compradores, la puerta sabe que el que entró es uno de ocho, y
ahora sabe además exactamente cuáles ocho y qué billetera es cada uno. Cualquier dato
lateral —quién ya entró, quién nunca entró, a qué hora se compró cada entrada, cuál se
revendió— se aplica sobre una lista de personas y no sobre un conjunto abstracto. El
segundo: una billetera pública no es un anónimo. La que envía el compromiso paga gas,
y esos fondos salieron de algún lado; si salieron de un exchange con identificación,
la billetera tiene un titular. El tercero, y el más incómodo: la línea que ata la hoja
a la billetera —`contratos/EntradaNFT.sol:73`— es exactamente la que impide que un
tercero te secuestre la entrada. **La regla que protege la hoja es la que la vincula.**
No es un descuido de implementación que se arregle borrando una línea: es una tensión
de diseño.

Esta tarea no la resuelve. Las salidas que existen —enviar el compromiso desde una
billetera distinta de la que tiene el token, acumular los envíos para que no se sepa
cuál vino de quién, probar en el momento del envío que uno es el dueño sin decir qué
token es— tienen precio y ninguna es gratis. Cuál se elige, y si alguna es viable en
la PoC, es **T13**. Dejarlo planteado acá y no cerrarlo es deliberado: el error que
esta PoC existe para no cometer es venderle al jurado una ventaja del contrato como si
fuera del ZK, y afirmar que el anonimato está a salvo porque la matemática de la
prueba está bien sería exactamente eso.

### Por qué la implementación de OpenZeppelin y no un ERC-721 propio

Porque el ERC-721 no es difícil, es **detallista**, y las dos cosas no se parecen. El
estándar exige `supportsInterface` (ERC-165), exige que `safeTransferFrom` compruebe
que el receptor sepa recibir tokens, define cómo interactúan `approve` y
`setApprovalForAll` con las transferencias, y fija qué eventos se emiten y con qué
argumentos. Un error en cualquiera de esas esquinas no se nota probando a mano: se
nota cuando un marketplace no muestra la entrada, o cuando una transferencia manda un
token a un contrato que no lo puede mover nunca más.

Escribirlo de cero tampoco enseñaría nada de lo que esta PoC quiere entender, que es
ZK. Con la implementación de referencia puesta, todo lo que es nuestro son unas treinta
líneas: la función `emitir`, la función `enviarCompromiso` y su almacenamiento. Es
mucho más fácil revisarlas sabiendo que el resto es código que auditó mucha gente.

El precio está medido: desplegar `EntradaNFT` cuesta **2.341.162 de gas**, contra
429.921 del `RegistroDeRaiz` pelado de la V1. La mayor parte de esa diferencia es el
estándar completo, no nuestras treinta líneas. Se paga una sola vez.

### Por qué heredar `RegistroDeRaiz` y no copiar sus dos funciones

Porque las reglas de la raíz —el rango contra `P`, la bandera `publicada`, que escriba
solo el organizador, que la publicación quede en el log— costaron una tarea entera y
están documentadas en `docs/08-contrato-raiz.md`. Una copia sería una segunda versión
de esas reglas, y la segunda versión es la que se olvida de actualizar. Heredando, la
V1 sigue siendo el único lugar donde están escritas, y los tests 10 y 11 de esta tarea
comprueban que dentro de `EntradaNFT` se siguen cumpliendo.

Que el organizador del registro de raíces sea el mismo que emite las entradas no es
una decisión de arquitectura del TPF: es lo que hace la PoC, donde todo lo despliega
la misma cuenta. Si en el sistema real la venta de entradas y la publicación de la
raíz las hace la misma entidad es una pregunta abierta, y queda anotada como candidata
a ADR en la bitácora.

### Por qué un solo compromiso por token, y qué se paga por eso

`contratos/EntradaNFT.sol:78` rechaza el segundo envío. Es lo contrario de lo que hace
`setRaiz`, que sí permite pisar una raíz, y la diferencia tiene razón de ser: la raíz
es el resumen del padrón y cambia legítimamente con cada tanda de venta, mientras que
el compromiso es la hoja de una persona. Si esa hoja pudiera cambiar después de que la
raíz se publicó, el organizador no sabría cuál de los dos valores está adentro del
árbol, y el comprador podría invalidarse su propia prueba sin darse cuenta.

El precio es concreto y el test 12 lo demuestra: **una entrada revendida se lleva el
compromiso del vendedor**. El token cambia de dueño, el compromiso no, y el comprador
nuevo no puede poner el suyo. Quien vendió sigue conociendo el secreto de la hoja que
está en el árbol; quien compró tiene el NFT y no puede generar ninguna prueba. La
reventa, que es una de las cosas que el NFT venía a habilitar (ADR-005), queda rota
por la capa de compromisos si no se hace nada más.

Que eso se vea acá, y que se vea como consecuencia de una decisión de tres palabras,
es el motivo de que el test exista. La alternativa —permitir que el dueño actual
reemplace el compromiso mientras la raíz no esté publicada— está en la sección 4, y
qué hacer con la reventa después de publicada es candidata a ADR.

### Qué cuesta, y por qué cuesta eso

Los números salen de transacciones reales en la cadena local; el comando que los
produce es `npm run contrato:nft`.

| Operación | Gas | Quién paga |
|---|---|---|
| Desplegar `EntradaNFT` (una sola vez) | 2.341.162 | el organizador |
| Emitir la primera entrada | 95.719 | el organizador |
| Emitir las siguientes | 78.607 | el organizador |
| **Enviar un compromiso** | **71.515** | **el comprador** |
| Enviar un compromiso que vale 0 | 51.243 | el comprador |

Lo primero que hay que leer de esa tabla no es un número: es la columna de la derecha.
En la V1 pagaba el organizador y nadie más, nunca. Acá aparece un costo **por
comprador**, y aparece del lado del comprador. Ocho entradas son ocho transacciones de
71.515 que ocho personas distintas tienen que poder mandar, lo que quiere decir que
cada una necesita una billetera con fondos. Es un requisito del sistema, no un detalle
de implementación, y es de las cosas que un ticketing masivo tiene que resolver antes
de existir.

La cuenta del compromiso cierra, y cierra al gas. `Compromiso` ocupa dos casilleros de
storage —`valor` en uno, `enviado` en el otro—, y los datos de la llamada se cobran a
16 por byte distinto de cero y 4 por byte en cero ([EIP-2028]):

| Fila | Base | Datos | Los dos casilleros | Resto |
|---|---|---|---|---|
| Enviar un compromiso (71.515) | 21.000 | 704 | 2 × (2.100 + 20.000) = 44.200 | 5.611 |
| Enviar un compromiso que vale 0 (51.243) | 21.000 | 332 | (2.100 + 100) + (2.100 + 20.000) = 24.300 | 5.611 |

El **resto es idéntico en las dos filas**, y eso es la comprobación de que la cuenta
está bien: son la lectura de `ownerOf` —2.100 por ser el primer acceso a ese casillero
en la transacción, `COLD_SLOAD_COST` de [EIP-2929]—, el evento que se emite y las
instrucciones de la función, que no dependen del valor enviado.

Todo lo que varía está en las otras dos columnas, y las dos diferencias se explican
solas. En los datos, 372 de diferencia: el compromiso que vale 0 ocupa 32 bytes en
cero donde el otro los tiene todos distintos de cero —32 × (16 − 4) = 384 menos— y el
número de token 2 aporta un byte distinto de cero que el token 0 no tenía, que son 12
más. En los casilleros, 19.900: escribir un
valor distinto de cero en un casillero que valía cero son 20.000 (`SSTORE_SET_GAS`,
[EIP-2200]), y escribir un cero donde ya había un cero son 100. Es decir: **un
compromiso que vale 0 sale 20.000 de gas más barato que cualquier otro, porque no
estrena su casillero**. Es una curiosidad del modelo de gas y no una propiedad que
sirva para nada, pero explica la fila y confirma que el contrato trata al cero como un
valor y no como una ausencia.

Las tres filas de emisión también se explican entre ellas, y las dos diferencias son
del mismo tipo. Entre la primera emisión y la segunda hay 17.112: 17.100 porque el
contador `_proximoToken` estrena su casillero en la primera (20.000) y en la segunda
solo lo cambia (2.900, `SSTORE_RESET_GAS` ajustado por [EIP-2929]), y 12 porque las
dos direcciones no tienen la misma cantidad de bytes en cero, y 16 − 4 = 12. La cuarta
emisión cuesta 61.519, exactamente 17.100 menos que las otras que van a un comprador
nuevo: es la única que le toca a alguien que **ya tenía** una entrada, así que su
`balanceOf` pasa de 1 a 2 en vez de estrenarse en 1.

Un aviso de rigor, el mismo que la V1: estos números son de la cadena local de Hardhat,
que implementa las mismas reglas de gas que la red principal pero **no tiene precio**.
El gas es una unidad de trabajo, no de plata. Lo que sostienen estas mediciones es la
comparación entre operaciones, no un costo.

## 4. Qué podrías cambiar

**La política de envío: una sola vez → reemplazable hasta que se publique la raíz.**
El contrato tendría que saber si la raíz del evento ya se publicó —lo sabe, porque
hereda `getRaiz`— y aceptar reemplazos antes de ese momento. Se gana que un comprador
que se equivocó pueda corregir y, sobre todo, que una entrada revendida antes del
evento pueda llevar el compromiso de quien la compró. Se pierde simplicidad y aparece
un orden nuevo que respetar: publicar la raíz pasa a ser un acto que cierra la
inscripción, y publicarla dos veces deja de ser inofensivo. Toca
`contratos/EntradaNFT.sol:78` y el test 12, que pasaría a comprobar lo contrario de lo
que comprueba hoy.

**La reventa después de publicada la raíz.** Es el caso que la opción anterior no
cubre y no tiene arreglo dentro del contrato: si la hoja ya está en el árbol, el
comprador nuevo solo puede entrar si se rearma el árbol y se vuelve a publicar la
raíz. Eso implica que las entradas vendidas antes siguen siendo válidas contra una
raíz vieja o que hay que invalidarlas, y es una decisión de diseño del TPF y no de
esta PoC. Toca el organizador, el provisionador de puertas y, probablemente, el
formato de la configuración de cada molinete.

**Exigir prueba de que se conoce el secreto.** Hoy `enviarCompromiso` acepta cualquier
número, incluido el compromiso de otra persona copiado de la cadena. Copiarlo no
sirve para entrar —hay que saber el secreto—, pero sí sirve para molestar: si dos
tokens mandan el mismo valor, el organizador tiene hojas repetidas y el control que
`scripts/organizador.mjs` ya hace desde T05 las detecta y no arma el árbol. Una prueba
de conocimiento del preimagen en el momento del envío lo cerraría. Se gana robustez,
se pierde que enviar un compromiso sea una transacción barata y simple, y aparece un
circuito más que mantener. Toca `contratos/EntradaNFT.sol:69` y todo el camino del
comprador.

**Quién puede emitir: `organizador` inmutable → `Ownable` o roles.** Igual que en la
V1 y con el mismo argumento: una sola cuenta que no se puede cambiar es lo más simple
y lo más frágil. `@openzeppelin/contracts` 5.6.1 trae `Ownable` y `AccessControl` y ya
está instalado. Toca `contratos/RegistroDeRaiz.sol:34` y `contratos/EntradaNFT.sol:57`.
Es la misma pregunta que **ADR-012** se hace para los compradores.

**Lo que hace que la entrada valga plata: precio, regalías y tope de reventa.** Hoy
`emitir` es gratis y no hay ninguna restricción a las transferencias. Un `mint`
pagable, `ERC2981` para las regalías, un `_update` que rechace transferencias por
encima de un precio o después de una fecha: todo eso es capa NFT pura y es lo que
ADR-005 discute. Se gana el caso de uso completo; se pierde que el contrato se lea en
una pantalla. Toca `contratos/EntradaNFT.sol:56` y la lista de contratos base de `:28`.

**El almacenamiento: dos casilleros → uno.** El compromiso siempre es menor que `P`,
que es apenas menor que `2^254`, así que sobran dos bits arriba. Usar el bit 255 como
bandera de "enviado" ahorra estrenar un segundo casillero: unos 22.100 de gas por
comprador, casi un tercio del total. Se pierde legibilidad. Toca
`contratos/EntradaNFT.sol:33` y `:88`. Es el mismo ejercicio que la sección 4 de
`docs/08-contrato-raiz.md` propone para la raíz.

**Los tests: script propio con ethers → el runner de Hardhat 3.** Hoy
`scripts/contrato-nft.mjs` es un programa que imprime una tabla y sale con código 1 si
algo falla. Hardhat 3 trae un runner sobre `node:test`, helpers de red y tests
escritos en Solidity; se ganarían fixtures —volver a un estado guardado en vez de
repetir el despliegue—, `expect(...).to.be.revertedWithCustomError` y mediciones de
gas automáticas, y se perdería que este código sea el mismo `ethers` que el equipo va
a usar en la aplicación web. Toca `hardhat.config.js`, `package.json` y el script
entero. Conviene mirarlo cuando los contratos sean tres o cuatro.

## 5. Probalo vos

Desde la raíz del repo. La primera vez, `npm install` y `npm run setup`.

### Los tests y el gas, de una

```bash
npm run contrato:nft
```

Reinicia la cadena, despliega, emite cuatro entradas, manda tres compromisos y corre
los doce tests:

```
  es un ERC-721 segun ERC165 (0x80ac58cd)                       OK     la implementacion es la de OpenZeppelin 5.6.1
  ownerOf(0) devuelve la billetera del comprador A              OK     0x70997970C51812dc3A010C7d01b50e0d17dc79C8  (publico: lo lee cualquiera)
  el duenio envio su compromiso y quedo guardado                OK     128167701322062727050393... enviado=true
  un tercero NO puede enviar el compromiso de un token ajeno    OK     revirtio con SoloElDuenio(3, 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
  tampoco el organizador puede enviar por un comprador          OK     revirtio con SoloElDuenio(3, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
  enviar dos veces el mismo token se rechaza                    OK     revirtio con CompromisoYaEnviado(0)
  un compromiso >= p se rechaza on-chain                        OK     revirtio con FueraDelCampo(21888242871839275222246405745257275088548364400416034343698204186575808495617, 21888242871839275222246405745257275088548364400416034343698204186575808495617)
  un token que no existe se rechaza                             OK     revirtio con ERC721NonexistentToken(99)
  un compromiso que vale 0 no es lo mismo que no haber enviado  OK     token 2: (0, true) | token 3: (0, false)
  la raiz de la V1 sigue funcionando en este contrato           OK     getRaiz(1234) = (217428069206837197869151..., 3, true)
  y la sigue escribiendo solo el organizador                    OK     revirtio con SoloElOrganizador(0x70997970C51812dc3A010C7d01b50e0d17dc79C8, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
  una entrada revendida se lleva el compromiso del vendedor     OK     revirtio con CompromisoYaEnviado(1)
```

```
  Los 12 tests dan lo esperado.
```

Las direcciones van a ser esas mismas en tu máquina: son las cuentas #0 a #3 de la
cadena local de Hardhat, que se derivan de una frase pública y son iguales en todas
las computadoras del mundo. La dirección del contrato también, y por la misma razón
que explica `docs/08-contrato-raiz.md`: se deriva de quién despliega y de cuántas
transacciones mandó antes.

Vale la pena leer con atención el bloque **"Lo que cualquiera puede leer de esta
cadena"**, que está copiado en la sección 3: es el punto del documento.

### Rotura deliberada: sacale el dueño a la regla del dueño

En `contratos/EntradaNFT.sol:73`, comentá la línea:

```solidity
// if (duenio != msg.sender) revert SoloElDuenio(tokenId, msg.sender, duenio);
```

y corré `npm run contrato:nft` de nuevo:

```
  un tercero NO puede enviar el compromiso de un token ajeno    FALLA  no reverti: el tercero escribio
  tampoco el organizador puede enviar por un comprador          FALLA  revirtio con CompromisoYaEnviado(3)
  un compromiso que vale 0 no es lo mismo que no haber enviado  FALLA  token 2: (0, true) | token 3: (0, true)

CONTRATO NO VALIDADO.
```

Tres fallas y solo una es la esperada. Las otras dos son el daño colateral, y son más
instructivas que la primera: el comprador B le metió su compromiso al token 3, que es
del comprador A. Por eso el intento siguiente ya no revierte con `SoloElDuenio` sino
con `CompromisoYaEnviado` —la hoja de A está ocupada por el valor de B— y por eso el
token 3 aparece como que envió algo cuando nunca envió nada.

Traducido al sistema: A compró su entrada, no hizo nada mal, y no va a poder entrar.
El que entra es B, con una hoja que sí sabe abrir. Restaurá la línea.

### La entrada revendida, a mano

El test 12 ya lo hace, pero vale la pena verlo escrito: el comprador B manda su
compromiso para el token 1, después transfiere el token 1 al comprador C, y C intenta
mandar el suyo. La transferencia funciona —es un ERC-721, para eso está— y el envío
revierte con `CompromisoYaEnviado(1)`. C tiene la entrada y no tiene forma de generar
una prueba; B ya no tiene la entrada y sigue sabiendo el secreto de la hoja que está
en el árbol. La sección 3 explica por qué el contrato está hecho así y la 4, qué se
podría hacer distinto.

### Que la V1 sigue intacta

```bash
npm run contrato:medir
npm test
```

El primero corre los cinco controles del `RegistroDeRaiz` de T09 y el segundo, los
siete casos de la fase 1. Esta tarea no tocó el circuito, ni el prover, ni el
validador, ni la forma en que se arma el árbol: los dos comandos dan lo que daban.

## 6. Qué NO hace

**No cambia todavía cómo se arma el árbol, que es el sentido de todo esto.** El
organizador sigue generando las ocho identidades él mismo y `fuentes/seleccion.mjs`
sigue eligiendo `contrato-raiz`. Falta una implementación de `fuenteDeRaiz` —
`fuentes/contrato-nft.mjs`— cuyo `leerCompromisos` devuelva los compromisos que
enviaron los dueños de los tokens en vez de `null`, y una línea en
`fuentes/seleccion.mjs` que la ofrezca. Ese día `scripts/organizador.mjs:106` va a
tomar la otra rama —la que ya está escrita desde T05 y nunca se ejecutó— y el
organizador va a dejar de conocer los secretos. Es **T12**, y es el escalón que esta
tarea deja apoyado.

**No responde la pregunta de la sección 3.** El vínculo billetera ↔ compromiso está
publicado en la cadena y este contrato no hace nada para romperlo. Es **T13**.

**No verifica que el compromiso sea `Poseidon` de nada.** El contrato recibe un número
y lo guarda. Que el comprador conozca el secreto, que el compromiso no sea el de otro
y que el valor no sea basura son cosas que este contrato no puede comprobar: la
sección 4 explica cuál sería el precio de que pudiera.

**No sabe de eventos.** Los tokens son uno solo y corrido —no hay un token "del evento
A"—, mientras que las raíces que hereda de la V1 están indexadas por `scope`. Atar las
dos cosas, o desplegar un contrato por evento, es una decisión que no hace falta tomar
para que T12 ande y que el TPF sí va a tener que tomar.

**No hay plata en ninguna parte.** Emitir es gratis, no hay precio, no hay regalías y
no hay tope de reventa. Lo que ADR-005 discute está en la sección 4 como cosa que se
podría agregar, y no está agregado.

**No resuelve el doble ingreso entre puertas.** Es el caso 3 de las demostraciones de
T08 y sigue abierto igual: dos molinetes sin canal entre ellos dejan pasar la misma
entrada dos veces. Es el frente **ADR-009**, y esta tarea no lo mueve.

**No es una cadena.** Es un nodo en esta computadora, sin otros validadores, sin
consenso, sin costo y sin permanencia. Que el registro de propiedad sea público e
inmutable —que es de lo que vive todo el argumento del NFT— acá está **supuesto**, no
demostrado.

---

[EIP-2200]: https://eips.ethereum.org/EIPS/eip-2200
[EIP-2929]: https://eips.ethereum.org/EIPS/eip-2929
[EIP-2028]: https://eips.ethereum.org/EIPS/eip-2028
