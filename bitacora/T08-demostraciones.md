---
tarea: T08
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`npm test` corre los siete casos del plan como una suite ejecutable y sale con 0
si los siete dan lo esperado. Un archivo nuevo, `scripts/demostraciones.mjs`, y
una línea en `package.json`. Nada más se tocó: ni el prover, ni el validador, ni
las librerías.

La suite no reimplementa ningún chequeo. Corre los comandos de verdad
—`organizador.mjs`, `prover.mjs`, `provisionar-puerta.mjs`, `validador.mjs`— como
procesos separados, igual que los correría una persona, y lee el código de salida
(0 acepta, 2 rechaza, 1 no pudo trabajar) y el veredicto que el validador ya
imprime. Los dos casos que no pasan por la puerta —el del nulificador con otro
scope y el del secreto intruso— usan `lib/merkle.mjs`, `lib/campo.mjs` y el
`.wasm` del circuito directamente.

El documento es `docs/07-demostraciones.md`, con las seis secciones de la
plantilla.

### La salida real de `npm test`

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

Caso 1 - una entrada legitima entra por la puerta A1

  esperado    PASE (codigo 0), los 4 chequeos OK
  obtenido    PASE (codigo 0), 4/4 chequeos OK
              la lista de la puerta demo-a1 quedo con 1 nulificador
  muestra     los cuatro chequeos dan bien y la puerta anota el nulificador sin saber de quien es

  OK

Caso 2 - la misma prueba, otra vez, en la misma puerta

  esperado    RECHAZADA en el chequeo 4 (nulificador), codigo 2
  obtenido    RECHAZADA en el chequeo 4 (nulificador), codigo 2
              la lista de la puerta demo-a1 sigue con 1 nulificador: un rechazo no anota nada
  muestra     el nulificador es lo que hace reconocible el segundo uso, sin identificar a nadie

  OK

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

Caso 5 - una prueba del evento B en una puerta del evento A

  esperado    RECHAZADA en el chequeo 2 (scope), codigo 2, con el chequeo 1 en OK
  obtenido    RECHAZADA en el chequeo 2 (scope), codigo 2, chequeo 1 (raiz) OK
              la raiz coincide porque las mismas ocho personas compraron para los dos eventos:
              sin el chequeo del scope, la misma identidad entraria una vez por evento
  muestra     el chequeo 1 no la atrapa —el padron es el mismo— y el chequeo 2 si

  OK

Caso 6 - un sobre con un byte alterado

  esperado    RECHAZADA en el chequeo 3 (cripto), codigo 2, con los chequeos 1 y 2 en OK
  obtenido    RECHAZADA en el chequeo 3 (cripto), codigo 2, chequeos 1 y 2 OK
              se altero el byte 159: el menos significativo del nulificador
              la raiz y el scope siguen siendo los correctos, asi que los dos primeros pasan
  muestra     verificar Groth16 es una ecuacion entre la prueba y sus senales: cambiar una rompe la igualdad

  OK

Caso 7 - un secreto que no esta en el arbol no llega a generar prueba

  esperado    snarkjs.wtns.calculate tira: el circuito no encuentra un witness que satisfaga sus restricciones
  obtenido    tiro Error: Assert Failed. Error in template Pertenencia_145 line: 57
              el circuito dijo: ERROR:  4 Error in template Pertenencia_145 line: 57
              la linea 57 de circuitos/pertenencia.circom es la que compara la raiz calculada
              con la raiz publica: es esa restriccion la que no cierra
              salidas/demostraciones/intruso.wtns quedo en 0 bytes: snarkjs abre el archivo antes de calcular
              no hay prueba que presentar: el atacante no llega a la puerta
              el prover (npm run probar) lo corta todavia antes, comparando Poseidon(secreto)
              con la hoja del padron; la suite pasa por abajo de esa guarda para mostrar que
              quien rechaza es el circuito y no el script
  muestra     este es el unico caso que no falla en la puerta: falla antes, en el telefono del atacante

  OK

Resumen

  OK     1  una entrada legitima entra por la puerta A1
  OK     2  la misma prueba, otra vez, en la misma puerta
  OK     3  la misma prueba entra por la puerta A2
  OK     4  la misma identidad con otro scope da otro nulificador
  OK     5  una prueba del evento B en una puerta del evento A
  OK     6  un sobre con un byte alterado
  OK     7  un secreto que no esta en el arbol no llega a generar prueba

  7 de 7 casos dan lo esperado.

  detalle en salidas/demostraciones/resultado.json

  Lo que el ZK NO resuelve: el caso 3. Dos puertas sin canal entre ellas dejan
  pasar la misma entrada dos veces, y eso es el frente ADR-009 del TPF.
  Lo que el ZK SI resuelve: en los siete casos la puerta decidio sin aprender
  cual de las ocho identidades tenia adelante.

Ver docs/07-demostraciones.md.
```

### La comprobación de idempotencia

```
$ npm test > final1.txt 2>&1; echo "exit1=$?"
exit1=0
$ npm test > final2.txt 2>&1; echo "exit2=$?"
exit2=0
$ diff final1.txt final2.txt && echo "DIFF VACIO"
DIFF VACIO
$ git status --short
 M package.json
?? docs/07-demostraciones.md
?? scripts/demostraciones.mjs
```

Dos corridas seguidas dan salida idéntica byte a byte y las dos salen con 0. Las
pruebas Groth16 son distintas en cada corrida —el protocolo las aleatoriza— pero
nada de lo que la suite informa depende de esos bytes. `git status` tampoco
cambia: `datos/` queda republicado en el evento A, con los mismos secretos
deterministas y la misma raíz. La corrida tarda unos 11 segundos en la máquina de
`docs/05-prover.md`.

## Decisiones que tomé y por qué

**Procesos separados y no llamadas a la librería.** Cada caso que involucra a la
puerta corre `scripts/validador.mjs` como proceso aparte y lee su código de
salida. Llamar a `correrChequeos` desde adentro de la suite habría sido más
rápido, pero las dos puertas compartirían memoria y el caso 3 —el agujero de
coordinación— dejaría de demostrar nada real. Además así se ejercitan cosas que
una llamada directa no toca: la lectura de los dos formatos de sobre, el chequeo
del orden de señales grabado en la puerta y la jaula de red.

**Puertas propias, borradas al arrancar.** La suite usa `demo-a1` y `demo-a2`, no
las puertas 1 y 2. Borra sus directorios al empezar y las provisiona de nuevo. Es
lo que la hace idempotente, y de paso deja intacto el estado de las puertas que se
usan a mano siguiendo `docs/06-validador.md`. Descarté la alternativa de una
variable de entorno con el directorio raíz de puertas: obligaba a tocar
`lib/puerta.mjs` —que `docs/06-validador.md` cita por número de línea— y agrega una
perilla de configuración para un problema que se resuelve cambiando un nombre.

**El byte alterado se altera en las señales, no en la prueba.** Ver el tropiezo de
abajo. En corto: alterar un byte de la prueba da tres resultados distintos según
qué byte y según qué prueba, y uno de los tres cuelga la corrida.

**El caso 7 pasa por abajo de la guarda del prover.** `npm run probar` corta antes
de llegar al circuito, comparando `Poseidon(secreto)` con la hoja del padrón. Esa
guarda está bien, pero si el caso la usara estaría demostrando que un script
valida sus entradas. Lo que hay que mostrar es que rechaza **el circuito**, que es
lo único que el atacante no puede reescribir. Por eso la suite llama directamente
a `snarkjs.wtns.calculate` y espera el assert del wasm.

**"Sin relación visible" y no "independientes".** El caso 4 compara dos
nulificadores de la misma identidad con distinto scope. Lo que se puede afirmar
mirando dos números es que son distintos, que no comparten ni un dígito
hexadecimal de prefijo, y que cada uno es exactamente `Poseidon(secreto, scope)`
recalculado afuera del circuito. Que sean invinculables es una propiedad de
Poseidon y esta PoC no la demuestra: no lo escribí.

**El informe imprime el esperado antes que el obtenido.** Una suite que solo dice
"OK" no enseña nada, y acá la salida es parte del entregable.

## Con qué me tropecé

**El byte alterado de la prueba comprimida puede colgar la lectura del sobre.**
Empecé el caso 6 alterando un byte de la prueba, que es lo que el enunciado
sugiere. Sobre una misma prueba binaria comprimida (128 bytes de prueba + 96 de
señales) probé doce posiciones, una por corrida:

| Posición | Punto | Qué pasó |
|---|---|---|
| 0, 5, 10 | `pi_a` (G1) | descomprime a otro punto válido; `verify` da `false` |
| 20 | `pi_a` (G1) | `leerSobre` no volvió (cortado a los 15 s) |
| 40, 60 | `pi_b` (G2) | descomprime; `verify` da `false` |
| 70, 90 | `pi_b` (G2) | `RuntimeError` del wasm de ffjavascript |
| 96, 100, 120 | `pi_c` (G1) | `leerSobre` no volvió (el 100, cortado a los 150 s) |
| 110 | `pi_c` (G1) | descomprime; `verify` da `false` |

Como Groth16 aleatoriza cada prueba, el byte 20 de hoy no es el byte 20 de mañana:
un caso así sería no determinista y a veces colgaría la suite entera. Terminé
alterando el byte menos significativo del nulificador, que siempre cae en el
chequeo 3 con los dos primeros en OK. La explicación probable —una descompresión
que pide una raíz cuadrada modular que no existe para esa `x`— es una lectura de
los síntomas, no del código de ffjavascript, y quedó marcada `[a verificar]` en el
documento.

**El caso 7 dejaba un `intruso.wtns` de 0 bytes.** Mi primera condición era que el
archivo de witness no existiera. Falló: snarkjs abre el archivo de salida antes de
calcular, así que queda vacío. Cambié la condición a que exista con cero bytes,
que además es más precisa: que el archivo aparezca no significa que haya witness.

**`circom_runtime` imprime su propio `ERROR:` con `console.log`.** Salía suelto en
medio del informe. La suite lo captura durante la llamada y lo muestra como parte
del caso, con el prefijo `el circuito dijo:`. Se reubica, no se esconde.

**El orden de los eventos importa.** El organizador publica una raíz por vez en
`datos/raiz.json`. Hay que generar el evento B primero y el A después, para que el
repositorio quede como estaba y `git status` no muestre nada.

**La idempotencia rota, que era el encargo.** Verificado a mano que sin el borrado
la primera corrida da 7 de 7 y la segunda da 5 de 7: fallan el caso 1 y el caso 3,
los dos por doble ingreso. Lo importante es por qué no alcanza con regenerar la
prueba: el nulificador es `Poseidon(secreto, scope)` y una prueba nueva, con bytes
completamente distintos, trae **el mismo nulificador**. Lo comprobé con los
comandos sueltos y quedó como rotura deliberada en la sección 5 del documento.

## Qué dejo pendiente o candidato a ADR

**Candidato a ADR: tiempo máximo y aislamiento al leer un sobre en la puerta.** Un
sobre corrupto puede dejar la lectura sin volver. En la puerta de un estadio eso
es un molinete trabado, y no hace falta un atacante: alcanza con un QR mal
impreso. Las defensas habituales —un timeout por sobre y descomprimir en un
proceso que se pueda matar— son ingeniería de sistemas, pero la decisión de
tomarlas y de cuánto tiempo dar toca el presupuesto de **ADR-004**. Conviene
verificar antes si la implementación de referencia que se use en producción
(arkworks, rapidsnark) tiene el mismo comportamiento: `[a verificar]`.

**Candidato a ADR: contrato de salida del validador.** Hoy la suite depende del
texto que imprime `scripts/validador.mjs`. Cuando el molinete sea un servicio y no
un comando va a hacer falta una salida estructurada (`--json` con veredicto,
chequeos y tiempos). No lo hice porque cambiar el validador estaba fuera del
encargo.

**Para T09**: la suite no debería cambiar cuando la raíz salga de un contrato. Lo
que cambia es de dónde la descarga la puerta al provisionarse. Si `npm test`
tuviera que cambiar para que T09 pase, es señal de que la escalera se rompió.

**Queda sin demostrar acá**: el ataque del árbol propio, que tiene su propio
comando (`npm run ataque:raiz-propia`) y su sección en `docs/06-validador.md`. Si
alguna vez se lo suma, la suite pasa a tener ocho casos.

**No cierro ningún frente del TPF.** El caso 3 expone **ADR-009** y no lo resuelve.
Lo demás se engancha con **ADR-002**, **ADR-001**, **ADR-004** y **ADR-011**, todos
en `../zk-ticketing-docs`.
