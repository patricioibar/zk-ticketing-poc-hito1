# Demostraciones

## 1. Qué hace

`npm test` corre los siete casos que cierran la fase 1. Cada caso declara de
antemano qué resultado espera, la suite lo ejecuta con los comandos de verdad
—organizador, prover, provisionar-puerta, validador— y compara. Sale con 0 si
los siete dan lo esperado y con 1 si alguno no.

Dos de esos siete son entradas que pasan, cuatro son entradas que la puerta
rechaza, y el séptimo no llega nunca a la puerta: falla antes, cuando el atacante
intenta calcular el witness en su propio teléfono.

La suite no vuelve a implementar ningún chequeo. Lo único que agrega al
repositorio es la coreografía: poner el estado en cero, correr los comandos en
orden, leer el veredicto y decir si es el que correspondía.

## 2. Cómo lo hace

Un archivo nuevo, `scripts/demostraciones.mjs`, y una línea nueva en
`package.json` (`"test": "node scripts/demostraciones.mjs"`). Todo lo demás es
código de T05 a T07 corrido tal cual.

### Cómo corre los comandos

`scripts/demostraciones.mjs:59` (`correr`) es un `spawnSync` del mismo `node` que
corre la suite, con el script como argumento y `cwd` en la raíz del repositorio.
Devuelve el código de salida y la salida de texto junta (stdout y stderr).

Se invoca el script directamente en lugar de pasar por `npm run` porque npm
agrega un proceso intermedio por comando —cerca de medio segundo cada uno en
Windows— y no cambia nada: los argumentos y el código de salida son idénticos.
Lo que sí cambia, y es lo que importa, es que cada caso sigue siendo **un proceso
aparte**: la puerta abre sus dos archivos, decide y termina. Si la suite llamara
a `correrChequeos` desde adentro de su propio proceso, las dos puertas
compartirían memoria y el caso 3 —el agujero de coordinación— dejaría de
demostrar algo real.

### La preparación, que es lo que hace idempotente a la suite

`scripts/demostraciones.mjs:135` (`prepararTodo`), en este orden:

1. **Exige los artefactos del build** (`:139` a `:142`): el `.wasm`, el `.sym`, la
   zkey y la verification key. Un clon recién bajado no los trae, porque `build/`
   está en `.gitignore`, y el mensaje dice qué comando corregir.
2. **Borra su propio estado** (`:147`): `puertas/puerta-demo-a1/`,
   `puertas/puerta-demo-a2/` y `salidas/demostraciones/`. Esto es lo único que la
   suite borra, y es lo único que la suite escribe. Las puertas 1 y 2 —las que se
   usan a mano siguiendo `docs/06-validador.md`— no se tocan.
3. **Genera el evento B** (`:156`): organizador y una prueba de la identidad 3.
4. **Genera el evento A** (`:165`): organizador y una prueba de la misma identidad.
5. **Provisiona las dos puertas del evento A** (`:174`), ya con las listas vacías
   porque los directorios se acaban de crear.
6. **Fabrica el sobre alterado** del caso 6 (`:186` a `:194`).

El orden B → A no es arbitrario. El organizador publica **una** raíz por vez en
`datos/raiz.json`, así que para tener una prueba del evento B hay que publicar B,
generar la prueba, y volver a publicar A. Terminar en A deja el repositorio como
estaba: los secretos son deterministas y la raíz de A es la misma que antes, así
que después de `npm test` `git status` no muestra nada.

Cada prueba recién generada se copia de `salidas/` a un sobre propio en
`salidas/demostraciones/` (`scripts/demostraciones.mjs:121`, `sobreDesdeSalidas`),
porque la corrida siguiente del prover pisa `salidas/prueba.json`. El sobre que
se escribe es el de un solo archivo, `sobre-de-entrada@1`, con
`escribirSobreJson` de `lib/sobre.mjs`: el mismo formato que ya leía el validador
en T07.

### Cómo lee el veredicto

El validador ya habla: imprime una línea por chequeo con `OK` o `FALLA`, termina
con `PASE.` o con `RECHAZADA por el chequeo N (id).`, y sale con 0 si aceptó, 2
si rechazó y 1 si no pudo trabajar. `scripts/demostraciones.mjs:84`
(`parsearValidador`) lee esas tres cosas y no decide ninguna por su cuenta.

Que rechazar tenga código 2 y no 1 es lo que hace posible distinguir "rechazó
como se esperaba" de "faltaba un archivo". `docs/06-validador.md` dice que esa
decisión se tomó en T07 pensando en esta suite; acá se cobra.

### Los siete casos

Están en `scripts/demostraciones.mjs:202` (`casos`), como una lista de objetos con
un título, una línea de qué muestra, el resultado esperado en palabras y una
función que lo ejecuta. El resultado esperado se imprime **antes** que el
obtenido, para que leer la salida no sea adivinar qué se estaba buscando.

| # | Caso | Esperado |
|---|---|---|
| 1 | Entrada legítima en la puerta A1 | PASE, código 0, los cuatro chequeos OK |
| 2 | La misma prueba otra vez en A1 | RECHAZADA en el chequeo 4 (nulificador), código 2 |
| 3 | La misma prueba en la puerta A2 | **PASE**, código 0 |
| 4 | La misma identidad con otro scope | Dos nulificadores distintos, cada uno igual a `Poseidon(secreto, scope)` en JS |
| 5 | Prueba del evento B en una puerta del evento A | RECHAZADA en el chequeo 2 (scope), con el chequeo 1 en OK |
| 6 | Sobre con un byte alterado | RECHAZADA en el chequeo 3 (cripto), con los chequeos 1 y 2 en OK |
| 7 | Secreto que no está en el árbol | `snarkjs.wtns.calculate` tira: no hay prueba que presentar |

Los casos 1, 2, 3, 5 y 6 son una invocación del validador cada uno. Los otros dos
no pasan por la puerta:

**El caso 4** (`:269`) no necesita validador porque no es sobre aceptar o
rechazar: compara los nulificadores de los dos sobres, lee el secreto de la
identidad 3 de `datos/secretos.json` y recalcula `Poseidon(secreto, scope)` en
JavaScript con `lib/merkle.mjs` para los dos scopes. Exige tres cosas: que los dos
nulificadores sean distintos, y que cada uno coincida con el calculado afuera del
circuito. Lo último es lo que ata el resultado al mecanismo en vez de dejarlo en
"salieron dos números distintos".

**El caso 7** (`:343`) arma el camino de Merkle real de la posición 3 —que es
público, cualquiera lo saca de `datos/arbol.json`— y le mete un secreto inventado
(`:358`). Después llama a `snarkjs.wtns.calculate` directo contra el `.wasm` del
circuito (`:377`) y espera que tire. Tira:

```
Error: Assert Failed. Error in template Pertenencia_145 line: 57
```

La línea 57 de `circuitos/pertenencia.circom` es `raiz === arbol.out;`. El
circuito calculó `Poseidon(secreto_inventado)`, subió por el camino, le dio otra
raíz, y la restricción que la compara con la raíz pública no cierra. No hay
witness; sin witness no hay nada que probar.

`circom_runtime` además escribe su propio `ERROR:` con `console.log`, que saldría
suelto en el medio del informe. La suite lo captura (`:372`) y lo imprime como
parte del caso, con el prefijo `el circuito dijo:`. Se reubica, no se esconde.

Un detalle que la suite comprueba y conviene saber: snarkjs abre el archivo de
salida **antes** de calcular, así que queda un `intruso.wtns` de 0 bytes. Que el
archivo exista no significa que haya witness, y por eso la condición del caso es
que el error haya ocurrido **y** que el archivo tenga cero bytes.

### El informe

`scripts/demostraciones.mjs:411` (`main`) recorre los casos en orden, imprime
esperado / obtenido / notas / qué muestra, y cierra con la tabla de resumen, el
recuento y dos párrafos que son la lección de la tarea. También deja
`salidas/demostraciones/resultado.json` con los siete resultados, para poder
citarlos desde una bitácora sin copiar a mano.

## 3. Por qué está hecho así

### Por qué la suite no reimplementa ningún chequeo

Un test que trae su propia copia de la lógica que quiere probar no prueba el
sistema: se prueba a sí mismo. Si mañana alguien se olvida de comparar la raíz en
`lib/puerta.mjs`, una suite con su propia comparación seguiría en verde.

Acá cada caso corre el comando que correría una persona y mira el código de
salida y el texto del veredicto. Eso también prueba cosas que una llamada directa
a `correrChequeos` no probaría: que el validador sepa leer los dos formatos de
sobre, que el orden de las señales grabado en la puerta siga siendo el que el
código espera, que la jaula de red no rompa nada, y que los códigos de salida
sigan significando lo que `docs/06-validador.md` dice que significan.

El precio es que la suite depende del **texto** que imprime el validador. Si
alguien cambia "RECHAZADA por el chequeo 4 (nulificador)." la suite deja de
entender y falla. Es un acoplamiento real y la alternativa está en la sección 4.

### Por qué la suite tiene sus propias puertas y las borra

Esta es la corrección que ordenó toda la tarea, y salió de un tropiezo concreto:
verificando T07, un caso que había pasado ayer falló hoy por doble ingreso. La
causa es que `puertas/` guarda la lista de nulificadores de cada molinete y esa
lista **sobrevive entre corridas**, que es exactamente lo que tiene que hacer un
molinete de verdad.

Y hay un agravante que lo hace peor de lo que parece: el nulificador es
`Poseidon(secreto, scope)`, determinista. Una prueba nueva, generada de cero, con
bytes distintos porque Groth16 aleatoriza cada prueba, **trae el mismo
nulificador**. Volver a generar la prueba no ayuda en nada. Se puede comprobar en
tres comandos, y está en la sección 5.

Tampoco alcanzaba con reprovisionar: `scripts/provisionar-puerta.mjs:142`
conserva la lista cuando el scope es el mismo, y con razón, porque una puerta que
se reinicia en medio de la noche no puede olvidarse de quién entró.

Así que la suite tiene dos puertas propias, `demo-a1` y `demo-a2`, y borra sus
directorios al arrancar. Dos consecuencias buenas: `npm test` da exactamente lo
mismo corrido dos veces seguidas sobre un clon limpio, y las puertas 1 y 2 —las
que Patricio usa a mano para explorar— quedan intactas, con su propio estado y su
propia historia.

La otra opción era un directorio raíz de puertas configurable por variable de
entorno. Se descartó por una razón chica y una grande. La chica: obligaría a tocar
`lib/puerta.mjs`, que es la pieza que `docs/06-validador.md` cita por número de
línea. La grande: agregar una perilla de configuración para que los tests no se
pisen con el uso manual es más máquina que la que el problema pide, cuando
cambiar el nombre de la puerta alcanza.

### Por qué el byte alterado se altera en las señales y no en la prueba

"Una prueba con un byte alterado" invita a alterar un byte de la prueba. Se
probó, y no sirve para una suite: **el resultado depende de qué byte y de qué
prueba**.

Sobre un sobre binario comprimido concreto (128 bytes de prueba + 96 de señales)
se alteró un bit en doce posiciones distintas de la prueba, una por corrida:

| Posición del byte | Punto | Qué pasó |
|---|---|---|
| 0, 5, 10 | `pi_a` (G1) | descomprime a otro punto válido; `groth16.verify` devuelve `false` |
| 20 | `pi_a` (G1) | la lectura del sobre no volvió (cortada a los 15 s) |
| 40, 60 | `pi_b` (G2) | descomprime; `verify` devuelve `false` |
| 70, 90 | `pi_b` (G2) | `RuntimeError` del wasm de ffjavascript |
| 96, 100, 120 | `pi_c` (G1) | la lectura del sobre no volvió (100 se cortó a los 150 s) |
| 110 | `pi_c` (G1) | descomprime; `verify` devuelve `false` |

La explicación probable es la descompresión: un punto comprimido guarda solo la
coordenada `x` y un bit de signo, y reconstruir `y` pide una raíz cuadrada
modular. Si la `x` alterada sigue teniendo raíz, sale otro punto perfectamente
válido y la verificación simplemente da `false`; si no la tiene, no hay punto que
devolver. Que la implementación de ffjavascript se quede dando vueltas en ese
caso en lugar de fallar es una lectura de los síntomas, no del código:
**[a verificar]**.

Dos conclusiones. La primera, para la suite: como Groth16 aleatoriza cada prueba,
el byte 20 de la prueba de hoy no es el byte 20 de la de mañana, y un caso
construido así sería un caso que a veces rechaza, a veces explota y a veces
cuelga la corrida entera. Por eso el caso 6 altera el byte menos significativo
del **nulificador** (`scripts/demostraciones.mjs:190`): las señales van en
big-endian, tocar el último byte del primer elemento cambia el valor en 1 y lo
deja cómodamente adentro del campo, y el resultado es siempre el mismo. Los
chequeos 1 y 2 pasan —la raíz y el scope llegan intactos— y el 3 falla, que es
justo lo que la lección pide mostrar: verificar Groth16 es una igualdad entre la
prueba y sus señales públicas, y cambiar cualquiera de las dos la rompe.

La segunda conclusión no es sobre la suite y es más importante: **un molinete que
se cuelga leyendo un sobre corrupto es un molinete que frena la cola**. Un QR
manchado alcanza. Está en la sección 6 y es candidato a ADR.

### Por qué el caso 7 pasa por abajo de la guarda del prover

`npm run probar` no llega a fallar por el circuito: corta antes, comparando
`Poseidon(secreto)` con la hoja que el padrón publica en esa posición, y dice
"ESTE SECRETO NO ES EL DE ESTA POSICIÓN DEL PADRÓN". Es una buena guarda y hace
bien en estar.

Pero si el caso 7 fuera esa guarda, estaría demostrando que un script del
proyecto valida sus entradas, y eso no es lo interesante. Lo interesante es que
**el circuito** rechaza, y el circuito es lo único que un atacante no puede
reescribir: la guarda del prover la borra cualquiera que edite el archivo. Por eso
la suite llama a `wtns.calculate` directamente y espera el assert del wasm.

### Por qué "sin relación visible" y no "independientes"

El caso 4 muestra dos nulificadores de la misma identidad con dos scopes
distintos, y no comparten ni un dígito hexadecimal de prefijo. La tentación es
escribir "son independientes" o "es imposible vincularlos". Las dos frases serían
afirmaciones criptográficas sobre Poseidon, y esta PoC no demuestra ninguna: lo
que hizo fue calcular dos hashes y mirarlos.

Lo que sí se puede afirmar es que son distintos, que cada uno es exactamente
`Poseidon(secreto, scope)` —comprobado con una implementación distinta de la del
circuito— y que a simple vista no se parecen. Que sean invinculables depende de
las propiedades de Poseidon como función de hash, y eso se cita de la
bibliografía o se marca **[a verificar]**; no sale de dos corridas.

### Por qué el informe imprime lo esperado antes que lo obtenido

Porque una suite que solo dice "OK" enseña cero. El objetivo de esta PoC es que
Patricio entienda el mecanismo, y el formato esperado / obtenido / qué muestra
convierte la corrida en algo que se puede leer de arriba abajo y entender sin
abrir el código. Es también lo que la hace servible para mostrarla en una weekly.

## 4. Qué podrías cambiar

**El harness propio → `node:test`.** Node 20 trae un corredor de tests integrado
(`node --test`), con `describe`/`it`, reporte TAP y ejecución en paralelo. Se gana
formato estándar, integración con CI y no mantener el bucle de `main`. Se pierde
el informe didáctico: `node:test` imprime lo que falló, no lo que se demostró, y
acá la salida es parte del entregable. También se pierde el orden garantizado, que
esta suite necesita porque el caso 2 depende de que el 1 haya anotado. Tocaría
`scripts/demostraciones.mjs` entero y `package.json`.

**Parsear el texto → un `--json` en el validador.** Hoy la suite depende de las
frases que imprime `scripts/validador.mjs`. La alternativa es que el validador
acepte `--json` y escriba un objeto con el veredicto, los cuatro chequeos y los
tiempos. Se gana un contrato explícito, que es lo que va a hacer falta cuando el
molinete sea un servicio y no un comando. Se pierde que el validador sea un solo
camino de código, y aparece la pregunta de cuál de las dos salidas es la fuente de
verdad. Tocaría `scripts/validador.mjs` y `scripts/demostraciones.mjs:84`.

**Puertas propias → un directorio raíz configurable.** `PUERTAS_DIR` como variable
de entorno en `lib/puerta.mjs:27` y la suite apuntando a un temporal. Se gana
aislamiento total, incluso del nombre de las puertas. Se pierde simplicidad y se
agrega una perilla que hay que documentar y que se puede setear mal. Ver la
sección 3.

**Agregar el ataque de raíz propia como caso 8.** `npm run ataque:raiz-propia` ya
existe y ya deja su sobre en `salidas/ataque/`. Sumarlo son cuatro líneas y
cerraría la demostración de por qué los chequeos 1 y 2 son los críticos. No está
porque el plan pide siete casos y porque ese ataque es el entregable de T07, con
su propio comando y su propia sección en `docs/06-validador.md`: duplicarlo acá
lo haría parecer de esta tarea.

**Siete casos → una matriz.** Hoy cada caso es código. Con más eventos, más
puertas y más identidades conviene una tabla de datos (identidad, scope, puerta,
resultado esperado) y un solo ejecutor. Se gana agregar un caso escribiendo una
fila; se pierde que cada caso pueda explicar lo suyo, que es la mitad del valor.

**Reportar tiempos.** La suite no mide nada a propósito: los tiempos del molinete
están en `docs/06-validador.md` y los del prover en `docs/05-prover.md`, los dos
con hardware declarado. Si algún día `npm test` corriera en varias máquinas,
tendría sentido que juntara los tiempos de cada validación; hoy sería un número
sin pregunta detrás.

## 5. Probalo vos

Desde la raíz del repositorio. Si es un clon nuevo, primero el build, que no viaja
en git:

```bash
npm install
npm run circuito:pertenencia
npm run setup
```

Y después, siempre:

```bash
npm test
```

La corrida entera tarda unos 11 segundos en la máquina de `docs/05-prover.md`
(Intel i5-14400F, 16 GB, Windows 11, Node v20.19.2, snarkjs 0.7.6). Empieza
mostrando de dónde sale el estado:

```
Demostraciones - las siete corridas de la fase 1

Preparacion (parte de cero en cada corrida)

  estado borrado                      puertas/puerta-{demo-a1,demo-a2}/ y salidas/demostraciones/
  evento B: padron y raiz             npm run organizador -- --scope evento-B
  evento B: prueba de la identidad 3  npm run probar -- --identidad 3 --scope evento-B --corridas 1
  evento A: padron y raiz             npm run organizador -- --scope evento-A
  evento A: prueba de la identidad 3  npm run probar -- --identidad 3 --scope evento-A --corridas 1
  dos puertas del evento A            npm run puerta:provisionar -- --puerta demo-a1,demo-a2 --scope evento-A
  sobre con un byte alterado          salidas/demostraciones/sobre-evento-A-alterado.bin (byte 159 de 224)
```

Los tres casos del medio son los que conviene leer despacio:

```
Caso 3 - la misma prueba entra por la puerta A2

  esperado    PASE (codigo 0). Es el resultado esperado, no un fallo de la suite
  obtenido    PASE (codigo 0)
              la misma entrada entro dos veces: 1 en demo-a1 y 1 en demo-a2
              y las dos listas tienen el mismo nulificador: si
              no lo resuelve el ZK: hace falta que alguien mire las dos puertas
  muestra     el agujero de coordinacion: dos listas locales sin canal no pueden saber lo que vio la otra (ADR-009)

  OK

Caso 4 - la misma identidad con otro scope da otro nulificador

  esperado    dos nulificadores distintos, cada uno igual al Poseidon(secreto, scope) calculado en JS
  obtenido    distintos, y cada uno coincide con Poseidon(secreto, scope) en JS
              evento A  9349048846653045638591846123935411322465784345075339403618387866985628512571
              evento B  15322268727791300097105410023599274769060027757489707367016935737130240234003
              comparten 0 de 64 digitos hexadecimales de prefijo
              sin relacion visible. No se afirma mas que eso: que sean invinculables es
              una propiedad de Poseidon, no algo que estas dos corridas demuestren
  muestra     el nulificador es Poseidon(secreto, scope): determinista por evento, distinto entre eventos

  OK
```

Y el cierre:

```
Resumen

  OK     1  una entrada legitima entra por la puerta A1
  OK     2  la misma prueba, otra vez, en la misma puerta
  OK     3  la misma prueba entra por la puerta A2
  OK     4  la misma identidad con otro scope da otro nulificador
  OK     5  una prueba del evento B en una puerta del evento A
  OK     6  un sobre con un byte alterado
  OK     7  un secreto que no esta en el arbol no llega a generar prueba

  7 de 7 casos dan lo esperado.
```

### Que dé lo mismo dos veces

Es la propiedad que esta tarea tuvo que arreglar, así que conviene verla:

```bash
npm test > corrida1.txt
npm test > corrida2.txt
diff corrida1.txt corrida2.txt && echo "identicas"
git status --short
```

`diff` no imprime nada y `git status` tampoco: las pruebas son distintas en cada
corrida porque Groth16 las aleatoriza, pero nada de lo que la suite informa
depende de esos bytes, y `datos/` vuelve a quedar en el evento A con la misma
raíz de siempre. Acordate de borrar los dos `corrida*.txt`.

### Rotura deliberada: sacarle el borrado a la suite

Esta es la rotura que reproduce el tropiezo original. Comentá el bucle de
`scripts/demostraciones.mjs:146`:

```js
  // for (const puerta of [PUERTA_A1, PUERTA_A2]) {
  //   rmSync(directorioPuerta(puerta), { recursive: true, force: true });
  // }
```

Borrá primero `puertas/puerta-demo-a1/` y `puertas/puerta-demo-a2/` a mano, para
empezar de cero. La primera corrida da 7 de 7, porque las puertas se crean en ese
momento. La segunda da 5 de 7:

```
Caso 1 - una entrada legitima entra por la puerta A1

  esperado    PASE (codigo 0), los 4 chequeos OK
  obtenido    RECHAZADA en el chequeo 4 (nulificador), codigo 2, 3/4 chequeos OK

  FALLA
```

Fallan el 1 y el 3: las dos puertas ya tenían anotado ese nulificador de la
corrida anterior, así que la entrada legítima rebota en las dos.

Vale la pena ver por qué con los comandos sueltos, porque la explicación
"quedó estado viejo" se queda corta. Con la suite ya corrida una vez:

```bash
npm run puerta:provisionar -- --puerta demo-a1 --scope evento-A
npm run probar -- --identidad 3 --scope evento-A --corridas 1
npm run validar -- --puerta demo-a1 --prueba salidas/prueba.json
```

El provisionamiento avisa que conserva la lista, porque el evento es el mismo:

```
    puertas/puerta-demo-a1/nulificadores.json  (se conservan 1 nulificadores de este mismo evento)
```

y la prueba **recién generada**, con bytes completamente distintos a la anterior,
igual rebota:

```
  nulificador       9349048846653045638591846123935411322465784345075339403618387866985628512571
  4  el nulificador no esta en su lista local        FALLA ya paso 2026-09-23T20:04:23.452Z

RECHAZADA por el chequeo 4 (nulificador).
```

Ahí está la parte que importa: **regenerar la prueba no cambia el nulificador**.
`Poseidon(secreto, scope)` es determinista, y esa es toda la razón por la que el
mecanismo funciona. Lo que había que poner en cero era la puerta, no la prueba.
Volvé a dejar las líneas como estaban y corré `npm test` para limpiar.

### Rotura deliberada: alterar un byte de la prueba en vez de una señal

En `scripts/demostraciones.mjs:190`, cambiá el byte que se altera por uno de
adentro de la prueba:

```js
  const posicionByte = 100;
```

Corré `npm test` unas cuantas veces. Vas a ver tres finales distintos sin haber
cambiado nada entre corrida y corrida: rechazo en el chequeo 3, un `RuntimeError`
al leer el sobre (código de salida 1, que no es un pase pero tampoco es un
rechazo), o la suite colgada sin volver, que hay que cortar con Ctrl-C. La razón
está en la sección 3, y el hecho de que un sobre corrupto pueda dejar al molinete
sin responder está en la sección 6. Dejalo como estaba.

## 6. Qué NO hace

**No demuestra ninguna propiedad criptográfica.** Siete corridas son siete
ejemplos. Que el nulificador de un scope no se pueda vincular con el de otro, que
Poseidon sea resistente a preimagen, o que Groth16 sea sólido, no sale de acá:
sale de la bibliografía, y para el caso de Groth16 ni siquiera vale en esta PoC,
porque el trusted setup de T04 lo corrió una sola persona en una sola máquina y
quien lo corrió puede fabricar pruebas sin conocer ningún secreto
(`docs/03-setup.md`). Todo lo que la suite muestra sobre rechazos vale igual; la
garantía que no vale es la del chequeo 3.

**No resuelve el doble ingreso entre puertas, y ese es el punto.** El caso 3 pasa
a propósito. La misma entrada abre la puerta A1 y la puerta A2, y las dos hicieron
bien su trabajo: cada una miró su lista, y ninguna de las dos listas sabía lo que
había visto la otra. Ninguna prueba de conocimiento cero arregla eso. El
nulificador logra que dos usos de la misma entrada sean **reconocibles como el
mismo**; que alguien los esté mirando a los dos es un problema de sistemas
distribuidos, y es el frente **ADR-009** del TPF.

Vale la pena decir en qué se convierte esa distinción frente al jurado, porque es
el criterio con el que el proyecto se mide. **Es NFT**: que la entrada sea
auténtica, que no se pueda falsificar, que tenga tope de reventa, que pague
regalías. Todo eso lo da el contrato y no necesita ni un circuito. **Es ZK**: que
la puerta acepte o rechace sin aprender cuál de las ocho identidades tiene
adelante ni qué billetera la controla. En los siete casos de esta suite —incluidos
los cuatro rechazos— la puerta decidió sin saber a quién le estaba abriendo o
cerrando. Con un `tokenId` el molinete sabría exactamente qué entrada es y, si el
contrato es público, a qué dirección pertenece. Esa es la diferencia entera, y no
incluye el doble ingreso entre puertas: el ZK no lo empeora, pero tampoco lo
resuelve.

**El conjunto de anonimato es de ocho personas.** "No saben cuál de los ocho sos"
es una frase mucho más débil de lo que suena. Con ocho, una cámara en la puerta o
el orden de llegada alcanzan para adivinar. La PoC usa ocho porque el circuito es
de profundidad 3, y el claim de privacidad real es **ADR-001**.

**No cubre el ataque del árbol propio.** La demostración de por qué los chequeos 1
y 2 son los críticos —un atacante que arma su propio árbol y genera una prueba que
verifica— es `npm run ataque:raiz-propia` y está en `docs/06-validador.md`. No se
duplicó acá. Si alguna vez se corren los dos juntos, la suite tendría ocho casos.

**No mide nada.** Ningún número de esta suite es una medición: no hay tiempos
reportados, y los 11 segundos de la corrida son una comodidad, no un dato. Los
tiempos del molinete están en `docs/06-validador.md` y los del prover en
`docs/05-prover.md`, los dos con hardware declarado, y ninguno de los dos es
MED-001.

**Un sobre corrupto puede dejar a la puerta sin responder.** Es el hallazgo lateral
de esta tarea y no es chico. En cuatro de doce posiciones probadas, alterar un bit
adentro de la prueba comprimida hizo que la lectura del sobre no volviera —una de
ellas seguía sin volver a los 150 segundos—. En la puerta de un estadio eso es un
molinete trabado con un QR manchado, y no hace falta un atacante: alcanza con una
impresión mala. Las defensas son las de siempre —un tiempo máximo por sobre, y
descomprimir en un proceso que se pueda matar— y son ingeniería de sistemas, no
criptografía. Queda anotado como **candidato a ADR** en
`bitacora/T08-demostraciones.md`.

**No prueba que la puerta esté offline.** La jaula de `bloquearRed` corre adentro
del validador y la suite la ejerce en cada caso, pero lo que garantiza está
acotado y ya lo explica `docs/06-validador.md`: atrapa `fetch` y los módulos de
red usados a través de su objeto por defecto, no un import con nombre capturado
antes, ni `node:dgram`, ni un binario nativo.

**No sabe nada de contratos.** La raíz sigue saliendo de un JSON local que
cualquiera edita. Que la raíz sea la del evento real —y no la que alguien escribió
en `datos/raiz.json`— lo empieza a resolver **T09** con `RegistroDeRaiz.sol`, y la
suite no debería cambiar cuando eso pase: lo que cambia es de dónde la puerta
descarga la raíz al provisionarse, no qué decide en la puerta.

Los frentes del TPF con los que se engancha, todos en `../zk-ticketing-docs`:
**ADR-009** (coordinación entre puertas, que es lo que el caso 3 expone),
**ADR-002** (validación offline), **ADR-001** (claim de privacidad y tamaño del
conjunto de anonimato), **ADR-004** (presupuesto de tiempo en la puerta) y
**ADR-011** (qué entra en el QR). **No cierra ninguno.**
