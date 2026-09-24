---
tarea: T16
fecha: 2026-09-24
estado: hecha
---

## Qué se hizo

`EXPERIMENTOS.md` en la raíz: nueve roturas deliberadas sobre el código de la
PoC, cada una con qué tocar, qué esperar, qué enseña el resultado y cómo volver
atrás. **Las nueve se corrieron antes de escribirse** y lo que está en los
bloques de salida del documento es lo que imprimió la máquina, recortado pero no
retocado.

No se tocó código. Los únicos cambios del repositorio son el documento nuevo,
esta bitácora y `estado.json`. Todo lo que se rompió para medir se restauró:
`git status` queda mostrando solo los archivos nuevos y la cadena queda bajada.

### El orden, que es el argumento

El documento no ordena por tarea ni por documento de origen, sino por lo que
enseña cada experimento, y los cuatro primeros son un bloque:

1. **El conteo de restricciones no se mueve.** Comentar `raiz === arbol.out`
   (`circuitos/pertenencia.circom:57`) saca la restricción que convierte el
   cálculo en una prueba y el contador sigue diciendo 2513.
2. **La señal sub-restringida.** `<--` en vez de `<==` en la línea 62: el
   circuito pasa entero, código 0, y un nulificador inventado satisface el
   sistema.
3. **La `zkey` que quedó vieja.** `zkey verify` lo detecta; `prove` genera una
   prueba que verifica.
4. **El validador que le cree a la prueba.** `npm run ataque:raiz-propia`: la
   prueba es correcta, el enunciado es verdadero y el sistema igual está roto.

La escalera es de silencio creciente: en el 1 la batería de tests lo atrapa pero
la métrica miente; en el 2 no lo atrapa nada; en el 3 lo ve una herramienta y no
la otra; en el 4 todo está bien y el sistema igual falla. Escrito así porque la
familia es la lección, no cada caso por separado.

Después van los tres que tienen guarda escrita —secreto fuera del campo, fuente
que devuelve `0` en vez de `null`, ptau demasiado chico— con la corrida de la
guarda y la corrida sin ella, que es la que enseña. Y al final los dos del
contrato: la reventa que se lleva el compromiso del vendedor y el dueño que no
envía.

### Verificación

Salida real de la última corrida, que es también el control que el documento
propone para saber si uno volvió al punto de partida:

```
  OK     1  una entrada legitima entra por la puerta A1
  OK     2  la misma prueba, otra vez, en la misma puerta
  OK     3  la misma prueba entra por la puerta A2
  OK     4  la misma identidad con otro scope da otro nulificador
  OK     5  una prueba del evento B en una puerta del evento A
  OK     6  un sobre con un byte alterado
  OK     7  un secreto que no esta en el arbol no llega a generar prueba

  7 de 7 casos dan lo esperado.
```

Doce segundos, código 0, con `datos/` restaurado y la cadena bajada.

## Decisiones que tomé y por qué

**Tres scripts auxiliares, y ninguno entra al repositorio.** Los experimentos 2,
3 y 7 no se pueden correr con los comandos que hay: hacen falta un manipulador de
witness, una llamada directa a `zkey verify` y `prove` con la `zkey` vieja, y una
llamada a `newZKey` sin guarda. Los escribí, los corrí, y los puse enteros en un
apéndice de `EXPERIMENTOS.md` para que se guarden en la raíz, se corran y se
borren —el precedente es el `correlacion.mjs` de
`docs/11-cierre-de-la-escalera.md`—. No los agregué a `scripts/` ni los expuse
como `npm run` porque son andamios de un rato y T16 es una tarea de
documentación: agregar cinco entradas al `package.json` habría sido meterse en el
código de otras tareas.

**El experimento 2 llega hasta el final.** `docs/02-circuito.md` §5 describe la
rotura del `<--` y dice, con razón, que para ver el agujero de verdad hay que
reemplazar a mano el valor del nulificador en el witness y evaluar el `.r1cs`.
Eso estaba contado, no ejecutable. El script del apéndice A lo hace: parsea el
binfile `.wtns`, le suma uno al nulificador y pregunta. Con `<==` da
`WITNESS IS NOT CORRECT` abortando en la restricción 2341; con `<--`,
`WITNESS IS CORRECT`. Sin eso el experimento se quedaba en "mirá, pasa igual",
que no es lo mismo que ver el nulificador falso siendo aceptado.

**La columna de "al terminar" dice la verdad sobre `build/`.** Seis de los nueve
dejan algo que restaurar, y en tres de ellos restaurar el archivo del circuito no
alcanza: hay que recompilar, porque `build/` se queda con el `.r1cs` y el `.wasm`
del circuito roto y todo lo que corra después los usa sin decir nada. Lo puse
arriba de todo con el nombre de "la trampa que más caro sale" porque la pisé yo
—corrí el manipulador de witness contra un `build/` que venía del experimento
anterior y el resultado no tenía sentido hasta que miré el número de cables—.

**Dejé afuera roturas que ya están bien contadas en su sección 5.** El `x + 1` de
Poseidon, el pragma desalineado de circomlib, la prueba correcta en la puerta
equivocada, el borrado que le falta a la suite, el byte alterado adentro de la
prueba, la clave de otra cuenta, `SoloElDuenio` comentado, los ocho compradores
con el mismo secreto, la fuente que miente. Son buenas y están enteras en
`docs/`. Meterlas acá habría hecho un catálogo de dieciocho entradas donde las
cuatro que importan se pierden. El criterio del encargo —un experimento cuyo
resultado no cambia lo que entendés no vale la pena— aplicado también a la
segunda copia de un experimento que ya existe.

## Con qué me tropecé

**El número de cables no es la huella del `<--`, y el documento lo sugiere.**
`docs/02-circuito.md` §5 presenta `wires: 2519 en vez de 2518` como la única
diferencia visible de la rotura del `<--`. Es cierto que cambia, pero **la
rotura del experimento 1 —comentar `raiz === arbol.out`— produce exactamente el
mismo reporte del compilador**: 1212 restricciones no lineales, 1301 lineales,
2519 cables, 2513 restricciones totales, sin advertencias. Las ocho líneas son
idénticas carácter por carácter para dos bugs completamente distintos. Lo
escribí así en el documento: un cable de más significa "algo cambió", nunca
"esto cambió". Es un matiz, no un error de `docs/02-circuito.md`, pero el matiz
importa porque invita a usar el número como control y no sirve para eso.

**Dos números de línea desactualizados en las secciones 5.** `docs/04-organizador.md`
§5 manda comentar `scripts/organizador.mjs:67` y la llamada a `exigirEnCampo`
está en la 73. `docs/03-setup.md` §5 manda cambiar `scripts/setup-groth16.mjs:36`
y `const POTENCIA` está en la 37 —cambiar la 36 deja dos declaraciones y el
script muere con `SyntaxError: Identifier 'POTENCIA' has already been declared`,
que no se parece en nada a lo que uno esperaba—. En `EXPERIMENTOS.md` puse los
números reales. No corregí los documentos: no es tarea de T16 tocar la
documentación de T04 y T05. Queda anotado abajo.

**`snarkjs.wtns.check` revienta cuando el witness está mal.** Sin un logger como
tercer argumento, chequear un witness que no satisface el sistema tira
`Cannot read properties of undefined (reading 'warn')`: snarkjs intenta avisar
por un logger que no le pasaron. Un `try/catch` ingenuo convierte eso en "hubo un
error al chequear", que es otra cosa que "el witness está mal". Es de la misma
familia que todo lo demás del documento, así que quedó adentro del experimento 2
como yapa.

**`npm test` deja `datos/arbol.json` modificado.** `docs/07-demostraciones.md` §5
dice que después de la suite `git status` no imprime nada. Hoy imprime una
línea: el campo `generado` del padrón lleva la fecha de la corrida, y la
commiteada es la del 2026-09-23. No es una regresión —el contenido criptográfico
es idéntico, la raíz es la misma— pero alguien que siga el documento al pie de la
letra va a pensar que rompió algo. Está aclarado en `EXPERIMENTOS.md`, en el
camino de vuelta.

**El primer intento del manipulador de witness colgó.** `build/pertenencia.wtns`
queda en cero bytes después de una corrida de `npm run circuito:pertenencia`,
porque el último witness que calcula es uno inválido que falla. Reescribí el
script para que genere el suyo. Y el proceso no terminaba: snarkjs deja handles
abiertos y el script necesita un `process.exit(0)` explícito, cosa que también
hacen los scripts del repositorio.

## Qué dejo pendiente o candidato a ADR

No abre candidatos a ADR nuevos. Los que la PoC deja están juntos en el apéndice
de `docs/11-cierre-de-la-escalera.md` y T16 no agrega ninguno: los experimentos 8
y 9 apuntan a ADR-005 y al tamaño del conjunto de anonimato de ADR-001, que ya
están abiertos.

Tres correcciones chicas de documentación, todas de una línea, para quien toque
esos archivos:

- `docs/04-organizador.md` §5: la línea de `exigirEnCampo` es la 73, no la 67.
- `docs/03-setup.md` §5: `const POTENCIA` está en la 37, no en la 36.
- `docs/07-demostraciones.md` §5: `git status` sí muestra `datos/arbol.json`
  modificado después de `npm test`, por el campo `generado`.

Y una observación para el informe, que es la que más rinde de todo lo que salió
de correr esto: **de los cuatro fallos silenciosos, tres los atrapa un control
que alguien escribió a mano y el cuarto no lo atrapa nada**. El del `<--` no
tiene defensa automática en este stack: ni el compilador, ni el conteo de
restricciones, ni la batería de testigos, ni `wtns.check`. Es el argumento
empírico más concreto que la PoC produjo a favor de mirar en serio las
alternativas de la pieza 1 de `INTERCAMBIABLES.md` (ADR-010), y conviene llevarlo
a la weekly con el comando al lado, porque se muestra en quince segundos.
