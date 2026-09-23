---
tarea: T09
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`RegistroDeRaiz.sol` con dos funciones (`setRaiz`, `getRaiz`), compilado con solc
0.8.28 sobre Hardhat 3.17.0, y `fuentes/contrato-raiz.mjs`, la segunda
implementación de la interfaz `fuenteDeRaiz`. La raíz del evento deja de vivir en
`datos/raiz.json` y pasa a vivir en un contrato de la cadena local: el organizador
la publica con una transacción y el resto del sistema la lee gratis.

El criterio de la tarea se cumple: **los siete casos de T08 pasan contra la raíz del
contrato**, corridos dos veces seguidas, con el mismo resultado y sin intervención
manual. La suite sigue siendo `npm test`, un comando.

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

El gas, medido con `npm run contrato:medir` sobre transacciones reales:

```
  desplegar el contrato (una sola vez)           429.921
  publicar la raiz de un evento nuevo             69.917
  pisar esa raiz con otra                         32.905
  volver a publicar exactamente la misma raiz     30.105
  lo que costaria si fuera una transaccion        26.548   <- la lectura, que no se paga
```

Y los cinco controles del contrato y de la interfaz:

```
  un scope sin publicar: el mapping devuelve 0...         OK     raiz=0, publicada=false
  ...y la fuente lo traduce a null                        OK     leerRaiz devolvio null
  una raiz que vale 0, publicada, se lee 0 y no null      OK     leerRaiz devolvio 0 (bigint)
  otra cuenta no puede publicar una raiz                  OK     revirtio con SoloElOrganizador(...)
  una raiz >= p se rechaza on-chain                       OK     revirtio con FueraDelCampo(...)
```

Archivos nuevos: `contratos/RegistroDeRaiz.sol`, `hardhat.config.js`,
`fuentes/contrato-raiz.mjs`, `fuentes/seleccion.mjs`, `lib/cadena.mjs`,
`scripts/cadena.mjs`, `scripts/contrato.mjs`, `docs/08-contrato-raiz.md`.
Comandos nuevos: `contrato:compilar`, `contrato:medir`, `cadena:arriba`,
`cadena:abajo`, `cadena:estado`.

## Decisiones que tomé y por qué

**Hardhat 2.29.1 → 3.17.0.** El `package.json` tenía Hardhat 2 clavado por una sola
razón, escrita en `docs/00-entorno.md`: Hardhat 3 pide Node 22.13.0 o posterior y la
máquina tenía Node 20.19.2. **Patricio actualizó a Node v24.21.0 (npm 11.19.0), y ese
cambio fue lo único que habilitó el salto.** No había ninguna otra razón para
quedarse en la serie 2. Verificado corriéndolo: `npx hardhat --version` responde
`3.17.0`. Quedó clavado sin `^`, como el resto.

**`package.json` pasó a declarar `"type": "module"`.** No fue una preferencia:
Hardhat 3 busca su configuración únicamente como `hardhat.config.ts` o
`hardhat.config.js`. Con el archivo llamado `hardhat.config.mjs` —que era lo que
pedía la convención del repo— la herramienta contesta `Error HHE3: No Hardhat config
file found`. TypeScript está descartado por `CONTEXTO.md`, así que la única salida es
`.js`, y un `.js` con `import` necesita que el paquete sea ESM. Esto revierte una
decisión explícita de T01, que había argumentado lo contrario porque Hardhat 2
esperaba un config en CommonJS. No rompe nada: no hay otro archivo `.js` en el repo.

**Hardhat solo compila y levanta la cadena; el resto es ethers.** No uso
`hre.network.connect()`, ni los plugins de toolbox, ni Ignition. El despliegue y las
llamadas van por `ethers.JsonRpcProvider` contra `http://127.0.0.1:8545`, con el
artefacto leído de `artifacts/`. Dos razones: ethers ya estaba en el proyecto y es lo
que el equipo va a usar en la aplicación web —el código que Patricio lee acá es el
que va a escribir después—, y un proveedor JSON-RPC es la interfaz más estable que
hay, mientras que la API de Hardhat 3 es nueva y ya rompió una vez.

**La bandera `publicada` en el struct, en vez de tratar el 0 como ausencia.** Es la
regla 3 de la interfaz hecha Solidity. Un `mapping` vacío devuelve 0 y 0 es un
elemento de campo válido, así que sin la bandera no hay forma de distinguir "no hay
raíz" de "la raíz es 0". Cuesta un casillero de storage (unos 22.100 de gas en la
primera publicación de cada evento) y lo vale: la alternativa barata —usar el bit 255
de la raíz como bandera, porque la raíz siempre es menor que `2^254`— está en la
sección 4 del documento como pieza intercambiable.

**`setRaiz` permite pisar una raíz ya publicada.** Un evento real vende durante
semanas y cada tanda cambia la raíz; un registro de una sola escritura por evento
obligaría a inventar un evento por tanda, y además rompería que `npm test` se pueda
correr dos veces. El precio es que el organizador puede cambiar la raíz debajo de una
entrada ya vendida. Queda mitigado a medias por el evento `RaizPublicada`, que deja
la historia completa en el log aunque el storage tenga solo la última. Quién debería
poder cambiar la raíz de un evento en curso es candidata a ADR (ver abajo).

**La cadena se levanta y se baja desde los scripts.** `fuentes/contrato-raiz.mjs` la
levanta si está baja, así que cualquier comando suelto funciona sin preparación; y
`scripts/demostraciones.mjs` la **reinicia** al empezar y la baja al terminar, porque
la suite tiene que correr contra una cadena vacía para que la raíz que lee sea la que
publicó el organizador de esta corrida. Todo el estado de la cadena vive en `cadena/`,
que agregué a `.gitignore`.

## Con qué me tropecé

**El hallazgo de diseño, y es el importante: la interfaz `fuenteDeRaiz` no definía
cómo se elige la implementación.** El criterio de T09 era que la suite pasara
"cambiando solo la fuente". No se pudo, y no por un descuido mío: el organizador, el
prover y el provisionador de puertas hacían `import { fuenteJson } from
"../fuentes/json.mjs"` cada uno por su cuenta. La implementación no estaba enchufada,
estaba **soldada, en tres lugares**. La interfaz definía muy bien el contrato —qué
métodos, qué tipos, qué se devuelve cuando no hay nada, que los errores se tiran— y
no definía el mecanismo de selección. Una pieza intercambiable que obliga a editar a
todos sus usuarios no es intercambiable, y `docs/04-organizador.md` lo decía sin
darse cuenta: "toca un archivo nuevo en `fuentes/` y una línea en
`scripts/organizador.mjs`".

**Lo reporto como falla del diseño de la interfaz, no como trabajo de rutina**, que es
lo que la tarea pedía si pasaba. Toqué los tres scripts que el encargo daba por
intocables: **siete líneas en total**, ninguna de lógica.

| Archivo | Líneas | Qué cambió |
|---|---|---|
| `scripts/organizador.mjs` | 17, 92 | el `import` y la construcción de la fuente |
| `scripts/organizador.mjs` | 89 | cosmética: el encabezado decía "(fuente JSON)" |
| `scripts/prover.mjs` | 21, 144 | el `import` y la construcción de la fuente |
| `scripts/provisionar-puerta.mjs` | 18, 89 | el `import` y la construcción de la fuente |

El arreglo es `fuentes/seleccion.mjs`: un solo lugar que sabe qué implementaciones
hay y cuál se usa (variable de entorno `FUENTE`, `contrato` por defecto). Mantuve los
números de línea de los tres archivos exactamente como estaban para no romper las
citas `archivo:línea` de `docs/04-organizador.md` y `docs/05-prover.md`. Con la
indirección puesta, T12 va a agregar `fuentes/contrato-nft.mjs` y una línea en
`seleccion.mjs`, y esta vez sí va a ser cierto que no se toca nada más.

Además cambié `scripts/demostraciones.mjs` (14 líneas: reiniciar la cadena en la
preparación, bajarla al final). No está en la lista de intocables y los siete casos
quedaron igual, pero lo digo igual: la suite que valida la tarea fue tocada por la
tarea, aunque solo en su andamiaje.

**`hardhat.config.mjs` no existe para Hardhat 3.** Perdí un rato buscando plugins y
formatos de configuración antes de mirar el código: `config-loading.js` hace
`findUp("hardhat.config.ts")` y después `findUp("hardhat.config.js")`, y no hay
tercera opción. El mensaje `Error HHE3: No Hardhat config file found` con el archivo
ahí adelante es engañoso hasta que sabés eso.

**`nonce has already been used`.** Dos transacciones seguidas desde el mismo
firmante, en la cadena local, salían con el mismo nonce: la segunda moría con
`Nonce too low. Expected nonce to be 2 but got 1`. Es el caché interno de ethers v6,
que recuerda la respuesta de `getTransactionCount` por un rato. En una cadena con
bloques cada doce segundos es una optimización sana; en una que mina un bloque por
transacción, es un bug. Se arregla con `cacheTimeout: -1` al construir el
`JsonRpcProvider` (`lib/cadena.mjs:202`).

**Bajar el nodo en Windows.** Arrancarlo con `npx hardhat node` deja como pid el del
`cmd.exe` intermedio, no el del nodo, y matar ese pid no mata al hijo. Se arregló
lanzando `node node_modules/hardhat/dist/src/cli.js node` directamente y bajándolo
con `taskkill /PID n /T /F`.

**ethers no decodifica los custom errors cuando el rechazo ocurre estimando el gas.**
`e.revert` viene en `null` y el mensaje es `execution reverted (unknown custom
error)`, aunque los bytes del error estén en `e.data` y el ABI los tenga. Hay que
decodificarlos a mano con `new ethers.Interface(abi).parseError(datos)`
(`scripts/contrato.mjs`). Sin eso, los dos controles de rechazo informaban "unknown
custom error" y no servían para aprender nada.

**`datos/raiz.json` quedó en el repositorio y ya no lo escribe nadie.**
`docs/04-organizador.md` había anticipado que desaparecería en T09. No lo borré
—borrar archivos necesita confirmación— así que quedó como resto de la fase 1: solo
se regenera si alguien corre con `FUENTE=json`. Conviene decidir si se borra o si se
deja como testimonio del primer escalón.

**Lo que la PoC no puede demostrar, dicho claro.** La cadena local es un nodo en esta
computadora, sin otros validadores, sin consenso, sin costo y sin permanencia. Las
propiedades que el documento le atribuye a la raíz publicada —que no se pueda cambiar
sin dejar rastro, que cualquiera pueda verificarla— son propiedades de una cadena con
varios participantes y acá están **supuestas**. Lo que sí queda demostrado es el
mecanismo: qué se guarda, qué cuesta y qué no hace falta guardar. Está escrito así en
la sección 6 del documento.

## Qué dejo pendiente o candidato a ADR

**Candidata a ADR: quién puede cambiar la raíz de un evento en curso, y con qué
aviso.** El contrato permite pisar una raíz publicada. Las opciones son una sola
escritura por evento (rígida pero honesta), pisar libremente (lo que hay), o un
timelock que anuncie la raíz nueva N bloques antes de que entre en vigencia. Toca el
claim de que una entrada vendida sigue siendo válida, así que no es una decisión de
implementación. Se engancha con **ADR-009**.

**Candidata a ADR: el control de acceso del organizador.** Hoy es una dirección
`immutable`: si se pierde la clave, el evento no puede volver a publicar. `Ownable`,
`AccessControl` o un multisig son las alternativas, y `@openzeppelin/contracts` 5.6.1
ya está instalado. Es la misma pregunta que **ADR-012** se hace para los compradores,
aplicada al organizador.

**Para el informe, no para un ADR:** el gas medido acá (69.917 para publicar una
raíz) es una unidad de trabajo, no de plata. Cuánto sale en pesos depende del
`gasPrice` de la red donde se despliegue, y esta PoC no tiene de dónde sacar ese dato.
Si el número va a un entregable, tiene que ir con esa aclaración.

**Nada de esto toca ADR-001 ni ADR-002.** El contrato no aporta ni quita privacidad:
lo que hace es darle autoridad a la raíz contra la que se compara. La validación
sigue siendo offline —el validador no cambió ni una línea y sigue corriendo con la
red bloqueada—, y eso quedó comprobado bajando la cadena entera y validando igual.

**No empecé T10 ni T11.**
