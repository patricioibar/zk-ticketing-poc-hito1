# Entorno

## 1. Qué hace

Fija y verifica el conjunto de herramientas con el que corre toda la PoC: el
compilador de circuitos, la librería que genera y verifica las pruebas, las dos
librerías de primitivas criptográficas y el stack de contratos. `npm run
verificar:entorno` imprime la versión real de cada una —la que responde el
programa instalado, no la que pide `package.json`— y termina con error si falta
alguna o si circom y circomlib no son de la misma serie.

Estas son las versiones que quedaron instaladas en la máquina de Patricio el
2026-09-23, copiadas de la salida del comando:

| Herramienta | Versión | De dónde sale |
|---|---|---|
| node | v20.19.2 | `node --version` |
| npm | 10.8.2 | `npm --version` |
| git | 2.51.0.windows.1 | `git --version` |
| rustc | 1.96.0 (ac68faa20 2026-05-25) | `rustc --version` |
| cargo | 1.96.0 (30a34c682 2026-05-25) | `cargo --version` |
| circom | 2.2.3 | `circom --version` |
| snarkjs | 0.7.6 | `node_modules/snarkjs/package.json` |
| circomlib | 2.0.5 | `node_modules/circomlib/package.json` |
| circomlibjs | 0.1.7 | `node_modules/circomlibjs/package.json` |
| ethers | 6.17.0 | `node_modules/ethers/package.json` |
| hardhat | 2.29.1 | `node_modules/hardhat/package.json` |
| @openzeppelin/contracts | 5.6.1 | `node_modules/@openzeppelin/contracts/package.json` |

Sistema operativo: Windows 11 Pro 10.0.26200.

## 2. Cómo lo hace

El único código de esta tarea es `scripts/verificar-entorno.mjs`. Se lee de arriba
hacia abajo en el mismo orden en que corre.

`scripts/verificar-entorno.mjs:15` declara la lista de **binarios**: node, npm,
git, rustc, cargo y circom. A cada uno se le pregunta su versión ejecutándolo.

`scripts/verificar-entorno.mjs:27` declara la lista de **paquetes de npm**:
snarkjs, circomlib, circomlibjs, ethers, hardhat y `@openzeppelin/contracts`.

La distinción entre las dos listas no es cosmética y es la mitad del punto de esta
tarea; está explicada en la sección 3.

`scripts/verificar-entorno.mjs:38` (`versionDeBinario`) ejecuta el programa con
`execFileSync` y se queda con la primera línea de su salida. Dos detalles no
obvios:

- `shell: process.platform === "win32"`: en Windows, `npm` no es un `.exe` sino un
  `npm.cmd`, y `execFileSync` sin shell no lo encuentra. Ese flag es la diferencia
  entre que el script ande en Windows o no.
- El `catch` no tira el error: lo anota en `problemas`
  (`scripts/verificar-entorno.mjs:36`) y devuelve `null`. Así el script sigue y al
  final te muestra **todo** lo que falta de una vez, en lugar de hacerte descubrir
  un faltante por corrida.

`scripts/verificar-entorno.mjs:52` (`versionDePaquete`) no ejecuta nada: abre
`node_modules/<paquete>/package.json` y lee su campo `version`. Es la versión que
efectivamente se va a cargar en tiempo de ejecución.

`scripts/verificar-entorno.mjs:62` (`pragmaDeCircomlib`) abre
`node_modules/circomlib/circuits/poseidon.circom` y busca la línea que empieza con
`pragma circom`. Esa línea declara contra qué serie del lenguaje está escrito el
circuito. Es el dato que permite comparar circom con circomlib, porque el número
de versión del paquete npm de circomlib (2.0.5) y el del compilador (2.2.3) no son
comparables entre sí: son proyectos distintos con numeraciones distintas. Lo único
comparable es la serie del lenguaje.

`scripts/verificar-entorno.mjs:85` y `:92` recorren las dos listas e imprimen.

`scripts/verificar-entorno.mjs:101` a `:111` es el chequeo de coherencia: extrae
el número mayor de la versión de circom (el `2` de `2.2.3`) y el número mayor del
pragma (el `2` de `pragma circom 2.0.0`) y, si no coinciden, agrega un problema.

`scripts/verificar-entorno.mjs:113` decide el código de salida: si hay al menos un
problema, los lista y sale con 1. Eso es lo que hace que `npm run
verificar:entorno` sea usable como chequeo y no solo como informe para leer.

## 3. Por qué está hecho así

**Por qué circom es un binario y snarkjs una librería.** Son dos etapas distintas
del mismo pipeline. circom es un *compilador*: toma el archivo `.circom` —que es
código en un lenguaje propio— y produce el sistema de restricciones (`.r1cs`) más
un programa WASM que calcula el *witness*. Eso es trabajo de compilador clásico
—parsear, analizar tipos, optimizar restricciones— y está escrito en Rust, así que
se distribuye como ejecutable nativo y se instala con `cargo`, fuera de npm.
snarkjs, en cambio, es la *librería de runtime*: toma el `.r1cs` y el witness que
produjo circom y hace la criptografía —trusted setup, generación de la prueba
Groth16, verificación—. Eso corre dentro de la aplicación, y la aplicación de esta
PoC es Node; por eso es un paquete npm. La consecuencia práctica: `npm install` no
alcanza para tener el entorno, y ese es exactamente el error que este script
detecta.

**Por qué las versiones de circom y circomlib tienen que coincidir.** circomlib no
es una librería binaria: son archivos `.circom` en texto plano que tu circuito
`include`-a y que el compilador vuelve a compilar cada vez. O sea que circomlib es
*código fuente para circom*, y como todo código fuente está escrito contra una
versión del lenguaje. Esa versión la declara la línea `pragma circom 2.0.0;` al
principio de cada archivo. El lenguaje de circom cambió de forma incompatible
entre la serie 1 y la 2 (señales, `<==`, componentes). Si el compilador y el
pragma son de series distintas, lo que ves no es "versión incompatible": es un
error de sintaxis en un archivo que vos no escribiste, en medio de `poseidon.circom`,
y perdés media hora buscando un bug tuyo que no existe. Por eso el chequeo de
coherencia es una sección propia del script y no una nota en un README.

circomlibjs es la tercera pata: la implementación **en JavaScript** de las mismas
primitivas (Poseidon, entre otras), para calcular fuera del circuito lo que el
circuito calcula adentro. Que las dos den el mismo resultado no está garantizado
por nada: es lo que T02 va a comprobar explícitamente antes de construir nada
encima.

**Por qué las versiones están clavadas sin `^`.** En `package.json` dicen
`"snarkjs": "0.7.6"`, no `"^0.7.6"`. Esta PoC produce números medidos que van a
terminar en un informe del TPF; si el entorno cambia solo entre dos corridas, esos
números dejan de ser comparables sin que nadie se entere. El costo es que las
actualizaciones hay que hacerlas a mano, que para un ejercicio de unas semanas es
el costo correcto.

**Por qué Hardhat 2 y no Hardhat 3.** Hardhat 3.17.0 es la versión actual, pero
requiere Node 22.13.0 o posterior y la máquina tiene Node 20.19.2. Verificado
corriéndolo, no leyéndolo: instalado en una carpeta aparte, `npx hardhat --version`
responde `ERROR: You are using Node.js 20.19.2 which is not supported by Hardhat.
Please upgrade to Node.js 22.13.0 or later.` Con Hardhat 2.29.1 —la última de la
serie 2— el mismo comando responde `2.29.1`. Se eligió no tocar la instalación de
Node de la máquina de Patricio en una tarea de andamiaje: esa es una decisión suya.
Queda anotada en la bitácora de T01 como pendiente.

**Por qué `package.json` no declara `"type": "module"`.** `CONTEXTO.md` pide ESM
con extensión `.mjs`. Usar `.mjs` explícito en cada archivo consigue lo mismo sin
volver ESM a todo el directorio, lo cual importa porque Hardhat 2 espera un
`hardhat.config.js` en CommonJS: con `"type": "module"` habría que renombrarlo a
`.cjs` y explicar por qué. Menos piezas raras que justificar en T09.

**Por qué la versión de los paquetes se lee de `node_modules` y no de
`package.json`.** `package.json` dice lo que *pedimos*; `node_modules` tiene lo que
*está corriendo*. Para un documento cuyo propósito es que los números sean
reproducibles, la única fuente honesta es la segunda. `package-lock.json` está
versionado en git justamente para que las dos coincidan en otra máquina.

## 4. Qué podrías cambiar

**El compilador: circom → Noir, Halo2 o gnark.** circom es el que usa el documento
de Hito 1 de Agustina Fontana y el que tiene más material didáctico, que para una
PoC de aprendizaje pesa. Noir (Aztec) tiene mejor ergonomía de lenguaje y un
backend sin trusted setup por circuito; gnark es Go y muy rápido para probar.
Cambiarlo rehace todo `circuitos/` y la mitad de los scripts, y hay que revisar si
el ADR correspondiente del repo de docs ya fijó algo. Se gana ergonomía y se pierde
la correspondencia directa con el documento de referencia del equipo.

**El sistema de prueba: Groth16 → PLONK o FFLONK.** snarkjs soporta los tres.
Groth16 da la prueba más chica y la verificación on-chain más barata, que es lo que
importa para la validación en puerta, pero necesita un trusted setup **por
circuito**: si cambiás una línea del circuito, hay que rehacerlo. PLONK usa un
setup universal, así que iterar sale mucho más barato. Tocar: `scripts/` de setup y
de prueba (T04, T06) y el verificador de T10. El número de tamaño de prueba y el de
gas cambian, así que MED-001 habría que rehacerla.

**La función hash: Poseidon → Poseidon2, Rescue o MiMC.** Todas están pensadas para
ser baratas en circuito, a diferencia de SHA-256. Poseidon es la que trae circomlib
y la que más implementaciones cruzadas tiene (Solidity, JS, Rust), que es lo que
permite el paso de control de T02. Cambiarla toca el circuito, el organizador y el
validador, y obliga a repetir T02 desde cero.

**Node 20 → Node 22 LTS.** Desbloquea Hardhat 3. Cambia `package.json` (campo
`engines` y la versión de `hardhat`) y probablemente el `hardhat.config` de T09.
Se gana el stack actual de Hardhat; se pierde la garantía de que las mediciones de
antes y después del cambio sean comparables, así que conviene hacerlo antes de
MED-001 o no hacerlo.

**Hardhat → Foundry.** Foundry es más rápido y los tests se escriben en Solidity.
Se pierde el ecosistema JS que acá conviene, porque el prover y el organizador ya
están en Node y comparten código con los contratos vía ethers.

## 5. Probalo vos

Instalación desde cero, en la raíz del repo:

```bash
cargo install --git https://github.com/iden3/circom.git
npm install
npm run verificar:entorno
```

La salida real del último comando, tal como quedó:

```
Herramientas del sistema
  node                    v20.19.2
  npm                     10.8.2
  git                     git version 2.51.0.windows.1
  rustc                   rustc 1.96.0 (ac68faa20 2026-05-25)
  cargo                   cargo 1.96.0 (30a34c682 2026-05-25)
  circom                  circom compiler 2.2.3

Paquetes de Node (version instalada en node_modules)
  snarkjs                 0.7.6
  circomlib               2.0.5
  circomlibjs             0.1.7
  ethers                  6.17.0
  hardhat                 2.29.1
  @openzeppelin/contracts 5.6.1

Coherencia circom <-> circomlib
  pragma de circomlib     pragma circom 2.0.0
  compatibles             si

Entorno completo. Ver docs/00-entorno.md.
```

Si `circom` no aparece, el problema casi siempre es el PATH: el binario queda en
`C:\Users\<vos>\.cargo\bin\circom.exe` y esa carpeta tiene que estar en el PATH
—si ya tenés `cargo` disponible en la terminal, lo está—.

**Comprobación de que la cadena entera funciona**, no solo de que los binarios
existen. En una carpeta temporal fuera del repo, creá `humo.circom`:

```
pragma circom 2.0.0;
include "circomlib/circuits/poseidon.circom";
template Humo() {
  signal input a;
  signal output h;
  component p = Poseidon(1);
  p.inputs[0] <== a;
  h <== p.out;
}
component main = Humo();
```

y compilalo apuntando `-l` a `node_modules` del repo:

```bash
circom humo.circom --r1cs --wasm -l <ruta-al-repo>/node_modules
<ruta-al-repo>/node_modules/.bin/snarkjs r1cs info humo.r1cs
```

Tiene que terminar en `Everything went okay` y snarkjs tiene que leer el `.r1cs`
e informar `Curve: bn-128` y `# of Constraints: 415`. Eso prueba las tres cosas de
una: circom compila, encuentra circomlib, y snarkjs entiende lo que circom produjo.

**Rotura deliberada.** Abrí
`node_modules/circomlib/circuits/poseidon.circom` y cambiá la primera línea por
`pragma circom 3.0.0;`. Después corré `npm run verificar:entorno`:

```
Coherencia circom <-> circomlib
  pragma de circomlib     pragma circom 3.0.0
  compatibles             ?

Problemas:
  - circom circom compiler 2.2.3 no coincide con el "pragma circom 3.0.0" de circomlib
```

y el comando sale con código 1. Restaurá con `npm install`. El punto de la rotura
es ver el mensaje que el chequeo te ahorra: sin él, el mismo desajuste aparece
recién en T03 como un error de sintaxis adentro de un archivo de circomlib.

## 6. Qué NO hace

No instala Node, ni Rust, ni git: asume que están. No fija la versión de Node más
allá de declarar `engines: node >= 20.19.0`, que npm solo usa como advertencia. No
verifica que `solc` esté disponible —Hardhat lo descarga solo la primera vez que
compila un contrato, en T09— así que `npm run verificar:entorno` puede pasar en
una máquina sin conexión donde T09 igual falle.

No comprueba que el Poseidon de circomlibjs y el de circomlib den el mismo
resultado: solo comprueba que los dos paquetes están instalados y que el pragma es
de la serie correcta. Esa comprobación, que es la que realmente importa, es T02.

No es una instalación segura ni reproducible bit a bit: `cargo install --git` toma
la punta de la rama por defecto del repositorio de iden3, no un tag. La que quedó
es `circom 2.2.3` del commit `a100faed`. Si alguien reinstala dentro de un mes
puede obtener otra.

Nada de esto toca decisiones del TPF. El entorno es instrumental: aporta a la
**medición MED-001** —el hardware y las versiones son parte obligatoria del reporte
de cualquier número que se mida acá— y condiciona a **ADR-008/009/010/011** solo en
el sentido de que la evidencia que esta PoC produzca va a estar atada a este stack
concreto. La elección de circom y Groth16 no se decide acá: se hereda del documento
de Hito 1 y de esos frentes.
