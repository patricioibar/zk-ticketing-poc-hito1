---
tarea: T06
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`npm run probar -- --identidad 3 --scope evento-A` genera una prueba Groth16 de
pertenencia al árbol del evento, la verifica, la serializa de cuatro maneras y mide
tiempo y tamaño sobre varias corridas. Archivos nuevos: `scripts/prover.mjs`,
`lib/prueba-binaria.mjs` y `docs/05-prover.md`. Archivos tocados: `lib/campo.mjs`
(una función nueva), `scripts/organizador.mjs` (tres líneas), `package.json`,
`AGENTS.md` y `datos/` regenerado para el evento `evento-A`.

Se reutilizó todo lo que dejó T05: `lib/merkle.mjs` para el árbol y el camino,
`lib/campo.mjs` para la validación de rango y `fuentes/json.mjs` para leer la raíz
publicada. No se duplicó nada del árbol.

### Los dos números

Salida real del comando, `2026-09-23`, **Intel Core i5-14400F (16 hilos lógicos),
15,8 GB de RAM, Windows 11 (win32 10.0.26200 x64), Node v20.19.2, snarkjs 0.7.6**:

```
  1 corrida de calentamiento + 10 medidas
  calentamiento     witness 46.9 ms + prueba 404.9 ms (descartada)

  witness              38.4 ms +/- 1.8 ms     mediana   38.5 ms   [35.9 ms .. 40.3 ms]
  prueba Groth16      119.1 ms +/- 8.2 ms     mediana  119.7 ms   [106.7 ms .. 128.9 ms]
  total               157.5 ms +/- 8.2 ms     mediana  159.4 ms   [144.8 ms .. 169.1 ms]
```

```
  JSON minimizado (sin espacios), que es lo mejor que da el JSON
    prueba                           725 bytes
    senales                          239 bytes
    sobre completo                   964 bytes
  Binario, elementos de campo crudos
    prueba sin comprimir             256 bytes
    prueba comprimida                128 bytes
    3 senales publicas                96 bytes
    sobre comprimido completo        224 bytes
    solo prueba + nulificador        160 bytes

  la prueba reconstruida desde los bytes verifica   si (comprimida y sin comprimir)
```

```
  sobre binario comprimido         224 bytes   entra, con 13.2x de margen
  el mismo en base64               300 bytes   entra igual
  sobre JSON minimizado            964 bytes   entra
```

**Esto no es MED-001.** MED-001 pregunta por teléfonos de gama media y esto corre
en una PC de escritorio. El tiempo es una cota de referencia; el tamaño sí es
definitivo, porque 224 bytes son 224 bytes en cualquier máquina.

### Variabilidad entre invocaciones

Cinco invocaciones del comando con la máquina tranquila dieron promedios totales de
155,0, 155,5, 156,3, 157,5 y 161,2 ms, con desvíos de 8 a 15 ms. Con otra carga
encima, corridas idénticas dieron promedios de hasta 397,5 ms (desvío 53,5 ms,
máximo 527,8 ms): dos veces y media más lento sin cambiar una línea. El piso de
ruido de una medición de rendimiento en un escritorio con su carga normal es del
orden del 150%, y eso vale la pena tenerlo escrito antes de comparar primitivas o
profundidades entre sí.

### Verificación

`npm run probar -- --identidad 3 --scope evento-A` sale con código 0 y comprueba,
en la misma corrida: que el árbol recalculado desde el padrón dé la raíz que
publicó la fuente; que `Poseidon(secreto)` sea la hoja del padrón; que el camino
llegue a la raíz; que el nulificador del circuito sea el de circomlibjs; que las
señales públicas 1 y 2 sean la raíz publicada y el scope pedido; que la prueba
verifique contra la `verification_key`; que las 10 pruebas sean distintas entre sí;
y que la prueba reconstruida desde los bytes —comprimida y sin comprimir— vuelva a
verificar.

Roturas deliberadas probadas, las tres con código de salida 1 y mensaje que dice la
causa: padrón editado (la raíz recalculada no da la publicada, corta antes de
generar nada), evento nunca publicado (`leerRaiz` devuelve `null`), identidad fuera
del padrón.

## Decisiones que tomé y por qué

**Medir las dos serializaciones en serio, y demostrar la equivalencia en vez de
afirmarla.** El binario se reconstruye y se vuelve a verificar en cada corrida. Sin
eso, "128 bytes" sería una cuenta, no una medición: nada garantizaría que esos
bytes alcancen para rearmar la prueba.

**No escribir la compresión de puntos a mano.** Comprimir es fácil, descomprimir
exige una raíz cuadrada modular en `Fq` y en `Fq2`. Se usan
`toRprCompressed`/`fromRprCompressed` de **ffjavascript**, que es la librería que
snarkjs ya usa por debajo para `zkey` y `ptau`; no se agregó ninguna dependencia
nueva al `package.json`. Es la regla de primitivas auditadas de `AGENTS.md`.

**Elegir el formato comprimido (128 bytes) como principal y escribir igual el sin
comprimir (256).** Lo que se pierde con cada uno está en la sección 3 del doc. Lo
principal: el comprimido no lo puede consumir un verificador de Solidity, porque
descomprimir on-chain no es barato; el sin comprimir es exactamente lo que espera un
verificador Groth16 generado por snarkjs, y por eso queda disponible para T10.
Ninguno de los dos lleva metadatos —ni curva, ni protocolo, ni evento—: son bytes
que solo significan algo para quien ya sabe qué `verification_key` usar.

**Descartar la primera corrida y decirlo.** Paga el JIT del wasm y el primer acceso
a la `zkey` en disco: 405 ms contra 119 ms. Se reporta aparte en vez de promediarse
o esconderse. Lo que **no** se descarta es la lectura de la `zkey` en cada corrida,
porque `groth16.prove` la relee; eso hace que los números sean una cota superior
chica frente a una aplicación que la tuviera en memoria.

**Guardar la serie cruda en `salidas/medicion.json`.** Un promedio sin la serie no
se puede auditar. En este caso fue lo que dejó ver que las corridas lentas venían en
bloque y no repartidas, que es lo que apunta a carga externa y no a un problema del
código.

**El prover corta si el padrón no corresponde a la raíz publicada.** Podría generar
igual una prueba válida contra la raíz que recalculó; sería inútil y el validador la
rechazaría con un "no verifica" que no explica nada. Cortar donde la causa todavía
es visible vale más que producir un artefacto.

**Cambiar tres líneas de `scripts/organizador.mjs`.** Hizo falta porque el comando
que fija `PLAN.md` usa una etiqueta (`evento-A`) donde el circuito quiere un
elemento de campo, y la traducción tiene que ser **una sola** para los dos lados: si
el organizador publica la raíz bajo un número y el prover prueba bajo otro, el
síntoma aparece recién en la puerta. La función quedó en `lib/campo.mjs`
(`elementoDeScope`) y el organizador la llama. La salida por defecto de
`npm run organizador` no cambió ni un carácter: un scope numérico sigue
interpretándose tal cual, y la etiqueta solo se imprime cuando hay una.

**Regenerar `datos/` para `evento-A` y commitearlo.** Es la consecuencia de lo
anterior: el comando de "hecho cuando" pide `--scope evento-A`, y para que ande
recién clonado el repo tiene que traer publicado ese evento. `npm run organizador`
sin flags vuelve a dejar el evento 1234, y entonces hay que probar con
`--scope 1234`. Está dicho en la sección 5 del doc.

## Con qué me tropecé

**El comando del plan usa una etiqueta y el resto del repo usa el número 1234.**
Fue lo único que obligó a tocar código de otra tarea. Las alternativas eran peores:
o el prover derivaba la etiqueta por su cuenta y quedaban dos derivaciones que
pueden divergir, o había que pedirle a quien corre el comando que pegara a mano un
número de 76 dígitos.

**La medición del tiempo no era reproducible entre invocaciones hasta que quedó
claro por qué.** Las primeras tandas dieron promedios de 154 a 398 ms sin ningún
patrón aparente. Repitiendo con la máquina tranquila da 155 a 161 ms de forma
consistente. Lo que parecía ruido de la medición era carga de la máquina, y eso
terminó siendo un resultado en sí mismo: está en la sección 3 del doc.

**El tamaño del JSON no es constante.** Varía entre 722 y 725 bytes entre corridas,
porque cada prueba es distinta y los números decimales tienen distinta cantidad de
dígitos. No era lo esperado y resultó ser la mejor ilustración de por qué el JSON no
es el tamaño de la prueba: el binario da 128 bytes siempre.

**`exigirEnCampo` no se puede aplicar a las coordenadas de la prueba.** Las señales
públicas son elementos de `Fr` —el campo de `lib/campo.mjs`—, pero las coordenadas
de los puntos son de `Fq`, que es otro primo y más grande. Validarlas contra `p`
habría rechazado pruebas perfectamente válidas. Quedó documentado en
`lib/prueba-binaria.mjs:113`.

## Qué dejo pendiente o candidato a ADR

**Candidata a ADR — de dónde sale el `scope` de un evento.** Hoy es
`sha256("scope|etiqueta|intento")` con rechazo, elegido acá por necesidad operativa
y no por diseño. En el sistema real va a salir de un identificador on-chain —un
`tokenId`, la dirección del contrato de ese evento, un número de edición—, y tiene
que quedar idéntico en el circuito, el organizador, el prover, el validador y el
contrato. Es exactamente la clase de valor cuya divergencia no da error hasta la
puerta.

**Candidata a ADR — la prueba es transferible.** Cualquiera que tenga los 224 bytes
los presenta en la puerta y pasan: no hay nada que ate la prueba a quien la presenta,
ni a un momento, ni a un molinete. Alcanza con fotografiar el QR de otro y llegar
primero. Las defensas habituales —un desafío del validador que entre al circuito
como señal pública, una marca de tiempo, una firma del dispositivo— cambian el
circuito y afectan directamente a ADR-011, porque un desafío implica que el QR no
puede ser estático.

**Candidata a ADR — qué viaja en el sobre.** El sobre completo son 224 bytes, pero
la raíz y el scope el validador ya los conoce: 160 bytes alcanzarían. Se perdería
que la prueba sea autocontenida, y un validador mal configurado fallaría con "no
verifica" en vez de con "esta prueba es de otro evento". Afecta a T07 y a ADR-011.

**Pendiente de medición, no de decisión.** Tres números que este prover permite
obtener y que esta tarea no obtuvo: cuánto tarda la prueba en un navegador de
teléfono de gama media (eso **es** MED-001); cuánto tarda con profundidad 20 en vez
de 3; y cuánto pesa y tarda con PLONK en vez de Groth16. Los tres se consiguen
cambiando una pieza y volviendo a correr el mismo comando.

**No se tocó ningún ADR y no se leyó ninguno.** Las referencias a ADR-001, ADR-004,
ADR-011 y ADR-012 en `docs/05-prover.md` son por ID, como pide `AGENTS.md`. El
presupuesto de 5 s que el doc menciona sale de lo que dice `PLAN.md` sobre ADR-004,
no de haber leído ese ADR; el límite de 2953 bytes del QR sale de lo que `PLAN.md`
dice sobre ADR-011. Antes de llevar cualquiera de estos números a un entregable del
TPF hay que confirmar el estado de esos ADR con
`python3 scripts/proyecto.py decisiones` en el repo de documentación.

**El trusted setup que respalda estas pruebas no es seguro.** Lo corrió una sola
persona en una sola máquina (T04). Los tiempos y los tamaños son igual de válidos;
la garantía de solidez no.
