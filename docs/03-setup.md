# Trusted setup Groth16

## 1. Qué hace

`npm run setup` corre de punta a punta la ceremonia que Groth16 necesita para el
circuito de T03: la fase 1 (Powers of Tau, universal) con dos contribuciones y un
beacon, la fase 2 específica de `circuitos/pertenencia.circom`, y el export de la
`verification_key`. Deja en `build/setup/` la `zkey` con la que T06 va a generar
pruebas y la clave con la que T07 las va a verificar.

**Esta ceremonia no es segura y no puede usarse en producción.** La corre una sola
persona en una sola máquina, así que hay un momento en que un único proceso conoce
todos los secretos que había que destruir. Quien los tenga puede fabricar pruebas
falsas que cualquier verificador acepta: entradas que nunca se compraron. Sirve
para aprender cómo es el mecanismo y para medir cuánto cuesta. La sección 3
explica qué es exactamente ese residuo y qué haría falta para que la ceremonia sí
valiera algo.

## 2. Cómo lo hace

### Antes del código: por qué hay una ceremonia

Groth16 es un sistema de pruebas con una característica incómoda y otra excelente.
La excelente es que la prueba es de tamaño constante —tres puntos de curva
elíptica, unos cientos de bytes— y se verifica en milisegundos sin importar si el
circuito tiene dos mil restricciones o dos millones. Es lo que lo hace candidato
para un molinete y para una verificación on-chain barata.

La incómoda es de dónde salen esos parámetros. Para poder verificar en tiempo
constante, el verificador no recorre el circuito: usa una **cadena de referencia
común** (CRS), un conjunto de puntos de curva precalculados que codifican el
sistema de ecuaciones del circuito. Esos puntos se construyen evaluando polinomios
en un punto secreto —llamémoslo `tau`— y publicando únicamente `g^tau`, `g^tau²`,
`g^tau³`… Lo que se publica no revela `tau`: recuperarlo sería resolver el
logaritmo discreto.

El problema es el otro lado. Quien **sí** conoce `tau` (y los otros secretos de la
CRS, `alpha`, `beta`, `gamma`, `delta`) puede construir un argumento que pasa la
verificación sin tener ningún witness detrás. Puede probar que conoce una entrada
válida sin tenerla. Por eso a esos secretos se los llama **residuo tóxico**: el
protocolo exige que alguien los genere y que después nadie los tenga.

Una ceremonia es el procedimiento que hace que "nadie los tenga" sea una
afirmación con algún respaldo: varios participantes aportan cada uno una parte del
secreto, de modo que el secreto final es el producto de todos y hay que conocerlos
todos para reconstruirlo. La sección 3 desarrolla por qué alcanza con que uno solo
sea honesto, y por qué acá eso no se cumple.

### Dos fases, y la diferencia entre ellas

La ceremonia de Groth16 se parte en dos por una razón que es mitad matemática y
mitad práctica.

La **fase 1** produce las potencias de `tau`: `g^tau^i` para `i` de 0 a `2^n`. Eso
no depende de ningún circuito. Cualquier circuito que quepa en ese tamaño puede
usar el mismo archivo. Es el trabajo caro y es el que conviene hacer entre muchos,
una sola vez, para todo el ecosistema.

La **fase 2** toma esas potencias y las combina con el sistema de ecuaciones de
**un** circuito concreto, agregando dos secretos nuevos propios de ese circuito.
El resultado es la `zkey`, y no sirve para ningún otro circuito ni siquiera para
el mismo circuito con una línea cambiada.

El script hace las dos, en ese orden, y la salida está separada en dos bloques
justamente para que se vea cuál es cuál.

### El recorrido del script

`scripts/setup-groth16.mjs` se lee de arriba hacia abajo en el orden en que corre.

**Cuánto tiene que medir el ptau.** `scripts/setup-groth16.mjs:112`
(`potenciaMinima`) calcula el tamaño mínimo a partir del `.r1cs`, con la misma
cuenta que hace snarkjs por dentro. La fórmula está en
`node_modules/snarkjs/src/zkey_new.js:59`:

```js
const cirPower = log2(r1cs.nConstraints + r1cs.nPubInputs + r1cs.nOutputs +1 -1) +1;
```

con `log2` entero (piso). Para nuestro circuito: 2513 restricciones + 2 entradas
públicas + 1 salida = 2516; `floor(log2(2516)) = 11`; más uno, **12**. De ahí sale
el `2^12 = 4096` de `scripts/setup-groth16.mjs:36`, y el script lo vuelve a
calcular en cada corrida en vez de confiar en la constante: si mañana el circuito
crece, `scripts/setup-groth16.mjs:165` aborta con el número que hay que poner.

El `+1` final de la fórmula no es un margen de seguridad arbitrario: el dominio de
evaluación tiene que ser estrictamente mayor que el tamaño del sistema, porque el
polinomio que se interpola necesita un grado más. La consecuencia práctica es que
un circuito de exactamente 4096 restricciones ya no entra en `2^12`.

**Fase 1.** `scripts/setup-groth16.mjs:178` crea el acumulador vacío
(`powersOfTau.newAccumulator`): un archivo con las potencias de `tau = 1`, que no
tiene ningún secreto y que existe solo para que la primera contribución tenga algo
que multiplicar. `:181` y `:184` son las dos contribuciones
(`powersOfTau.contribute`). Cada una toma el archivo anterior, elige un secreto
propio `s`, eleva cada punto a la potencia que corresponde y deja el archivo
nuevo. El `tau` resultante es el producto de los aportes.

`:187` es el **beacon**, que es una contribución final distinta: su aleatoriedad no
es secreta sino pública, de modo que no queda nadie con algo que destruir. Qué
problema resuelve y por qué el nuestro no lo resuelve, en la sección 3.

`:197` (`powersOfTau.verify`) recorre la cadena entera y comprueba que cada
contribución sea una potenciación legítima de la anterior. Es lo que permite que
un tercero audite la ceremonia sin confiar en los participantes: no puede saber si
destruyeron el secreto, pero sí que nadie puso basura.

`:201` (`preparePhase2`) es el paso más caro de toda la corrida —36 de los 53
segundos— y el que menos se entiende de nombre. Convierte las potencias de `tau`,
que están en forma de coeficientes, a la forma de evaluaciones (una FFT sobre el
dominio de 4096 puntos) y deja las cuatro secciones que la fase 2 va a leer. Es
cálculo puro: no agrega ni quita secretos. Por eso el archivo pasa de 1541 kB a
4612 kB.

**Fase 2.** `:209` (`zKey.newZKey`) es el primer momento en que el circuito
aparece: lee `build/pertenencia.r1cs`, lo convierte a la forma polinómica que usa
Groth16 y combina cada polinomio con las potencias de `tau` del ptau. El resultado
es una `zkey` que ya está atada a este circuito y a ningún otro. `:212` le agrega
una contribución, `:221` la cierra con el beacon.

`:231` (`zKey.verifyFromR1cs`) es la verificación importante: comprueba que la
`zkey` final corresponda **a ese `.r1cs` y a ese ptau**, y que la cadena de
contribuciones sea legítima. Es el chequeo que detecta el error de haber cambiado
el circuito sin rehacer el setup; la sección 5 lo hace fallar a propósito.

`:236` exporta la `verification_key`: el puñado de puntos que necesita el
verificador, 3,5 kB contra los 1149 kB de la `zkey`. Esa asimetría es el punto
central del diseño de un molinete: el que prueba carga un megabyte, el que verifica
carga tres y medio.

`:243` genera una **segunda `zkey`** del mismo circuito, a partir de la misma zkey
inicial pero con otra entropía. No forma parte de la ceremonia: existe para la
demostración de la sección 5.

**Control.** `:276` genera una prueba de verdad con la `zkey` recién hecha, usando
el mismo árbol de ocho identidades de T03, y `:282` la verifica contra su propia
`verification_key`. Sin esto, el script podría dejar archivos bien formados y
completamente inútiles.

`:293` verifica **la misma prueba contra la `verification_key` de la otra
ceremonia**, y `:300` la verifica contra sus señales públicas con el nulificador
alterado en uno. Las dos tienen que dar que no. Son los dos tests negativos de esta
tarea, en la misma lógica que los cinco testigos inválidos de T03: un setup que
produce pruebas que verifican no está probado hasta que se muestra qué es lo que
**no** verifica.

### Lo que produce, y dónde

Todo va a `build/setup/`, que `.gitignore` excluye entero (por `build/`, y además
por `*.ptau` y `*.zkey`). Nada de esto se commitea y está bien: son 14 MB
regenerables con un comando. La contrapartida está en la sección 3.

| Archivo | Tamaño | Qué es |
|---|---|---|
| `pot_0000.ptau` … `pot_beacon.ptau` | ~1540 kB c/u | La cadena de la fase 1, contribución por contribución |
| `pot_final.ptau` | 4612 kB | La fase 1 después de `prepare phase2`. **Reusable por cualquier circuito de hasta 2^12** |
| `pertenencia_0000.zkey` … `pertenencia.zkey` | ~1150 kB c/u | La cadena de la fase 2. La última es la que usa el prover |
| `verification_key.json` | 3547 bytes | Lo que necesita el verificador |
| `pertenencia_otra.zkey`, `verification_key_otra.json` | | La segunda ceremonia, solo para la demostración |
| `prueba.json`, `senales_publicas.json`, `prueba.wtns` | 855 bytes, 1 kB, 79 kB | La prueba de control |

## 3. Por qué está hecho así

### Qué es exactamente el residuo tóxico, y qué puede hacer quien lo tenga

Conviene ser preciso, porque es la pregunta que el jurado va a hacer y una
respuesta vaga se nota.

Los secretos son `tau`, `alpha` y `beta` de la fase 1, y `gamma` y `delta` de la
fase 2. Quien los conoce puede construir, para **cualquier** enunciado público que
elija, tres puntos que pasan la ecuación de verificación de Groth16. No necesita
ningún witness: arma la prueba desde el álgebra. En este sistema eso significa
presentarse en la puerta con un nulificador inventado y una prueba que el validador
acepta, sin haber comprado ninguna entrada y sin estar en ningún árbol. Y puede
hacerlo tantas veces como quiera, con un nulificador distinto cada vez, así que la
defensa contra el doble uso tampoco lo frena.

Lo que **no** puede hacer, y esto es importante para no sobrevender el riesgo, es
enterarse de quién es quién. La propiedad de conocimiento cero de Groth16 no
depende de que esos secretos estén destruidos: las pruebas honestas no revelan el
witness ni siquiera frente a quien tiene el residuo. O sea que el residuo tóxico
rompe la **solidez** (se pueden inventar entradas) y no rompe la **privacidad**
(no se puede saber cuál de los compradores entró).

Traducido al vocabulario del proyecto: el residuo tóxico ataca lo que en este
sistema protege el contrato —que una entrada sea auténtica— y no ataca lo único
que aporta el ZK. Que igual sea la objeción más grave es obvio: un sistema de
ticketing donde alguien puede fabricar entradas no tiene nada que discutir después.

### Por qué la fase 1 es reusable y la fase 2 no

La diferencia no es una convención: es qué información entró en cada archivo.

La fase 1 solo contiene potencias de un número secreto: `g^tau^0`, `g^tau^1`,
`g^tau^2`, … hasta `2^12`. No hay nada ahí que mencione un circuito. Cualquier
sistema de ecuaciones que quepa en ese grado puede evaluar sus polinomios en esos
puntos. Por eso existen ceremonias públicas gigantes —Perpetual Powers of Tau, con
cientos de participantes independientes— cuyo archivo usa medio ecosistema: el
trabajo de confianza se hace una vez y se amortiza entre todos los proyectos.

La fase 2 toma los polinomios de **este** circuito —las matrices A, B y C del
`.r1cs`, que son literalmente las ecuaciones que escribimos en T03— y las evalúa
en esas potencias, con dos secretos nuevos encima. El resultado codifica el sistema
de ecuaciones. Cambiar una línea del circuito cambia las ecuaciones, y las
ecuaciones viejas ya no describen el circuito nuevo. No hay forma de "actualizar"
una zkey: hay que rehacer la fase 2 (barata: 5,7 segundos acá) sobre la misma fase 1
(cara: 46 segundos acá, y meses de coordinación en una ceremonia real).

Esa asimetría es la que hace que la respuesta al jurado sea viable: la parte
imposible de organizar por un equipo de cuatro personas es justo la que **no** hay
que organizar, porque ya está hecha y se descarga. La parte que sí hay que
organizar es chica y se puede hacer con cinco participantes en una tarde.

### Por qué alcanza con que una sola contribución sea honesta

Esta es la propiedad que hace que una ceremonia tenga sentido, y es más simple de
lo que parece.

Cada participante `i` elige su secreto `s_i` y deja el archivo elevado a esa
potencia. Después de `n` contribuciones, el secreto efectivo es el producto
`s_1 · s_2 · … · s_n`. Para reconstruirlo hay que conocer **todos** los factores:
si uno solo de los participantes eligió el suyo al azar y lo destruyó, el producto
es un número que nadie sabe, por más que los otros `n-1` se hayan coordinado entre
ellos y hayan guardado los suyos. De ahí el nombre: supuesto **1-de-n honesto**.
No hace falta confiar en la mayoría, ni en un tercero, ni saber quién fue el
honesto. Alcanza con que haya existido.

Eso es lo que hace que la defensa correcta ante el jurado no sea "confíen en
nosotros" sino "acá está la lista de participantes, elegí uno cualquiera y
preguntale si destruyó su secreto; si te convence uno solo, el sistema es sólido".
Y por eso la verificación de `scripts/setup-groth16.mjs:197` importa aunque no
pueda comprobar ninguna destrucción: establece que cada eslabón de la cadena es
legítimo, que es lo único que un tercero puede comprobar.

### Por qué esta ceremonia, así corrida, no es segura

Con lo anterior en la mano la respuesta se dice sola: **acá `n = 1`**. Las dos
contribuciones de la fase 1 y la de la fase 2 las hace el mismo proceso, en la
misma máquina, en el mismo segundo. El supuesto 1-de-n honesto necesita que exista
al menos un participante independiente, y acá no hay ninguno: el que corrió el
script tuvo, en un momento, todos los factores en memoria.

`scripts/setup-groth16.mjs:73` genera la entropía con `randomBytes(32)` y no la
escribe a ningún lado; snarkjs la mezcla con 64 bytes del generador del sistema
(`node_modules/snarkjs/src/misc.js:182`) antes de derivar el secreto. Todo eso es
higiene razonable y **no cambia nada**: un proceso que quisiera conservar el
residuo solo tiene que imprimirlo, y nadie desde afuera puede distinguir una
corrida que lo destruyó de una que lo guardó. Esa indistinguibilidad es el punto
entero. Una ceremonia no es segura porque el operador sea confiable; es segura
porque no hace falta que lo sea.

Lo mismo vale para el beacon de `scripts/setup-groth16.mjs:43`. Un beacon es una
contribución cuya aleatoriedad es pública y verificable por cualquiera —el ejemplo
canónico es el hash de un bloque de Bitcoin futuro, elegido por fecha y hora antes
de que ese bloque exista—, y su función es cerrar la ceremonia sin dejar a nadie
con un secreto. El nuestro es una constante escrita a mano. Cumple exactamente la
forma del paso y ninguna de sus propiedades: quien elige el valor podría haberlo
elegido para que le convenga. Está ahí para que el script tenga la estructura
completa de una ceremonia real, no para aportar seguridad.

**Qué haría falta para que esta ceremonia sí sirviera**, en orden de esfuerzo
creciente:

1. Usar para la fase 1 un ptau de una ceremonia pública existente en vez de
   generarlo acá. Es una descarga y un cambio de tres líneas en el script, y se
   lleva puesta la parte más difícil del problema.
2. Correr la fase 2 entre varios participantes reales, en máquinas distintas, con
   el flujo de challenge/response de snarkjs: cada uno recibe un archivo, aporta,
   publica el hash del resultado y una declaración firmada de que destruyó su
   entropía. Es lo que hicieron Tornado Cash y Semaphore, y está documentado.
3. Cerrar con un beacon de verdad, anunciado con anticipación y tomado de una
   fuente pública posterior al anuncio.
4. Publicar la cadena completa —cada archivo intermedio, cada hash, cada
   declaración— para que un tercero pueda correr la verificación por su cuenta.

Nada de eso es investigación: es logística. Pero es logística que hay que hacer
antes de decir que el sistema es sólido, y por eso la PoC la deja explícitamente
afuera en vez de simularla a medias.

### Por qué el script calcula la potencia mínima en vez de confiar en la constante

Porque snarkjs falla en silencio. Si el ptau es chico, `zKey.newZKey` **no lanza
ninguna excepción**: escribe un mensaje en el logger, devuelve `-1` y deja un
archivo `.zkey` de **cero bytes**
(`node_modules/snarkjs/src/zkey_new.js:61`). Nuestro script pasa `null` como
logger para que la salida sea legible, así que ese mensaje ni siquiera se
imprimiría: una corrida con un ptau insuficiente terminaría "bien", con un archivo
vacío, y el error aparecería recién en T06 al intentar probar. Lo medí; está en la
sección 5.

La guarda de `scripts/setup-groth16.mjs:165` convierte ese fallo silencioso en un
error con el número exacto que hay que poner. Es el mismo criterio que en T03: la
herramienta te deja pasar, y el control lo escribe uno.

### Por qué el script compila el circuito si hace falta

`scripts/setup-groth16.mjs:79` (`asegurarCircuito`) invoca a `circom` con los
mismos argumentos que T03 si no encuentra el `.r1cs` o el `.wasm`. Como `build/`
está en `.gitignore`, un clon limpio del repositorio no tiene ninguno de los dos, y
sin esto `npm run setup` fallaría con un error de archivo faltante en una tarea
que no es la suya. El requisito de la tarea es que la ceremonia se regenere entera
desde cero, y "desde cero" incluye compilar.

### Por qué las funciones del árbol están duplicadas

`armarArbol` y `caminoDe` son copias de las de `scripts/circuito-pertenencia.mjs`.
Duplicar código no es gratis y en general está mal, pero acá la alternativa era
extraerlas a un módulo común, y eso significa mover líneas en el script de T03,
que `docs/02-circuito.md` cita por número de línea en cinco lugares. Documentación
que apunta a la línea equivocada es peor que treinta líneas repetidas. Queda
anotado en la bitácora: el lugar natural para unificarlo es T05, que va a
construir el árbol de verdad y va a necesitar esas funciones como parte del
organizador, no como utilidades de un banco de pruebas.

### Por qué no se commitea nada de la ceremonia

`.gitignore` ya excluía `*.ptau` y `*.zkey`, y `build/` entero. Es la decisión
correcta —son 14 MB por corrida y se regeneran con un comando— pero tiene una
consecuencia que hay que tener presente y que el script no puede evitar:

**Cada corrida de `npm run setup` produce una `zkey` y una `verification_key`
distintas.** La entropía es aleatoria, así que la ceremonia es *reproducible* en el
sentido de que se puede volver a correr entera y obtener un setup válido, no en el
sentido de que produzca los mismos bytes. Una prueba generada antes de una corrida
nueva deja de verificar después de ella. Es exactamente el mismo fenómeno que
demuestra la sección 5 con la segunda `zkey`, y la regla práctica que se desprende
es simple: **la prueba, la `zkey` y la `verification_key` tienen que venir siempre
de la misma corrida.** Cuando T09 publique la clave on-chain, ese acoplamiento pasa
a ser un problema de despliegue de verdad; acá alcanza con no borrar `build/setup/`
en la mitad de una demo.

## 4. Qué podrías cambiar

**La fase 1: generada acá → un ptau de una ceremonia pública.** Es el cambio más
importante de esta lista y el más barato de implementar: descargar el archivo de
una ceremonia con cientos de participantes independientes y saltear los cuatro
primeros pasos del script. Se gana la única propiedad que hoy falta por completo —
el supuesto 1-de-n honesto sobre la mitad más cara de la ceremonia— y se pierde que
`npm run setup` deje de ser autocontenido: pasa a depender de una descarga grande y
de verificar que el archivo bajado sea el que dice ser. Tocaría
`scripts/setup-groth16.mjs`. Para el TPF esta es la respuesta al jurado, no una
alternativa: la PoC genera el suyo para que se vea el mecanismo completo, no porque
convenga.

**El sistema de pruebas: Groth16 → PLONK o fflonk.** snarkjs implementa los tres.
Los dos últimos usan un setup **universal y actualizable**: no hay fase 2 por
circuito, así que cambiar una línea del circuito no obliga a rehacer ninguna
ceremonia, y desaparece la mitad del problema que explica este documento. Se paga
con pruebas más grandes y verificación más cara, que es exactamente lo que esta
PoC tiene que medir antes de opinar: si la prueba no entra en un QR, la Variación 2
tiene otro problema. `kb/objeciones-jurado.md` en el repo de docs anota UltraHonk
en la misma línea. Tocaría el prover (T06), el validador (T07) y el verificador
on-chain (T10), y es una decisión de ADR, no de acá.

**La potencia: 12 → la que pida el circuito de verdad.** Hoy 2^12 = 4096 cubre las
2513 restricciones con poco margen. T03 midió que subir el árbol a profundidad 20
—un millón de entradas— lleva el circuito a 11438 restricciones, que necesitan
2^14. El costo de la fase 1 crece con el tamaño, no con el circuito: un ptau más
grande sirve para todos los circuitos más chicos, así que si se va a generar uno,
conviene generarlo holgado. Es cambiar `scripts/setup-groth16.mjs:36`.

**El beacon: constante inventada → fuente pública.** Anunciar con anticipación qué
bloque de qué cadena se va a usar y tomar su hash cuando exista. No cambia nada del
código salvo de dónde sale el valor de `scripts/setup-groth16.mjs:43`, y convierte
un paso decorativo en uno real.

**Las contribuciones: un proceso → varias personas.** snarkjs expone
`powersOfTau.exportChallenge` e `importResponse` justamente para esto: el
coordinador genera un archivo de desafío, cada participante lo procesa en su
máquina y devuelve una respuesta, y el coordinador la incorpora. Es más trabajo de
coordinación que de código. Lo que se gana es la única cosa que hace que una
ceremonia valga algo; lo que se pierde es que `npm run setup` ya no corre solo.

**La `verification_key`: archivo en `build/` → fija en el repositorio o on-chain.**
Hoy la clave se regenera en cada corrida y vive en un directorio ignorado. Cuando
haya que verificar pruebas desde un contrato (T10) o desde un molinete que no corre
el setup (T07), la clave tiene que ser un dato fijo y versionado, no un subproducto.
Es la discusión de qué se congela y cuándo, y aparece de nuevo en T09.

## 5. Probalo vos

Desde la raíz del repo:

```bash
npm run setup
```

Tarda menos de un minuto. Salida real de una corrida del 2026-09-23 con `build/`
borrado —por eso la primera línea es la del circuito compilándose—, sin las
advertencias de descriptores de archivo que imprime snarkjs de a ratos. Hardware:
Intel Core i5-14400F, 16 hilos, 16 GB de RAM, Windows 11 Pro 10.0.26200, node
v20.19.2, snarkjs 0.7.6.

```
Trusted setup Groth16 para circuitos/pertenencia.circom
ADVERTENCIA: ceremonia de una sola persona en una sola maquina.
NO ES SEGURA. Sirve para aprender y para medir. Ver docs/03-setup.md.

Circuito compilado (no estaba en build/).

Tamano del circuito
  restricciones     2513
  entradas publicas 2
  salidas           1
  potencia minima   2**12 = 4096
  potencia usada    2**12 = 4096

Fase 1 - Powers of Tau (universal: no sabe nada del circuito)

  arranque sin contribuciones                      335 ms
  contribucion 1                                  3073 ms
  contribucion 2                                  2858 ms
  beacon (cierre de la fase 1)                    3169 ms
  verificacion de la cadena de la fase 1           617 ms
  prepare phase2                                 35842 ms

  ptau final: 4612 kB (sirve para cualquier circuito de hasta 2**12)

Fase 2 - zkey (especifica de este circuito)

  zkey inicial desde el .r1cs                     1994 ms
  contribucion 1                                   643 ms
  beacon (cierre de la fase 2)                     641 ms
  verificacion contra el .r1cs y el ptau          2461 ms
  export de la verification key                      9 ms
  segunda zkey (otra ceremonia, mismo circuito)     639 ms

  zkey:  1149 kB
  vkey:  3 kB

Control - una prueba generada con esta zkey

  calculo del witness                               82 ms
  generacion de la prueba                          351 ms
  verificacion contra su propia vkey                45 ms

  senales publicas [nulificador, raiz, scope]
    13958008681850683262116059744170178113099221759039031649483790525027830032801
    18671017815487546595076512029472066822531342561155042486011578944804634860499
    1234
  prueba: 1 kB
  verifica contra su propia vkey   si

Demostracion - la misma prueba contra la vkey de la otra ceremonia

  Mismo circuito, mismas senales publicas, otra ceremonia de fase 2.
Invalid proof

  verifica contra la vkey ajena    no (correcto)
  verifica con el nulificador +1   no (correcto)

Tiempos

  total de los pasos medidos       52.8 s

Setup completo en build/setup/. Recorda: esta ceremonia NO ES SEGURA.
Ver docs/03-setup.md.
```

Cuatro cosas para mirar además del "correcto".

La primera: **el nulificador es el mismo número que imprimió T03**
(`13958008…32801`). El circuito no cambió; lo que hay ahora es una prueba
criptográfica de ese cálculo en vez de un witness.

La segunda: **el reparto de los tiempos**. `prepare phase2` se lleva 35,8 de los
52,8 segundos, el 68% de todo lo medido, y no tiene nada de secreto adentro: es
una FFT. Toda la fase 2 —lo que hay que rehacer cuando el circuito cambia,
incluida su verificación— son 5,7 segundos.

La tercera: **la prueba pesa 855 bytes y se verifica en 45 ms**, contra una `zkey`
de 1149 kB. Esos números no son la medición MED-001 y no hay que citarlos como tal:
salieron de una sola corrida, sin repeticiones, en una máquina de escritorio y no
en un teléfono. Son el orden de magnitud, y lo que hacen es habilitar T06.

La cuarta: **`Invalid proof`** lo imprime snarkjs, no el script. Es la línea que
prueba que la demostración cruzada realmente corrió.

### La demostración: una prueba no verifica contra la clave de otra ceremonia

Es el punto central de la tarea y ya está adentro de la corrida normal. Vale la
pena entender qué compara exactamente:

- El **circuito es el mismo**. Las dos `zkey` salen de la misma
  `pertenencia_0000.zkey`, o sea del mismo `.r1cs`.
- Las **señales públicas son las mismas**: mismo nulificador, misma raíz, mismo
  scope.
- Lo único que difiere es la **entropía de la contribución de fase 2**.

Y alcanza para que la verificación dé que no. Es la contracara del `<--` de T03:
allá el circuito aceptaba algo que no debía; acá el verificador rechaza algo que
"debería" andar. Los dos apuntan a lo mismo: en este stack, que algo parezca
correcto no significa nada, y lo único que vale es lo que se ejecuta.

La consecuencia práctica, para no perder una tarde: si T06 genera una prueba y T07
la rechaza, lo primero que hay que descartar es que la `verification_key` venga de
una corrida de `npm run setup` distinta de la `zkey`.

### Rotura deliberada 1: un ptau demasiado chico

Cambiá `scripts/setup-groth16.mjs:36`:

```js
const POTENCIA = 11;
```

Corré `npm run setup`. La guarda del script lo corta antes de hacer nada:

```
  potencia minima   2**12 = 4096
  potencia usada    2**11 = 2048

El ptau de 2**11 no alcanza para este circuito.
Subi POTENCIA a 12 en scripts/setup-groth16.mjs.
```

Lo interesante es qué pasa **sin** esa guarda. Lo medí llamando a `zKey.newZKey`
directamente con un ptau de 2^11, primero con logger y después sin él:

```
circuit too big for this power of tau ceremony. 2513*2 > 2**11
NO FALLO
```

```
devuelve: -1 | existe: true | bytes: 0
```

snarkjs no lanza ninguna excepción: escribe el mensaje **solo si le pasás un
logger**, devuelve `-1` y deja un `.zkey` de cero bytes. Un script que no mira el
valor de retorno sigue adelante como si nada y el error aparece mucho después, en
otra tarea, con un mensaje que no habla del ptau. Es el argumento a favor de
escribir la guarda uno mismo.

Volvé a poner `12`.

### Rotura deliberada 2: cambiar el circuito y no rehacer el setup

Esta es la pregunta de "¿qué pasa si toco una línea del circuito después de
generar la `zkey`?", y la respuesta tiene dos mitades que conviene no mezclar.

Saqué la línea 38 de `circuitos/pertenencia.circom` —la que restringe cada índice
a ser 0 o 1— y compilé esa variante aparte, sin tocar la `zkey`. El circuito pasa
de 2513 a 2510 restricciones. Con la `zkey` vieja:

```
--- verifyFromR1cs(r1cs modificado, ptau, zkey vieja):
Circuit hash:
		de322996 40ce382a fde51570 86ea1c98
		c6613a1e fb8f676d 1807a3a1 f4de44b4
		359ba146 3931dcd5 423094bd 6553c541
		ae6473bd 3fea2335 e295a2fe acde840c
INVALID:  Circuit does not match
resultado: false
--- prove(zkey vieja, witness del circuito modificado):
genero prueba. verifica: true
```

La primera mitad es la buena: `snarkjs zkey verify` compara el hash del circuito
que quedó grabado en la `zkey` contra el `.r1cs` que le pasás y dice
`Circuit does not match`. Hay una herramienta que detecta el desfasaje, y usarla es
gratis.

La segunda mitad es la que hay que entender, porque es contraintuitiva y es el
riesgo real: **el prover generó una prueba igual, y esa prueba verifica**. No hay
ningún error. La razón es que la `zkey` codifica el sistema de ecuaciones **viejo**,
y el witness que produjo el circuito nuevo también lo satisface —la restricción que
saqué era una de más, no una de menos—. Lo que se está probando es el circuito
viejo, no el que está en el repositorio.

Dicho al revés, que es como duele: si mañana agregás al circuito una restricción de
seguridad y no rehacés la fase 2, el sistema sigue funcionando, las pruebas siguen
verificando, los tests siguen pasando y **la restricción nueva no se aplica**. No
hay ninguna señal de que algo esté mal. La única defensa es correr `zkey verify`
contra el `.r1cs` actual como parte del despliegue, que es lo que hace
`scripts/setup-groth16.mjs:231` en cada corrida.

La otra mitad del panorama: si el cambio en el circuito agrega o saca una **señal**
—no una restricción—, el desajuste sí es ruidoso. Agregué una señal de adorno
(`signal cuadrado <== secreto * secreto;`), que lleva los cables de 2518 a 2519, y
el prover con la `zkey` vieja muere en el acto:

```
EXCEPCION: Invalid witness length. Circuit: 2518, witness: 2519
```

O sea: cambiar el circuito y no rehacer el setup falla ruidosamente cuando cambia
la *forma* del witness, y falla en silencio cuando cambian solo las *ecuaciones*.
El caso silencioso es el peligroso y es el más común, porque agregar una
restricción a señales que ya existen es exactamente lo que uno hace cuando arregla
un agujero de seguridad.

## 6. Qué NO hace

**No produce un setup usable en producción, y no hay forma de arreglarlo desde
acá.** Lo que falta no es código: son participantes independientes. Todo lo que
este script genera sirve para desarrollar, para demostrar y para medir. Si alguna
vez hay un despliegue real, la ceremonia se rehace con gente de verdad y estos
archivos se tiran.

**No mide el costo de probar.** Los 351 ms de generación y los 45 ms de
verificación son de una sola corrida en una máquina de escritorio, y están acá como
control de que el setup funciona, no como resultado. La medición —repeticiones,
hardware anotado, y sobre todo un teléfono, que es donde el número importa— es
MED-001 en el repo de docs y le corresponde a T06. No cites estos números como si
fueran esa medición.

**No verifica nada on-chain.** La `verification_key` es un archivo JSON en un
directorio ignorado por git. Convertirla en un verificador de Solidity
(`zKey.exportSolidityVerifier`, que snarkjs también expone) es T10, y decidir si la
raíz y la clave se publican en la cadena es T09.

**No dice nada sobre si la raíz es la correcta.** Igual que el circuito de T03: una
prueba válida lo es contra la raíz que le pasen. Que esa raíz sea la del evento
real lo resuelve `RegistroDeRaiz.sol` en T09.

**No es NFT ni contrato.** Nada de lo que hay acá tiene que ver con la
autenticidad de la entrada, las regalías o el tope de reventa. El trusted setup es
el precio de admisión del ZK, y es un precio que un sistema de entradas NFT sin
privacidad no paga: es el costo del lado de la balanza que el proyecto eligió.

Los frentes del TPF con los que se engancha: **ADR-008, ADR-009, ADR-010 y
ADR-011** en `../zk-ticketing-docs`, y sobre todo la entrada
`kb/objeciones-jurado.md`, que marca el trusted setup como la objeción más
peligrosa del proyecto. Esta tarea no cierra ninguna decisión: aporta el material
para responderla —el mecanismo corrido de punta a punta, los tiempos de cada fase,
y la demostración de que la fase 2 es intercambiable y la fase 1 no—. La elección
de sistema de pruebas (Groth16 con ceremonia por circuito contra un setup
universal) queda abierta y es de ADR.
