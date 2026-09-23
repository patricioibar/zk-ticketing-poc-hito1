# Recorrido

Un tour guiado por lo que ya está construido, en orden de lectura, para hacerlo
con la terminal al lado. No es un resumen: es el hilo. Cada parada te manda a
correr un comando y a leer una sección concreta de los documentos que ya
existen, y te dice qué tendrías que estar entendiendo cuando salgas de ahí. Si
algo está bien explicado en un doc, acá va el enlace y no la copia.

**Cubre la fase 1 y nada más**: entorno, Poseidon, circuito, trusted setup,
organizador, prover, validadores y las demostraciones. No hay contratos, ni NFT,
ni nada on-chain, porque todavía no existen. Qué falta y cuándo se extiende este
recorrido está al final, en [Lo que todavía no está](#lo-que-todavía-no-está).

**Cuánto lleva.** Leyendo y corriendo los comandos, alrededor de una hora.
Haciendo también las roturas deliberadas —que es donde está la mitad del valor—,
unas dos horas y cuarto. Los tramos están cronometrados uno por uno; se puede
cortar entre tramos sin perder el hilo.

**El hilo conductor.** Casi todo lo que encontraron las ocho tareas se ordena
alrededor de una sola idea: los **modos de fallo silencioso**. Un conteo de
restricciones que no baja cuando sacás la única línea que hacía que el circuito
probara algo. Un circuito con un carácter cambiado que compila igual, pasa los
tests y acepta un nulificador inventado. Una `zkey` vieja que sigue generando
pruebas válidas del circuito de ayer. Un validador que le cree a la raíz que le
trae la prueba y deja entrar a cualquiera con su propio árbol. En este stack, que
algo parezca correcto no significa nada. Vas a encontrar cuatro de estos marcados
como **Fallo silencioso 1** a **4**, y tres variantes menores en el camino.

---

## Antes de empezar

Dos cosas, una vez:

```bash
npm install
npm run setup
```

`npm run setup` tarda entre veinte segundos y un minuto según la máquina y
regenera `build/`, que no viaja en git: son unos 14 MB de `ptau` y `zkey` que se
rehacen con un comando. Si querés saber ahora mismo qué es lo que se está
generando, no hace falta: es el Tramo 5.

Tres avisos prácticos antes del primer comando.

**Los números no te van a coincidir con los de los docs.** Todo lo que está
escrito en `docs/` se midió el 2026-09-23 con Node v20.19.2. Esta máquina hoy
tiene **Node v22.23.3**, y eso mueve los tiempos —el `npm run setup` que a los
docs le tardó 52,8 s acá tarda unos 19—. Los *valores* criptográficos sí
coinciden exactamente: la raíz, los compromisos y los nulificadores son los
mismos números de siempre, porque son deterministas. Si te coincide un tiempo, es
casualidad; si no te coincide una raíz, hay un problema.

**Esta copia es un worktree con `core.autocrlf=true`.** Consecuencia: después de
correr el organizador o `npm test`, `git status` va a marcar los tres archivos de
`datos/` como modificados aunque el contenido sea idéntico (`git diff` no muestra
ni una línea). Es cosa de finales de línea, no rompiste nada. `git checkout --
datos/` lo deja limpio. `docs/07-demostraciones.md` dice que `git status` queda
limpio; con esta configuración de git, no.

**Lo que podés borrar sin miedo**: `build/`, `salidas/` y `puertas/`. Los tres
están en `.gitignore` y los tres se regeneran con un comando. `datos/` sí está
versionado.

---

## Tramo 1 — Miralo andar (10 min)

Antes de leer una sola línea de explicación:

```bash
npm test
```

Unos trece segundos. Lo que acabás de ver es el sistema entero en una pantalla:
siete casos, cada uno declarando de antemano qué resultado espera, ejecutados con
los comandos de verdad —organizador, prover, provisionar, validador— como
procesos separados.

Leelo entero, de arriba abajo, sin intentar entender todavía por qué funciona.
Tres cosas para fijarte:

- El **caso 3 pasa**, y pasa a propósito. La misma entrada abre la puerta A1 y la
  puerta A2. No es un bug de la suite: es el agujero que la PoC existe para
  exponer.
- El **caso 7** es el único que no falla en la puerta. Falla antes, en el teléfono
  del atacante, cuando el circuito no encuentra ningún witness.
- Los dos párrafos del final separan **lo que el ZK resuelve** de **lo que no**.
  Esa distinción es el criterio con el que se mide el TPF entero, y es a donde
  vuelve este recorrido al cerrar.

Si querés el contexto de la suite en sí, está en
[`docs/07-demostraciones.md`](docs/07-demostraciones.md), secciones 1 y 2. La
sección 6 de ese mismo doc dejala para más adelante: el Tramo 8 te trae de vuelta
acá y para entonces se lee distinto.

**Qué tendrías que estar entendiendo al salir de acá:** nada del mecanismo
todavía. Solo que el sistema corre entero, que hay siete afirmaciones sobre él
que son verificables en trece segundos, y que una de esas siete es un agujero
declarado.

---

## Tramo 2 — Qué problema resuelve esto (10 min)

Ahora el enunciado. Está en [`CONTEXTO.md`](CONTEXTO.md), sección "Qué es esto",
en una oración: **probar que tenés una entrada válida de un conjunto, sin revelar
cuál es ni qué billetera la controla, y que esa entrada no se pueda usar dos
veces.**

Tres piezas lo sostienen: un árbol de Merkle de compromisos cuya raíz es pública,
una prueba de pertenencia a ese árbol donde el secreto y la posición quedan
privados, y un nulificador `Poseidon(secreto, scope)` determinista por evento.

Corré el primer escalón:

```bash
npm run organizador -- --scope evento-A
```

Un segundo. Genera ocho identidades, arma el árbol y publica la raíz.

Y ahora leé dos secciones cortas de
[`docs/04-organizador.md`](docs/04-organizador.md), sección 3: **"Por qué el árbol
se arma con compromisos y no con secretos"** y **"Qué es el conjunto de
anonimato, y por qué 8 es ridículamente chico"**. Son dos páginas y son la base
conceptual de todo lo que sigue.

La segunda es incómoda a propósito y conviene que lo sea: el ZK no aporta
privacidad por sí mismo, aporta la privacidad que le permita el tamaño del
conjunto. Con ocho hojas, adivinar quién entró tiene probabilidad 1/8. El árbol
de esta PoC es una demostración del mecanismo, no una demostración de privacidad.

Si te sobra un minuto, mirá `datos/arbol.json`. Es el padrón: público por
definición, y no revela quién es quién. Al lado está `datos/secretos.json`, que
es lo que en el sistema real no existiría. Por qué son dos archivos distintos
está en la sección 3 del mismo doc, en "Por qué la raíz y el padrón son dos
artefactos distintos", y la respuesta —porque lo único que cambia de lugar al
subir la escalera es la raíz— es la que va a tener sentido recién en la fase 2.

**Qué tendrías que estar entendiendo al salir de acá:** qué es un compromiso y
por qué el árbol se puede publicar entero sin que eso sirva de nada a nadie. Y
que "ocho" es el número que acota todo el claim de privacidad de esta PoC.

---

## Tramo 3 — El campo y el hash (15 min)

Este tramo es el único que no construye nada. Es un instrumento de calibración, y
va antes que el circuito por una razón que vale la pena tener clara.

```bash
npm run control:poseidon
```

Unos trece segundos, casi todos compilando. Lo que hace es comprobar que Poseidon
devuelve exactamente el mismo número calculado adentro de un circuito de circom y
calculado en JavaScript con circomlibjs, sobre dieciséis vectores.

Leé de [`docs/01-poseidon.md`](docs/01-poseidon.md), sección 3, estas cuatro
partes en orden:

1. **"Qué es el campo primo, y por qué todo esto es aritmética modular"**. Es el
   universo entero de valores que puede tomar una señal: los enteros de 0 a
   `p - 1` con `p` de 77 dígitos. El dato incómodo que te va a perseguir hasta la
   fase 3: un `uint256` de Solidity no entra en el campo.
2. **"Por qué Poseidon y no SHA-256"**. Acá aparece la unidad de costo de todo el
   diseño, que es la **restricción**. La tabla medida dice 517 restricciones
   contra 63038 para hacer el mismo trabajo: 122 veces. Y la explicación de por
   qué —las restricciones son sobre elementos del campo, no sobre bits— es lo que
   hace que la intuición de un procesador no sirva acá.
3. **"Por qué esta tarea va antes que el circuito"**. Dos implementaciones
   distintas de Poseidon van a calcular lo mismo en dos lugares distintos, y si
   difirieran en un bit el único síntoma sería "la prueba no verifica", sin más
   información.
4. **"El caso de borde: la reducción módulo p es silenciosa en las dos"**.

Ese último punto es la primera variante del hilo conductor de este recorrido.
`Poseidon(p)` da el mismo hash que `Poseidon(0)`; `Poseidon(p + 1)`, el mismo que
`Poseidon(1)`. Las dos implementaciones reducen sin decir nada, lo cual está bien
—coinciden, que es lo que había que establecer— y tiene una consecuencia que no
está bien: **dos secretos distintos pueden producir el mismo nulificador** si
difieren en un múltiplo exacto de `p`. Con secretos al azar da lo mismo; con
secretos que vengan de afuera, el valor no es al azar, lo elige alguien, y ese
alguien puede ser un atacante.

Mirá en la salida del comando el vector `p (el modulo exacto)`: la línea
`x mod p  0  <- se redujo` no la calcula el script aparte, la lee **de adentro
del witness**. Es el circuito diciendo con qué número trabajó realmente.

Si tenés quince minutos de más y querés ver la lección, la primera rotura
deliberada de la sección 5 de ese doc —cambiar `x` por `x + 1` en una línea del
circuito de control— es barata y enseña dos cosas: que el hash del circuito para
`x = 0` pasa a ser el de JavaScript para `x = 1` (está corrido un lugar, y
comparar contra los otros vectores te dice qué pasó), y que sumarle uno al número
más grande del campo da cero.

**Qué tendrías que estar entendiendo al salir de acá:** que todo son elementos de
un campo finito, que el costo se mide en restricciones y que hashear es barato
mientras que comparar es caro, y que una reducción silenciosa es un problema que
hay que atajar fuera del circuito, porque adentro no queda rastro de que haya
pasado.

---

## Tramo 4 — El circuito (25 min)

Es el tramo largo y es el centro de todo. Salí de acá entendiendo esto y el resto
se acomoda solo.

Abrí [`circuitos/pertenencia.circom`](circuitos/pertenencia.circom). Son 67
líneas. Leelas enteras antes de correr nada: se leen en cinco minutos y están
comentadas.

Después corré el banco de pruebas:

```bash
npm run circuito:pertenencia
```

Cuatro segundos. Compila, imprime las **2513 restricciones**, arma el árbol de
ocho identidades y corre un testigo válido y cinco inválidos. Los mensajes
`ERROR: 4 Error in template Pertenencia_145 line: 57` los imprime el wasm de
circom, no el script, y aparecen **porque los testigos inválidos están siendo
rechazados correctamente**.

Ahora [`docs/02-circuito.md`](docs/02-circuito.md). De la sección 2, leé
**"Antes del código: qué es una restricción"** y **"Señal privada, pública y
salida"**. Ahí está la regla que gobierna todo lo demás: *lo que no está escrito
como restricción, no está probado*. El compilador genera además un `.wasm` que
calcula el witness, pero ese wasm es una comodidad para el que prueba
honestamente; un atacante arma el witness a mano como quiera, y lo único que lo
limita son las ecuaciones.

De la sección 3, leé **"Qué es una señal sub-restringida"** entera. Y después
hacé las dos roturas de la sección 5, en este orden.

### Fallo silencioso 1 — la restricción que falta

Comentá la línea 57 de `circuitos/pertenencia.circom`:

```circom
    // raiz === arbol.out;
```

Es la única línea que compara la raíz que sale de subir el árbol contra la raíz
pública. Corré `npm run circuito:pertenencia`.

Compila sin una sola advertencia, **con las mismas 2513 restricciones**, y cuatro
de los cinco testigos inválidos pasan a ser aceptados. Lo importante no es que
falle el comando: es **qué sigue funcionando**. El testigo válido pasa, el
nulificador es el correcto, `wtns.check` dice que el witness satisface el
sistema. Un circuito que hace todo bien salvo lo único que tenía que probar, y
cualquiera con un secreto inventado y una raíz inventada entra a cualquier
evento.

Restaurá la línea y volvé a correrlo antes de seguir.

### Fallo silencioso 2 — `<--` en vez de `<==`

En la línea 62, cambiá un carácter:

```circom
    nulificador <-- hasherNulificador.out;
```

Corré `npm run circuito:pertenencia`: **pasa entero**. Mismo nulificador, los
cinco rechazos donde corresponde, código de salida 0.

La diferencia visible es una sola, y está en la salida del compilador:
`wires: 2519` en vez de `2518`. Mismas 2513 restricciones, ninguna advertencia.
Ese cable de más es todo el agujero: `nulificador` dejó de estar atado a nada, y
cualquiera que arme el witness a mano puede poner ahí el número que quiera. En
este sistema eso es entrar con la misma entrada todas las veces que quiera,
inventando un nulificador nuevo en cada puerta. El anonimato queda intacto; lo
que se cae es la defensa contra el doble uso.

La tabla de la sección 3 del doc es la parte que más conviene retener, porque
contradice la intuición razonable de buscar el bug contando restricciones: el
circuito correcto, el del `<--` y el que no compara la raíz tienen **los tres**
2513 restricciones. La firma del bug es un cable libre de más, no una ecuación de
menos, y circom 2.2.3 no dice nada. La medición que lo cierra está en el doc:
compilando la variante con `<--`, generando el witness válido y reemplazando a
mano el nulificador por el número 42, las 2513 restricciones se evalúan una por
una y las violadas son **cero**.

Restaurá el `<==`.

La conclusión práctica: un circuito no se audita contando. Se audita
preguntándose, señal por señal, qué ecuación la ata.

Si te queda apetito, las otras dos secciones de la 3 que vale la pena son **"Por
qué la separación de dominio"** —por qué la hoja usa `Poseidon` de una entrada y
el nulificador de dos, y qué ataque evita eso— y **"Qué queda afuera a propósito:
el rango de las entradas"**, que cierra el pendiente del Tramo 3: validar el
rango adentro del circuito no es caro, es **imposible**, porque cuando el valor
llega ahí ya está reducido y no hay nada que comparar.

**Qué tendrías que estar entendiendo al salir de acá:** que un circuito es un
sistema de ecuaciones y no un programa; que la prueba demuestra "conozco un
witness que satisface este sistema" y nada más; y que las dos formas de romperlo
—una restricción que falta y una señal que se asigna sin atarse— no producen
ningún síntoma hasta que ya es tarde.

---

## Tramo 5 — El trusted setup (20 min)

Ya lo corriste en "Antes de empezar". Ahora toca entender qué generó.

Leé de [`docs/03-setup.md`](docs/03-setup.md), en este orden:

1. Sección 2, **"Antes del código: por qué hay una ceremonia"** y **"Dos fases, y
   la diferencia entre ellas"**. Groth16 da una prueba de tamaño constante que se
   verifica en milisegundos, y el precio es que esos parámetros salen de unos
   secretos que alguien tiene que generar y nadie tiene que conservar: el
   **residuo tóxico**.
2. Sección 3, **"Qué es exactamente el residuo tóxico, y qué puede hacer quien lo
   tenga"**. Es la respuesta al jurado y conviene tenerla con precisión: quien lo
   tiene puede fabricar entradas que nunca se compraron, y **no** puede saber cuál
   de los compradores entró. Rompe la solidez, no la privacidad. Ataca lo que en
   este sistema aporta el contrato, no lo que aporta el ZK.
3. Sección 3, **"Por qué alcanza con que una sola contribución sea honesta"** y
   **"Por qué esta ceremonia, así corrida, no es segura"**. El supuesto se llama
   1-de-n honesto, y acá **n = 1**: las tres contribuciones las hizo el mismo
   proceso, en la misma máquina, en el mismo segundo. Nada de lo que hay en
   `build/setup/` sirve para producción, y lo que falta no es código: son
   participantes.

Volvé a mirar la salida de tu `npm run setup`. Dos cosas:

- `prepare phase2` se lleva más de la mitad del tiempo total y no tiene ningún
  secreto adentro: es una FFT. Toda la fase 2 —lo que hay que rehacer cuando el
  circuito cambia— son unos pocos segundos. Esa asimetría es lo que hace viable
  la respuesta al jurado: la parte imposible de organizar para un equipo de
  cuatro es justo la que no hay que organizar, porque ya está hecha y se descarga.
- El bloque **"Demostracion - la misma prueba contra la vkey de la otra
  ceremonia"** da `no (correcto)`. Mismo circuito, mismas señales públicas, otra
  entropía de fase 2, y alcanza para que no verifique. La regla práctica que se
  desprende: la prueba, la `zkey` y la `verification_key` tienen que venir siempre
  de la misma corrida.

### Fallo silencioso 3 — la zkey desactualizada

Está medido en la sección 5 del doc, **"Rotura deliberada 2"**, y tiene dos
mitades que conviene no mezclar.

La mitad buena: `snarkjs zkey verify` compara el hash del circuito grabado en la
`zkey` contra el `.r1cs` que le pasás y dice `INVALID: Circuit does not match`.
Hay una herramienta que detecta el desfasaje y usarla es gratis; el script la
corre en cada corrida.

La mitad que duele: con esa misma `zkey` vieja, **el prover genera una prueba
igual y esa prueba verifica**. Sin ningún error. La `zkey` codifica el sistema de
ecuaciones viejo, y el witness del circuito nuevo también lo satisface. Dicho al
revés, que es como conviene recordarlo: si mañana agregás al circuito una
restricción de seguridad y no rehacés la fase 2, el sistema sigue funcionando,
las pruebas siguen verificando, los tests siguen pasando y **la restricción nueva
no se aplica**.

Y la otra mitad del panorama: si el cambio agrega o saca una *señal* en vez de
una *ecuación*, el desajuste sí es ruidoso —`Invalid witness length. Circuit:
2518, witness: 2519`—. O sea que falla fuerte cuando cambia la forma del witness
y falla en silencio cuando cambian solo las ecuaciones. El caso silencioso es el
peligroso y es el más común, porque agregar una restricción a señales que ya
existen es exactamente lo que uno hace cuando arregla un agujero.

Una variante más, en la sección 3 del mismo doc: si el `ptau` es demasiado chico,
`zKey.newZKey` **no lanza ninguna excepción**. Escribe un mensaje solo si le
pasás un logger, devuelve `-1` y deja un `.zkey` de **cero bytes**. El script
tiene una guarda propia que corta antes, con el número exacto que hay que poner,
justamente porque la librería no avisa.

**Qué tendrías que estar entendiendo al salir de acá:** qué es una ceremonia y
por qué alcanza con un participante honesto; que la nuestra no tiene ninguno y
eso rompe la solidez y no la privacidad; y que una `zkey` y su circuito son un
par que hay que verificar explícitamente porque divergir no duele hasta mucho
después.

---

## Tramo 6 — La prueba (15 min)

Recién ahora aparece la prueba de conocimiento cero de verdad.

```bash
npm run probar -- --identidad 3 --scope evento-A
```

Unos cuatro o cinco segundos: hace una corrida de calentamiento y diez medidas.

De [`docs/05-prover.md`](docs/05-prover.md), leé de la sección 2 **"Antes del
código: qué es 'generar una prueba'"** y, sobre todo, **"Qué entra al circuito y
qué sale"**. Esa tabla de seis filas es lo único que aporta el ZK, y conviene
mirarla contra la salida del comando que acabás de correr.

Y después la subsección que la sigue: **"¿Por qué publicar `Poseidon(secreto,
scope)` no revela nada del secreto?"**. Son tres propiedades y hacen falta las
tres. La primera tiene una condición que se subestima: la defensa depende de que
el secreto sea **impredecible**. Un secreto derivado de un DNI o de un número de
orden se rompe probando candidatos, y el hash no salva nada. Por eso los secretos
de esta PoC se generan por rechazo sobre 256 bits y no con una regla legible.

Y lo que el nulificador **sí** revela, dicho con la misma claridad: dentro de un
mismo evento, dos entradas con el mismo nulificador son la misma identidad. Es a
propósito —es la defensa contra el doble uso— y es un límite real de la
privacidad.

Mirá los dos números que esta PoC existe para medir, en el bloque `Tamano` de la
salida. El tamaño es el resultado firme: **224 bytes** el sobre binario
comprimido, contra los 2953 que entran en un QR estático. Eso no cambia con la
máquina. El tiempo no: el bloque de hardware y la advertencia de que **esto no es
MED-001** están en la salida a propósito, y la razón está en la sección 3 del
doc, **"Por qué estos números no son MED-001"**. MED-001 pregunta por un teléfono
de gama media; esto es una PC de escritorio, y el factor entre las dos no está
medido acá.

Un detalle chico que enseña más que un párrafo: el JSON de la prueba mide entre
722 y 725 bytes según qué prueba salió, y el binario da 128 siempre. Un tamaño
que depende de qué prueba salió no es el tamaño de la prueba: es el tamaño de una
manera de escribirla.

Ahora la propiedad que hace que todo esto sirva. Corré la misma identidad en otro
evento:

```bash
npm run organizador -- --scope evento-B
npm run probar -- --identidad 3 --scope evento-B
```

Misma identidad, mismo árbol, **misma raíz**, y un nulificador que no se parece
en nada al anterior. Nadie que vea los dos puede decidir si son de la misma
persona. **Eso es ZK**: un NFT común no lo da, porque el `tokenId` y la billetera
son los mismos en los dos eventos.

Dejá el repo como estaba:

```bash
npm run organizador -- --scope evento-A
npm run probar -- --identidad 3 --scope evento-A
```

**Qué tendrías que estar entendiendo al salir de acá:** qué viaja en la prueba y
qué no; por qué publicar el nulificador es seguro y qué condición hay que
sostener para que lo siga siendo; y que de los dos números que la PoC tiene que
medir, uno está cerrado y el otro es solo una cota de referencia.

---

## Tramo 7 — La puerta (25 min)

El último tramo de código, y donde aparece el fallo silencioso más importante de
todos.

```bash
npm run puerta:provisionar -- --puerta 1,2 --scope evento-A
```

De [`docs/06-validador.md`](docs/06-validador.md), leé de la sección 2 **"Los dos
momentos"**. La pieza central del diseño es que esto no es un comando sino dos:
provisionar es el momento conectado, validar es el momento offline. El validador
no importa `fuentes/`, no lee `datos/` ni `build/`, y se guarda una copia propia
de la `verification_key` en vez de una ruta a `build/setup/`. Por qué —si
apuntara al archivo del repo, el día que alguien rehaga el setup cambiaría de
clave sin enterarse— está en la sección 3, **"Por qué la puerta guarda su propia
raíz y su propia vkey"**.

Ahora las tres corridas que cuentan la historia entera:

```bash
npm run validar -- --puerta 1 --prueba salidas/prueba.json   # PASE,     exit 0
npm run validar -- --puerta 1 --prueba salidas/prueba.json   # RECHAZADA, exit 2
npm run validar -- --puerta 2 --prueba salidas/prueba.json   # PASE,     exit 0
```

Detenete en la segunda. La puerta rechaza **sin saber a quién está rechazando**:
no sabe cuál de las ocho identidades es, ni qué billetera la controla, solo que
ese nulificador ya pasó. Y el mensaje dice las dos posibilidades —el mismo que
pasó antes, o alguien que le sacó una foto al QR— porque la puerta no puede
distinguirlas.

Y detenete en la tercera, que es el agujero: **entró dos veces con la misma
entrada**, y las dos puertas hicieron bien su trabajo. Mirá las listas:

```bash
npm run validar -- --puerta 1 --estado
npm run validar -- --puerta 2 --estado
```

Dos archivos, dos procesos, ningún canal. El nulificador logra que dos usos de la
misma entrada sean *reconocibles como el mismo*; que alguien esté mirando las dos
puertas es un problema de sistemas distribuidos y no lo arregla ninguna prueba de
conocimiento cero. Es el frente ADR-009 del TPF.

Si querés repetir las tres corridas, las listas sobreviven entre invocaciones
—que es lo que hace un molinete de verdad—, así que hay que vaciarlas primero con
`npm run validar -- --puerta 1 --olvidar` y lo mismo para la 2. Y ojo con la
tentación de regenerar la prueba en vez de vaciar la lista: no sirve, y por qué
no sirve es la rotura del Tramo 8.

### Fallo silencioso 4 — el validador que le cree a la raíz

```bash
npm run ataque:raiz-propia
```

Leé la salida entera y después la sección 3 del doc, **"Por qué los dos primeros
chequeos son los críticos"**.

El atacante no conoce ningún secreto del evento. Arma **su propio árbol de
Merkle** con ocho secretos que inventó él y genera una prueba contra la raíz de
ese árbol, con el mismo `.wasm` y la misma `zkey` que usa cualquier comprador.
Los tres artefactos que necesita son públicos y que los tenga no es falla de
nadie.

Esa prueba **verifica contra la verification key del evento**. No está rota ni
falsificada: demuestra un enunciado verdadero, "conozco un secreto cuyo
compromiso está en el árbol de raíz X". Es cierto, porque el árbol de raíz X lo
armó él.

El validador ingenuo —el que verifica la prueba y lleva la lista, que es el que
uno escribiría primero— lo deja entrar. Y no entra una vez: como los ocho
secretos son suyos, genera ocho entradas, u ochocientas. El chequeo del
nulificador, el que *parece* el importante, es inútil contra esto, porque cada
secreto propio da un nulificador nuevo.

La lección, con precisión: **la validez criptográfica no es aceptabilidad**. Lo
que `groth16.verify` responde es "existe un witness que satisface este circuito
con estas señales públicas", y no dice absolutamente nada sobre si esas señales
públicas son las correctas. Elegir el enunciado que a uno le importa es trabajo
del verificador, con datos propios, de antemano.

Si querés ver el chequeo 2 aislado —el del scope, que el chequeo 1 **no** atrapa
porque la raíz es la misma para los dos eventos—, la rotura está en la sección 5
del doc, "La prueba correcta en la puerta equivocada". Y hay una variante menor
del hilo conductor en [`docs/04-organizador.md`](docs/04-organizador.md), sección
5, segunda rotura: una fuente que devuelve `0` en vez de `null` para un evento
que no publicó. Un `mapping` de Solidity vacío devuelve exactamente eso, `0` es
un elemento de campo perfectamente válido, y un 0 que se cuele como raíz hace que
el prover genere pruebas contra un árbol que no existe. La interfaz obliga a
`null` y el organizador lo comprueba en cada corrida, mirando hacia la fase 2.

Por último, los tiempos de la sección 5 del doc del validador, que hay que no
confundir: **~8 ms** es verificar una prueba con el proceso caliente —el costo
real por persona en la cola—, **~320 ms** es la primera verificación de cada
proceso, que paga construir la curva BN254 una vez, y **~750 ms** es el comando
entero con el arranque de Node, que es un artefacto de que esto sea un script.
Verificar sale unas veinte veces menos que probar, y esa asimetría es la
propiedad que hace que los SNARK sirvan.

**Qué tendrías que estar entendiendo al salir de acá:** que una prueba válida
puede ser perfectamente inaceptable; que el ancla de confianza del sistema es la
raíz que la puerta descargó antes, no la que le traen; y que el doble ingreso
entre puertas no es un problema de criptografía.

---

## Tramo 8 — Volvé al principio (10 min)

```bash
npm test
```

Los mismos trece segundos, los mismos siete casos, y ahora se leen distinto. El
caso 5 falla en el chequeo 2 con el 1 en OK y sabés exactamente por qué. El caso
6 altera el byte menos significativo del nulificador, y por qué no altera un byte
de la prueba está en la sección 3 de
[`docs/07-demostraciones.md`](docs/07-demostraciones.md). El hallazgo lateral de
esa medición es serio: en cuatro de doce posiciones probadas, un bit cambiado
adentro de la prueba comprimida hizo que la lectura del sobre **no volviera**, y
una de ellas seguía sin volver a los 150 segundos. En la puerta de un estadio eso
es un molinete trabado, y no hace falta un atacante: alcanza con un QR mal
impreso.

Leé ahora la sección 6 de ese doc, que al principio del recorrido te habría dicho
poco. En particular el párrafo que separa "es NFT" de "es ZK", que es a donde
llega este recorrido.

Y si querés la rotura más didáctica de las ocho tareas, es la de la sección 5,
"sacarle el borrado a la suite": la prueba **recién generada**, con bytes
completamente distintos a la anterior, igual rebota en el chequeo 4. Porque
regenerar la prueba no cambia el nulificador: `Poseidon(secreto, scope)` es
determinista, y esa es toda la razón por la que el mecanismo funciona.

---

## Qué da el ZK y qué daría un NFT común

Es la pregunta que el jurado va a hacer primero, y la única forma de contestarla
sin que se note el bulto es haber separado las dos cosas desde el principio. Acá
está, contra lo que efectivamente corrió en este recorrido.

**Lo que daría un NFT común, sin un solo circuito.** Que la entrada sea auténtica
y no se pueda falsificar. Que haya un tope de reventa y que las regalías se
paguen. Que las transferencias se puedan bloquear. Que la raíz que la puerta
descargó sea la del evento real y no la que alguien escribió en un archivo. Todo
eso lo da el contrato, y ninguna de esas propiedades necesita conocimiento cero.
De hecho, en esta fase 1 **ninguna de ellas está**: la raíz sale de un JSON local
que cualquiera edita, y por eso el chequeo 1 del validador garantiza que la
puerta y el prover estén de acuerdo sobre *cuál* es el árbol, no que ese árbol
sea el del evento.

**Lo único que da el ZK.** Que la puerta acepte o rechace sin aprender cuál de
los compradores tiene adelante ni qué billetera la controla. En los siete casos
de `npm test` —incluidos los cuatro rechazos— la puerta decidió sin saber a quién
le estaba abriendo o cerrando. Con un `tokenId` el molinete sabría exactamente
qué entrada es y, si el contrato es público, a qué dirección pertenece. Y la
segunda mitad, que viste en el Tramo 6: que el nulificador de un evento no se
pueda correlacionar con el de otro, cosa que un NFT no da porque el `tokenId` y
la billetera son los mismos en los dos.

**Lo que no da ninguno de los dos**, y conviene decirlo con la misma claridad:

- El doble ingreso entre puertas sin canal entre ellas (el caso 3). El ZK no lo
  empeora y tampoco lo resuelve.
- Que la prueba sea intransferible. Los 224 bytes los presenta cualquiera:
  alcanza con fotografiar el QR de otro y llegar primero.
- El tamaño del conjunto de anonimato. Con ocho personas, una cámara en la puerta
  o el orden de llegada alcanzan para adivinar. La PoC ilustra ese límite; no
  mide nada sobre el conjunto de un evento real.

Y las tres limitaciones que esta fase 1 tiene encima y que hay que decir antes de
que las diga otro: el trusted setup lo corrió una sola persona en una sola
máquina, así que la garantía de solidez no vale; el organizador genera y conoce
los ocho secretos, así que la privacidad **frente a él** es cero; y el conjunto
de anonimato es de ocho. Ninguna de las tres es un descuido: las tres están
escritas en la sección 6 del doc que corresponde, y las dos primeras son
exactamente lo que las fases 2 y 3 empiezan a mover.

---

## Lo que todavía no está

Este recorrido cubre la **fase 1**, que es lo que existe hoy: las tareas T01 a
T08. Lo que sigue, según [`estado.json`](estado.json), está pendiente:

| Fase | Tarea | Qué agrega |
|---|---|---|
| 2 | T09 · `RegistroDeRaiz.sol` + Hardhat | la raíz deja de ser un archivo local |
| 2 | T10 · verificador Groth16 on-chain (opcional) | verificar desde un contrato |
| 3 | T11 · `EntradaNFT.sol` | las entradas como NFT de verdad |
| 3 | T12 · flujo completo con compradores | cada comprador genera su propio secreto |
| 3 | T13 · cierre de la escalera | los tres escalones, comparados |

Hasta que eso exista, hay dos preguntas que este recorrido deja abiertas a
propósito, porque no se pueden contestar con lo que corrió acá: **si la raíz que
la puerta tiene es la del evento real** —eso lo empieza a resolver T09— y **si el
organizador puede hacerse pasar por sus compradores** —hoy puede, y eso lo
resuelve T12—. Las dos están anotadas en la sección 6 de cada doc y ninguna es
una sorpresa.

La pieza de arquitectura que hace que ese salto sea barato es la interfaz
`fuenteDeRaiz`, y vale la pena leer su contrato ahora aunque la segunda
implementación no exista: está en la sección 3 de
[`docs/04-organizador.md`](docs/04-organizador.md), "La interfaz `fuenteDeRaiz`, y
qué tiene que cumplir una implementación nueva". La promesa es que T09 y T12 se
enchufan **sin tocar el organizador, el prover ni los validadores**, y que si hay
que tocar algo más, la interfaz está mal diseñada. Cuando eso pase, este
recorrido se extiende con los tramos que faltan.

Mientras tanto, si querés seguir por tu cuenta: cada uno de los ocho documentos
de `docs/` tiene una sección 4, **"Qué podrías cambiar"**, con las piezas
intercambiables de ese componente, qué se gana, qué se pierde y qué archivos
habría que tocar. Es el material del que va a salir `INTERCAMBIABLES.md` (T15) y
se puede leer hoy.

---

## Mapa de comandos

Todos verificados en este repositorio. Ninguno necesita conexión salvo
`npm install`.

| Comando | Qué hace | Cuánto tarda |
|---|---|---|
| `npm run estado` | qué está hecho y qué sigue | ~1 s |
| `npm run verificar:entorno` | versiones reales de las doce herramientas | ~3 s |
| `npm run control:poseidon` | Poseidon en circuito contra Poseidon en JS | ~13 s |
| `npm run circuito:pertenencia` | compila el circuito, 1 testigo válido y 5 inválidos | ~4 s |
| `npm run setup` | la ceremonia Groth16 entera | ~20-55 s |
| `npm run organizador -- --scope evento-A` | ocho identidades, el árbol y la raíz | ~1 s |
| `npm run probar -- --identidad 3 --scope evento-A` | una prueba, medida y serializada | ~5 s |
| `npm run puerta:provisionar -- --puerta 1,2 --scope evento-A` | el momento conectado de las puertas | ~1 s |
| `npm run validar -- --puerta 1 --prueba salidas/prueba.json` | el molinete: 0 acepta, 2 rechaza, 1 error | ~1 s |
| `npm run validar -- --puerta 1 --estado` | la lista local de nulificadores | ~1 s |
| `npm run validar -- --puerta 1 --olvidar` | vacía esa lista (un molinete real no tiene este botón) | ~1 s |
| `npm run ataque:raiz-propia` | el ataque del árbol propio, contra los dos validadores | ~2 s |
| `npm test` | los siete casos de la fase 1 | ~13 s |

Y los ocho documentos, en el mismo orden en que los recorre este tour:

| Doc | Tramo |
|---|---|
| [`docs/00-entorno.md`](docs/00-entorno.md) | antes de empezar |
| [`docs/01-poseidon.md`](docs/01-poseidon.md) | 3 |
| [`docs/02-circuito.md`](docs/02-circuito.md) | 4 |
| [`docs/03-setup.md`](docs/03-setup.md) | 5 |
| [`docs/04-organizador.md`](docs/04-organizador.md) | 2 y 7 |
| [`docs/05-prover.md`](docs/05-prover.md) | 6 |
| [`docs/06-validador.md`](docs/06-validador.md) | 7 |
| [`docs/07-demostraciones.md`](docs/07-demostraciones.md) | 1 y 8 |

Cada uno tiene las mismas seis secciones: qué hace, cómo lo hace, **por qué está
hecho así**, qué podrías cambiar, probalo vos, y qué NO hace. La tercera y la
sexta son las que este recorrido usa más, y no por casualidad: son las dos que un
tutorial no escribe.
