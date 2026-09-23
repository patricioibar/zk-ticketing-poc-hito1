---
tarea: T07
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

Dos validadores de puerta independientes, el comando que los provisiona y el
ataque que justifica el orden de los chequeos.

Archivos nuevos:

- `lib/senales.mjs` — el orden de las señales públicas (`[nulificador, raiz, scope]`),
  verificado contra `build/pertenencia.sym` en vez de asumido.
- `lib/sobre.mjs` — leer y escribir lo que presenta el comprador: prueba + tres
  señales, en los dos formatos que dejó T06 más el sobre de un solo archivo.
- `lib/puerta.mjs` — el estado local de un molinete y los cuatro chequeos.
- `scripts/provisionar-puerta.mjs` — el momento conectado.
- `scripts/validador.mjs` — el momento offline.
- `scripts/ataque-raiz-propia.mjs` — el ataque del árbol propio.
- `docs/06-validador.md`.

Reutilizado sin copiar: `lib/merkle.mjs`, `lib/campo.mjs`,
`lib/prueba-binaria.mjs` y `fuentes/json.mjs`. No se tocó `scripts/prover.mjs`
ni ningún archivo de T05 o anteriores.

Comandos nuevos en `package.json`: `puerta:provisionar`, `validar` y
`ataque:raiz-propia`. `puertas/` se agregó a `.gitignore`: es estado local que se
regenera.

### Verificación (salidas reales)

**El orden de las señales, contra el `.sym`:**

```
  orden verificado  [nulificador, raiz, scope]   segun build/pertenencia.sym
```

Las tres primeras líneas de `build/pertenencia.sym` son `1,1,145,main.nulificador`,
`2,2,145,main.raiz`, `3,3,145,main.scope`. El orden que anotaba `docs/05-prover.md`
quedó confirmado contra la fuente que lo produce, y no contra la salida del prover.

**La entrada pasa, se repite, y entra por la otra puerta:**

```
puerta 1, primera vez   1 OK  2 OK  3 OK (320.0 ms)  4 OK   => PASE          exit 0
puerta 1, otra vez      1 OK  2 OK  3 OK (316.9 ms)  4 FALLA (ya paso)       exit 2
puerta 2, la misma      1 OK  2 OK  3 OK (317.6 ms)  4 OK   => PASE          exit 0
```

La tercera línea es el agujero de ADR-009, real y no simulado: son dos procesos
distintos con dos archivos distintos.

**El ataque del árbol propio:**

```
  raiz propia       20015225524063974638380943110570875067346502649548216576988022975831689873684
  es la del evento  NO
  verifica contra la verification key DEL EVENTO   SI

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

El script sale con 1 si el ingenuo no acepta o si el estricto no rechaza: el
ataque se autocomprueba.

**Prueba del evento-A en una puerta del evento-B** (el chequeo 2, aislado):

```
  1  la raiz es la que descargo esta puerta          OK    coincide
  2  el scope es el del evento de esta puerta        FALLA otro evento
```

El chequeo 1 no la atrapa, porque el padrón —y por lo tanto la raíz— es el mismo
para los dos eventos.

**Tiempos**, cinco invocaciones del comando completo en el i5-14400F de
`docs/05-prover.md` (Windows 11, Node v20.19.2, snarkjs 0.7.6):

```
corrida 1  wall 767 ms   verificacion 334.2 ms   10 mas: 8.3 ms  [6.7 .. 9.6]
corrida 2  wall 727 ms   verificacion 316.9 ms   10 mas: 8.0 ms  [7.1 .. 9.1]
corrida 3  wall 743 ms   verificacion 323.0 ms   10 mas: 7.8 ms  [6.6 .. 10.4]
corrida 4  wall 751 ms   verificacion 321.0 ms   10 mas: 7.9 ms  [6.7 .. 8.9]
corrida 5  wall 754 ms   verificacion 318.2 ms   10 mas: 7.7 ms  [6.9 .. 8.9]
```

Verificar en caliente sale ~8 ms, unas veinte veces menos que los 157 ms que
tarda generar la prueba. La primera verificación de cada proceso paga la
construcción de la curva BN254 (~320 ms) y el comando entero paga además el
arranque de Node. No es la medición de un molinete real y el documento lo dice.

## Decisiones que tomé y por qué

**Un solo script con `--puerta` en vez de dos scripts casi idénticos, como decía
`PLAN.md`.** La independencia que la tarea necesita es de estado, no de texto:
dos procesos, dos archivos, ningún canal. Eso se cumple igual con un script
parametrizado y se evita el riesgo de que alguien arregle un chequeo en una copia
y no en la otra, con lo cual T08 mediría una diferencia de implementación en vez
de la falta de sincronización. Está justificado en la sección 3 del documento.

**Separé provisionar de validar en dos comandos.** El plan no lo pedía, pero sin
esa separación "offline" no se puede mostrar: si el validador leyera
`datos/raiz.json` en el momento de validar, estaría consultando una fuente
externa y la demostración de ADR-002 sería una afirmación del documento. Ahora el
validador no importa `fuentes/`, no lee `datos/` ni `build/`, y tiene su propia
copia de la verification key adentro de su configuración.

**Verifiqué el orden de las señales contra `build/pertenencia.sym`** y no contra
la salida del prover, que es lo que el plan marcaba como "verificarlo, no
asumirlo". El `.sym` es lo que produce el compilador; la salida del prover es una
consecuencia. `exigirOrdenCanonico` corre al provisionar (donde hay `build/`) y
graba el orden en la configuración de la puerta; el validador offline comprueba
ese orden grabado contra la constante del código. Si alguien cambia el circuito,
falla explícito en vez de comparar la raíz contra el nulificador.

**El validador sale con 2 cuando rechaza**, no con 1. T08 va a scriptear esto y
necesita distinguir "rechazó como se esperaba" de "el comando no pudo trabajar".

**El ataque corre `correrChequeos` de `lib/puerta.mjs`, con los chequeos 1 y 2
omitidos**, en vez de tener su propio validador ingenuo escrito aparte. Así la
única diferencia entre aceptar y rechazar al atacante son esos dos ids, y no
alguna otra cosa que se cuele en una segunda implementación. El script se
autocomprueba: sale con 1 si el ingenuo no acepta o si el estricto no rechaza.

**Bloqueo de red durante la validación** (`bloquearRed`). Reemplaza `fetch` y los
métodos de `node:http`, `node:https` y `node:net` por funciones que tiran. No es
una caja de arena y el documento dice qué no atrapa (un import con nombre
capturado antes, `node:dgram`, un binario nativo); es una alarma para que una
consulta agregada por descuido rompa el comando en vez de andar de casualidad
porque la máquina de prueba tenía wifi.

**El estado de las puertas va a `puertas/`, fuera de git.** Es estado de
ejecución, como `salidas/`, y se regenera con un comando.

## Con qué me tropecé

**`datos/` estaba en `evento-A` en el commit pero en `1234` en el working tree**,
por las pruebas de T06. Lo regeneré con `npm run organizador -- --scope evento-A`,
que es lo que `docs/05-prover.md` indica al final de su sección 5, en vez de
descartar los cambios con git.

**La primera verificación cuesta 40 veces más que las siguientes** (320 ms contra
8 ms) porque ffjavascript construye la curva BN254 en la primera llamada. Si
hubiera reportado solo el primer número, el documento diría que validar sale
320 ms, que es cuarenta veces el costo real por persona en una cola. Por eso
agregué `--cronometrar N`, que repite la verificación en el mismo proceso y
reporta el caliente aparte. Es el mismo problema que T06 resolvió descartando la
corrida de calentamiento.

**Leer el sobre binario tarda 342 ms y el JSON 1 ms**, y no es que el binario sea
lento: es que `deserializarPrueba` construye la curva, así que paga lo mismo que
pagaría después la verificación. Con el JSON la curva la construye
`groth16.verify`. El total del comando es el mismo por los dos caminos.

**La lista `estadisticas` de `scripts/prover.mjs:92` me hubiera servido** para
resumir las repeticiones de `--cronometrar`, pero moverla a `lib/` habría
corrido todas las líneas de `prover.mjs` y `docs/05-prover.md` la cita por
`archivo:línea` en una docena de lugares. Resolví con tres líneas —promedio,
mínimo y máximo, sin desvío ni mediana— adentro del validador. Si alguien toca el
prover en el futuro, esa función merece vivir en `lib/estadisticas.mjs` y que los
dos la usen.

## Qué dejo pendiente o candidato a ADR

**Candidata a ADR: quién arma las señales públicas.** Hoy la prueba trae la raíz
y el scope, y la puerta los compara con los suyos. La alternativa es que el sobre
traiga solo la prueba y el nulificador (160 bytes en vez de 224) y que la puerta
arme las señales con sus propios valores antes de verificar. El chequeo 1 deja de
ser un `if` que alguien puede olvidarse de escribir: pasa a ser estructural,
porque la raíz ajena nunca entra al programa. Es la defensa más fuerte contra el
ataque que demuestra esta tarea, y cambia el formato del sobre, así que toca al
prover y al QR de ADR-011.

**Candidata a ADR: cuántas raíces vigentes tolera una puerta.** Hoy conoce una
sola. Si el organizador publica una raíz nueva después del provisionamiento, la
puerta rechaza compradores legítimos y no tiene cómo enterarse. Una lista de
raíces vigentes con vencimiento resuelve eso y abre la pregunta de quién revoca y
cuándo.

**Candidata a ADR, ya abierta como ADR-009: cómo se sincronizan las listas.** T08
la va a convertir en una prueba automática. Las opciones y qué se pierde con cada
una están en la sección 4 del documento.

**Pendiente para T08**: la suite de siete casos. Esta tarea dejó los comandos y
los códigos de salida (0 aceptada, 2 rechazada, 1 error) para que se puedan
scriptear, y los artefactos del ataque quedan en `salidas/ataque/`.

**Pendiente, no de esta tarea**: `nulificadores.json` se reescribe entero, así
que un corte de luz en el medio lo deja inválido. Un molinete real necesita
escritura durable. Está en la sección 4 del documento.
