---
tarea: T01
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

Quedó instalado y verificado el stack completo de la PoC. De las siete
herramientas que pedía la tarea faltaban dos: circom y snarkjs. El resto (node,
npm, git, rustc, cargo) ya estaba.

circom se instaló **por el primer camino, `cargo install --git`**, sin pelearlo.
Windows 11, toolchain MSVC, sin WSL y sin binario de release. El comando exacto:

```
cargo install --git https://github.com/iden3/circom.git circom
```

Tardó 2m02s de compilación (`Finished \`release\` profile [optimized] target(s) in
2m 02s`), tiró un montón de warnings de `dead_code` del propio circom que no son
un problema, y terminó con:

```
  Installing C:\Users\Patricio\.cargo\bin\circom.exe
   Installed package `circom v2.2.3 (https://github.com/iden3/circom.git#a100faed)` (executable `circom.exe`)
```

`C:\Users\Patricio\.cargo\bin` ya estaba en el PATH (viene de rustup), así que
`circom --version` responde en una terminal nueva sin configurar nada. **Para el
resto del equipo: en Windows 11 no hace falta WSL ni el binario de release.** Si
alguien tiene que reinstalarlo, el camino documentado alcanza.

Se creó `package.json` con las versiones clavadas (sin `^`), los scripts `estado`
y `verificar:entorno`, y `engines: node >= 20.19.0`. Se creó
`scripts/verificar-entorno.mjs`, que pregunta la versión a cada binario, lee la de
cada paquete de `node_modules`, compara la serie de circom contra el `pragma` de
circomlib y sale con código 1 si algo falta o no coincide. `.gitignore` ya venía de
T00 y cubre lo que hace falta (`node_modules/`, `*.r1cs`, `*.zkey`, `*.ptau`,
`*.wtns`, `*.wasm`, `build/`, `artifacts/`, `cache/`); no hubo que tocarlo.
`package-lock.json` queda versionado a propósito.

Salida real de `npm run verificar:entorno` (código de salida 0):

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

Como el criterio de "hecho" de T01 solo exige que las versiones se impriman, hice
además una prueba de humo fuera del repo para confirmar que la cadena realmente
funciona y no solo que los binarios existen: un circuito de una línea que usa
`Poseidon(1)` de circomlib, compilado con `circom humo.circom --r1cs --wasm -l
<repo>/node_modules`. Terminó en `Everything went okay` (216 restricciones no
lineales, 199 lineales) y `snarkjs r1cs info humo.r1cs` leyó el archivo:
`Curve: bn-128`, `# of Constraints: 415`. Los artefactos no se commitearon; el
procedimiento quedó en la sección 5 de `docs/00-entorno.md` para que se pueda
repetir.

## Decisiones que tomé y por qué

**Hardhat 2.29.1 y no Hardhat 3.17.0.** Hardhat 3 es la versión actual, pero no
corre en esta máquina. Lo verifiqué instalándolo en una carpeta temporal en vez de
leer la documentación: `npx hardhat --version` responde `ERROR: You are using
Node.js 20.19.2 which is not supported by Hardhat. Please upgrade to Node.js
22.13.0 or later.` (y `npm install` avisa `EBADENGINE required: { node: '>= 22' }`).
Con 2.29.1, la última de la serie 2, el mismo comando responde `2.29.1`. Preferí
fijar Hardhat 2 antes que actualizar Node por mi cuenta: cambiar el runtime de la
máquina en una tarea de andamiaje no me corresponde. Queda como pendiente abajo.

**Versiones exactas, sin `^`.** Esta PoC produce números que van a un informe. Si
el entorno se mueve solo entre dos corridas, las mediciones dejan de ser
comparables y nadie se entera. El costo —actualizar a mano— es el correcto para un
ejercicio de semanas.

**Sin `"type": "module"` en `package.json`.** `CONTEXTO.md` pide ESM con `.mjs`;
la extensión explícita ya lo consigue. Poner `"type": "module"` obligaría a
renombrar el `hardhat.config.js` de T09 a `.cjs`, que es una rareza más para
explicar sin ganar nada.

**Las versiones de los paquetes se leen de `node_modules`, no de `package.json`.**
El primero dice lo que corre; el segundo, lo que se pidió. Para un doc que busca
reproducibilidad, la fuente honesta es la primera.

**El chequeo de coherencia compara series del lenguaje, no números de paquete.**
circom `2.2.3` y circomlib `2.0.5` son proyectos distintos con numeraciones
distintas: compararlos entre sí no significa nada. Lo único comparable es el
`pragma circom 2.0.0;` que traen los `.circom` de circomlib contra la serie del
compilador.

**Solo instalé lo que T01 lista.** No agregué `@nomicfoundation/hardhat-ethers`,
`chai` ni el `hardhat-toolbox`: el toolbox arrastra TypeScript y typechain, que
contradicen la convención de `CONTEXTO.md`. Que T09 agregue lo mínimo que necesite.

## Con qué me tropecé

**`execFileSync("npm", ...)` no funciona en Windows.** `npm` no es un `.exe` sino
un `npm.cmd`, y `execFileSync` sin shell no lo resuelve. Se arregla con
`shell: process.platform === "win32"` en las opciones. Vale para cualquier script
futuro de esta PoC que invoque un ejecutable de npm.

**Hardhat 3 instala sin error y falla al usarse.** `npm install` solo emite un
warning `EBADENGINE` y sigue; el error aparece recién al ejecutar. Si no lo hubiera
corrido, habría quedado pinneada una versión inutilizable hasta T09, tres fases más
adelante.

Nada más. circom compiló a la primera y circomlib no dio sorpresas.

## Qué dejo pendiente o candidato a ADR

No apareció ninguna decisión de arquitectura del TPF: esta tarea es instrumental.
**Ninguna candidata a ADR.**

Pendientes, ninguno bloqueante:

- **Node 20.19.2 → Node 22 LTS.** Es decisión de Patricio porque toca la máquina,
  no el repo. Desbloquea Hardhat 3 y actualiza un runtime que está al final de su
  ciclo de soporte. Si se hace, conviene hacerlo **antes** de MED-001: mediciones
  tomadas con runtimes distintos no se comparan.
- **`cargo install --git` no fija un tag.** Toma la punta de la rama por defecto de
  iden3/circom. Acá quedó `2.2.3` del commit `a100faed`; una reinstalación futura
  puede traer otra cosa sin aviso. Si en algún momento hace falta reproducir
  exactamente esta build, el comando es el mismo con `--rev a100faed`.
- **Hardhat todavía no tiene plugins.** Está instalado y responde `--version`, pero
  sin `@nomicfoundation/hardhat-ethers` no se puede desplegar nada. T09 lo agrega.
- **`solc` no está verificado.** Hardhat lo baja solo la primera vez que compila un
  contrato, así que `npm run verificar:entorno` puede pasar en una máquina sin
  conexión donde T09 igual falle.
