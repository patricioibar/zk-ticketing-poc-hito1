---
tarea: T11
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`contratos/EntradaNFT.sol`: un ERC-721 hecho con la implementación de referencia de
OpenZeppelin 5.6.1, que hereda `RegistroDeRaiz` —así conserva la raíz de la V1 sin
copiar sus reglas— y suma `enviarCompromiso(tokenId, compromiso)` con
`ownerOf(tokenId) == msg.sender`, almacenamiento por token y evento. Son unas treinta
líneas propias: `emitir`, `enviarCompromiso`, las dos lecturas y el struct.

`scripts/contrato-nft.mjs` (`npm run contrato:nft`) es la verificación: reinicia la
cadena, despliega, emite cuatro entradas a tres compradores, manda tres compromisos y
corre doce tests, cada uno probando la regla rompiéndola. Además mide el gas e imprime
la tabla billetera ↔ compromiso armada leyendo los logs, que es el punto del
documento.

Salida real de `npm run contrato:nft`, corrida de hoy:

```
Contrato EntradaNFT - tests y gas

  contrato          EntradaNFT en 0x5FbDB2315678afecb367f032d93F642f64180aa3 (2.341.162 gas)
  nombre / simbolo  Entrada TPF211 / ENT211
  organizador       0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  comprador A       0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  comprador B       0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  comprador C       0x90F79bf6EB2c4f870365E785982E1f101E93b906

Emitir entradas

  token 0           a 0x7099...79C8   95.719 gas
  token 1           a 0x3C44...93BC   78.607 gas
  token 2           a 0x90F7...b906   78.619 gas
  token 3           a 0x7099...79C8   61.519 gas   <- se queda sin compromiso

Enviar compromisos

  token 0           128167701322062727050393...   71.515 gas
  token 1           138720783476471229638957...   71.527 gas
  token 2           0                             51.243 gas   <- un compromiso que vale 0

Tests

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

Lo que cualquiera puede leer de esta cadena

  token  billetera que lo envio                 compromiso
      0  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  128167701322062727050393...
      1  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  138720783476471229638957...
      2  0x90F79bf6EB2c4f870365E785982E1f101E93b906  0

Gas

  que                                              gas       quien paga
  desplegar EntradaNFT (una sola vez)           2.341.162   el organizador
  emitir la primera entrada                        95.719   el organizador
  emitir las siguientes                            78.607   el organizador
  enviar un compromiso                             71.515   el comprador
  enviar un compromiso que vale 0                  51.243   el comprador

  Los 12 tests dan lo esperado.
```

Lo que ya existía sigue dando lo mismo: `npm run contrato:medir`, cinco de cinco
controles; `npm test`, siete de siete casos.

El documento es `docs/09-entrada-nft.md`, con las seis secciones. La sección 3 es la
que importa: por qué emitir un NFT no da privacidad, y la pregunta incómoda del
vínculo billetera ↔ compromiso planteada sin cerrar.

Tocado además: `lib/cadena.mjs` (compilar mira ahora todos los `.sol`,
`abiDelContrato` toma el nombre del contrato, y `motivoDeRevert` se mudó acá desde
`scripts/contrato.mjs`), `scripts/contrato.mjs` (usa el importado), `package.json`
(`contrato:nft`), y el arreglo del scope que se cuenta más abajo. Se mantuvieron los
números de línea de `lib/cadena.mjs` para no romper las citas de
`docs/08-contrato-raiz.md`.

### El arreglo del scope por defecto

`npm run organizador` sin argumentos usaba el scope `1234`, mientras que `datos/`
está commiteado para `evento-A`: correr el comando tal como lo documentan los docs
pisaba el padrón, los secretos y la raíz con otro evento y ensuciaba el árbol de
trabajo. `scripts/organizador.mjs:28` ahora dice `evento-A`.

Elegí el default coherente con lo commiteado y no exigir `--scope` explícito por tres
razones. El prover y el provisionador de puertas ya toman el scope de
`datos/arbol.json` cuando no se les pasa ninguno, así que con este cambio los tres
comandos sin argumentos hablan del mismo evento en vez de dos. `npm test` termina
corriendo el organizador sobre `evento-A`, o sea que ese ya era el estado canónico.
Y exigir el flag rompería todas las líneas `npm run organizador` que hay escritas en
los docs de T05 a T09.

Descarté leer el scope de `datos/arbol.json` como hacen los otros dos: haría el
comando pegajoso —si alguna vez corriste `--scope evento-B`, la corrida siguiente sin
flags seguiría en `evento-B` y nunca volverías al estado commiteado—, que es una forma
distinta del mismo problema.

Comprobado: `npm run organizador` sin flags deja `git status` limpio.

Actualicé `docs/04-organizador.md` (la frase que documentaba el default) y
`docs/08-contrato-raiz.md` (las dos salidas de su sección 5 que mostraban `1234`).

## Decisiones que tomé y por qué

**Heredar `RegistroDeRaiz` en vez de copiar `setRaiz`/`getRaiz`.** Las reglas de la
raíz costaron una tarea entera y están documentadas en un solo lugar; una copia es una
segunda versión que se olvida de actualizar. Los tests 10 y 11 comprueban que adentro
de `EntradaNFT` siguen valiendo. Efecto secundario: el organizador del registro de
raíces y el emisor de entradas son la misma cuenta. En la PoC es lo natural; que en el
sistema real sea así es una pregunta abierta, anotada abajo.

**Un solo compromiso por token** (`contratos/EntradaNFT.sol:78`), al revés que
`setRaiz`, que sí deja pisar. La raíz es el resumen del padrón y cambia con cada tanda;
el compromiso es la hoja de una persona, y si pudiera cambiar después de publicada la
raíz nadie sabría cuál de los dos valores está adentro del árbol. El precio es real y
lo dejé como test propio (el 12): una entrada revendida se lleva el compromiso del
vendedor, así que el que compra tiene el NFT y no puede generar ninguna prueba.

**`tokenId` desde 0**, para que coincida con la posición de la hoja. Cuesta cero ahora
y evita un `-1` en T12.

**No escribir un chequeo de "el token existe".** `ownerOf` ya revierte con
`ERC721NonexistentToken`, que dice exactamente qué pasó. Un error propio ahí sería
código nuestro para repetir lo que hace la librería.

**El script de tests con `ethers` y no el runner de Hardhat 3.** Sigue la forma que
dejó T09 y el código es el mismo que el equipo va a usar en la aplicación web. Se
pierden los fixtures y los matchers de revert; está anotado en la sección 4 del
documento como lo primero a mirar cuando haya tres o cuatro contratos.

**Desplegar `EntradaNFT` desde el propio script** y no generalizar
`asegurarDespliegue`, que está escrito para un contrato sin argumentos de constructor
y guarda un único `cadena/despliegue.json`. Generalizarlo es trabajo de T12, que es
cuando va a haber una fuente que necesite el contrato desplegado entre comandos.

## Con qué me tropecé

**La frase de la cadena local tiene once `test` y no doce.** La escribí con doce y
`ethers` cortó con `invalid mnemonic length`. Deriva las cuentas #1 a #3 por
`m/44'/60'/0'/0/i`, que es lo que hace que las direcciones del documento sean las
mismas en cualquier máquina.

**`compilarSiHaceFalta` solo miraba `RegistroDeRaiz.sol`.** Con el `.sol` nuevo
agregado, la función contestaba "ya está compilado" porque el que miraba no había
cambiado, y el artefacto de `EntradaNFT` no existía. Ahora mira todos los `.sol` de
`contratos/`. Es el tipo de supuesto —"hay un contrato"— que no se ve hasta que deja
de ser cierto.

**Un test que mentía.** El de "un compromiso >= p se rechaza" comprobaba el estado del
token después del intento, y cuando probé la rotura deliberada del documento ese test
salió `FALLA` al lado de un revert perfectamente correcto: el estado que miraba ya
estaba contaminado por la falla anterior. Lo pasé a comprobar el motivo del revert.
Los otros siguen comprobando estado, que es más fuerte donde el estado es el punto.

**El gas de publicar la raíz cambió al cambiar el scope por defecto**: 69.917 con
`1234`, 70.277 con `evento-A`. Son 360 y no es un misterio: `1234` ocupa 30 bytes en
cero de los 32 que se mandan y el scope derivado no tiene ninguno, a 12 de gas por
byte. La tabla de `docs/08-contrato-raiz.md` sigue valiendo porque
`npm run contrato:medir` publica sobre `1234`, pero la salida de ejemplo de su sección
5 había que corregirla.

**`datos/arbol.json` guarda un campo `generado` con la fecha.** Hoy coincide con la
que está commiteada, así que el árbol queda limpio; otro día, `npm run organizador`
va a dejar esa línea modificada aunque todo lo demás sea idéntico. No lo toqué porque
es anterior a esta tarea y sacarlo o no es una decisión sobre el formato del padrón,
pero conviene saberlo antes de que confunda a alguien.

## Qué dejo pendiente o candidato a ADR

**El vínculo billetera ↔ compromiso es público y esta tarea no lo resuelve.** Está
planteado en la sección 3 del documento con los tres motivos por los que la respuesta
cómoda ("la prueba no dice qué hoja se usó") es insuficiente, y con la observación que
más me importa: la línea que impide que un tercero te secuestre la hoja es exactamente
la que ata la hoja a tu billetera. Es una tensión de diseño, no un descuido. Lo
responde **T13**.

**Reventa y compromiso fijo (candidata a ADR).** Hoy una entrada revendida se lleva el
compromiso del vendedor: el comprador nuevo no puede entrar y el vendedor sigue
sabiendo el secreto de la hoja que está en el árbol. Si la reventa es antes de publicar
la raíz hay arreglo dentro del contrato; si es después, no lo hay sin rearmar el árbol
y volver a publicar. Se engancha con **ADR-005**.

**Quién emite las entradas y quién publica la raíz (candidata a ADR).** Acá son la
misma cuenta porque `EntradaNFT` hereda `RegistroDeRaiz`. Si en el sistema real son la
misma entidad, o si la emisión y la publicación tienen que estar separadas, no lo
decide esta PoC.

**Exigir prueba de conocimiento del secreto al enviar el compromiso (candidata a
ADR).** El contrato acepta cualquier número, incluido el compromiso de otro copiado de
la cadena. Copiarlo no sirve para entrar, pero sí para molestar: dos hojas repetidas y
el organizador no arma el árbol.

**Los tokens no saben de eventos.** Hay un padrón único de tokens y un mapa de raíces
por `scope`. Atar las dos cosas, o desplegar un contrato por evento, no hace falta para
que T12 ande pero el TPF lo va a tener que resolver.

**Aparece un costo por comprador, y del lado del comprador**: 71.515 de gas cada uno,
lo que quiere decir que cada comprador necesita una billetera con fondos. En la V1
pagaba el organizador y nadie más. Es un requisito del sistema y no un detalle de
implementación; vale como insumo para la medición **MED-001** y para cualquier
discusión sobre viabilidad en un ticketing masivo.

**No empecé T12.** El contrato existe y está probado, pero el árbol se sigue armando
igual que antes: falta `fuentes/contrato-nft.mjs` y la línea en `fuentes/seleccion.mjs`.
Está escrito en la sección 6 del documento.
