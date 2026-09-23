# Prover

## 1. Qué hace

`npm run probar -- --identidad 3 --scope evento-A` es el lado del comprador: toma
una posición del padrón público, el secreto que le corresponde y la etiqueta de un
evento, y produce una **prueba Groth16** de que ese secreto está en el árbol de
compromisos del evento, sin decir en qué posición. Junto con la prueba salen tres
números públicos —el nulificador, la raíz y el scope— que son todo lo que el
validador de la puerta va a ver.

De paso mide las dos cosas que esta PoC existe para medir: cuánto tarda en generar
la prueba y cuánto pesa. Las mide sobre varias corridas y las reporta con
dispersión, hardware y fecha, porque un número solo no es una medición.

## 2. Cómo lo hace

Son tres archivos nuevos y tres reutilizados. El script `scripts/prover.mjs` es el
que se ejecuta; `lib/prueba-binaria.mjs` convierte la prueba en bytes y de vuelta;
`lib/campo.mjs:75` agregó la traducción de una etiqueta de evento a elemento de
campo. Del lado reutilizado están `lib/merkle.mjs` (el árbol), el resto de
`lib/campo.mjs` (la validación de rango) y `fuentes/json.mjs` (la raíz publicada).
El árbol no se reimplementó: es la misma definición que usa el organizador, que es
justamente lo que T05 unificó.

### Antes del código: qué es "generar una prueba"

T03 dejó establecido que el circuito no es un programa sino un sistema de 2513
ecuaciones, y que un **witness** es un conjunto de valores para todas sus señales
que las satisface. Hasta ahora la PoC llegaba hasta ahí: calculaba witnesses y
comprobaba que satisficieran el sistema.

Una prueba Groth16 es otra cosa. Es un objeto chico —tres puntos de curva
elíptica— que convence a cualquiera de que **existe un witness que satisface el
sistema y que coincide con estas entradas públicas**, sin mostrar el witness.
Quien la verifica no ve el secreto, ni el camino, ni la posición: ve tres números
públicos y un `si` o un `no`.

Eso tiene dos consecuencias que se ven en las mediciones de la sección 5. La
primera es que generar la prueba cuesta bastante más que calcular el witness
(acá, tres veces más). La segunda es que el tamaño de la prueba **no depende del
tamaño del circuito**: son siempre tres puntos. Un circuito con diez veces más
restricciones tardaría más en probarse y produciría una prueba del mismo tamaño.

### El recorrido, en orden

**Los artefactos que tienen que existir.** `scripts/prover.mjs:85`
(`exigirArtefacto`) comprueba cinco archivos antes de hacer nada: el `.wasm` del
circuito, la `zkey` y la `verification_key.json` del setup, y el padrón y los
secretos del organizador. Si falta alguno, imprime cuál y el comando exacto que lo
produce. Ninguno de los cinco se commitea —`build/` está en `.gitignore` y pesa
varios megabytes—, así que en un repo recién clonado faltan todos.

**El padrón.** `scripts/prover.mjs:132` lee `datos/arbol.json` y `:133` convierte
cada compromiso a `BigInt` pasándolo por `exigirEnCampo`. Esa validación es la que
T03 y T05 le asignaron explícitamente a esta tarea: el padrón es un archivo de
texto que cualquiera edita, y un valor fuera de `[0, p)` sería reducido por
Poseidon en silencio.

**El scope.** `scripts/prover.mjs:141` y `:142`. El comando recibe `evento-A`, que
es una etiqueta, y el circuito necesita un elemento de campo. La traducción está
en `lib/campo.mjs:75` (`elementoDeScope`): si el texto son solo dígitos se
interpreta tal cual, y si no, se deriva como `sha256("scope|etiqueta|intento")`
con rechazo, igual que los secretos del organizador y por la misma razón —nunca se
reduce módulo `p`—. Para `evento-A` da
`7421952849778469791634643529725528999721210991605956451547960136850882987634`.

Esa función vive en `lib/campo.mjs` y no en el prover a propósito: el organizador
la usa también. Si cada uno derivara el scope a su manera, el organizador
publicaría la raíz bajo un número y el prover probaría bajo otro, y el síntoma
—"la prueba no verifica"— aparecería recién en la puerta.

**La raíz, que sale de la fuente y no del padrón.** `scripts/prover.mjs:165`
llama a `fuente.leerRaiz(scope)`. El padrón trae adentro un campo `raiz`, y sería
más cómodo usarlo, pero esa raíz la escribió el mismo que armó el árbol: creerle
sería no comprobar nada. Lo que hace el prover es rearmar el árbol desde los
compromisos con `armarArbol` de `lib/merkle.mjs` y exigir que dé exactamente la
raíz que devolvió la fuente (`scripts/prover.mjs:174`). Si no coinciden, corta.

Ese corte es una decisión y está comentada en el código: el prover *podría*
generar igual una prueba contra la raíz que recalculó, y sería una prueba
perfectamente válida contra un árbol que nadie publicó. El validador la
rechazaría sin poder decir por qué. Es mejor fallar en el único lugar donde la
causa todavía es visible.

Hoy la fuente es `fuentes/json.mjs` y lee un archivo. En T09 va a ser un contrato
y **esta línea no cambia**: es la misma pieza intercambiable que describe la
sección 3 de `docs/04-organizador.md`.

**El secreto.** `scripts/prover.mjs:202` lo saca de `datos/secretos.json`, que es
el archivo que en el sistema real no existiría, y lo pasa por `exigirEnCampo`.
`:206` calcula `Poseidon(secreto)` y lo compara contra la hoja que el padrón
publica en esa posición. Si no da, corta: sin esa igualdad no hay camino de Merkle
posible y el circuito rechazaría el witness unas décimas de segundo más tarde, con
un mensaje mucho peor.

**El camino.** `scripts/prover.mjs:220` llama a `caminoDe` de `lib/merkle.mjs`,
que devuelve los tres hermanos y los tres bits de posición. Para la identidad 3 los
índices son `[1, 1, 0]`: la hoja está a la derecha en los dos primeros niveles y a
la izquierda en el tercero, que es la escritura en binario de 3 con el bit menos
significativo primero.

**El nulificador esperado.** `scripts/prover.mjs:228` calcula
`Poseidon(secreto, scope)` en JavaScript, con circomlibjs. No hace falta para
generar la prueba: existe para contrastarlo después contra el que produce el
circuito. Son dos implementaciones distintas de Poseidon, y que den el mismo número
es lo que T02 estableció y lo que este control vuelve a verificar en cada corrida.

**La generación medida.** `scripts/prover.mjs:252` hace una corrida de
calentamiento que se descarta, y `:263` corre el bucle de N corridas medidas. Cada
corrida son dos pasos cronometrados por separado con `process.hrtime.bigint()`:

- `snarkjs.wtns.calculate(input, wasm, wtns)` calcula el witness ejecutando el
  `.wasm` del circuito y lo deja en un archivo.
- `snarkjs.groth16.prove(zkey, wtns, null)` lee la `zkey` de 1,1 MB y produce la
  prueba.

Por qué se descarta la primera: paga la compilación JIT del wasm y el primer
acceso a la `zkey` en disco, y no representa ni el caso frío de una aplicación
recién abierta ni el caliente. Se reporta aparte —en la corrida de la sección 5,
405 ms contra los 119 ms de las medidas— para que el número esté a la vista en vez
de escondido en un promedio.

Lo que sí queda adentro de cada medición es la lectura de la `zkey` desde disco,
porque `groth16.prove` la relee en cada llamada. Una aplicación real la tendría
cargada en memoria, así que estos números son, por ese lado, una cota superior
chica.

**Las estadísticas.** `scripts/prover.mjs:92` calcula media, desvío muestral
(divide por `n-1`, porque son una muestra de las corridas posibles y no la
población entera), mediana, mínimo y máximo. La serie cruda, corrida por corrida,
queda en `salidas/medicion.json`: un promedio sin la serie no se puede auditar,
porque no deja ver si la dispersión es ruido parejo o una sola corrida que se fue
al doble.

**La verificación.** `scripts/prover.mjs:297` verifica la prueba contra la
`verification_key.json` del setup, y las tres líneas siguientes comprueban que las
señales públicas sean las que tienen que ser: el nulificador igual al de
JavaScript, la raíz igual a la publicada, el scope igual al pedido.

**El tamaño.** `scripts/prover.mjs:319` y `:320` serializan la misma prueba de dos
maneras, y `:325` y `:328` la reconstruyen desde los bytes y la vuelven a
verificar. Esa vuelta es la única comprobación que vale: el tamaño se mide, pero
que la serialización no haya perdido nada solo se demuestra volviendo a verificar
lo reconstruido.

### Qué entra al circuito y qué sale

Esta es la parte que conviene tener clara antes que los números, porque es lo único
que aporta el ZK.

| Señal | Rol | La ve el verificador | Qué es |
|---|---|---|---|
| `secreto` | privada | no | El número que solo conoce el comprador |
| `camino[3]` | privada | no | Los tres hermanos del camino de Merkle |
| `indices[3]` | privada | no | La posición de la hoja, en bits |
| `raiz` | pública | sí | La raíz del árbol del evento |
| `scope` | pública | sí | El identificador del evento |
| `nulificador` | **salida** | sí | `Poseidon(secreto, scope)` |

Las privadas forman parte del witness, entran en las 2513 ecuaciones y no salen en
la prueba. Las públicas son el contexto contra el que se prueba: el verificador
tiene que estar de acuerdo con ellas, y de hecho la raíz la conoce de antes,
publicada por el organizador.

El nulificador es una **salida** del circuito, y en Groth16 una salida es una
entrada pública más: viaja junto con la prueba y el verificador la recibe. Ahí está
la pregunta natural, y vale la pena contestarla despacio porque es el corazón del
mecanismo.

**¿Por qué publicar `Poseidon(secreto, scope)` no revela nada del secreto?** Por
tres propiedades, que son distintas y hacen falta las tres:

1. **Poseidon es de un solo sentido.** De `Poseidon(s, scope)` no se saca `s`. Con
   el scope conocido, el atacante podría probar candidatos a secreto y ver cuál da
   el nulificador; eso es un ataque de fuerza bruta contra un espacio de 254 bits,
   que es exactamente lo que no se puede hacer. Lo que sí conviene retener es que
   esa defensa **depende de que el secreto sea impredecible**: un secreto derivado
   de un DNI, un número de orden o una fecha se rompe probando candidatos, y el
   hash no salva nada. Por eso `lib/campo.mjs` los genera con rechazo sobre 256
   bits y no con una regla legible.
2. **El nulificador no dice qué hoja es.** El árbol tiene ocho hojas, cada una es
   `Poseidon(secreto_i)`, y el nulificador es `Poseidon(secreto_i, scope)`. Son
   funciones distintas —una de aridad 1 y otra de aridad 2, que en Poseidon cargan
   constantes distintas, como midió T02— así que el nulificador no se puede
   comparar contra ninguna hoja del padrón. Ver una hoja y ver un nulificador no
   permite decidir si vienen del mismo secreto sin conocer el secreto.
3. **El nulificador no es correlacionable entre eventos.** Como el scope entra al
   hash, la misma identidad produce un nulificador distinto en cada evento. La
   corrida de la sección 5 lo muestra: identidad 3 en `evento-A` y en `evento-B`,
   misma raíz, nulificadores sin ninguna relación visible.

Y lo que el nulificador **sí** revela, que hay que decirlo con la misma claridad:
dentro de un mismo evento, dos entradas con el mismo nulificador son la misma
identidad. Eso es a propósito —es la defensa contra el doble uso— y es un límite
real de la privacidad: el validador no sabe quién sos, pero sabe que sos la misma
persona que ya pasó. La lista de nulificadores es T07.

### Las dos serializaciones, y por qué el JSON no es el tamaño de la prueba

Una prueba Groth16 son tres puntos: `pi_a` y `pi_c` en G1, `pi_b` en G2. Nada más.
Todo lo demás de `prueba.json` es transporte legible.

`lib/prueba-binaria.mjs:52` escribe esos tres puntos como bytes crudos, y `:77` los
lee de vuelta. Las conversiones punto ↔ bytes son las de **ffjavascript**, la
librería que snarkjs usa por debajo para leer y escribir `zkey` y `ptau`: comprimir
un punto es fácil, pero descomprimirlo exige una raíz cuadrada modular en `Fq` —y
en `Fq2` para G2—, y eso es criptografía que no se escribe a mano.

El formato, que es el de ffjavascript y por eso es el que se documenta:

- Cada coordenada es un entero de `Fq` en **big-endian sobre 32 bytes**.
- **Sin comprimir**, un punto de G1 son `(x, y)` = 64 bytes y uno de G2
  `((x₀, x₁), (y₀, y₁))` = 128 bytes. Total: 64 + 128 + 64 = **256 bytes**.
- **Comprimido**, va solo `x`, y el bit `0x80` del primer byte dice cuál de las dos
  raíces `y` es la correcta. El bit `0x40` marca el punto en el infinito. Los dos
  bits caben porque `q < 2^254`: los dos bits altos de la codificación de 32 bytes
  siempre están libres. Total: 32 + 64 + 32 = **128 bytes**.

Las señales públicas son tres elementos de `Fr` —el campo de `lib/campo.mjs`, no el
de las coordenadas— y van como tres enteros big-endian de 32 bytes: 96 bytes.
`lib/prueba-binaria.mjs:113` es el único lugar donde corresponde llamar a
`exigirEnCampo`, porque las señales son números; las coordenadas de la prueba son
elementos de `Fq`, un campo distinto y más grande, y validarlas contra `p` sería un
error.

Los números medidos están en la sección 5. El resumen: 964 bytes de JSON minimizado
contra 224 bytes de binario comprimido. La diferencia es un factor de 4,3, y no
tiene nada de misterioso: un elemento de campo escrito en decimal ocupa unos 76
caracteres en vez de 32 bytes, y encima el JSON agrega comillas, comas, corchetes y
nombres de campo.

Hay un detalle que lo deja más claro que cualquier explicación. El tamaño del JSON
**cambia de corrida en corrida** —722 a 725 bytes en las diez corridas medidas—
porque cada prueba es distinta y los números decimales tienen distinta cantidad de
dígitos. El binario da 128 bytes siempre. Un tamaño que depende de qué prueba salió
no es el tamaño de la prueba: es el tamaño de una manera de escribirla.

## 3. Por qué está hecho así

### Por qué estos números no son MED-001

Es la advertencia más importante del documento y por eso va primero.

MED-001, en `../zk-ticketing-docs`, pregunta cuánto tarda en generarse una prueba
**en un teléfono de gama media**, porque esa es la máquina del sistema real: la
prueba la genera el asistente del comprador, en su teléfono, quizás sin conexión y
haciendo cola. Lo que se midió acá corre en una PC de escritorio con un Intel
i5-14400F, 16 GB de RAM y Windows 11, sobre Node 20 y snarkjs 0.7.6. Son máquinas
que no se parecen: distinto presupuesto térmico, distinta memoria, distinta
cantidad de núcleos disponibles de verdad, y —lo que probablemente más pesa— un
entorno de ejecución distinto, porque en el teléfono el circuito corre en el
WebAssembly de un navegador o de una app híbrida, no en el Node de escritorio.

Entonces lo que estos números son, con precisión:

- Una **cota de referencia** que establece el orden de magnitud del mecanismo en
  hardware cómodo, y que sirve de línea de base contra la cual comparar cuando se
  mida en teléfono.
- Evidencia de que el circuito, el setup y el prover funcionan de punta a punta y
  producen pruebas que verifican.

Lo que **no** son:

- No son MED-001 y no la reemplazan.
- No autorizan a decir "la prueba tarda 0,16 segundos" en el informe sin decir
  dónde. El factor entre un escritorio y un teléfono de gama media para trabajo
  criptográfico de este tipo no está medido acá, y escribirlo estimado sería
  inventar una cifra.
- No dicen nada sobre el consumo de batería, la memoria pico ni qué pasa con la
  aplicación en segundo plano.

`PLAN.md` dice que estos dos números son los que necesitan MED-001 (contra el
presupuesto de 5 s de ADR-004) y ADR-011 (contra los 2953 bytes del QR estático).
Es cierto para el **tamaño**, que no depende de la máquina: 224 bytes son 224 bytes
en un teléfono o en un servidor, y eso sí cierra la pregunta de ADR-011. Para el
**tiempo** lo único que aporta es una cota inferior de referencia. Los dos ADR se
citan por ID y no se resumen acá: su estado se consulta con
`python3 scripts/proyecto.py decisiones` en el repo de docs.

### Por qué varias corridas y no una

Porque una corrida no es una medición, y porque acá la dispersión resultó ser
información.

En las diez corridas de la sección 5 el total dio 157,5 ms de promedio con un
desvío de 8,2 ms y un rango de 144,8 a 169,1 ms: bastante estable. Cinco
invocaciones seguidas del comando, con la máquina tranquila, dieron promedios de
155,0, 155,5, 156,3, 157,5 y 161,2 ms. Eso es reproducible.

Pero con otra carga en la máquina las mismas corridas dieron promedios de hasta
397,5 ms, con desvío de 53,5 ms y máximos de 527,8 ms: **dos veces y media más
lento**, sin que cambiara una línea de código. La conclusión no es que la medición
esté mal, es que una medición de rendimiento en una computadora de escritorio con
su carga normal encima tiene un piso de ruido del orden del 150%. Cualquier
comparación seria —esta primitiva contra aquella, esta profundidad contra la otra—
tiene que hacerse en la misma invocación y en las mismas condiciones, o no compara
nada.

Por eso el script reporta promedio, desvío, mediana y rango, y guarda la serie
cruda en `salidas/medicion.json`. La mediana, en particular, es más informativa que
el promedio cuando hay una corrida que se va al doble.

### Por qué se reportan dos serializaciones y no una

Porque el pedido del TPF es "¿entra en un QR?" y contestarlo con el número del JSON
sería contestar mal, por exceso, un factor de 4. Y porque la diferencia tiene un
contenido conceptual: enseña que una prueba es un objeto matemático de tamaño fijo,
y el JSON una decisión de transporte reversible.

El formato que se eligió para el archivo binario principal es el **comprimido**
(`salidas/prueba-comprimida.bin`, 128 bytes), y se escribe también el sin comprimir
(256 bytes). Qué se pierde con cada uno:

- **Comprimido.** Se pierde tiempo en el verificador: descomprimir exige una raíz
  cuadrada modular por punto. En JavaScript lo hace ffjavascript y es despreciable
  frente a la verificación; en Solidity **no existe** esa operación barata, así que
  un verificador on-chain no puede consumir este formato.
- **Sin comprimir.** Se pierde la mitad del espacio, y se gana ser directamente lo
  que espera un verificador Groth16 de Solidity, que toma los ocho elementos de
  campo sueltos. Es el formato para T10.
- **Los dos.** Se pierde legibilidad: no hay forma de mirar un `.bin` y entender
  qué dice. Por eso el script sigue escribiendo también el JSON.
- **Ninguno de los dos lleva metadatos.** No dicen qué curva es, ni qué protocolo,
  ni de qué evento. Son 128 bytes que solo significan algo si el que los recibe ya
  sabe qué circuito y qué `verification_key` usar. Para un QR de entrada eso está
  bien —el validador de la puerta lo sabe—, pero un formato de intercambio de
  verdad necesitaría una cabecera, y eso es una decisión de protocolo del TPF.

Lo que **no** se pierde, y se demuestra en vez de afirmarse: la prueba reconstruida
desde los bytes vuelve a verificar contra la misma `verification_key`, en los dos
formatos. Es el control de `scripts/prover.mjs:325`.

### Por qué la etiqueta del evento se convierte a campo acá, y por qué es candidata a ADR

El circuito recibe el scope como un elemento de campo, y la gente nombra los
eventos con palabras. Alguien tiene que traducir, y la traducción tiene que ser la
misma en los cuatro lugares donde el valor aparece: el organizador que publica la
raíz, el prover que genera la prueba, el validador que la verifica y el contrato
que registre el evento. Si dos de ellos difieren, el nulificador de uno no es el
del otro y nada verifica.

Por eso `elementoDeScope` está en `lib/campo.mjs` y la usan el prover y el
organizador. Pero **cuál tiene que ser esa regla no lo decide esta tarea**: en el
sistema real el scope probablemente salga de un identificador on-chain del evento
—un `tokenId`, la dirección del contrato, un número de edición— y no de un hash de
una etiqueta escrita a mano. Está anotado como candidata a ADR en
`bitacora/T06-prover.md`.

### Por qué el prover valida rango y el circuito no

Es la contrapartida de lo que explican `docs/02-circuito.md` y
`docs/04-organizador.md`: adentro del circuito las señales *son* elementos del
campo, y un valor fuera de `[0, p)` ya llegó reducido, sin rastro. El chequeo tiene
que pasar donde el valor todavía es un entero de JavaScript, y en esta tarea eso es
el prover: el secreto que lee de un archivo, el scope que deriva de un texto, los
compromisos que lee del padrón, la raíz que devuelve la fuente y las señales
públicas que serializa. Los cinco pasan por `exigirEnCampo`.

Con secretos generados por el organizador el riesgo es despreciable. Con secretos
que vengan de afuera —de un comprador, de un contrato, de un `uint256`
cualquiera— no lo es, porque ahí el valor lo elige alguien, y ese alguien puede ser
un atacante.

### Por qué el prover no verifica contra un contrato y sí contra un archivo

Porque el escalón de la parte base es el que es. La fuente de la raíz es
`fuentes/json.mjs`, un archivo local que cualquiera edita con un editor de texto.
Que eso sea inseguro está dicho en `docs/04-organizador.md` y no cambia acá: el
prover comprueba que el padrón sea coherente con la raíz que la fuente publica,
pero no tiene forma de saber si esa raíz es la del evento real. Eso lo resuelve
`RegistroDeRaiz.sol` en T09, y el prover no va a cambiar cuando pase: cambia la
implementación de la interfaz, no quien la llama.

## 4. Qué podrías cambiar

**La serialización: comprimida → sin comprimir, o → base64 dentro de un URI.** Los
tres formatos están medidos: 128, 256 y 300 bytes (el base64 del sobre completo de
224). Comprimida es la más chica y la que un verificador JavaScript consume sin
problema; sin comprimir es la que puede consumir un verificador de Solidity;
base64 es la que entra en un `data:` o en una URL, a costa de un tercio más. Toca
`lib/prueba-binaria.mjs` y quien la llame, que hoy es solo el prover y desde T07
también el validador.

**Qué viaja en el sobre: prueba + 3 señales → prueba + nulificador.** El sobre
completo son 224 bytes, pero la raíz y el scope el validador de la puerta ya los
conoce: la raíz la publicó el organizador y el scope es el evento en el que está
parado. Mandar solo la prueba y el nulificador son 160 bytes, un 29% menos. Se
pierde que la prueba deje de ser autocontenida: un verificador que no sepa de qué
evento es no puede hacer nada con ella, y si el validador estuviera mal configurado
—raíz vieja— el error aparecería como "no verifica" en vez de como "esta prueba es
de otro evento". Toca el formato del sobre y a T07.

**El backend: Groth16 → PLONK o FFLONK.** snarkjs implementa los tres. Groth16 da
la prueba más chica (128 bytes comprimida) y la verificación más barata, a cambio
de necesitar un trusted setup **por circuito**: cada vez que cambie una línea del
circuito hay que rehacer la fase 2, con la ceremonia que eso implica. PLONK usa un
setup universal —el mismo `ptau` sirve para cualquier circuito— y produce pruebas
bastante más grandes y verificaciones más caras. Para un sistema que va a iterar el
circuito durante el desarrollo, la diferencia operativa es enorme. Cuánto más
grande y cuánto más lento **no está medido acá**: es exactamente el tipo de cosa
que este prover permitiría medir cambiando `snarkjs.groth16.prove` por
`snarkjs.plonk.prove` y rehaciendo el setup. Es una decisión de ADR.

**La profundidad del árbol: 3 → 20.** T03 midió el costo en restricciones: 11438
contra 2513, unas 4,5 veces. Lo que **no** está medido es cuánto crece el tiempo de
prueba, que es lo que importa para MED-001. La prueba seguiría pesando 128 bytes,
porque Groth16 da pruebas de tamaño constante. Tocaría
`circuitos/pertenencia.circom:67`, `scripts/organizador.mjs`, la potencia del `ptau`
de T04, y nada del prover: el prover ya lee la profundidad del padrón.

**De dónde sale el secreto: `datos/secretos.json` → la billetera del comprador.**
Es T12 y es el cambio que más acerca la PoC al sistema real. Se gana que el
organizador no pueda generar la prueba de ninguno de sus compradores, que hoy sí
puede. Se pierde la comodidad de tener los ocho secretos en un archivo, y aparece
el problema de la custodia, que es ADR-012. Tocaría `scripts/prover.mjs:202` y
nada más: el resto del prover no sabe de dónde vino el secreto.

**Dónde corre el prover: Node → navegador.** snarkjs corre en el navegador con el
mismo `.wasm` y la misma `zkey`. Es el paso necesario para que MED-001 sea posible,
porque medir en un teléfono significa medir en un navegador de teléfono. Se gana la
medición que el TPF necesita; se pierde la comodidad del `console.log` y aparece el
problema de bajar 1,1 MB de `zkey` al dispositivo, que es un dato relevante por sí
mismo para una aplicación móvil.

**La medición: `hrtime` en el mismo proceso → un proceso por corrida.** Hoy las N
corridas comparten proceso, así que comparten el estado del JIT y las cachés. Eso
mide el caso caliente, que es el correcto para una aplicación abierta, y subestima
el frío, que es el correcto para una que se acaba de abrir. La corrida de
calentamiento —405 ms contra 119 ms— da una idea de la diferencia, pero no es una
medición del arranque en frío. Tocaría `scripts/prover.mjs:263`.

## 5. Probalo vos

Desde la raíz del repo, con el entorno ya armado por las tareas anteriores:

```bash
npm run circuito:pertenencia   # si falta build/pertenencia_js/pertenencia.wasm
npm run setup                  # si falta build/setup/pertenencia.zkey
npm run organizador -- --scope evento-A
npm run probar -- --identidad 3 --scope evento-A
```

Los dos primeros solo hacen falta una vez: `build/` no se commitea. El tercero
tampoco, salvo que quieras otro evento: `datos/` sí está commiteado y viene
publicado para `evento-A`.

Salida real del último comando, tal como quedó el 2026-09-23:

```
Prover / asistente - una prueba de pertenencia

  padron publico    datos/arbol.json (8 compromisos, profundidad 3)
  fuente de raiz    json (datos/raiz.json)
  evento (scope)    evento-A -> 7421952849778469791634643529725528999721210991605956451547960136850882987634
  identidad         3

Arbol

  raiz recalculada  21742806920683719786915181996178546158207976983808212562412387320164881855720
  raiz publicada    21742806920683719786915181996178546158207976983808212562412387320164881855720
  coinciden         si

Identidad 3

  compromiso padron 21630521322428614492072238094553662178591068764296528687525646144397449139327
  Poseidon(secreto) 21630521322428614492072238094553662178591068764296528687525646144397449139327
  coinciden         si
  indices           [1, 1, 0]
  camino llega      si

Que entra y que sale del circuito

  privadas  secreto, camino[3], indices[3]   (nadie las ve)
  publicas  raiz, scope                        (el verificador tiene que estar de acuerdo)
  salida    nulificador = Poseidon(secreto, scope)  (publico, no revela el secreto)

Generacion

  1 corrida de calentamiento + 10 medidas
  calentamiento     witness 46.9 ms + prueba 404.9 ms (descartada)

  witness              38.4 ms +/- 1.8 ms     mediana   38.5 ms   [35.9 ms .. 40.3 ms]
  prueba Groth16      119.1 ms +/- 8.2 ms     mediana  119.7 ms   [106.7 ms .. 128.9 ms]
  total               157.5 ms +/- 8.2 ms     mediana  159.4 ms   [144.8 ms .. 169.1 ms]

  las 10 pruebas son distintas entre si   si

Senales publicas [nulificador, raiz, scope]

  9349048846653045638591846123935411322465784345075339403618387866985628512571
  21742806920683719786915181996178546158207976983808212562412387320164881855720
  7421952849778469791634643529725528999721210991605956451547960136850882987634

  nulificador == Poseidon(secreto, scope) en JS   si
  senal publica 1 == raiz publicada              si
  senal publica 2 == scope                       si
  la prueba verifica contra la vkey              si

Tamano

  JSON de snarkjs, como lo escribe el script (indentado)
    prueba.json                      857 bytes
    senales-publicas.json            249 bytes
    sobre completo                  1106 bytes
  JSON minimizado (sin espacios), que es lo mejor que da el JSON
    prueba                           725 bytes
    senales                          239 bytes
    sobre completo                   964 bytes
  Binario, elementos de campo crudos
    prueba sin comprimir             256 bytes   (3 puntos: G1 64 + G2 128 + G1 64)
    prueba comprimida                128 bytes   (solo x, el signo de y en un bit)
    3 senales publicas                96 bytes   (3 x 32)
    sobre comprimido completo        224 bytes
    solo prueba + nulificador        160 bytes   (raiz y scope los sabe el validador)

  el JSON varia de corrida en corrida: entre 722 y 725 bytes
  el binario no varia nunca: los puntos son de ancho fijo

  la prueba reconstruida desde los bytes verifica   si (comprimida y sin comprimir)

QR estatico (limite 2953 bytes en modo binario, ADR-011)

  sobre binario comprimido         224 bytes   entra, con 13.2x de margen
  el mismo en base64               300 bytes   entra igual
  sobre JSON minimizado            964 bytes   entra

Hardware de esta corrida

  cpu               Intel(R) Core(TM) i5-14400F (16 hilos logicos)
  memoria           15.8 GB
  sistema           win32 10.0.26200 (x64)
  node              v20.19.2, snarkjs 0.7.6

  ESTO NO ES MED-001. MED-001 pregunta por telefonos de gama media; esto es
  una cota de referencia en una PC de escritorio. Ver docs/05-prover.md.

Artefactos

  salidas/prueba.json                  858 bytes
  salidas/senales-publicas.json        250 bytes
  salidas/prueba-comprimida.bin        128 bytes
  salidas/prueba-sin-comprimir.bin     256 bytes
  salidas/senales-publicas.bin          96 bytes
  salidas/medicion.json               2087 bytes

Prueba generada y verificada. El validador de la puerta (T07) solo va a ver
el nulificador, la raiz y el scope: cual de las 8 hojas es, no.
```

Cuatro cosas para mirar además del "si".

La primera: **las diez pruebas son distintas entre sí y las diez verifican**.
Groth16 aleatoriza cada prueba con dos valores nuevos; que dos corridas del mismo
witness dieran la misma prueba sería una filtración, no una comodidad.

La segunda: el JSON se mueve entre 722 y 725 bytes según qué prueba salió, y el
binario da 128 siempre.

La tercera: `calentamiento ... 404.9 ms (descartada)`. Tres veces y media más que
la mediana de las corridas medidas. Está a la vista a propósito.

La cuarta, la que importa para el informe: el bloque de hardware, y la advertencia
de que esto no es MED-001.

**Probá otra identidad.** `npm run probar -- --identidad 0 --scope evento-A`: los
`indices` pasan a `[0, 0, 0]` y el nulificador es otro, porque el secreto es otro.
El tamaño de la prueba no se mueve ni un byte.

**Probá el mismo comprador en otro evento**, que es la propiedad que hace que esto
sirva:

```bash
npm run organizador -- --scope evento-B
npm run probar -- --identidad 3 --scope evento-B
```

Misma identidad, mismo árbol, **misma raíz**
(`217428069...881855720`), y el nulificador pasa de
`9349048846653045638591846123935411322465784345075339403618387866985628512571` a
`15322268727791300097105410023599274769060027757489707367016935737130240234003`.
Nadie que vea los dos nulificadores puede decidir si son de la misma persona. Esa
es la no vinculabilidad entre eventos, y es ZK: un NFT común no la da, porque el
`tokenId` y la billetera son los mismos en los dos eventos.

Dejá el repo como estaba con `npm run organizador -- --scope evento-A`.

**Rotura deliberada: editar el padrón.** Abrí `datos/arbol.json` y cambiale un
dígito a cualquiera de los ocho compromisos. Después:

```bash
npm run probar -- --identidad 3 --scope evento-A
```

```
Arbol

  raiz recalculada  19780192358429021375007050566209932173279449433302523900422661048657124273749
  raiz publicada    21742806920683719786915181996178546158207976983808212562412387320164881855720
  coinciden         NO

EL PADRON NO CORRESPONDE A LA RAIZ PUBLICADA.

  Los compromisos de datos/arbol.json no producen la raiz que devolvio la fuente.
  Alguien edito el padron, o el padron y la raiz son de corridas distintas.
  Corre  npm run organizador  y volve a intentar. Ver docs/05-prover.md.
```

El comando sale con código 1 y no genera nada. Lo interesante es qué habría pasado
sin esa comprobación: el prover habría armado el árbol con el padrón adulterado,
habría generado una prueba **válida** contra esa raíz falsa, y el validador de la
puerta la habría rechazado con un "no verifica" que no dice nada. El control de
`scripts/prover.mjs:174` existe para que el error aparezca donde se puede entender.

Para verlo, comentá el `process.exit(1)` de `scripts/prover.mjs:189` y volvé a
correrlo: la prueba se genera, verifica contra su propia `verification_key`, y es
inútil. Restaurá la línea y volvé a correr `npm run organizador -- --scope evento-A`.

**Rotura deliberada: pedir un evento que nadie publicó.**

```bash
npm run probar -- --identidad 3 --scope evento-Z
```

```
  evento (scope)    evento-Z -> 5162561070443048710092673499535668015443463167505766525895114448749706856460
  identidad         3

La fuente no tiene ninguna raiz publicada para el scope 5162561070443048710092673499535668015443463167505766525895114448749706856460.
Corre primero:  npm run organizador -- --scope evento-Z
```

Parece un detalle de usabilidad y no lo es: es el control que
`docs/04-organizador.md` describe como el que va a atrapar a la implementación de
T09. Un `mapping` de Solidity sin entrada devuelve 0, y un 0 que llegara acá
disfrazado de raíz válida haría que el prover generara pruebas contra un árbol
inexistente. La interfaz obliga a `null`, y el prover corta.

## 6. Qué NO hace

**No verifica nada en la puerta, y no se acuerda de ningún nulificador.** Genera la
prueba y la escribe en `salidas/`. Quien tiene que guardar la lista de
nulificadores ya vistos y rechazar el repetido es el validador de T07, y el
problema difícil —dos molinetes sin conexión entre ellos— es de sincronización, no
de criptografía.

**No mide lo que hay que medir para MED-001.** Está desarrollado en la sección 3 y
se repite acá porque es el límite más importante de esta tarea: 157 ms de promedio
en un i5-14400F de escritorio no es el número de un teléfono de gama media, y el
factor entre los dos no está medido. Este prover es la herramienta con la que se va
a poder medir cuando corra en un navegador de teléfono; no es la medición.

**No protege la prueba en tránsito.** La prueba es transferible: cualquiera que
tenga los 224 bytes puede presentarlos en la puerta y pasan. No hay nada que ate la
prueba a quien la presenta, ni a un momento, ni a un molinete. Alcanza con sacarle
una foto al QR de otro y llegar primero. El problema es real y conocido, y las
defensas habituales —un desafío del validador que entre al circuito como señal
pública, una marca de tiempo, una firma del dispositivo— cambian el circuito y son
decisiones de diseño del TPF, no de esta tarea. Queda anotado en la bitácora.

**Las pruebas que genera se apoyan en un trusted setup que no es seguro.** La
ceremonia de T04 la corrió una sola persona en una sola máquina, así que quien la
corrió conoce el residuo tóxico y puede fabricar pruebas que verifican sin conocer
ningún secreto. Todo lo que se mide acá —tiempos, tamaños, que la prueba
verifique— es igual de válido; lo que no vale es la garantía de solidez. Está en
`docs/03-setup.md`.

**No ata la prueba a ningún NFT, ni a ninguna billetera, ni a ningún pago.** La
hoja es `Poseidon(secreto)` y nada más. Cualquiera que conozca *un* secreto del
padrón genera la prueba de esa hoja, sea o no el comprador. Esa relación la
construyen T11 y T12.

**El conjunto de anonimato es de 8 personas.** La prueba dice "soy una de las ocho
hojas de este árbol". Con ocho hojas, adivinar quién entró tiene probabilidad 1/8.
Está explicado en `docs/04-organizador.md` y engancha con **ADR-001**, que ya acota
el claim de privacidad por esta razón. Esta PoC ilustra el límite; no aporta
evidencia sobre el tamaño de conjunto de un evento real.

**No dice nada sobre metadatos.** Que el nulificador no revele el secreto es
cierto. Que nadie pueda correlacionar quién entró mirando a qué hora se presentó
cada prueba, desde qué dispositivo o en qué orden, es otro problema entero y no lo
toca esta PoC.

Los frentes del TPF con los que se engancha: **ADR-004** (presupuesto de tiempo en
la puerta), **ADR-011** (qué entra en el QR), **ADR-001** (claim de privacidad),
**ADR-012** (custodia del secreto) y la medición **MED-001**, todos en
`../zk-ticketing-docs`. **No cierra ninguno.** Lo único que esta tarea cierra, y
solo para hardware de escritorio, es la pregunta de ADR-011 sobre el tamaño: 224
bytes contra 2953 disponibles, con 13 veces de margen, y ese número no cambia con
la máquina. Las decisiones que esta tarea dejó a la vista —de dónde sale el scope,
qué viaja en el sobre, y cómo se impide que una prueba sea transferible— están
anotadas como candidatas a ADR en `bitacora/T06-prover.md`.
