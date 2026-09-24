# Cierre de la escalera

## 1. Qué hace

Esta tarea no agrega una pieza al sistema: lo mide entero. Corre las tres
implementaciones de `fuenteDeRaiz` —`json`, `contrato-raiz` y `contrato-nft`—
sobre exactamente el mismo código, compara qué cambia y qué no entre un escalón y
el siguiente, y responde la pregunta que las doce tareas anteriores fueron
dejando para el final: **si el vínculo billetera ↔ compromiso queda público en la
cadena, ¿se rompe el anonimato en la puerta?**

Además junta en un solo lugar los candidatos a ADR que quedaron desparramados en
las doce bitácoras. Es, probablemente, lo más valioso que esta PoC le deja al TPF,
y hasta hoy había que leer doce archivos para encontrarlo.

La respuesta corta a la pregunta es que no se rompe. La sección 3 explica por qué
esa respuesta corta, dicha así, es una respuesta que el jurado tiene derecho a no
aceptar.

## 2. Cómo lo hace

### Las tres corridas

El mecanismo de la escalera es una variable de entorno. `fuentes/seleccion.mjs:32`
lee `FUENTE`, devuelve una de tres implementaciones, y el organizador, el prover y
el provisionador de puertas no saben cuál les tocó. La suite de siete casos de T08
se corrió dos veces contra cada una, en la misma sesión y en la misma máquina:

```bash
FUENTE=json         npm test
FUENTE=contrato     npm test
FUENTE=contrato-nft npm test
```

Las seis corridas terminaron con código 0 y `7 de 7 casos dan lo esperado`.

Lo que importa no es que pasen: es **cuánto se parecen las salidas**. Guardadas y
comparadas con `diff`, normalizando los pid del proceso de Node:

- `json` contra `contrato`: **la salida es idéntica byte a byte**. Cero líneas de
  diferencia. Poner la raíz en un contrato no cambió ni un número de la suite.
- `contrato` contra `contrato-nft`: **difieren dos números y nada más**. Son los
  dos nulificadores que imprime el caso 4, el que muestra que la misma identidad
  con otro scope da otro nulificador:

  ```
  Caso 4 - la misma identidad con otro scope da otro nulificador
                evento A  9349048846653045638591846123935411322465784345075339403618387866985628512571
                evento B  15322268727791300097105410023599274769060027757489707367016935737130240234003
  ```

  contra

  ```
                evento A  16016438767422724834834941357118663293260569424032484733590386215444885617496
                evento B  6916242104931416613545230595425987354781362899968692720052190930030410281884
  ```

  Difieren por la única razón por la que tenían que diferir: el nulificador es
  `Poseidon(secreto, scope)` y el secreto de la hoja 3 ya no es el que inventó el
  organizador con su semilla, sino el que derivó un comprador de su clave privada
  (`lib/compradores.mjs:56`). El circuito, el prover, el validador y la forma de
  las señales públicas son los mismos.

Esa es la medición que vale por toda la fase 3. La pieza intercambiable se cambió
dos veces y lo único que se movió fue lo que **tenía** que moverse.

### La línea que decide

`scripts/organizador.mjs:106` es donde la escalera se apoya:

```js
const compromisosDeLaFuente = await fuente.leerCompromisos(opciones.scope);
```

Con `json` y con `contrato-raiz`, ese método contesta `null` y el organizador
toma la rama de la parte base: genera ocho identidades, se queda con los ocho
secretos y arma el árbol con lo que él mismo inventó. Con `contrato-nft`
(`fuentes/contrato-nft.mjs:47`) contesta ocho números que mandaron ocho personas,
y el organizador toma la otra rama, que estaba escrita desde T05 y nunca se había
ejecutado. La diferencia se lee en una línea de la salida:

```
  la fuente no origina compromisos: los genera el organizador (limitacion de la parte base)
```

contra

```
  la fuente aporto 8 compromisos: el organizador no genera secretos
```

### El gas, medido en las tres

Corriendo `npm run organizador` contra cada fuente desde una cadena recién
reiniciada, y leyendo después `npm run cadena:estado`:

| Operación | `json` | `contrato-raiz` | `contrato-nft` | Quién paga |
|---|---|---|---|---|
| Desplegar el contrato | — | 429.921 | 2.341.174 | el organizador |
| Emitir las ocho entradas | — | — | 646.040 | el organizador |
| Publicar la raíz del evento A | — | 70.277 | 70.288 | el organizador |
| Enviar los ocho compromisos | — | — | 572.180 | **cada comprador el suyo** |
| **Total del escalón** | **0** | **500.198** | **3.629.682** | |

Las ocho emisiones son 95.719 la primera y 78.607 u 78.619 las otras siete; los
ocho compromisos son 71.515 o 71.527 según cuántos bytes en cero tenga el número
enviado, a 16 − 4 = 12 de gas por byte ([EIP-2028]). La diferencia de 11 entre las
dos publicaciones de raíz es del mismo tipo: es la misma función del mismo
contrato sobre el mismo scope, y lo único que cambia es la raíz, que tiene otra
cantidad de bytes en cero. El desglose completo de por qué cada fila cuesta lo que
cuesta está en la sección 3 de `docs/08-contrato-raiz.md` y de
`docs/09-entrada-nft.md`; acá interesa la comparación, no la cuenta.

### Cuántas líneas costó subir cada escalón

Medido con `git diff --numstat` entre los commits de cada tarea. Es el número que
dice si la pieza intercambiable estaba bien diseñada:

| | escalón 1 → 2 (T09) | escalón 2 → 3 (T12) |
|---|---|---|
| **Los tres consumidores** (`organizador`, `prover`, `provisionar-puerta`) | **7 líneas** (3 + 2 + 2) | **0** |
| La fuente nueva | `fuentes/contrato-raiz.mjs`, 80 líneas nuevas | `fuentes/contrato-nft.mjs`, 70 líneas nuevas |
| El mecanismo de selección | no existía: hubo que crear `fuentes/seleccion.mjs`, 41 líneas | +8 −1 en ese archivo |
| El escalón anterior | — | `fuentes/contrato-raiz.mjs`, +5 −5 |
| Plomería nueva | `lib/cadena.mjs` (290), `contratos/RegistroDeRaiz.sol` (77), `hardhat.config.js` (16), `scripts/demostraciones.mjs` (+14 −1) | `lib/compradores.mjs` (188), `lib/cadena.mjs` (+40 −13), `contratos/EntradaNFT.sol` (+2 −2) |

La fila de arriba es la que hay que mirar, y hay que mirarla con las dos columnas
juntas. T09 reportó esas siete líneas **como una falla**, y tenía razón: la
interfaz `fuenteDeRaiz` definía muy bien qué métodos hay y qué devuelven, y no
definía cómo se elige la implementación, así que cada consumidor importaba
`fuentes/json.mjs` por su nombre. Una pieza intercambiable que obliga a editar a
todos sus usuarios no es intercambiable; es una pieza soldada en tres lugares.
T09 arregló el diagnóstico creando `fuentes/seleccion.mjs`, y T12 cobró el
arreglo: cero.

Dos honestidades sobre ese cero. La primera: T12 sí tocó cinco líneas de
`fuentes/contrato-raiz.mjs`, el escalón anterior, para agregarle el parámetro
`yaConectado` que le permite apuntar a un contrato ya desplegado. No son
consumidores, son vecinos, y el costo real de subir el escalón es "cero
consumidores, cinco líneas del escalón de abajo". La segunda: `EntradaNFT.sol` (97
líneas) no aparece en la columna de T12 porque lo escribió T11. El escalón se
subió en dos tareas, no en una, y contar solo la última infla el resultado.

### El experimento del nulificador

Hay un dato más, y es el que sostiene media sección 3. Con el flujo completo
corrido, la puerta `flujo-a` dejó anotado esto en
`puertas/puerta-flujo-a/nulificadores.json`:

```json
{
  "nulificador": "21188147761299192891249625304539314658323592094901195412685523209436134662731",
  "momento": "2026-09-24T01:09:39.199Z",
  "origen": "salidas/flujo/sobre-legitimo.json"
}
```

La pregunta del experimento: con eso y con la cadena, ¿se puede decir quién entró?
Calculando `Poseidon(secreto, scope)` para los ocho secretos de
`datos/secretos.json` y comparando:

```
nulificador 21188147761299192891249625304539314658323592094901195412685523209436134662731
  anotado a las 2026-09-24T01:09:39.199Z
  ATADO a hoja 0, token 5, billetera 0x976EA74026E726554dB657fA54763abd0C3a0aa9
```

Tardó lo que tarda calcular ocho Poseidon. Qué demuestra y qué no demuestra eso
—y por qué es la parte más importante de este documento— está en la sección 3. El
comando para reproducirlo está en la sección 5.

## 3. Por qué está hecho así

### La tabla completa: los tres escalones, uno al lado del otro

| | 1. `json` | 2. `contrato-raiz` | 3. `contrato-nft` |
|---|---|---|---|
| Dónde vive la raíz | `datos/raiz.json` | `RegistroDeRaiz` | `EntradaNFT`, que lo hereda |
| De dónde salen los compromisos | los inventa el organizador | los inventa el organizador | los mandan los compradores |
| Quién genera el secreto | el organizador, de una semilla suya | el organizador, de una semilla suya | cada comprador, de su clave privada |
| Quién decide el orden de las hojas | el organizador | el organizador | la cadena: el orden de llegada |
| Qué sabe el organizador | los ocho secretos | los ocho secretos | nada: ocho números que no puede abrir |
| ¿Puede hacerse pasar por un comprador? | sí, por los ocho | sí, por los ocho | no |
| ¿Puede saber cuál de los ocho entró? | sí | sí | no, mientras no tenga ningún secreto |
| Autoridad de la raíz | ninguna: es un archivo editable | una cuenta, y queda el rastro | igual |
| ¿Existe la entrada como cosa? | no | no | sí: un ERC-721 con dueño |
| Vínculo público billetera ↔ hoja | no existe | no existe | **los ocho pares, en la cadena** |
| Gas total | 0 | 500.198 | 3.629.682 |
| Billeteras con fondos que hace falta | 0 | 1 | **9** |
| Suite de T08 | 7/7 | 7/7 | 7/7 |
| `npm test` (dos corridas) | 10,7 s / 10,6 s | 11,5 s / 11,4 s | 16,0 s / 15,5 s |
| Líneas tocadas en los tres consumidores | — | 7 | 0 |

Los tiempos son de reloj, en la máquina de `docs/00-entorno.md` (Windows 11 Pro
10.0.26200, Node v24.21.0, cadena local de Hardhat 3.17.0), dos corridas cada uno
en la misma sesión. Son de orientación: no caracterizan hardware, no aíslan nada y
**no son MED-001**. Lo único que sostienen es que el tercer escalón tarda unos
cuatro segundos y medio más que los otros dos, y que esos cuatro segundos y medio
son la venta —desplegar un ERC-721, emitir ocho tokens y mandar ocho
transacciones—, no la criptografía, que es la misma.

Tres filas merecen una lectura y no un vistazo.

**"Qué sabe el organizador"** es el punto entero de la Variación 2. En los dos
primeros escalones la privacidad frente al organizador es **cero**: el que vende
las entradas tiene los ocho secretos, así que puede generar la prueba de cualquiera
y, mirando el nulificador que anotó la puerta, saber cuál de los ocho entró. Todo
el mecanismo ZK funcionaba y protegía a los compradores de todo el mundo menos de
quien más interés tiene. El tercer escalón es el que cierra eso, y no lo cierra con
más criptografía: lo cierra cambiando **quién calcula qué**.

**"Billeteras con fondos"** pasa de una a nueve, y es la fila que menos se discute
y más se paga. Ocho personas tienen que poder mandar una transacción de ~71.500 de
gas cada una. En un ticketing masivo eso es un requisito del sistema, no un detalle
de implementación: antes de la privacidad hay que resolver que ochenta mil personas
tengan una billetera con fondos, o que alguien pague por ellas, y si alguien paga
por ellas aparece un tercero que sabe quién es quién.

**"Vínculo público billetera ↔ hoja"** es lo que abre la sección que sigue. Es el
precio del tercer escalón y es lo que esta tarea tiene que poder defender.

### La pregunta incómoda

> Si cualquiera puede armar la tabla de qué billetera mandó qué compromiso,
> ¿el anonimato en la puerta no es un teatro?

La respuesta corta es que no: la prueba Groth16 demuestra "conozco el secreto de
alguna de estas ocho hojas" y no dice cuál, así que saber de quién es cada hoja no
dice quién entró. El conjunto de anonimato siguen siendo las ocho.

Eso es cierto y es insuficiente, y conviene ser preciso sobre en qué sentido cada
cosa. La sección 3 de `docs/09-entrada-nft.md` ya dio tres motivos; acá van con el
sistema completo corrido y con dos más que aparecieron al medirlo.

**Primero hay que decir qué protege el ZK, exactamente.** No protege que se sepa
que alguien entró: la puerta cuenta ingresos. No protege quiénes son los ocho
candidatos: eso está en la cadena. No protege cuántos de los ocho entraron. Lo
único que protege es **el vínculo entre un ingreso anotado en el registro del
operador y una hoja del padrón**, que es lo mismo que decir: entre lo que sabe el
molinete y lo que sabe la cadena. La llave que uniría esos dos registros es el
secreto, y el secreto no está en ninguno de los dos.

Formulado así, el claim es defendible y es chico. Si el equipo alguna vez lo dice
como "nadie puede saber quién entró", está diciendo algo falso, y el jurado lo va a
encontrar en treinta segundos: alcanza con que alguien mire.

**Uno. La llave del join existe, y es la misma que permite la validación offline.**
El nulificador es `Poseidon(secreto, scope)`: determinista por evento. Que sea
determinista es lo que hace posible detectar el doble ingreso sin consultar a
nadie, que es ADR-002 y es el eje del trabajo. Y es exactamente lo que hace que,
el día que alguien obtenga un secreto, pueda atar **todos** los ingresos pasados y
futuros de esa persona a esa persona, en todos los eventos, retroactivamente,
porque el nulificador de cada evento se recalcula con una operación.

El experimento de la sección 2 muestra la forma de ese ataque en tres líneas: con
los ocho secretos a mano, el nulificador anotado a las 01:09:39 se ata a la hoja 0,
al token 5 y a la billetera `0x976EA740…`. Hay que decir con todas las letras qué
demuestra y qué no. **No demuestra que el sistema real sea vulnerable**: en el
sistema real nadie tiene los ocho secretos, y en esta PoC los tengo porque están
todos en un archivo de una sola computadora y porque se derivan de las claves
privadas de la cadena local de Hardhat, que son públicas. Lo que demuestra es que
el join **es computable en cuanto aparece la llave**, y que la llave es un número
que alguien tiene que guardar por años. Quién lo guarda es **ADR-012**, y deja de
ser una pregunta de comodidad para ser una pregunta de privacidad: un servicio de
custodia que guarde los secretos de sus usuarios puede reconstruir el historial de
ingresos de todos ellos, y no necesita romper nada para hacerlo.

Es la misma clase de tensión que encontró T11 —la línea de `EntradaNFT.sol:73` que
impide que un tercero te ocupe la hoja es la que ata la hoja a tu billetera— y vale
la pena nombrarla como patrón, porque ya apareció dos veces: **en este diseño, cada
propiedad que hace el sistema usable es también la que lo hace vinculable.**

**Dos. El conjunto de anonimato se puede vaciar comprando.** Ocho hojas quiere
decir que la mejor protección posible es 1 en 8. Cada secreto que sale de las manos
de su dueño le saca un candidato a todos los demás: si *k* de los ocho compradores
colaboran, o si una sola persona compró *k* de las ocho entradas, el conjunto de
los otros baja a 8 − *k*. Con seis entradas en la mano, el que entra es uno de dos.

Esto no es una hipótesis: es aritmética sobre el conjunto, y la cadena se la deja
verificar al atacante, que puede comprobar cuáles de las ocho hojas son suyas. Lo
que la PoC agrega es el precio: comprar una entrada acá es gratis y enviar su
compromiso son 71.515 de gas. Seis hojas son unos 429.000 de gas y ningún permiso.
Un evento real cobra la entrada, y ese precio es hoy lo único que limita el ataque
—lo cual quiere decir que **el límite del anonimato es económico y no
criptográfico**. Cuánto vale realmente vaciar un conjunto de anonimato en un evento
de verdad es `[a verificar]`: depende del precio de la entrada y de si hay tope de
compras por persona, que no es una pregunta que esta PoC pueda contestar.

**Tres. El que mira la cadena y además está parado en la puerta ya ganó.** Si el
observador ve a la persona, el mecanismo no aporta nada: ya sabe quién entró. El
ZK no compite con los ojos ni con una cámara. Lo que el ZK impide es que ese
conocimiento quede **anotado, indexado y acumulado** en el registro del operador,
que es una diferencia real —un dato que un humano vio y no escribió no se vende, no
se filtra y no se pide por oficio— pero es mucho más chica que la que sugiere la
frase "validación anónima".

Y acá aparece algo que esta PoC hace peor de lo que podría. La puerta anota, además
del nulificador, la hora exacta y el archivo de origen (`scripts/validador.mjs:191`
y `:192`). El chequeo de doble ingreso no necesita nada de eso: necesita saber si
el nulificador está en el conjunto, y `lib/puerta.mjs:157` usa `momento` solo para
escribir un mensaje más lindo. Es metadato que el operador acumula gratis y que
es justamente el insumo del ataque de correlación que viene abajo. Que sobre no
quiere decir que haya que sacarlo —una puerta real va a querer auditoría—, pero sí
que es una decisión y no un default.

**Cuatro. La correlación temporal, que esta PoC no puede medir.** La cadena tiene
(billetera, compromiso, bloque, marca de tiempo del bloque). La puerta tiene
(nulificador, momento). No hay ninguna relación criptográfica entre las dos tablas.
Pero si el orden en que la gente compra se parece al orden en que la gente llega,
la distribución uniforme sobre las ocho deja de ser uniforme, y sobre un conjunto de
ocho **una pista débil alcanza**: pasar de 1/8 a 1/3 es la diferencia entre una
sospecha y una acusación.

Esta PoC no puede poner un número ahí y no hay que fingir que sí. Los ocho
compromisos los manda un script en menos de un segundo y entra una sola persona:
no hay comportamiento que correlacionar. Medirlo necesita o un despliegue real o
una simulación con un modelo de comportamiento de compra y de llegada, y las dos
cosas están fuera del alcance del Hito 1. Queda **`[a verificar]`**, y es de las
cosas que conviene que el equipo sepa que no sabe antes de la defensa, porque es
una pregunta fácil de hacer.

Lo que sí se puede afirmar acá es la mitad favorable: el `scope` cambia el
nulificador entre eventos, así que dos ingresos de la misma persona a dos eventos
distintos no se atan mirando los nulificadores. El caso 4 de la suite lo muestra en
cada corrida. Es una propiedad de Poseidon y no algo que estas corridas demuestren:
que sean invinculables está **supuesto**, y `npm run control:poseidon` estableció
que dos implementaciones coinciden, no que la primitiva sea segura. `[a verificar]`
contra el paper de Poseidon o contra un análisis independiente.

### Entonces, la respuesta

**No, el vínculo público no rompe el anonimato en la puerta**, y se puede sostener
con precisión: el molinete verifica una prueba cuyas señales públicas son la raíz,
el scope y el nulificador, ninguna de las cuales identifica una hoja, y no existe
forma conocida de ir del compromiso publicado al nulificador sin el secreto.

**Y el anonimato que queda es más chico de lo que la frase sugiere.** Es un
conjunto de ocho personas con nombre, billetera e historial de compra público; se
degrada con cada secreto que cambia de manos y con cada entrada que compra un
mismo actor; no resiste a nadie que mire; y se apoya en una llave —el secreto— cuya
custodia el proyecto todavía no decidió.

Lo que el equipo tiene que poder decir en la defensa, sin adornos, es esto: el ZK
acá no compra anonimato frente al mundo. Compra **que el operador del evento no
pueda construir la base de datos de quién entró a qué**, que es un objetivo chico,
concreto y que ningún NFT solo consigue. Esa frase es defendible. "Validación
anónima" no lo es.

### Y el vínculo también compra algo

Conviene decirlo antes de proponer romperlo, porque es la objeción que se le va a
hacer a cualquier mitigación de la sección 4. Que el compromiso lo mande el dueño
del token es lo que hace el padrón **auditable**: cualquiera puede comprobar que
las ocho hojas corresponden a ocho entradas realmente emitidas y no a ocho hojas
que el organizador se inventó. Sin esa regla, el padrón vuelve a ser una lista que
el organizador arma con quien quiera —que es exactamente el primer escalón, con
más pasos— y el conjunto de anonimato pasa a ser un número que hay que creerle.

Romper el vínculo y conservar la auditabilidad se puede: es una segunda prueba de
conocimiento cero en el momento del envío. Cuesta un circuito más. Esa es la
decisión, y no es de esta PoC.

## 4. Qué podrías cambiar

Las piezas intercambiables de este documento son las mitigaciones del vínculo, más
las dos que quedaron pendientes de la escalera.

**Quién manda el compromiso: el dueño del token → una billetera sin relación.**
El comprador manda su compromiso desde una billetera nueva, sin historia y sin
vínculo con la que tiene el NFT. La tabla billetera ↔ hoja sigue existiendo pero ya
no dice nada. Se pierden dos cosas y hay que nombrarlas: se cae la regla de
`contratos/EntradaNFT.sol:73`, así que cualquiera puede ocupar la hoja de un token
ajeno y dejar afuera a su dueño; y se cae la auditabilidad del padrón. Toca
`contratos/EntradaNFT.sol:69` y todo el camino del comprador. Además, la billetera
nueva necesita fondos, y de dónde salen esos fondos es el mismo problema de
trazabilidad un paso más atrás.

**Quién manda el compromiso: cada uno el suyo → un lote.** Un relayer junta los N
compromisos y los manda en una transacción. La cadena deja de tener pares y pasa a
tener un conjunto. Se gana que el vínculo no sea público y se gana que el comprador
no necesite una billetera con fondos, que es la fila de nueve billeteras de la
tabla; se pierde que el relayer sí sabe el mapeo, o sea que el problema se mueve de
"cualquiera lo sabe" a "uno lo sabe", y aparece un tercero de confianza en un
sistema cuyo argumento es no tener terceros de confianza. Toca
`contratos/EntradaNFT.sol:69` y `lib/compradores.mjs:115`.

**Probar la propiedad sin decir qué token.** Una prueba de conocimiento cero en el
momento del envío: "soy dueño de alguno de los tokens emitidos y este es mi
compromiso", sin decir cuál. Es la única mitigación que conserva la auditabilidad
del padrón *y* rompe el vínculo. Se pierde que enviar un compromiso sea una
transacción barata y simple —habría que verificar Groth16 on-chain, que es T10— y
aparece un segundo circuito que mantener y una segunda ceremonia. Toca el contrato,
el camino del comprador y `circuitos/`.

**El conjunto de anonimato: 8 → 2^k.** La profundidad está compilada adentro del
circuito (`Pertenencia(3)`), así que subirla es recompilar, rehacer el setup y
medir de nuevo: más restricciones, prueba más lenta, `ptau` más grande. Es la única
mitigación que ataca el problema de frente en vez de esconder la tabla, y el número
que hace falta para decidirla —cuánto tarda una prueba con profundidad 20 en un
teléfono de gama media— es **MED-001** y no está medido. Toca
`circuitos/pertenencia.circom`, el setup y todo lo que dependa del tamaño del árbol.

**Lo que anota la puerta: nulificador + hora + origen → solo el nulificador.**
Quitar `momento` y `origen` de `scripts/validador.mjs:191` deja al molinete con lo
único que necesita para decidir. Se gana que el registro del operador no sirva para
correlacionar; se pierde auditoría y se pierde el mensaje "ya pasó a las …" que hoy
le da sentido a un rechazo. Toca `scripts/validador.mjs:191` y `lib/puerta.mjs:157`.

**La fuente no debería desplegar ni vender.** Heredado de T12 y todavía abierto:
construir `fuenteContratoNft` monta el mundo entero si no está montado, así que la
fuente hace bastante más de lo que la interfaz dice. Lo correcto es un comando
`npm run compradores` aparte y una fuente que solo lea. Se pierde que `npm test`
sea un solo comando, porque la suite reinicia la cadena en cada corrida. Toca
`fuentes/contrato-nft.mjs:32` y la preparación de `scripts/demostraciones.mjs`.

**Un cuarto escalón: la cadena local → una testnet pública.** Es el escalón que la
PoC no sube y el que más cambiaría lo que se puede afirmar. Hoy todas las
propiedades que sostienen el argumento —que el registro sea público, inmutable y
verificable por alguien sin el repositorio— están **supuestas**. Se gana que la
raíz sea comprobable por un tercero y un número de gas con precio real; se pierde
que `npm test` corra sin conexión y sin fondos, y aparece una clave privada de
verdad que no puede vivir en el repositorio. Toca `hardhat.config.js`,
`lib/cadena.mjs:35` y de dónde sale la clave.

## 5. Probalo vos

Desde la raíz del repo. La primera vez, `npm install` y `npm run setup`.

### Las tres fuentes sobre el mismo código

```bash
npm run cadena:abajo
FUENTE=json         npm test
FUENTE=contrato     npm test
FUENTE=contrato-nft npm test
```

Las tres terminan en `7 de 7 casos dan lo esperado.` y con código 0. En PowerShell,
`$env:FUENTE="json"; npm test` y después `Remove-Item Env:FUENTE`.

Para ver la comparación y no creerle a este documento, guardá las tres salidas y
compará:

```bash
FUENTE=json         npm test > salida-json.txt 2>&1
FUENTE=contrato     npm test > salida-contrato.txt 2>&1
diff salida-json.txt salida-contrato.txt
rm salida-json.txt salida-contrato.txt
```

Salvo los pid que Node imprime en los dos avisos de deprecación del final, no hay
ninguna diferencia. Repetido contra `contrato-nft`, aparecen dos: los nulificadores
del caso 4.

### El gas de cada escalón

```bash
npm run cadena:abajo
FUENTE=contrato npm run organizador
npm run cadena:estado
```

`429921 gas` en la línea del contrato, y la tabla de raíces con `70277`. Y después:

```bash
npm run cadena:abajo
npm run flujo
```

Las dos líneas que resumen la diferencia entre el segundo escalón y el tercero:

```
  Gas: emitir las ocho, 646.040, lo paga el organizador.
       enviar los ocho compromisos, 572.180, lo pagan los compradores, uno por uno.
```

### Atar un nulificador a una billetera

Después de `npm run flujo`, con la cadena todavía levantada. Guardá esto como
`correlacion.mjs` en la raíz del repo:

```js
import { readFileSync } from "node:fs";
import { construirHashes } from "./lib/merkle.mjs";

const leer = (p) => JSON.parse(readFileSync(p, "utf8"));
const bolsa = leer("datos/secretos.json");
const puerta = leer("puertas/puerta-flujo-a/nulificadores.json");
const scope = BigInt(puerta.scope);
const { hash2 } = await construirHashes();

for (const usado of puerta.usados) {
  const objetivo = BigInt(usado.nulificador);
  const quien = bolsa.identidades.find((i) => hash2(BigInt(i.secreto), scope) === objetivo);
  console.log(`nulificador ${usado.nulificador}`);
  console.log(`  anotado a las ${usado.momento}`);
  console.log(quien ? `  ATADO a hoja ${quien.posicion}, token ${quien.token}, billetera ${quien.billetera}` : "  no se pudo atar");
}
```

```bash
node correlacion.mjs
rm correlacion.mjs
```

Lo que tenés que ver es el nulificador atado a una hoja, un token y una billetera.
Y lo que tenés que entender es por qué eso **no** es la demostración de que el
sistema esté roto: funciona porque `datos/secretos.json` está en esta computadora y
porque esos secretos se derivan de claves privadas de Hardhat, que son públicas. Lo
que demuestra es dónde está la llave. La sección 3 lo desarrolla.

La otra mitad no se prueba con un comando y conviene mirarla igual. Todo lo que
está publicado en la cadena es `datos/arbol.json`: los ocho compromisos y ningún
secreto. Con eso el script no tiene qué pasarle a `hash2`, y no existe otra cosa
que pasarle: para llegar al nulificador hace falta el secreto, y del compromiso al
secreto no se vuelve. Esa es, entera, la propiedad sobre la que se apoya el
argumento de la sección 3.

### Rotura deliberada: que la fuente mienta

En `fuentes/contrato-nft.mjs:48`, antes de leer los logs, agregá una línea:

```js
    async leerCompromisos() {
      return null;
      const llegados = await compromisosEnCadena(contrato);
```

y corré `npm run flujo`. Los ocho compradores pagan sus 572.180 de gas, los ocho
compromisos quedan en la cadena, y el organizador los ignora y se inventa ocho
secretos suyos. La salida vuelve a decir:

```
  la fuente no origina compromisos: los genera el organizador (limitacion de la parte base)
```

y el control que T12 dejó puesto lo atrapa:

```
  el organizador NO genero ningun secreto               FALLA  la fuente aporto los ocho compromisos
```

El flujo sale con código distinto de cero. Vale la pena ver **qué** lo atrapa: no
es la criptografía, que funciona perfecto —el árbol se arma, la raíz se publica, la
prueba se genera y la puerta la acepta—, sino un control que compara lo que hay en
la cadena con lo que usó el organizador. Sin ese control, el tercer escalón se cae
al primero sin un solo error y con ocho personas pagando por nada. Restaurá la
línea.

### Volver al estado commiteado

```bash
git checkout -- datos/
npm run cadena:abajo
```

## 6. Qué NO hace

**No responde si el anonimato alcanza.** Responde que el vínculo público no lo
rompe, y acota con precisión de qué tamaño es lo que queda. Si un conjunto de ocho
—o de ochenta mil— es suficiente para el caso de uso es una pregunta del TPF, y es
exactamente lo que **ADR-001** ya acota con `revision_pendiente: true`. Esta PoC
**ilustra** ese límite; no aporta evidencia sobre el tamaño de conjunto de un evento
real y no habilita a reabrir nada.

**No mide la correlación temporal.** Está argumentada y marcada `[a verificar]`. En
esta PoC los ocho compromisos salen en menos de un segundo y entra una persona: no
hay comportamiento que medir.

**No demuestra que Poseidon sea de un solo sentido.** Todo el argumento se apoya en
que del compromiso no se llega al secreto y del secreto no se vuelve. `npm run
control:poseidon` estableció que circomlibjs y circomlib calculan lo mismo, que es
otra cosa. Queda **supuesto**.

**No decide ninguna de las mitigaciones de la sección 4.** Ninguna es gratis y
todas cambian el contrato o el circuito. Son decisiones del TPF.

**No arregla que `npm run flujo` deje `datos/` modificado.** Lo explica y lo avisa:
`scripts/flujo-completo.mjs:310` ahora dice, al terminar, que `datos/` quedó
regenerado desde la cadena y cómo volver. El arreglo de fondo no se hizo porque es
una decisión de diseño y no un descuido, y conviene dejar escrito por qué.

Medido corriendo cada fuente desde el estado commiteado y mirando `git status`:
`FUENTE=json` ensucia `datos/arbol.json` y `datos/raiz.json`, `FUENTE=contrato`
ensucia solo `datos/arbol.json`, y en los dos casos **la única diferencia es el
campo de fecha** (`generado`, `publicado`), que se escribe con el reloj y cambia de
un día para el otro aunque el contenido sea idéntico. `FUENTE=contrato-nft` ensucia
`datos/arbol.json` y `datos/secretos.json` de verdad: la raíz y los ocho
compromisos son otros, porque son los de los compradores y no los de la semilla.

Son dos problemas distintos con el mismo síntoma, y ninguno se resuelve solo:

- **El padrón.** `datos/` es al mismo tiempo un juego de datos commiteado que los
  documentos citan y el directorio de salida del organizador. Los dos primeros
  escalones producen un padrón y el tercero produce otro; cualquier cosa que esté
  commiteada la va a ensuciar alguno de los dos. Las salidas son ignorar `datos/`
  como ya se ignoran `salidas/`, `puertas/` y `cadena/` —y entonces el repositorio
  deja de tener un padrón de referencia—, o commitear uno de los dos y aceptar que
  el otro ensucia. Es una decisión sobre qué es este directorio, y no la toma T13.
- **La fecha.** Es un campo que nadie lee: ningún script del repositorio lo
  consume. Sacarlo, o conservarlo cuando el resto del documento no cambió, haría
  que `npm run organizador` deje `git status` limpio cualquier día, que es lo que
  `docs/09-entrada-nft.md` prometió en T11 y hoy solo es cierto el mismo día. No se
  hizo porque cualquiera de las dos formas mueve líneas en
  `scripts/organizador.mjs` y en `fuentes/json.mjs`, y hay unas veinte citas
  `archivo:línea` a esos dos archivos en `docs/04-organizador.md` y en tres
  documentos más. El arreglo cuesta menos que actualizarlas, y actualizar la
  documentación de T05 no es trabajo de T13.

**No cierra la reventa, el relleno de hojas ni el orden de las hojas.** Los tres
quedaron abiertos en T11 y T12 y están en la lista de abajo.

**No es una cadena.** Es un nodo en esta computadora, sin otros validadores, sin
consenso, sin costo y sin permanencia. Que el registro sea público e inmutable
—de lo que vive la mitad de este documento— está **supuesto**.

**No empieza T14 ni T15.** El recorrido guiado y el documento de piezas
intercambiables son las dos tareas que siguen, y las dos se apoyan en esta.

---

## Apéndice: candidatos a ADR que deja la PoC

Están dispersos en `bitacora/T01` a `T12`. Acá van juntos, una línea cada uno,
agrupados por el frente del TPF que tocan. **No están decididos ni redactados como
ADR**: es una lista para llevar a la weekly. Los títulos de los frentes salen de
`../zk-ticketing-docs/docs/decisiones/`.

### ADR-001 · Claim de privacidad: no vinculabilidad del portador en la puerta (`aceptada`, `revision_pendiente: true`)

- **Qué entra en el compromiso.** Hoy la hoja es `Poseidon(secreto)` y no tiene
  relación con el NFT, la billetera ni el pago: cualquiera que conozca *un* secreto
  del padrón prueba pertenencia. El documento de Hito 1 plantea
  `Poseidon(secreto, titular)`. (T03, T05)
- **Separación de dominio explícita.** Hoja y nulificador no colisionan porque usan
  aridades distintas de Poseidon; la práctica estándar es prefijar una constante de
  dominio. Cuesta ~250 restricciones y tiene que quedar igual en circuito,
  organizador, prover y contrato. (T03)
- **Qué entra exactamente en el nulificador.** `Poseidon(secreto, scope)` da un solo
  nulificador por identidad y evento: correcto para "una identidad, una entrada",
  incorrecto para "una billetera, cuatro entradas". (T03)
- **Validar que todo valor que entra al circuito esté en `[0, p)`.** Las dos
  implementaciones reducen módulo `p` en silencio, así que dos secretos que
  difieran en un múltiplo de `p` dan el mismo nulificador. (T02)
- **El vínculo billetera ↔ compromiso, y sus mitigaciones.** Sección 4 de este
  documento: billetera sin relación, envío en lote, o prueba de propiedad sin
  revelar el token. Ninguna es gratis. (T11, T13)
- **La atrición del conjunto de anonimato.** El conjunto de ocho baja a 8 − *k* con
  *k* compradores que colaboren o con *k* entradas compradas por el mismo actor, y
  hoy el único límite es el precio de la entrada. (T13)
- **Qué anota la puerta.** El registro guarda hora y origen además del nulificador,
  y el chequeo de doble ingreso no los necesita. (T13)

### ADR-004 · Presupuesto en puerta: menos de 5 s por persona (`aceptada`, `revision_pendiente: true`)

- **Tiempo máximo y aislamiento al leer un sobre.** Un sobre corrupto puede dejar
  la lectura sin volver, y en un molinete eso es un molinete trabado; alcanza con un
  QR mal impreso. Verificar antes si arkworks o rapidsnark se comportan igual:
  `[a verificar]`. (T08)
- **Contrato de salida del validador.** Hoy la suite depende del texto que imprime
  el comando; un molinete que sea un servicio necesita salida estructurada. (T08)

### ADR-005 · Regalías y tope de reventa, como contrato puro sin ZK (`aceptada`, `revision_pendiente: true`)

- **La reventa está rota y es demostrable de punta a punta.** El que vende la
  entrada entra con su prueba y el que la compra no puede generar ninguna, porque el
  compromiso se envía una sola vez por token. (T11, T12)
- **Reemplazar el compromiso mientras la raíz no esté publicada.** Arregla la
  reventa anterior a la publicación y deja abierta la posterior; convierte publicar
  la raíz en un acto que cierra la inscripción. (T11)
- **Conviene contrastarlo con ADR-003** (`aceptada`: se bloquean las transferencias
  antes de la apertura de puertas) antes de abrir nada: la ventana problemática es
  la que va entre publicar la raíz y congelar las transferencias, y puede ser más
  chica de lo que parece. (T13)

### ADR-008 · Prueba pregenerada vs desafío-respuesta (`propuesta`)

- **La prueba es transferible.** Cualquiera que tenga los 224 bytes los presenta y
  pasa: alcanza con fotografiar el QR de otro y llegar primero. Las defensas
  —desafío del validador, marca de tiempo, firma del dispositivo— cambian el
  circuito. (T06)

### ADR-009 · Coordinación offline entre puntos de acceso: LAN o sharding (`propuesta`)

- **El doble ingreso entre puertas sigue abierto**, y el caso 3 de la suite lo
  demuestra en cada corrida: dos molinetes sin canal dejan pasar la misma entrada
  dos veces. (T07, T08)
- **Cuántas raíces vigentes tolera una puerta.** Hoy conoce una sola: si el
  organizador publica una raíz nueva después del provisionamiento, la puerta rechaza
  compradores legítimos y no tiene cómo enterarse. (T07)
- **Quién puede cambiar la raíz de un evento en curso, y con qué aviso.** El
  contrato permite pisar una raíz publicada; las opciones son una sola escritura por
  evento, pisar libremente, o un timelock. (T09)
- **Un registro on-chain de nulificadores resolvería el doble ingreso y costaría el
  claim de privacidad**, porque el nulificador es determinista por evento: publicarlo
  es publicar quién entró y a qué hora. (T09)
- **Escritura durable en el molinete.** `nulificadores.json` se reescribe entero, y
  un corte de luz en el medio lo deja inválido. (T07)

### ADR-010 · Esquema de prueba y plataforma (`propuesta`)

- **De dónde sale la fase 1 del setup.** Generar el `ptau` localmente es correcto
  para una PoC y insostenible para un despliegue: usar una ceremonia pública es una
  dependencia externa que hay que elegir, verificar y registrar. (T04)
- **Groth16 con ceremonia por circuito contra un setup universal.** PLONK, fflonk y
  UltraHonk eliminan la fase 2 a cambio de pruebas más grandes y verificación más
  cara; depende de dos números que todavía no se midieron. (T04)
- **Dónde vive la `verification_key` y cómo se versiona.** Hoy es un archivo
  ignorado por git que cambia en cada corrida, y la puerta necesita una clave fija.
  (T04)
- **Correctitud de Poseidon, no solo paridad entre implementaciones.** El control de
  T02 demuestra que circomlibjs y circomlib son la *misma* implementación, no que
  sean la *correcta*: un error compartido pasaría el control. `[a verificar]` contra
  los vectores del paper. (T02)
- **La profundidad del árbol está compilada en el circuito.** Subir el conjunto de
  anonimato es recompilar, rehacer el setup y volver a medir. Es **MED-001**. (T03,
  T13)

### ADR-011 · Canal de transmisión en puerta (`propuesta`)

- **Qué viaja en el sobre.** Son 224 bytes, pero la raíz y el scope la puerta ya los
  conoce: 160 alcanzarían. Se perdería que la prueba sea autocontenida. (T06)
- **Quién arma las señales públicas.** Si el sobre trae solo prueba y nulificador y
  la puerta arma las señales con sus propios valores, el chequeo de la raíz deja de
  ser un `if` que alguien puede olvidarse de escribir y pasa a ser estructural. (T07)

### ADR-012 · Modelo de billeteras: custodial vs autocustodia (`propuesta`)

- **La custodia del secreto.** Acá se deriva de la clave privada del comprador, que
  es la decisión más cómoda y la que menos se parece al sistema real. Si se pierde
  el secreto, se pierde la entrada. (T12)
- **Quien custodia secretos puede reconstruir historiales de ingreso**, porque el
  nulificador es determinista por evento. Es la consecuencia de privacidad de una
  decisión que se suele discutir como usabilidad. (T13)
- **El control de acceso del organizador.** Hoy es una dirección `immutable`: si se
  pierde la clave, el evento no puede volver a publicar. `Ownable`, `AccessControl`
  o multisig. (T09, T11)
- **Nueve billeteras con fondos para ocho compradores.** Cada comprador paga 71.515
  de gas de su bolsillo para entrar al árbol; si alguien paga por ellos, ese alguien
  sabe quién es quién. (T11, T13)

### Frentes que todavía no tienen ADR abierto

- **Altas y bajas del padrón.** El árbol se arma una vez; agregar un comprador
  cambia la raíz e invalida los caminos repartidos, y un evento real vende durante
  semanas. Árbol disperso, una raíz por tanda, o ventana de cierre. (T05)
- **Qué hacer con las hojas que faltan.** Siete compromisos no son un árbol de
  profundidad 3: rellenar (¿con qué valor, y quién puede abrirlo?), cerrar la
  inscripción, o cambiar la profundidad. Ninguna es un default. (T12)
- **El orden de las hojas.** Orden de llegada contra índice de emisión: el primero
  saca al organizador de la decisión, el segundo es robusto frente a
  reorganizaciones y a nodos sin logs. (T12)
- **Exigir prueba de conocimiento del secreto al enviar el compromiso.** El contrato
  acepta cualquier número, incluido el compromiso de otro copiado de la cadena:
  copiarlo no sirve para entrar, pero sí para que el organizador no pueda armar el
  árbol. (T11)
- **De dónde sale el `scope` de un evento.** Hoy es un hash de una etiqueta, elegido
  por necesidad operativa; en el sistema real sale de un identificador on-chain y
  tiene que quedar idéntico en cinco lugares. Es la clase de valor cuya divergencia
  no da error hasta la puerta. (T06)
- **Quién emite las entradas y quién publica la raíz.** Acá son la misma cuenta
  porque `EntradaNFT` hereda `RegistroDeRaiz`. (T11)
- **Los tokens no saben de eventos.** Un padrón único de tokens y un mapa de raíces
  por `scope`: los mismos ocho compromisos son el padrón de todos los eventos. Atar
  las dos cosas, o un contrato por evento. (T11, T12)

---

[EIP-2028]: https://eips.ethereum.org/EIPS/eip-2028
