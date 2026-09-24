---
tarea: T13
fecha: 2026-09-24
estado: hecha
---

## Qué se hizo

Se corrieron las tres implementaciones de `fuenteDeRaiz` sobre el mismo código, se
midió qué cambia y qué no entre un escalón y el siguiente, se respondió la pregunta
incómoda que T11 y T12 dejaron planteada, y se juntaron en un solo lugar los
candidatos a ADR de las doce bitácoras. El resultado es
`docs/11-cierre-de-la-escalera.md`.

Lo único que se tocó del código son cuatro líneas de `console.log` y un comentario
al final de `scripts/flujo-completo.mjs` (ver más abajo). No se tocó el circuito, el
organizador, el prover, los validadores, los contratos ni ninguna fuente.

### La comparación, y su resultado

Seis corridas de la suite de T08, dos por fuente, todas con código 0 y
`7 de 7 casos dan lo esperado.`:

```
json corrida 1: codigo=0  10748 ms
json corrida 2: codigo=0  10616 ms
contrato corrida 1: codigo=0  11475 ms
contrato corrida 2: codigo=0  11405 ms
contrato-nft corrida 1: codigo=0  15966 ms
contrato-nft corrida 2: codigo=0  15488 ms
```

Guardadas las salidas y comparadas con `diff`:

- `json` contra `contrato`: **idénticas**, salvo los pid que Node imprime en los
  dos avisos de deprecación del final.
- `contrato` contra `contrato-nft`: **difieren en dos números**, los nulificadores
  del caso 4, que tienen que diferir porque el secreto de esa identidad ya no lo
  inventa el organizador.

### El gas, medido

Corriendo `npm run organizador` contra cada fuente desde una cadena recién
reiniciada y leyendo `npm run cadena:estado`:

| | `json` | `contrato-raiz` | `contrato-nft` |
|---|---|---|---|
| Desplegar | — | 429.921 | 2.341.174 |
| Emitir las ocho | — | — | 646.040 |
| Publicar la raíz (evento A) | — | 70.277 | 70.288 |
| Los ocho compromisos | — | — | 572.180 (lo pagan los compradores) |
| **Total** | **0** | **500.198** | **3.629.682** |

### Las líneas para subir cada escalón

Con `git diff --numstat` entre los commits de las tareas:

- **escalón 1 → 2 (T09)**: 7 líneas en los tres consumidores (`organizador` 3,
  `prover` 2, `provisionar-puerta` 2). T09 lo reportó como falla y lo arregló
  creando `fuentes/seleccion.mjs`.
- **escalón 2 → 3 (T12)**: **0** líneas en los tres consumidores. Sí tocó cinco
  líneas de `fuentes/contrato-raiz.mjs` —el escalón de abajo— para agregarle
  `yaConectado`, y `EntradaNFT.sol` lo había escrito T11.

O sea que el arreglo de T09 funcionó y se puede demostrar con un número.

### El experimento del nulificador

Con el flujo corrido, calculando `Poseidon(secreto, scope)` para los ocho secretos
de `datos/secretos.json` y comparando contra lo que anotó la puerta:

```
nulificador 21188147761299192891249625304539314658323592094901195412685523209436134662731
  anotado a las 2026-09-24T01:22:02.200Z
  ATADO a hoja 0, token 5, billetera 0x976EA74026E726554dB657fA54763abd0C3a0aa9
```

El script está copiado entero en la sección 5 del documento y se probó tal como
está escrito ahí.

### La rotura deliberada

Con `return null;` agregado al principio de `leerCompromisos`
(`fuentes/contrato-nft.mjs:48`), los ocho compradores pagan sus 572.180 de gas, los
compromisos quedan en la cadena y el organizador los ignora y se inventa ocho
secretos propios. El árbol se arma, la raíz se publica, la prueba se genera y la
puerta la acepta: la criptografía no se entera de nada. Lo que lo atrapa es un
control de `npm run flujo`:

```
  el organizador NO genero ningun secreto               FALLA  la fuente aporto los ocho compromisos
```

## Decisiones que tomé y por qué

**La respuesta a la pregunta incómoda es "no, pero", y el "pero" ocupa más que el
"no".** Afirmar que el anonimato está a salvo porque la prueba no revela la hoja es
cierto y es la clase de respuesta que `docs/09-entrada-nft.md` ya había marcado como
insuficiente. Lo que hice fue reformular el claim hasta que fuera defendible: el ZK
acá protege **el vínculo entre un ingreso anotado en el registro del operador y una
hoja del padrón**, y nada más. No protege que se sepa que alguien entró, ni quiénes
son los ocho candidatos, ni cuántos entraron, ni a nadie que mire. Los cuatro
argumentos que sostienen el "pero" están en la sección 3.

**El experimento lo hice para medir la forma del ataque, no para demostrar una
vulnerabilidad.** Que el nulificador se ate a una billetera en esta PoC no prueba
nada sobre el sistema real: funciona porque los ocho secretos están en un archivo de
esta computadora y se derivan de claves de Hardhat que son públicas. Lo que sí
establece es dónde está la llave del join, y que la llave es un número que alguien
tiene que guardar por años. Eso convierte a ADR-012 de una pregunta de usabilidad en
una de privacidad, y es el hallazgo que más me importa de esta tarea.

**El pendiente de `datos/` lo dejé documentado y avisado, no arreglado.** Medí que
son dos problemas distintos con el mismo síntoma. Uno es el campo de fecha
(`generado`, `publicado`), que se escribe con el reloj y ensucia el árbol de trabajo
aunque el contenido sea idéntico: con `FUENTE=json` y con `FUENTE=contrato`, la
fecha es **la única** diferencia. El otro es el padrón: los dos primeros escalones
producen uno y el tercero produce otro, y cualquier juego de datos commiteado lo va
a ensuciar alguno de los dos.

El segundo es una decisión sobre qué es el directorio `datos/` para este
repositorio —o se ignora como `salidas/`, `puertas/` y `cadena/`, o se commitea uno
de los dos padrones y se acepta el ruido— y no la tomé: `CONTEXTO.md` es claro con
que las decisiones de arquitectura no son de esta PoC. El primero es barato en
código y caro en otra cosa: cualquiera de las dos formas de arreglarlo mueve líneas
en `scripts/organizador.mjs` y en `fuentes/json.mjs`, y hay unas veinte citas
`archivo:línea` a esos dos archivos repartidas en `docs/04-organizador.md` y tres
documentos más. Actualizar la documentación de T05 no me pareció trabajo de T13, y
dejar las citas mal, menos.

Lo que sí hice es que el comando lo diga. `scripts/flujo-completo.mjs:310` ahora
termina avisando que `datos/` quedó regenerado desde la cadena y cómo volver:

```
  datos/ quedo regenerado desde la cadena, asi que git status lo va a mostrar
  modificado. Para volver al juego de datos de la parte base:
    git checkout -- datos/
```

Es menos que resolverlo y es lo que se puede hacer sin decidir. El aviso está
después del cierre y antes de la línea de la cadena, así que no mueve ninguna cita:
la única que hay a ese archivo (`scripts/flujo-completo.mjs:236`, en
`docs/10-flujo-completo.md`) sigue apuntando a la misma línea.

**La lista de candidatos a ADR está agrupada por frente y no decidida.** Fui a
`../zk-ticketing-docs/docs/decisiones/` a leer los títulos y los estados reales en
vez de inferirlos de las menciones por ID que hacen las bitácoras. Quedaron 29
candidatos repartidos en los ocho frentes que el encargo nombra, más siete que no
tienen ADR abierto: 36 en total. Ninguno está redactado como ADR ni decidido: es
una lista para la weekly. Tres de esos frentes (ADR-001, 004 y 005) están
`aceptada` con `revision_pendiente: true`, así que los candidatos que caen ahí son
material para esa revisión pendiente y no una propuesta de reapertura.

**Marqué `[a verificar]` tres cosas** que no se pueden afirmar con lo que esta PoC
corre: la magnitud de la correlación temporal entre el momento de la compra y el del
ingreso, que Poseidon sea de un solo sentido (el control de T02 estableció paridad
entre dos implementaciones, no correctitud), y cuánto costaría de verdad vaciar un
conjunto de anonimato en un evento real, que depende del precio de la entrada y de
si hay tope de compras por persona.

## Con qué me tropecé

**El `diff` entre `json` y `contrato` dio cero y me costó creerlo.** Pensé que
estaba comparando mal. No: T09 hizo que poner la raíz en un contrato no cambiara ni
un número de la suite, que es exactamente lo que la escalera prometía. La evidencia
más fuerte de esta tarea es una salida vacía.

**La rotura deliberada tiene un daño colateral confuso si se la corre con
`npm test` en vez de con `npm run flujo`.** El prover construye la fuente, que llama
a `asegurarCompradores`, que reescribe `datos/secretos.json` con la bolsa de los
compradores, mientras `datos/arbol.json` tiene los compromisos que se inventó el
organizador. El error que sale es `ESTE SECRETO NO ES EL DE ESTA POSICION DEL
PADRON`, que es cierto y no explica nada. Documenté la versión con `npm run flujo`,
que falla en el control correcto y dice por qué.

**El aviso de `datos/` lo escribí primero adentro de la rama de la corrida
completa** y quedaba sin imprimirse en `npm run flujo -- --sin-enviar 5`, que
también ensucia `datos/secretos.json` porque la bolsa se escribe al construir la
fuente, antes de que el organizador falle. Lo saqué de la rama y le puse un texto
que es cierto en los dos casos.

**Dos corridas por fuente y no una**, porque un número solo de reloj no dice nada
sobre si el tercer escalón tarda más o si la máquina estaba ocupada. Igual quedaron
marcados como de orientación: no caracterizan hardware y no son MED-001.

## Qué dejo pendiente o candidato a ADR

Los candidatos a ADR están todos en el apéndice de
`docs/11-cierre-de-la-escalera.md`, agrupados por frente. Acá van solo los que
**abre esta tarea** y no estaban en ninguna bitácora anterior:

- **La atrición del conjunto de anonimato** (**ADR-001**). Ocho hojas quiere decir
  1 en 8 como techo, y cada secreto que cambia de manos le saca un candidato a todos
  los demás: *k* compradores que colaboren, o *k* entradas compradas por el mismo
  actor, dejan a los otros en 8 − *k*. El límite hoy es el precio de la entrada, o
  sea que es económico y no criptográfico.
- **Quien custodia secretos puede reconstruir historiales de ingreso**
  (**ADR-012**). El nulificador es determinista por evento, así que con un secreto
  se recalculan todos los ingresos de esa persona en todos los eventos,
  retroactivamente. Es la consecuencia de privacidad de una decisión que se suele
  discutir como usabilidad.
- **Qué anota la puerta** (**ADR-001**, toca **ADR-009**). El registro guarda
  `momento` y `origen` además del nulificador (`scripts/validador.mjs:191` y `:192`)
  y el chequeo de doble ingreso no los necesita: `lib/puerta.mjs:157` usa `momento`
  solo para un mensaje. Es el insumo exacto del ataque de correlación temporal, y
  una puerta real va a querer auditoría igual: por eso es una decisión y no un
  arreglo.
- **La reventa conviene contrastarla con ADR-003** (`aceptada`: se bloquean las
  transferencias antes de la apertura de puertas) antes de abrir nada. La ventana
  problemática es la que va entre publicar la raíz y congelar las transferencias, y
  puede ser bastante más chica de lo que las bitácoras de T11 y T12 suponen. No
  reabrí nada ni lo discutí: lo dejo anotado para la weekly.

Pendientes técnicos, ninguno bloqueante:

- **`datos/` sigue ensuciándose.** Las dos mitades del problema y las salidas de
  cada una están en la sección 6 del documento. La decisión es del equipo.
- **Un patrón que ya apareció dos veces y conviene nombrar:** en este diseño, cada
  regla que hace el sistema usable es también la que lo hace vinculable. La línea
  que impide que un tercero te ocupe la hoja (`EntradaNFT.sol:73`) es la que ata la
  hoja a tu billetera; el nulificador determinista que permite validar offline es el
  que permite atar ingresos. No es una lista de descuidos: es la forma del problema.

**No empecé T14 ni T15.** La cadena queda bajada.
