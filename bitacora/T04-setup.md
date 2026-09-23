---
tarea: T04
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`scripts/setup-groth16.mjs`, expuesto como `npm run setup`, corre la ceremonia
completa de Groth16 para `circuitos/pertenencia.circom` y deja todo en
`build/setup/`: fase 1 (Powers of Tau de 2^12) con dos contribuciones y un beacon,
`prepare phase2`, fase 2 con su contribución y su beacon, `verification_key`
exportada, y las verificaciones de snarkjs de las dos cadenas. El script compila el
circuito si no lo encuentra, así que corre sobre un clon limpio.

Además genera una prueba de control con esa `zkey` y la somete a dos tests
negativos: verificarla contra la `verification_key` de otra ceremonia del mismo
circuito, y verificarla con el nulificador alterado en uno. Las dos dan que no.

`docs/03-setup.md` con las seis secciones.

Tiempos de la corrida del 2026-09-23 (Intel Core i5-14400F, 16 hilos, 16 GB,
Windows 11 Pro 10.0.26200, node v20.19.2, snarkjs 0.7.6). Salida real de la
corrida final, con `build/` borrado de antemano para comprobar que regenera todo
desde cero; sin las advertencias de descriptores de archivo de snarkjs:

```
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
```

La ceremonia entera son 52,8 s, de los cuales `prepare phase2` se lleva 35,8. El
nulificador coincide con el que imprimió T03, así que la prueba criptográfica está
hablando del mismo cálculo.

Esos 351 ms de generación y 45 ms de verificación **no son MED-001**: una sola
corrida, sin repeticiones, en una máquina de escritorio. Están en el doc marcados
como orden de magnitud.

## Decisiones que tomé y por qué

**2^12 para el ptau.** No lo elegí a ojo: es la misma cuenta que hace snarkjs en
`node_modules/snarkjs/src/zkey_new.js:59`, `floor(log2(2513 + 2 + 1)) + 1 = 12`. El
script la recalcula del `.r1cs` en cada corrida y aborta si la constante no
alcanza, en vez de confiar en un número escrito a mano.

**Guarda propia para el tamaño del ptau.** Porque snarkjs falla en silencio:
`zKey.newZKey` con un ptau chico devuelve `-1`, escribe el mensaje solo si le pasás
un logger (el script pasa `null` para que la salida sea legible) y deja un `.zkey`
de cero bytes. Lo medí; la salida está en la sección 5 del doc. Sin la guarda, el
error aparecería en T06 con un mensaje que no habla del ptau.

**Beacon con una constante inventada, y dicho en el doc.** Un beacon necesita una
fuente pública impredecible para servir de algo. Preferí dejar el paso con su forma
completa y marcar explícitamente que es decorativo, antes que omitirlo y que la
ceremonia quedara sin el paso que la cierra.

**Segunda `zkey` generada dentro del mismo script.** La demostración pedida —una
prueba que falla contra la `verification_key` de otra ceremonia— necesita dos
ceremonias de fase 2 del mismo circuito. Que las dos salgan de la corrida normal
hace que la demostración se rehaga sola cada vez, en vez de ser una captura de
pantalla que envejece.

**Funciones del árbol duplicadas de `scripts/circuito-pertenencia.mjs`.** La
alternativa era extraerlas a un módulo común, pero eso mueve líneas en el script de
T03 y `docs/02-circuito.md` lo cita por número de línea en cinco lugares. Preferí
treinta líneas repetidas antes que documentación que apunta al renglón equivocado.
Está anotado abajo como pendiente.

**Todo a `build/setup/`, nada commiteado.** `.gitignore` ya excluía `*.ptau`,
`*.zkey` y `build/` entero. Lo dejé así y el script regenera todo, incluida la
compilación del circuito. La consecuencia queda escrita en el doc porque va a morder
a alguien: cada corrida produce una `zkey` y una `verification_key` distintas, así
que las pruebas de una corrida no verifican contra la clave de otra.

## Con qué me tropecé

**El fallo silencioso de `newZKey`.** Ya está arriba. Lo encontré buscando qué
mensaje de error mostrar en la rotura deliberada del doc y resultó que no había
ninguno: el archivo de cero bytes es todo lo que queda.

**Cambiar el circuito sin rehacer el setup no siempre falla.** Era lo que esperaba
documentar en una línea y resultó tener dos mitades opuestas, las dos medidas:

- Saqué la línea 38 del circuito (la binariedad de los índices), compilé la
  variante aparte y probé con la `zkey` vieja. `zkey verify` contra el `.r1cs`
  nuevo dice `INVALID: Circuit does not match`, como corresponde. Pero
  `groth16.prove` con la `zkey` vieja y el witness del circuito nuevo **genera una
  prueba que verifica**: la `zkey` codifica el sistema viejo y el witness honesto
  también lo satisface. O sea que si agregás una restricción de seguridad y no
  rehacés la fase 2, el sistema sigue andando y la restricción nueva no se aplica,
  sin ninguna señal de que algo esté mal.
- Si el cambio agrega o saca una **señal**, en cambio, falla ruidosamente:
  `Invalid witness length. Circuit: 2518, witness: 2519`.

El caso silencioso es el peligroso y es el más común. Quedó en la sección 5 del doc
con las dos salidas reales.

**Que el residuo tóxico rompe la solidez y no la privacidad.** Al escribir la
sección 3 me di cuenta de que la formulación intuitiva ("el que lo tiene rompe el
sistema") es imprecisa y que la precisión juega a favor del proyecto: quien tiene
el residuo puede fabricar entradas, y no puede saber cuál de los compradores entró.
Ataca lo que en este sistema aporta el contrato, no lo que aporta el ZK. Sigue
siendo la objeción más grave, pero conviene responderla con esa distinción hecha.

## Qué dejo pendiente o candidato a ADR

**Candidato a ADR: de dónde sale la fase 1.** Generar el ptau localmente es lo
correcto para una PoC didáctica y es insostenible para un despliegue. La respuesta
estándar es usar un ptau de una ceremonia pública con cientos de participantes
(Perpetual Powers of Tau), y eso es una dependencia externa que hay que elegir,
verificar y registrar. Se engancha con ADR-008 y con `kb/objeciones-jurado.md`.

**Candidato a ADR: Groth16 con ceremonia por circuito contra un setup universal.**
PLONK, fflonk y UltraHonk eliminan la fase 2 y con ella la mitad de este problema,
a cambio de pruebas más grandes y verificación más cara. La decisión depende de dos
números que la PoC todavía no midió —tamaño de la prueba contra lo que entra en un
QR, y costo de verificación on-chain—, así que no se puede cerrar ahora. Es lo que
`kb/objeciones-jurado.md` ya anota como respuesta posible.

**Pendiente técnico: unificar las funciones del árbol.** `armarArbol` y `caminoDe`
están en dos scripts. El lugar donde corresponde que vivan es el organizador de
T05; cuando esa tarea las escriba de verdad, este script y el de T03 deberían pasar
a importarlas.

**Pendiente de despliegue: dónde vive la `verification_key`.** Hoy es un archivo en
un directorio ignorado por git que cambia en cada corrida. T07 y T10 necesitan una
clave fija y versionada. Es una decisión que corresponde tomar cuando exista el
validador, no antes.

**Lo que esta tarea no hizo a propósito:** no midió el costo de probar (es MED-001,
va en T06) y no ejecutó ninguna de las cuatro cosas que harían segura a la
ceremonia. Están enumeradas en la sección 3 del doc, y todas son logística, no
investigación.
