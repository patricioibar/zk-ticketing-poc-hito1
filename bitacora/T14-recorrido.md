---
tarea: T14
fecha: 2026-09-23
estado: en-curso
---

## Qué se hizo

`RECORRIDO.md` en la raíz: el tour guiado que el `README.md` anunciaba y que
todavía no existía. Ocho tramos con estimación de tiempo cada uno, en orden de
lectura, pensado para hacerlo con la terminal al lado. Se actualizó el
`README.md`, que decía "existe a partir de T14", y se agregó `RECORRIDO.md` a su
tabla de mapa.

**La tarea queda en `en-curso`, no en `hecha`, y es a propósito.** Ver abajo.

### La diferencia con lo que pide el plan

T14 estaba programada para después de T13, cuando existieran los contratos y los
NFT: el plan la describe como un tour "desde el hash hasta el NFT". Se adelantó,
así que el recorrido **cubre solo la fase 1** —T01 a T08: entorno, Poseidon,
circuito, trusted setup, organizador, prover, validadores y demostraciones— y no
dice una palabra sobre contratos, NFT ni compromisos on-chain, porque no existen
y no se los vio funcionar.

El documento lo declara en su segundo párrafo y cierra con una sección **"Lo que
todavía no está"** que enumera T09 a T13 desde `estado.json`, nombra las dos
preguntas que esta fase deja abiertas a propósito —si la raíz que la puerta tiene
es la del evento real, y si el organizador puede hacerse pasar por sus
compradores— y dice que el recorrido se extiende cuando esas fases existan.

### Cómo está armado

Es un tour, no un resumen: la regla que se siguió es que si algo ya está bien
explicado en un doc, el recorrido enlaza la sección concreta y no la repite. Lo
que el recorrido aporta es el hilo, el orden, los comandos en la secuencia
correcta y, en cada parada, un párrafo de "qué tendrías que estar entendiendo al
salir de acá".

- **Arranca haciéndolo correr.** El Tramo 1 es `npm test` y nada más: el sistema
  entero en una pantalla, antes de cualquier párrafo de explicación. Recién el
  Tramo 2 plantea el problema.
- **Hilo conductor: los modos de fallo silencioso.** Cuatro numerados, cada uno
  verificado contra su documento antes de escribirlo: la restricción que falta
  (`raiz === arbol.out`, T03), la señal sub-restringida con `<--` (T03), la
  `zkey` desactualizada que sigue generando pruebas válidas del circuito viejo
  (T04) y el validador que le cree a la raíz que le trae la prueba (T07). Tres
  variantes menores en el camino: la reducción módulo `p` silenciosa de las dos
  implementaciones de Poseidon (T02), el `ptau` chico que deja una `zkey` de cero
  bytes sin lanzar excepción (T04) y la fuente que devuelve `0` en vez de `null`
  (T05).
- **Cierra con la distinción ZK / NFT**, que es lo que el jurado pregunta
  primero, contrastada contra lo que efectivamente corrió en el recorrido, con
  una tercera columna de lo que no da ninguno de los dos.
- **Mapa de comandos** al final, con los trece comandos y su tiempo real, y la
  tabla de los ocho documentos con el tramo en el que aparece cada uno.

Estimación de duración, declarada en el encabezado: **una hora** leyendo y
corriendo los comandos, **dos horas y cuarto** haciendo también las roturas
deliberadas. Los tramos, en orden: antes de empezar (5), miralo andar (10), qué
problema resuelve esto (10), el campo y el hash (15), el circuito (25), el
trusted setup (20), la prueba (15), la puerta (25), volvé al principio (10).
Suman 135 minutos.

## Decisiones que tomé y por qué

**Poner el circuito y la puerta como los dos tramos largos (25 min cada uno).**
Son los dos lugares donde están los cuatro fallos silenciosos y donde se juega el
entendimiento. El Tramo 5 (trusted setup) podría haber sido igual de largo y se
dejó en 20 porque la ceremonia ya se corrió en "antes de empezar" y el tramo es
casi todo lectura.

**Las roturas deliberadas se enlazan, no se reescriben, salvo dos.** Las dos del
circuito —comentar la línea 57 y cambiar `<==` por `<--` en la 62— están escritas
con sus pasos adentro del recorrido, porque son el corazón del hilo conductor y
mandar a buscarlas a otro archivo cortaría el tramo justo donde no hay que
cortarlo. Todas las demás se citan por doc y sección.

**El recorrido no repite ni un número medido.** Los tiempos de la tabla de
comandos son de las corridas de esta sesión y están redondeados y marcados como
tales; todo el resto —2513 restricciones, 224 bytes, 8 ms, 122 veces— se cita
desde el doc que lo midió. Un número copiado a mano en un segundo lugar es un
número que va a divergir.

**Tres avisos prácticos antes del primer comando**, que no estaban en ningún doc
y que le habrían costado un rato a cualquiera que siguiera el tour hoy: que los
tiempos de los docs no van a coincidir porque la máquina cambió de Node, que
`git status` marca `datos/` como modificado por finales de línea, y qué
directorios se pueden borrar sin miedo.

## Con qué me tropecé

**La máquina ya no tiene el Node con el que se midió todo.** Los ocho documentos
declaran `node v20.19.2` en su bloque de hardware; esta copia corre con **Node
v22.23.3 y npm 10.9.9** (`npm run verificar:entorno` pasa igual, porque
`engines` pide `>= 20.19.0`). El efecto en los números es grande y medido acá:
`npm run setup` tardó **19,3 s** contra los 52,8 s de `docs/03-setup.md`, y el
prover dio **203,5 ms ± 85,7 ms** de total contra los 157,5 ms ± 8,2 ms de
`docs/05-prover.md`. Los valores criptográficos no se movieron ni un dígito: la
raíz `21742806…81855720` y el nulificador `9349048…28512571` son los mismos de
siempre.

Esto es exactamente el pendiente que `bitacora/T01-entorno.md` dejó anotado
—"Node 20.19.2 → Node 22 LTS... si se hace, conviene hacerlo **antes** de
MED-001: mediciones tomadas con runtimes distintos no se comparan"— y ya pasó.
Lo resolví avisándolo en el recorrido en vez de corrigiendo ocho documentos, que
no es trabajo de esta tarea. **Queda pendiente** decidir si los bloques de
hardware se rehacen sobre Node 22 antes de MED-001.

**`git status` no queda limpio después de `npm test` en esta copia.** La
configuración de git de este repositorio tiene `core.autocrlf=true`, así que los
tres archivos de `datos/` que el organizador reescribe quedan marcados como
modificados aunque `git diff` no muestre ni una línea: es solo el final de línea.
`docs/07-demostraciones.md` sección 5 afirma que `git status` tampoco imprime
nada, y con esta configuración no se cumple. Lo verifiqué aislando el paso:
después de `git checkout -- datos/`, un solo `npm run organizador -- --scope
evento-A` alcanza para volver a ensuciarlo. Está avisado en el recorrido; no
toqué el doc de T08 porque no es mi tarea y el contenido de los archivos es
idéntico.

**Esta tarea es la excepción a la regla del contexto mínimo de `CONTEXTO.md`.**
Para escribir un hilo hace falta la foto completa: se leyeron los ocho documentos
de `docs/` y las nueve bitácoras enteros, más `CONTEXTO.md` y la sección T14 de
`PLAN.md`. Vale la pena que quede escrito que fue deliberado y por qué, para que
no parezca que un agente se desbordó.

## Verificación

El worktree estaba limpio: `npm install` y `npm run setup` primero. Todos los
comandos que el recorrido menciona se corrieron en esta copia y todas las rutas
que cita existen. Códigos de salida y tiempos reales (Node v22.23.3, Intel
i5-14400F, 16 GB, Windows 11 Pro 10.0.26200):

```
npm run estado                                          exit 0      873 ms
npm run verificar:entorno                               exit 0     2997 ms
npm run control:poseidon                                exit 0    13181 ms
npm run circuito:pertenencia                            exit 0     3922 ms
npm run setup                                           exit 0     19,3 s
npm run organizador -- --scope evento-A                 exit 0       ~1 s
npm run probar -- --identidad 3 --scope evento-A        exit 0     4529 ms
npm run puerta:provisionar -- --puerta 1,2 ...          exit 0       ~1 s
npm run validar -- --puerta 1 --prueba salidas/...      exit 0   (PASE)
npm run validar -- --puerta 1 --prueba salidas/...      exit 2   (RECHAZADA, chequeo 4)
npm run validar -- --puerta 2 --prueba salidas/...      exit 0   (PASE)
npm run validar -- --puerta 3 --prueba salidas/...      exit 2   (RECHAZADA, chequeo 2)
npm run validar -- --puerta 1 --estado                  exit 0
npm run ataque:raiz-propia                              exit 0
npm test                                                exit 0    12715 ms  (7 de 7)
```

Los flags que el recorrido cita se comprobaron contra el código que los parsea, no
contra la documentación: `--puerta`, `--prueba`, `--cronometrar`, `--estado` y
`--olvidar` en `scripts/validador.mjs`; `--identidad`, `--scope` y `--corridas` en
`scripts/prover.mjs`; `--scope`, `--semilla` y `--romper` en
`scripts/organizador.mjs`.

Las cuatro citas de línea de `circuitos/pertenencia.circom` se verificaron contra
el archivo: 38 es `indices[i] * (indices[i] - 1) === 0;`, 57 es
`raiz === arbol.out;`, 62 es `nulificador <== hasherNulificador.out;` y 67 es
`component main {public [raiz, scope]} = Pertenencia(3);`.

`datos/` quedó republicado en `evento-A` y restaurado con `git checkout --
datos/`, así que el único cambio del commit son los tres archivos de esta tarea.

## Qué dejo pendiente o candidato a ADR

**Ninguna candidata a ADR.** Esta tarea no toca diseño: ordena lo que ya está
escrito. Los candidatos que las ocho tareas anteriores dejaron anotados siguen
donde estaban, en sus bitácoras.

**T14 queda en `en-curso` y no en `hecha`.** El recorrido cubre la fase 1
completa y es útil tal como está, pero el plan pide un tour "desde el hash hasta
el NFT" y la segunda mitad de ese recorrido no se puede escribir sin haber visto
correr T09 a T13. Cuando T13 esté, hay que volver acá y agregar los tramos de la
fase 2 y la fase 3, revisar la sección "Lo que todavía no está" —que debería
quedar mucho más corta— y sobre todo **rehacer la sección de ZK contra NFT**, que
hoy contrasta contra un contrato que no existe y que entonces va a poder
contrastar contra uno que sí. Ese es el momento de pasarla a `hecha`.

**Pendiente heredado que esta tarea volvió a tocar: los bloques de hardware de
los ocho documentos.** Están medidos sobre Node v20.19.2 y la máquina tiene Node
v22.23.3. No es urgente para entender nada —los valores criptográficos no
dependen del runtime— y sí lo es antes de MED-001. La decisión es de Patricio,
porque toca la máquina.

**Pendiente chico: la afirmación de `git status` limpio en
`docs/07-demostraciones.md`.** No se cumple con `core.autocrlf=true`. Corresponde
arreglarlo en una pasada de mantenimiento sobre ese doc, o agregando un
`.gitattributes` que fije el final de línea de `datos/*.json`, que probablemente
sea la solución correcta y es una línea.

**Queda sin hacer, y son tareas propias**: `INTERCAMBIABLES.md` (T15), que sale
de las secciones 4 de los ocho docs, y `EXPERIMENTOS.md` (T16). Este recorrido
las apunta al pasar pero no las adelanta.
