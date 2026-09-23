# Plan de ejecución — PoC mini Hito 1, Variación 2

Pertenencia anónima a un conjunto + nulificador, con entradas como NFT y capa de
compromisos. Basado en el documento de Agustina Fontana (`Hito 1.pdf`), sección
POC MINI → CIRCOM → Variación 2.

**Objetivo doble.** El código funcionando es la mitad. La otra mitad, y la que
manda cuando hay que elegir, es que Patricio termine entendiendo cada pieza: qué
hace, por qué está hecha así, qué podría reemplazarla y qué se pagaría por el
cambio. Ante la duda entre "más funcionalidad" y "más entendimiento", gana el
entendimiento.

- Repo de documentación del TPF: `../zk-ticketing-docs`
- Estado de ejecución: [estado.json](estado.json) · cómo retomar: [RETOMAR.md](RETOMAR.md)
- Contexto fijo para agentes: [CONTEXTO.md](CONTEXTO.md)

---

## Supuestos (revisables antes de arrancar)

1. **Circom + snarkjs (Groth16)**, no Noir. Razones: Agustina lo recomienda por
   accesible; el objetivo es entender las restricciones "a manopla" y Circom las
   expone; Groth16 da la prueba más chica, que es justo el dato que necesita
   ADR-011 (QR estático, 2.953 bytes); y habilita el extra `zkey export solidity`.
   Costo: hay que entender el trusted setup. Eso es una ventaja pedagógica, no un
   problema.
2. **La Variación 2 incluye a la Variación 1.** Se construye en escalera: parte
   base (sin blockchain) → contrato que guarda la raíz → contrato que emite NFTs y
   recibe compromisos. Cada escalón enseña algo distinto y el anterior no se tira.
3. **Todo local.** Hardhat levanta una cadena en la propia máquina. Sin testnet,
   sin gas real, sin wallets reales, sin claves de nadie.
4. **Fuera de alcance**: mobile (Variación 3), QR real, NFC, y cualquier decisión
   de arquitectura del TPF. Esto alimenta ADR-008/009/010/011 y MED-001 con
   evidencia; no los cierra.

---

## Arquitectura, y por qué así

Cuatro piezas, tal como las define el documento de Agustina:

```
ORGANIZADOR  --> arma el árbol de Merkle con los compromisos, publica la raíz
ASISTENTE    --> con un secreto + el camino, genera la prueba y el nulificador
VALIDADOR 1  --> 4 chequeos, lista local de nulificadores
VALIDADOR 2  --> idéntico, lista local propia, SIN sincronizar con el 1
```

La decisión de diseño que atraviesa todo el proyecto: **la fuente de la raíz es
un módulo intercambiable**. Los tres escalones no reescriben el organizador ni el
prover ni los validadores; cambian qué implementación de `fuenteDeRaiz` se enchufa:

| Escalón | Implementación | De dónde sale la raíz |
|---|---|---|
| Parte base | `fuentes/json.mjs` | un archivo local |
| Variación 1 | `fuentes/contrato-raiz.mjs` | `RegistroDeRaiz.sol` |
| Variación 2 | `fuentes/contrato-nft.mjs` | `EntradaNFT.sol`, leyendo los compromisos enviados |

Esto no es adorno arquitectónico: es el mecanismo pedagógico. Que la escalera se
suba cambiando **un solo archivo** es la demostración literal de qué es
intercambiable y qué no.

---

## Convención de tareas

Cada tarea la ejecuta un **agente efímero**: una sesión nueva que no vio nada de
esta conversación. Por eso cada tarea de abajo es un encargo autocontenido y dice
exactamente qué leer. Un agente NO lee este plan entero: lee `CONTEXTO.md` (una
página, fija) + su propia tarea + los archivos que la tarea lista.

Una tarea está **hecha** solo si se cumplen las cuatro:

1. El código corre y su verificación pasa (el comando exacto está en la tarea).
2. Existe `docs/<componente>.md` con las 6 secciones de la plantilla de CONTEXTO.
3. Existe `bitacora/TNN-<slug>.md`: qué se hizo, qué se decidió, con qué se tropezó.
4. `estado.json` marca la tarea como `hecha` y hay un commit.

Si un agente no puede terminar, deja la tarea en `bloqueada` con el motivo en su
bitácora. No se inventa un resultado ni se marca hecha a medias.

---

# FASE 0 — Andamiaje

### T00 · Estructura, plan y estado — hecha en la sesión de planificación

Este archivo, `CONTEXTO.md`, `estado.json`, `RETOMAR.md`, `AGENTS.md`,
`CLAUDE.md`, `README.md` y `scripts/estado.mjs`.

### T01 · Entorno verificado

- **Leer**: `CONTEXTO.md`.
- **Hacer**: instalar y fijar versiones de circom (vía `cargo install`), snarkjs,
  circomlib, circomlibjs, Hardhat, OpenZeppelin Contracts y ethers. `npm init`,
  `package.json` con los scripts del proyecto, `.gitignore`.
- **Hecho cuando**: `docs/00-entorno.md` registra la versión **real** de cada
  herramienta (salida de `--version`, no lo que dice la documentación) y
  `npm run verificar:entorno` las imprime todas sin error.
- **Se aprende**: por qué circom es un binario de Rust y snarkjs una librería de
  Node, y por qué las versiones de circom y circomlib tienen que coincidir.

---

# FASE 1 — Parte base (sin blockchain)

### T02 · Paso de control: el Poseidon de JS y el del circuito son el mismo

- **Depende de**: T01. **Leer**: `CONTEXTO.md`, `docs/00-entorno.md`.
- **Hacer**: un circuito mínimo que emita `Poseidon(1)([x])` y un script que
  calcule lo mismo con `circomlibjs`. Comparar para varios valores, incluido el
  borde del campo.
- **Hecho cuando**: `npm run control:poseidon` compara ambos y falla ruidosamente
  si difieren.
- **Por qué primero**: si el hash de JS y el del circuito no coinciden, el árbol
  que arma el organizador no verifica nunca y el error es casi imposible de
  rastrear hacia atrás. Es la falla número uno de estos proyectos.
- **Se aprende**: qué es un hash ZK-friendly, por qué Poseidon y no SHA-256
  (costo en restricciones), y qué es el campo primo sobre el que se trabaja.

### T03 · El circuito de pertenencia

- **Depende de**: T02. **Leer**: `CONTEXTO.md`, `docs/01-poseidon.md`.
- **Hacer**: `circuitos/pertenencia.circom`. Privados: `secreto`, `camino[3]`,
  `indices[3]`. Públicos: `raiz`, `scope`. Salida pública: `nulificador`.
  Adentro: hoja `= Poseidon(secreto)`; subir el árbol y **exigir** que la raíz
  calculada sea igual a la pública; `nulificador = Poseidon(secreto, scope)`.
  Profundidad 3 (8 identidades).
  - **No escribir la verificación del camino de Merkle desde cero.** Primero
    comprobar qué template hay disponible en la versión instalada de circomlib, y
    si no lo hay, el port de Semaphore. Registrar en la bitácora cuál se usó y
    por qué. Solo escribirlo a mano si no existe ninguno.
- **Hecho cuando**: compila, y `docs/02-circuito.md` incluye el **número real de
  restricciones** que reporta el compilador.
- **Heredado de T02**: el paso de control cubre `Poseidon` de aridad 1, pero el
  nulificador usa aridad 2, y cada aridad tiene constantes distintas. Ampliá
  `npm run control:poseidon` a aridad 2 antes de confiar en el nulificador.
  T02 también dejó registrado que las dos implementaciones reducen módulo `p` en
  silencio: dos secretos que difieran en un múltiplo de `p` colisionan. Acá solo
  hay que tenerlo presente; la validación del rango va en el organizador y el
  prover (T05 y T06), no adentro del circuito.
- **Se aprende**: qué es una restricción y por qué un circuito no "ejecuta" sino
  que "verifica"; la diferencia entre señal privada, pública y salida; por qué la
  separación de dominio (Poseidon de 1 entrada para la hoja, de 2 para el
  nulificador) evita colisiones; y qué es una señal sub-restringida, que es la
  clase de bug de seguridad propia de Circom.

### T04 · Trusted setup Groth16

- **Depende de**: T03. **Leer**: `CONTEXTO.md`, `docs/02-circuito.md`.
- **Hacer**: ceremonia local completa: Powers of Tau (fase 1, universal) con al
  menos dos contribuciones, y fase 2 específica del circuito. Exportar la
  `verification_key`. Script reproducible.
- **Hecho cuando**: `npm run setup` regenera todo desde cero y `docs/03-setup.md`
  explica la ceremonia.
- **Advertencia obligatoria en el doc**: esta ceremonia corrida por una sola
  persona en una sola máquina **no es segura**. Quien la corre conoce el residuo
  tóxico y puede falsificar pruebas. Sirve para aprender y para medir; no sirve
  para producción. Decirlo explícitamente.
- **Se aprende**: por qué la fase 1 es reusable y la fase 2 no; por qué tocar una
  línea del circuito invalida la zkey; y la objeción que la KB marca como la más
  peligrosa para el jurado (`kb/objeciones-jurado.md`).

### T05 · Organizador v0 (fuente JSON)

- **Depende de**: T04. **Leer**: `CONTEXTO.md`, `docs/01-poseidon.md`, `docs/02-circuito.md`.
- **Hacer**: generar 8 identidades sintéticas (secreto aleatorio + compromiso
  `Poseidon(secreto)`), armar el árbol en JS, guardar raíz y árbol en JSON, y los
  secretos en un archivo aparte que simula "lo que cada comprador guarda para sí".
  Implementar `fuentes/json.mjs` contra la interfaz de `fuenteDeRaiz`.
- **Hecho cuando**: `npm run organizador` produce los artefactos y es determinista
  con semilla fija.
- **Se aprende**: qué es un compromiso y por qué el árbol se arma con compromisos
  y no con secretos; qué es el conjunto de anonimato y por qué 8 es ridículamente
  chico (engancha con ADR-001).

### T06 · Asistente / prover

- **Depende de**: T05. **Leer**: `CONTEXTO.md`, `docs/02-circuito.md`, `docs/04-organizador.md`.
- **Hacer**: tomar una identidad y un scope, calcular el camino de Merkle, generar
  el witness y la prueba Groth16, serializar prueba + señales públicas a archivo.
  **Medir y registrar**: tiempo de generación y tamaño real en bytes, tanto del
  JSON de snarkjs como de una serialización binaria compacta.
- **Hecho cuando**: `npm run probar -- --identidad 3 --scope evento-A` produce la
  prueba e imprime tiempo y tamaño.
- **Se aprende**: qué entra al circuito y qué sale; por qué el tamaño del JSON no
  es el tamaño de la prueba; y por qué esos dos números son exactamente los que
  necesitan MED-001 (contra el presupuesto de 5 s de ADR-004) y ADR-011 (contra
  los 2.953 bytes del QR estático).

### T07 · Validadores x2

- **Depende de**: T06. **Leer**: `CONTEXTO.md`, `docs/05-prover.md`.
- **Hacer**: dos scripts casi idénticos, cada uno con su propia lista local de
  nulificadores usados y **sin sincronizarse**. Cuatro chequeos, en este orden:
  1. que la raíz de la prueba sea **la suya**, la que descargó antes de quedar offline;
  2. que el scope sea el de **su** evento;
  3. que la prueba verifique criptográficamente;
  4. que el nulificador no esté en su lista. Si pasa todo, lo agrega y acepta.
- **Hecho cuando**: `npm run validar -- --puerta 1 --prueba <archivo>` funciona y
  `docs/06-validador.md` explica por qué los dos primeros chequeos son los críticos.
- **Ojo**: el orden de las señales públicas que devuelve snarkjs (salidas primero,
  después entradas públicas) hay que verificarlo, no asumirlo. Dejarlo anotado.
- **Se aprende**: que una prueba puede ser matemáticamente válida y aun así
  inaceptable; si el validador confía en los valores públicos que le trae la
  prueba en vez de compararlos con los suyos, cualquiera arma su propio árbol y entra.

### T08 · Demostraciones y pruebas negativas

- **Depende de**: T07. **Leer**: `CONTEXTO.md`, `docs/06-validador.md`.
- **Hacer**, como suite ejecutable:
  - Positivas: entra por el validador 1 → aceptada. Se repite en el 1 → rechazada
    por doble ingreso. **La misma prueba en el validador 2 → aceptada**: el
    problema de coordinación entre puertas, expuesto a propósito (ADR-009).
    Misma identidad con otro scope → nulificador sin relación visible con el anterior.
  - Negativas: prueba del evento B en una puerta del evento A → rechazada. Prueba
    con un byte alterado → rechazada. Secreto que no está en el árbol → **ni
    siquiera llega a generar prueba**, falla el witness.
- **Hecho cuando**: `npm test` corre las siete y las siete dan lo esperado.
- **Se aprende**: que el doble ingreso entre puertas distintas no lo resuelve el
  ZK — es el frente abierto ADR-009 — y que el ZK resuelve otra cosa: que nadie
  sepa cuál de los ocho sos.

---

# FASE 2 — Variación 1 (el contrato mínimo)

### T09 · `RegistroDeRaiz.sol` + Hardhat

- **Depende de**: T08. **Leer**: `CONTEXTO.md`, `docs/04-organizador.md`.
- **Hacer**: Hardhat con cadena local, contrato de dos funciones (`setRaiz`,
  `getRaiz`), y `fuentes/contrato-raiz.mjs`. El organizador escribe la raíz con
  una transacción real; el resto la lee gratis.
- **Hecho cuando**: toda la suite de T08 pasa **sin tocar** prover ni validadores,
  solo cambiando la fuente.
- **Se aprende**: cuál es la porción mínima que necesita estar on-chain (la raíz,
  y nada más); que el secreto, la prueba y el nulificador no tocan nunca la cadena;
  y qué significa que una lectura sea gratis y una escritura no.

### T10 · (Opcional) Verificador Groth16 on-chain

- **Depende de**: T09.
- **Hacer**: `snarkjs zkey export solidity`, desplegarlo, verificar una prueba
  on-chain y **medir el gas**.
- **Se aprende**: cómo sería verificar en la cadena en vez de en la puerta, y por
  qué rompe el principio offline del ADR-002. Se hace para entender la alternativa,
  no para adoptarla. Si el tiempo aprieta, esta tarea se saltea.

---

# FASE 3 — Variación 2 (el objetivo)

### T11 · `EntradaNFT.sol`

- **Depende de**: T09. **Leer**: `CONTEXTO.md`, `docs/08-contrato-raiz.md`.
- **Hacer**: ERC-721 con la implementación de referencia de OpenZeppelin (no
  escribirlo de cero), más `enviarCompromiso(tokenId, compromiso)` con
  `require(ownerOf(tokenId) == msg.sender)`, almacenamiento de compromisos y
  evento. Se conserva la raíz de la V1.
- **Hecho cuando**: tests del contrato, incluyendo que un tercero **no** puede
  enviar el compromiso de un token ajeno.
- **Se aprende**: el punto clave de toda la variación. Emitir un NFT no da
  privacidad: `ownerOf` devuelve una wallet pública. Lo que hace falta es separar
  dos capas — **quién es dueño del NFT** (público; sirve para reventa y regalías,
  ADR-005) de **qué secreto entra al árbol** (privado; sostiene el anonimato en
  la puerta, ADR-001). Es la distinción "es NFT" vs "es ZK" del `AGENTS.md` del
  repo de docs, hecha código.

### T12 · Flujo completo con compradores

- **Depende de**: T11.
- **Hacer**: mintear 8 NFTs a 8 cuentas de prueba de Hardhat → cada "comprador"
  genera su secreto localmente y envía **su** compromiso desde **su** cuenta → el
  organizador ya no inventa la lista: arma el árbol leyendo los compromisos que
  efectivamente llegaron → publica la raíz. `fuentes/contrato-nft.mjs`.
- **Hecho cuando**: el árbol sale de la cadena y la suite de T08 pasa entera.
- **Se aprende**: por qué ahora el organizador no conoce ningún secreto, y qué
  cambia eso respecto de la parte base, donde los generaba él.

### T13 · Cierre de la escalera

- **Depende de**: T12.
- **Hacer**: correr las tres fuentes sobre el mismo código, una tabla comparativa,
  y responder la pregunta incómoda: **¿el vínculo público wallet ↔ compromiso rompe
  el anonimato en la puerta?** (Respuesta corta: no, porque la prueba no revela
  qué hoja es; el conjunto de anonimato siguen siendo las 8. Pero hay que
  argumentarlo bien, no afirmarlo.)
- **Se aprende**: a defender el claim del ADR-001 con el sistema real delante.

---

# FASE 4 — Documentación transversal

Las docs por componente se escriben **dentro de cada tarea**, no acá. Estas tres
necesitan la foto completa.

### T14 · `RECORRIDO.md`

Tour guiado en orden de lectura, desde el hash hasta el NFT, pensado para leerse
de una sentada con el código al lado. Es el punto de entrada del repo.

### T15 · `INTERCAMBIABLES.md` — el núcleo del pedido

Matriz de cada pieza: qué se usó, qué alternativas hay, qué se gana, qué se
pierde, y qué habría que tocar para cambiarla. Cubre al menos: Circom vs Noir vs
zkVM; Groth16 vs UltraHonk vs WHIR; Poseidon vs MiMC vs Skyscraper; árbol de
Merkle vs alternativas; JSON vs contrato como fuente de raíz; verificación en
puerta vs on-chain; QR estático vs animado vs NFC. Cada fila enlaza al ADR que
tiene la decisión abierta y a la entrada de KB que la respalda.

### T16 · `EXPERIMENTOS.md`

Roturas deliberadas, con el resultado esperado, para aprender rompiendo: sacar una
restricción del circuito y ver que entra un secreto que no está en el árbol;
cambiar el scope y ver el nulificador; regenerar la zkey y ver que las pruebas
viejas dejan de verificar; hacer que el validador confíe en la raíz de la prueba
en vez de la suya y entrar con un árbol propio.

---

# FASE 5 — Devolver al repo de docs

### T17 · Evidencia al TPF

- **Hacer** en `../zk-ticketing-docs`, **con confirmación explícita de Patricio**:
  números medidos a `MED-001` (método, hardware, resultados); registro de
  exploración en ADR-010 y ADR-011; nota en `docs/plan.md` sobre el Hito 1;
  completar la fila del subsistema en `AGENTS.md` cuando el repo esté en GitHub.
- **Cómo**: con el procedimiento `registrar-medicion` y cierre por `cerrar-sesion`.
  Rama y PR. El push lo hace Patricio.
- **Ojo**: nada de esto cierra un ADR. La PoC aporta evidencia; las decisiones se
  cierran en la weekly, con revisión de otro integrante.

---

## Riesgos conocidos

| Riesgo | Señal temprana | Qué hacer |
|---|---|---|
| Poseidon de JS distinto al del circuito | la raíz no verifica nunca | T02 existe justamente para esto, antes de escribir nada |
| Versiones de circom y circomlib desalineadas | errores de compilación raros | versiones fijadas y registradas en T01 |
| No hay template de Merkle en circomlib | — | T03 lo verifica primero; fallback al port de Semaphore |
| `circom` no instala vía cargo en Windows | falla `cargo install` | binario de release; si tampoco, WSL. Registrar cuál se usó |
| El plan se vuelve una PoC grande | tareas que crecen | si una tarea no entra en una sesión de agente, se parte en dos |
