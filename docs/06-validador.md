# Validador

## 1. Qué hace

`npm run validar -- --puerta 1 --prueba salidas/prueba.json` es el molinete.
Recibe el sobre que presenta el comprador —una prueba Groth16 y sus tres señales
públicas— y decide pase o no pase con cuatro chequeos en orden: que la raíz sea
la suya, que el scope sea el de su evento, que la prueba verifique, y que el
nulificador no esté en su lista. Si pasa los cuatro, lo anota en la lista y
acepta.

Mientras decide no consulta nada: ni la cadena, ni un servidor, ni el archivo
donde el organizador publica la raíz. Todo lo que necesita —la raíz, el scope y
la verification key— lo descargó antes, en el único momento en que estuvo
conectado. Hay dos puertas, cada una con su propia lista de nulificadores en su
propio archivo, y no hay ningún canal entre ellas.

## 2. Cómo lo hace

Son seis archivos nuevos y cuatro reutilizados. De los nuevos, tres son
librería: `lib/senales.mjs` (el orden de las señales públicas), `lib/sobre.mjs`
(leer lo que presenta el comprador) y `lib/puerta.mjs` (el estado de un molinete
y los cuatro chequeos). Los otros tres son comandos:
`scripts/provisionar-puerta.mjs`, `scripts/validador.mjs` y
`scripts/ataque-raiz-propia.mjs`. Reutilizados, sin copiar nada: `lib/merkle.mjs`
(el árbol, que solo usa el ataque), `lib/campo.mjs` (validación de rango y
derivación del scope), `lib/prueba-binaria.mjs` (punto ↔ bytes) y
`fuentes/json.mjs` (la raíz publicada, que solo usa el provisionamiento).

### Los dos momentos

La pieza central del diseño es que esto no es un solo comando sino dos, y que
están separados a propósito:

**Provisionar** (`npm run puerta:provisionar -- --puerta 1 --scope evento-A`) es
el momento conectado. La puerta le pregunta a la fuente cuál es la raíz del
evento (`scripts/provisionar-puerta.mjs:90`), lee la verification key del setup,
verifica el orden de las señales públicas, y guarda todo eso en
`puertas/puerta-1/configuracion.json`. Incluida la vkey entera
(`scripts/provisionar-puerta.mjs:131`): no una ruta a `build/setup/`, sino una
copia propia.

**Validar** (`npm run validar -- --puerta 1 --prueba …`) es el momento offline.
`scripts/validador.mjs` no importa `fuentes/`, no lee `datos/`, no lee `build/`:
abre su `configuracion.json`, su `nulificadores.json` y el archivo de la prueba,
y nada más. Eso se puede comprobar mirando la lista de imports del script, que es
corta a propósito.

### El orden de las señales públicas, que se verifica y no se asume

snarkjs entrega las señales públicas como un array de tres números pelados, sin
nombres. Quién es cuál lo decide circom al compilar: en el witness van primero
las **salidas** de `main` y después las **entradas declaradas públicas**, cada
grupo en orden de declaración. Para `circuitos/pertenencia.circom` eso da
`[nulificador, raiz, scope]`, que es lo que ya anotaba `docs/05-prover.md`.

Pero "da" no es "asumimos". El compilador escribe el mapa completo en
`build/pertenencia.sym`, donde cada línea es
`indice_de_witness,indice_de_simbolo,nodo,nombre` y las posiciones `1..nPublic`
son exactamente las señales públicas. `lib/senales.mjs:38` (`ordenSegunSym`) lo
lee de ahí y `lib/senales.mjs:59` (`exigirOrdenCanonico`) tira si no coincide con
la constante `ORDEN_SENALES` de `lib/senales.mjs:23`. Las tres primeras líneas
del `.sym` de este circuito son:

```
1,1,145,main.nulificador
2,2,145,main.raiz
3,3,145,main.scope
```

y el comando lo imprime cuando provisiona:

```
  orden verificado  [nulificador, raiz, scope]   segun build/pertenencia.sym
```

Ese chequeo corre al provisionar, que es cuando hay acceso a `build/`. La puerta
offline no tiene el `.sym`: tiene el orden grabado en su configuración, y
`scripts/validador.mjs:92` comprueba que ese orden grabado sea el que el código
espera (`exigirOrdenConfigurado`, `lib/senales.mjs:79`). A partir de ahí nadie
escribe `publicSignals[1]`: se escribe `senales[indiceDe("raiz")]`.

Por qué tanto cuidado con algo que hoy es obvio: si alguien agrega una salida al
circuito, o reordena `public [raiz, scope]`, el orden cambia y **nada se rompe a
la vista**. La puerta compararía la raíz contra el nulificador, rechazaría todas
las entradas y el mensaje diría "la raíz no es la mía". Esa confusión puede
costar una noche; el chequeo cuesta leer un archivo de texto.

### El sobre

`lib/sobre.mjs:54` (`leerSobre`) resuelve lo que `--prueba` señala. Acepta los
dos formatos que ya dejaba escritos el prover de T06 —`salidas/prueba.json` con
su hermano `senales-publicas.json`, y `salidas/prueba-comprimida.bin` con su
hermano `senales-publicas.bin`— y además el sobre de un solo archivo, que es el
que escribe el ataque: 224 bytes binarios (128 de prueba comprimida + 3 × 32 de
señales) o un JSON `sobre-de-entrada@1`.

En el binario el largo alcanza para saber qué es, porque los puntos son de ancho
fijo: 224 bytes solo pueden ser prueba comprimida más tres señales. Las
conversiones punto ↔ bytes no se reescribieron: son las de
`lib/prueba-binaria.mjs`, que son las de ffjavascript.

Que el sobre traiga siempre las dos cosas no es una comodidad. Verificar Groth16
es una ecuación entre la prueba y las señales públicas: sin señales no hay nada
que verificar, y con señales distintas la misma prueba da "no". Por eso
`lib/sobre.mjs:41` exige que sean exactamente tres: un sobre con otra cantidad es
de otro circuito y esta verification key no lo puede evaluar.

### Los cuatro chequeos

Están en `lib/puerta.mjs:93` (`CHEQUEOS`), como una lista ordenada donde cada
entrada tiene un id, un título y una función. `lib/puerta.mjs:174`
(`correrChequeos`) los corre en orden y **corta en el primero que falla**, que es
lo que hace un molinete: no sigue evaluando una entrada que ya rechazó.

1. **La raíz** (`lib/puerta.mjs:95`). `senales[indiceDe("raiz")]` contra
   `configuracion.raiz`, los dos como `BigInt`. La raíz de la configuración es la
   que esta puerta descargó; la de las señales es la que trae quien está
   adelante.
2. **El scope** (`lib/puerta.mjs:113`). Igual, contra el scope del evento de esta
   puerta.
3. **La prueba** (`lib/puerta.mjs:130`). `snarkjs.groth16.verify` con la vkey
   local, cronometrado.
4. **El nulificador** (`lib/puerta.mjs:148`). Busca el nulificador en la lista
   local. Si está, devuelve cuándo pasó.

Si los cuatro dan bien, `scripts/validador.mjs:195` agrega el nulificador a la
lista con la fecha y el archivo de origen, y reescribe
`puertas/puerta-N/nulificadores.json`. El comando sale con 0 si aceptó, 2 si
rechazó y 1 si hubo un error de uso o de estado. Rechazar no es un error del
programa: es el trabajo del molinete, y por eso tiene código propio.

### Dos puertas, cero canal

El estado de cada puerta vive en `puertas/puerta-N/` y en ningún otro lado. No
hay en `lib/puerta.mjs` ninguna función que lea el estado de otra puerta: las
rutas se arman con el identificador que se pasó por línea de comandos
(`lib/puerta.mjs:27`) y cada invocación del comando es un proceso distinto que
abre sus dos archivos y sale. Lo único compartido entre las dos puertas es el
código, que es lo que también sería compartido en la realidad.

Esto importa porque T08 tiene que medir el agujero de la falta de sincronización.
Si las dos puertas escribieran en la misma lista, o si el programa mantuviera un
diccionario en memoria con las dos, la demostración de T08 no demostraría nada:
mostraría una simulación de un problema en vez del problema.

### Offline, en el código

`lib/puerta.mjs:195` (`bloquearRed`) reemplaza `globalThis.fetch` y los métodos
`request`, `get`, `connect` y `createConnection` de `node:http`, `node:https` y
`node:net` por funciones que tiran una excepción. `scripts/validador.mjs:138` la
instala antes de tocar el sobre y la libera después del veredicto. El comando lo
imprime:

```
  red               bloqueada: fetch, http.request, http.get, https.request, https.get, net.connect, net.createConnection
```

Qué atrapa esto, con precisión: cualquier código del camino de validación que
llame a `fetch` o que use esos módulos a través de su objeto por defecto —que es
como los usan ethers, axios y la mayoría de las librerías—. Qué **no** atrapa:
un módulo que haya capturado un import con nombre (`import { request } from
"node:http"`) antes de que la jaula se instale, `node:dgram`, o un binario
nativo. No es una caja de arena; es una alarma. La garantía fuerte sigue siendo
estructural: el script no importa nada que hable con el mundo.

## 3. Por qué está hecho así

### Por qué los dos primeros chequeos son los críticos

Es lo que esta tarea existe para dejar entendido, y conviene demostrarlo en vez
de afirmarlo. `npm run ataque:raiz-propia` construye el ataque.

El atacante no conoce ningún secreto del evento. Lo que hace es armar **su propio
árbol de Merkle** con ocho secretos que inventó él (`scripts/ataque-raiz-propia.mjs:114`),
y generar una prueba contra la raíz de ese árbol, con el mismo `.wasm` y la misma
`zkey` que usa cualquier comprador (`scripts/ataque-raiz-propia.mjs:139`). Los
tres artefactos que necesita son públicos: el circuito compilado y la zkey se
distribuyen con la aplicación, y la verification key es pública por definición.
Que los tenga no es una falla de nadie.

Esa prueba **verifica**:

```
Paso 2 - genera la prueba, con el mismo wasm y la misma zkey

  tardo             503.8 ms
  nulificador       20956171127200573905611734060527400924147447413371258308236425553865822759692
  raiz              20015225524063974638380943110570875067346502649548216576988022975831689873684
  scope             7421952849778469791634643529725528999721210991605956451547960136850882987634

  verifica contra la verification key DEL EVENTO   SI
```

No está rota ni falsificada. Demuestra un enunciado verdadero: "conozco un
secreto cuyo compromiso está en el árbol de raíz X". Es cierto, porque el árbol
de raíz X lo armó él.

Contra los dos validadores, con el mismo código —al ingenuo se le omiten los
chequeos 1 y 2 y nada más (`scripts/ataque-raiz-propia.mjs:187`)—:

```
  Validador INGENUO (verifica la prueba y lleva la lista, nada mas)
    1  la raiz es la que descargo esta puerta          NO LO HACE
    2  el scope es el del evento de esta puerta        NO LO HACE
    3  la prueba verifica contra su verification key   OK
    4  el nulificador no esta en su lista local        OK
    => PASE. El atacante entra.

  Validador de la puerta 1 (los cuatro chequeos, en orden)
    1  la raiz es la que descargo esta puerta          FALLA
    => RECHAZADA en el chequeo 1 (raiz).
```

Que los dos corran el mismo `correrChequeos` es deliberado: así la única
diferencia entre aceptar y rechazar al atacante es esa lista de dos ids, y no
alguna otra cosa que se haya colado en una segunda implementación.

La lección, dicha con precisión: **la validez criptográfica no es aceptabilidad**.
Lo que `groth16.verify` responde es "existe un witness que satisface este
circuito con estas señales públicas". No dice absolutamente nada sobre si esas
señales públicas son las correctas. Eso lo tiene que decidir quien verifica, con
datos propios, de antemano. Una prueba de conocimiento cero prueba un enunciado;
elegir el enunciado que a uno le importa es trabajo del verificador.

Y el daño no es de una entrada. Como los ocho secretos son suyos, el atacante
genera ocho entradas, u ochocientas si arma un árbol más grande, y la lista de
nulificadores no lo frena porque cada secreto propio da un nulificador nuevo. El
chequeo 4 —el que parece "el del doble uso", el que uno escribiría primero— es
inútil contra esto. Lo único que lo frena es el chequeo 1.

El chequeo 2 tapa un agujero parecido y más sutil, y hay una demostración
limpia en la sección 5: una prueba del `evento-A` presentada en una puerta del
`evento-B` **pasa el chequeo 1**, porque el padrón es el mismo y la raíz también.
Lo único que la detiene es el scope. Sin el chequeo 2, la misma identidad entraría
una vez por cada evento que se le ocurra nombrar, porque con otro scope el
nulificador es otro y la lista nunca lo vio.

Por eso van primero y por eso son los críticos. El orden también es barato: los
dos son una comparación de enteros, y descartan antes de gastar los 8 ms de la
verificación. Pero ese es el argumento débil. El argumento fuerte es que sin
ellos el chequeo 3 no significa nada.

### Por qué la puerta guarda su propia raíz y su propia vkey

Porque es el ADR-002 —validación offline como eje del sistema— hecho código. Un
molinete en la puerta de un estadio no tiene conexión garantizada: puede estar en
un subsuelo, con mil teléfonos saturando la celda, o con el wifi del lugar caído.
Si para validar tuviera que consultar algo, la cola se detiene.

La consecuencia de diseño es que **la confianza se establece antes**. La puerta
descarga la raíz cuando puede y después decide sola. Eso mueve el problema, no lo
elimina: si la raíz cambia después de que la puerta se provisionó, la puerta
queda con una raíz vieja y rechaza entradas legítimas. Es un frente real y está
en la sección 6.

Guardar la vkey entera adentro de `configuracion.json` en vez de una ruta a
`build/setup/verification_key.json` es la misma idea llevada al detalle: si la
puerta apuntara a un archivo del repo, el día que alguien rehaga el setup —como
pasó en T04— la puerta cambiaría de vkey sin enterarse. Una copia propia falla de
manera visible en vez de mutar en silencio.

### Por qué un comando con `--puerta` y no dos scripts casi idénticos

`PLAN.md` dice "dos scripts casi idénticos". Acá hay uno solo parametrizado, y la
razón es que la independencia que la tarea necesita no es de texto sino de
estado: dos procesos distintos, dos archivos distintos, ninguna comunicación. Eso
se cumple igual —mejor, incluso— con un solo script, y evita el riesgo obvio de
dos copias: que alguien corrija un chequeo en una y se olvide de la otra, y que
T08 termine midiendo una diferencia de implementación en lugar de la falta de
sincronización. Si en algún momento las dos puertas tuvieran que comportarse
distinto, ahí sí harían falta dos.

### Por qué la lista es un JSON y se reescribe entera

Porque con ocho identidades alcanza y sobra, y porque un archivo que se puede
abrir con un editor es lo que hace que la demostración de T08 sea legible. Las
propiedades que un molinete de verdad necesita —escritura durable ante un corte
de luz, apéndice en vez de reescritura, un índice que no sea una búsqueda
lineal— son ingeniería de sistemas, no criptografía, y están en la sección 6.

### Por qué el que rechaza sale con código 2 y no con 1

Porque T08 va a scriptear estas corridas y necesita distinguir tres cosas: la
puerta aceptó (0), la puerta rechazó (2) y el comando no pudo trabajar (1). Si
rechazar fuera 1, una suite no podría diferenciar "rechazó como se esperaba" de
"faltaba un archivo".

## 4. Qué podrías cambiar

**Qué viaja en el sobre: prueba + 3 señales → prueba + nulificador.** Hoy la
prueba trae la raíz y el scope, y la puerta los compara con los suyos. La
alternativa es que el sobre traiga solo la prueba y el nulificador (160 bytes en
vez de 224, un 29% menos) y que la puerta **arme las señales públicas con sus
propios valores** antes de verificar. El resultado es el mismo —una prueba contra
otra raíz no verifica— pero el chequeo 1 deja de ser un `if` que alguien puede
olvidarse de escribir: pasa a ser estructural, porque la raíz ajena nunca entra
al programa. Es más robusto y se pierde que el sobre sea autocontenido: un
verificador que no sepa de qué evento es no puede hacer nada, y un error de
configuración aparecería como "no verifica" en vez de como "esta prueba es de
otro evento", que es un mensaje mucho peor para diagnosticar. Tocaría
`lib/sobre.mjs`, `lib/puerta.mjs:93` y el prover.

**La lista local → una lista compartida entre puertas.** Es el frente ADR-009 y
es la razón de ser de T08. Las opciones conocidas van desde sincronizar cuando
hay conexión (y aceptar una ventana de doble uso del tamaño del intervalo), hasta
particionar el espacio de nulificadores por puerta (y perder que el comprador
elija por cuál entrar), hasta un molinete central (y perder el offline, que es
ADR-002). Ninguna es gratis y elegir es una decisión del TPF, no de esta PoC.
Tocaría `lib/puerta.mjs:62` y `:72`, que hoy son las dos únicas funciones que
saben dónde vive la lista.

**El archivo JSON → una base embebida.** SQLite con escritura durable, o un log
de solo apéndice con `fsync`. Se gana que un corte de luz no pierda los
nulificadores de la noche ni corrompa el archivo —hoy se reescribe entero, así
que un corte en el medio lo deja inválido— y se gana una búsqueda que no sea
lineal. Se pierde poder leer el estado con `cat`. Tocaría las mismas dos
funciones.

**La fuente de la raíz: un JSON → un contrato.** Es T09, y el validador **no
cambia**: lo que cambia es `scripts/provisionar-puerta.mjs:90`, que hoy le
pregunta a `fuenteJson` y mañana le va a preguntar a `fuentes/contrato-raiz.mjs`.
El momento offline sigue siendo offline; lo que mejora es de quién se descargó la
raíz. Es la misma escalera que describe `docs/04-organizador.md`.

**Una raíz vigente → varias.** Hoy la puerta conoce una sola raíz y una sola
vkey. Un sistema real necesita tolerar que el padrón cambie durante la venta: la
puerta tendría una lista de raíces vigentes con su fecha, y el chequeo 1 sería
una pertenencia a esa lista. Se gana que una entrada comprada a último momento no
quede afuera; se pierde que una raíz revocada siga siendo aceptada hasta que
alguien la saque, y aparece la pregunta de quién y cuándo. Tocaría
`lib/puerta.mjs:95` y el formato de `configuracion.json`.

**Verificar en JavaScript → verificar en otro lado.** Con la prueba sin comprimir
(256 bytes) un verificador Groth16 de Solidity consume los ocho elementos de
campo sueltos: eso es T10, y sirve para entender la alternativa, no para
adoptarla, porque verificar on-chain rompe el offline del ADR-002. En la
dirección opuesta está el molinete real, que probablemente no corra Node: la
verificación de Groth16 sobre BN254 existe en Rust (arkworks) y en C (rapidsnark),
y cuánto tarda ahí **no está medido acá**.

**Atar la prueba al portador.** Hoy la prueba es transferible: cualquiera que
tenga los 224 bytes entra. Las defensas habituales —un desafío que la puerta
muestra y que entra al circuito como señal pública, una marca de tiempo, una
firma del dispositivo— cambian el circuito y son decisión del TPF. Tocaría
`circuitos/pertenencia.circom`, el prover, y agregaría un chequeo 5 acá.

## 5. Probalo vos

Desde la raíz del repo, con el entorno armado por las tareas anteriores:

```bash
npm run circuito:pertenencia   # si falta build/pertenencia_js/pertenencia.wasm
npm run setup                  # si falta build/setup/pertenencia.zkey
npm run organizador -- --scope evento-A
npm run probar -- --identidad 3 --scope evento-A
npm run puerta:provisionar -- --puerta 1,2 --scope evento-A
```

El provisionamiento imprime lo que cada puerta se lleva:

```
Provisionar puerta - el momento conectado

  fuente de raiz    json (datos/raiz.json)   (se consulta ahora, no en la puerta)
  evento (scope)    evento-A -> 7421952849778469791634643529725528999721210991605956451547960136850882987634
  raiz del evento   21742806920683719786915181996178546158207976983808212562412387320164881855720
  verification key  build/setup/verification_key.json (3 senales publicas)
  orden verificado  [nulificador, raiz, scope]   segun build/pertenencia.sym

  puerta 1
    puertas/puerta-1/configuracion.json
    puertas/puerta-1/nulificadores.json  (lista vacia)
    esta puerta NO comparte nada con las demas: ni archivo, ni proceso.
```

### La entrada pasa

```bash
npm run validar -- --puerta 1 --prueba salidas/prueba.json
```

```
Validador de puerta - puerta 1 (offline)

  configuracion     puertas/puerta-1/configuracion.json (provisionada 2026-09-23)
  evento (scope)    evento-A -> 7421952849778469791634643529725528999721210991605956451547960136850882987634
  raiz que conoce   21742806920683719786915181996178546158207976983808212562412387320164881855720
  vkey propia       groth16/bn128, 3 senales publicas (copia local)
  orden de senales  [nulificador, raiz, scope]  (verificado contra el .sym al provisionar)
  lista local       0 nulificadores usados en esta puerta
  red               bloqueada: fetch, http.request, http.get, https.request, https.get, net.connect, net.createConnection

Sobre presentado

  archivo           salidas/prueba.json
  formato           prueba.json + senales-publicas.json (857 bytes)
  nulificador       9349048846653045638591846123935411322465784345075339403618387866985628512571
  raiz              21742806920683719786915181996178546158207976983808212562412387320164881855720
  scope             7421952849778469791634643529725528999721210991605956451547960136850882987634

Chequeos

  1  la raiz es la que descargo esta puerta          OK    coincide
  2  el scope es el del evento de esta puerta        OK    coincide
  3  la prueba verifica contra su verification key   OK    320.0 ms
  4  el nulificador no esta en su lista local        OK    0 usados antes

PASE. La puerta 1 acepta y anota el nulificador.

  registrado en     puertas/puerta-1/nulificadores.json  (1 usados en esta puerta)
  lo que la puerta NO sabe: cual de las 8 identidades entro, ni que billetera
  la controla. Solo que es una del arbol y que todavia no habia pasado por aca.

Tiempo

  leer el sobre     1.0 ms
  verificar Groth16 320.0 ms   (la primera del proceso: incluye armar la curva)
  total del comando 329.4 ms  (sin contar el arranque de node)
```

### La misma entrada, otra vez, en la misma puerta

```bash
npm run validar -- --puerta 1 --prueba salidas/prueba.json
```

```
  4  el nulificador no esta en su lista local        FALLA ya paso 2026-09-23T19:42:38.395Z

RECHAZADA por el chequeo 4 (nulificador).

  Esta entrada ya se uso en ESTA puerta. Quien esta adelante puede ser el mismo
  que paso antes o alguien que le saco una foto al QR: la puerta no puede
  distinguirlos, y por eso rechaza.
```

Vale la pena detenerse: la puerta rechaza sin saber a quién está rechazando. No
sabe cuál de las ocho identidades es, ni qué billetera la controla. Lo único que
sabe es que ese nulificador ya pasó. Eso es lo que aporta el ZK y no lo aporta un
NFT: con un `tokenId` el molinete sabría exactamente qué entrada es y, si el
contrato es público, a qué dirección pertenece.

### La misma entrada en la otra puerta

```bash
npm run validar -- --puerta 2 --prueba salidas/prueba.json
```

```
  4  el nulificador no esta en su lista local        OK    0 usados antes

PASE. La puerta 2 acepta y anota el nulificador.
```

**Entró dos veces con la misma entrada**, y las dos puertas hicieron bien su
trabajo. El agujero no es de la criptografía: es que dos listas locales sin canal
entre ellas no pueden saber lo que vio la otra. Está expuesto a propósito y es el
frente ADR-009. T08 lo va a convertir en una prueba automática.

Para ver las dos listas:

```bash
npm run validar -- --puerta 1 --estado
npm run validar -- --puerta 2 --estado
```

```
Puerta 1 - estado local

  lista local       puertas/puerta-1/nulificadores.json  (1 nulificadores)

    1  9349048846653045638591846123935411322465784345075339403618387866985628512571
       2026-09-23T19:42:38.395Z   salidas/prueba.json

  Esta lista es solo de la puerta 1. Ninguna otra puerta la ve, y esta puerta
  no ve las de las demas: no hay canal entre ellas.
```

`npm run validar -- --puerta 1 --olvidar` vacía la lista para volver a empezar.
Un molinete de verdad no tiene ese botón.

### El ataque del árbol propio

```bash
npm run ataque:raiz-propia
```

La salida está en la sección 3. El resumen: la prueba del atacante verifica
contra la verification key del evento, el validador ingenuo la acepta y la puerta
la rechaza en el chequeo 1. El ataque deja los artefactos en
`salidas/ataque/sobre-atacante.json` y `.bin`, así que se puede presentar en la
puerta de verdad:

```bash
npm run validar -- --puerta 1 --prueba salidas/ataque/sobre-atacante.bin
```

```
  1  la raiz es la que descargo esta puerta          FALLA otra raiz

  los 3 chequeos siguientes no se corrieron: la puerta ya rechazo.

RECHAZADA por el chequeo 1 (raiz).

  la prueba trae    20015225524063974638380943110570875067346502649548216576988022975831689873684
  esta puerta tiene 21742806920683719786915181996178546158207976983808212562412387320164881855720
```

### Rotura deliberada: la prueba correcta en la puerta equivocada

Esta es la que aísla el chequeo 2, y es la más instructiva de las dos roturas
porque el chequeo 1 **no** la atrapa.

```bash
npm run organizador -- --scope evento-B
npm run puerta:provisionar -- --puerta 3 --scope evento-B
npm run validar -- --puerta 3 --prueba salidas/prueba.json
```

```
  1  la raiz es la que descargo esta puerta          OK    coincide
  2  el scope es el del evento de esta puerta        FALLA otro evento

RECHAZADA por el chequeo 2 (scope).

  la prueba trae    7421952849778469791634643529725528999721210991605956451547960136850882987634
  esta puerta tiene 15733295061822279802586667571562460516812655015107393590714040915364065023364
```

La raíz coincide porque el padrón es el mismo: las mismas ocho personas compraron
para los dos eventos. Lo único distinto es el scope, y por eso es un chequeo
aparte y no un detalle del primero.

Dejá el repo como estaba:

```bash
npm run organizador -- --scope evento-A
```

### Rotura deliberada: tocarle la raíz a la puerta

Abrí `puertas/puerta-1/configuracion.json` y cambiale un dígito al campo `raiz`.
Después presentá la entrada legítima de siempre:

```
  1  la raiz es la que descargo esta puerta          FALLA otra raiz

  la prueba trae    21742806920683719786915181996178546158207976983808212562412387320164881855720
  esta puerta tiene 21742806920683719786915181996178546158207976983808212562412387320164881855721
```

Rechaza a un comprador honesto, y esa es exactamente la lección: la raíz que la
puerta tiene **es** el ancla de confianza. Si está mal, o vieja, la puerta
rechaza a todo el mundo. Por eso mover el problema al momento del
provisionamiento no es resolverlo: es elegir dónde ponerlo. Restaurá con

```bash
npm run puerta:provisionar -- --puerta 1 --scope evento-A
```

que conserva la lista de nulificadores porque el evento es el mismo.

### Cuánto tarda

Cinco invocaciones seguidas del comando completo, en la misma máquina de
`docs/05-prover.md` (Intel i5-14400F, 16 GB, Windows 11, Node v20.19.2,
snarkjs 0.7.6), con `--cronometrar 10`:

```
corrida 1  wall 767 ms   verificacion 334.2 ms   10 mas: 8.3 ms de promedio  [6.7 .. 9.6]
corrida 2  wall 727 ms   verificacion 316.9 ms   10 mas: 8.0 ms de promedio  [7.1 .. 9.1]
corrida 3  wall 743 ms   verificacion 323.0 ms   10 mas: 7.8 ms de promedio  [6.6 .. 10.4]
corrida 4  wall 751 ms   verificacion 321.0 ms   10 mas: 7.9 ms de promedio  [6.7 .. 8.9]
corrida 5  wall 754 ms   verificacion 318.2 ms   10 mas: 7.7 ms de promedio  [6.9 .. 8.9]
```

Tres números distintos y hay que no confundirlos:

- **~8 ms** es lo que cuesta verificar una prueba Groth16 una vez que el proceso
  está caliente. Es el costo por persona de la cola.
- **~320 ms** es la primera verificación de cada proceso, que paga la
  construcción de la curva BN254 en ffjavascript. Un molinete que arranca una vez
  por noche la paga una vez.
- **~750 ms** es el comando entero, incluido el arranque de Node. Eso es un
  artefacto de que esto sea un script de línea de comandos, no una propiedad del
  mecanismo.

Ninguno de los tres es una medición de un molinete real, por la misma razón que
los números del prover no son MED-001: esto es Node de escritorio, no el
dispositivo de una puerta, y no incluye leer el QR, que es probablemente la parte
más lenta de todo. Lo que sí se puede decir es que la verificación no es el
cuello de botella: contra el presupuesto de 5 s de ADR-004, 8 ms es nada, y el
costo dominante del sistema está del lado del comprador, generando la prueba.

Verificar es unas **veinte veces más barato que probar** (8 ms contra los 157 ms
de `docs/05-prover.md`), y esa asimetría no es un accidente de esta
implementación: es la propiedad que hace que los SNARK sirvan.

## 6. Qué NO hace

**No sincroniza nada con las otras puertas, y eso es un agujero real.** La misma
entrada pasa por la puerta 1 y por la puerta 2. No lo resuelve el ZK ni lo
resuelve el nulificador: el nulificador garantiza que dos usos de la misma
entrada sean *reconocibles como el mismo*, pero alguien tiene que estar mirando
las dos puertas para reconocerlo. Es el frente **ADR-009** y T08 lo convierte en
una prueba automática.

**No ata la prueba a quien la presenta.** Los 224 bytes son transferibles:
alcanza con sacarle una foto al QR de otro y llegar primero. La puerta no puede
distinguir al dueño del que copió, y por eso el mensaje del chequeo 4 dice las
dos cosas. Las defensas están en la sección 4 y cambian el circuito.

**No autentica al organizador.** La raíz que la puerta descargó salió de un
archivo JSON local que cualquiera edita. Que sea inseguro está dicho en
`docs/04-organizador.md` y lo empieza a resolver T09 con `RegistroDeRaiz.sol`.
Mientras tanto, el chequeo 1 garantiza que la puerta y el prover estén de acuerdo
sobre *cuál* es el árbol, no que ese árbol sea el del evento real.

**El chequeo 3 no garantiza solidez.** La ceremonia de T04 la corrió una sola
persona en una sola máquina, así que quien la corrió conoce el residuo tóxico y
puede fabricar pruebas que verifican sin conocer ningún secreto. Todo lo que se
mide acá vale igual; la garantía que no vale es justamente la que el chequeo 3
parece dar. Está en `docs/03-setup.md`.

**No sabe qué hacer con una raíz vieja.** Si el organizador publica una raíz
nueva después de que la puerta se provisionó, la puerta rechaza a los
compradores nuevos y no tiene forma de enterarse de por qué. No hay vencimiento,
ni lista de raíces vigentes, ni aviso.

**No resiste un corte de luz.** `nulificadores.json` se reescribe entero en cada
aceptación. Un corte en el medio de esa escritura deja el archivo inválido y la
puerta no arranca. Es ingeniería de sistemas y está en la sección 4.

**No mide un molinete.** Los 8 ms son Node de escritorio. No incluyen leer el QR,
ni el dispositivo real, ni la cola de gente. Contra **ADR-004** sirven como
indicio de que la verificación no es el problema, no como medición.

**No sabe nada de NFT.** Esta pieza no mira un contrato, ni un `tokenId`, ni una
billetera. Que la entrada sea auténtica, que no se haya falsificado, que tenga
tope de reventa o regalías: todo eso lo da el contrato y es **T11**. Lo único que
aporta el ZK acá es que la puerta acepte o rechace sin aprender cuál de los ocho
compradores está adelante. Y el conjunto de anonimato de esta PoC es de ocho
personas, que es ridículamente chico y acota el claim: **ADR-001**.

**No dice nada sobre metadatos.** Que el nulificador no revele el secreto es
cierto. Que la puerta registre la hora exacta de cada aceptación —y este
validador la registra, en `nulificadores.json`— abre una correlación con cualquier
otra fuente que sepa quién llegó cuándo. Es otro problema entero y esta PoC no lo
toca.

Los frentes del TPF con los que se engancha: **ADR-002** (validación offline, que
es el que esta pieza materializa), **ADR-009** (coordinación entre puertas),
**ADR-004** (presupuesto de tiempo en la puerta), **ADR-011** (qué entra en el
QR) y **ADR-001** (claim de privacidad), todos en `../zk-ticketing-docs`. **No
cierra ninguno.** Las decisiones que esta tarea dejó a la vista —qué viaja en el
sobre y quién arma las señales públicas, cuántas raíces vigentes tolera una
puerta, y cómo se sincronizan las listas— están anotadas como candidatas a ADR en
`bitacora/T07-validador.md`.
