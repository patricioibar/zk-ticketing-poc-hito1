---
tarea: T12
fecha: 2026-09-23
estado: hecha
---

## Qué se hizo

`lib/compradores.mjs`: los ocho compradores, que es la parte del sistema que la parte
base no tenía. Cada uno tiene su billetera (las cuentas 1 a 8 de la cadena local),
deriva su secreto de su propia clave privada, calcula `Poseidon(secreto)` en su lado y
manda ese número al contrato firmando él. El módulo también lee los compromisos que
llegaron —ordenados por bloque e índice de log— y escribe la bolsa de secretos que
lee el prover.

`fuentes/contrato-nft.mjs`: la tercera implementación de `fuenteDeRaiz`. Su
`leerCompromisos` es la primera que no devuelve `null`. Los dos métodos de la raíz no
están escritos ahí: se reusan los de `fuentes/contrato-raiz.mjs` sobre el contrato de
entradas, que hereda `RegistroDeRaiz`.

`fuentes/seleccion.mjs`: la rama `FUENTE=contrato-nft`.

`scripts/flujo-completo.mjs` (`npm run flujo`): la corrida narrada de punta a punta,
con doce controles. Corre organizador, prover, provisionar-puerta y validador como
procesos separados. Tiene dos variantes: la completa, que incluye la demostración de
la reventa, y `--sin-enviar N`, que monta el caso del dueño que nunca envía.

`docs/10-flujo-completo.md`, con las seis secciones.

Retoques a lo que ya existía: `asegurarDespliegue` generalizado a cualquier contrato
(nombre + argumentos de constructor, un archivo de despliegue por contrato), que es
lo que `docs/09-entrada-nft.md` dejaba anotado como trabajo de esta tarea;
`cuentaLocal` movido a `lib/cadena.mjs`; `yaConectado` en `fuentes/contrato-raiz.mjs`;
un comentario corregido en `contratos/EntradaNFT.sol:38`.

## Verificación

El criterio de la tarea: el árbol sale de la cadena y la suite de T08 pasa entera
contra esa fuente, dos veces seguidas.

```
$ FUENTE=contrato-nft npm test     (corrida 1 y corrida 2, idénticas)

  OK     1  una entrada legitima entra por la puerta A1
  OK     2  la misma prueba, otra vez, en la misma puerta
  OK     3  la misma prueba entra por la puerta A2
  OK     4  la misma identidad con otro scope da otro nulificador
  OK     5  una prueba del evento B en una puerta del evento A
  OK     6  un sobre con un byte alterado
  OK     7  un secreto que no esta en el arbol no llega a generar prueba

  7 de 7 casos dan lo esperado.
```

**No hubo que tocar el organizador, el prover ni los validadores.** `npm test` con la
fuente por defecto sigue dando 7 de 7 y `npm run contrato:nft`, 12 de 12.

```
$ npm run flujo

  hoja  token  billetera del comprador                     compromiso            bloque
     0      5  0x976EA74026E726554dB657fA54763abd0C3a0aa9  5430403240636096370315...      10
     1      0  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  1074289276230625726229...      11
     2      7  0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f  1083251489194895969416...      12
     3      2  0x90F79bf6EB2c4f870365E785982E1f101E93b906  1681328875369691083415...      13
     4      6  0x14dC79964da2C08b23698B3D3cc7Ca32193d9955  1256466661436403759651...      14
     5      1  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  2179453724548475265035...      15
     6      4  0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc  8296063138256847758141...      16
     7      3  0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  1812472575642067986412...      17

  Gas: emitir las ocho, 646.040, lo paga el organizador.
       enviar los ocho compromisos, 572.180, lo pagan los compradores, uno por uno.

Controles de la venta

  se emitieron las ocho entradas                        OK     emitidos() = 8
  llegaron los ocho compromisos                         OK     8 eventos CompromisoEnviado
  la posicion de la hoja NO es el numero de token       OK     hojas 0..7 = tokens 5,0,7,2,6,1,4,3
  el orden de las hojas es el de llegada a la cadena    OK     orden de envio 5,0,7,2,6,1,4,3
  cada hoja es Poseidon del secreto de su comprador     OK     calculado del lado del comprador

El organizador: lee la cadena, arma el arbol, publica la raiz

  el organizador NO genero ningun secreto               OK     la fuente aporto los ocho compromisos
  el padron es la cadena, hoja por hoja                 OK     8 hojas en datos/arbol.json

La puerta: la hoja 0 entra al evento

  la puerta acepta la entrada                           OK     codigo 0

La reventa: el NFT cambia de duenio y el compromiso no

  el NFT es del comprador nuevo                         OK     ownerOf(1)
  el comprador nuevo no puede poner su compromiso       OK     revirtio con CompromisoYaEnviado(1)
  la hoja sigue siendo la del vendedor                  OK     hoja 5, token 1
  el que VENDIO la entrada entra igual                  OK     codigo 0: PASE
```

El caso del dueño que no envía:

```
$ npm run flujo -- --sin-enviar 5

  entradas emitidas   8
  compromisos en la cadena   7

  el organizador no arma el arbol                       OK     salio con codigo 1
  y dice por que                                        OK     armarArbol: se esperaba una potencia de dos de hojas
                                                               y llegaron 7. Un arbol incompleto necesita una hoja
                                                               de relleno definida, y eso es una decision, no un default.
```

## Decisiones que tomé y por qué

**El orden de las hojas es el de llegada de las transacciones, no el `tokenId`.** Es
lo que pedía la tarea y contradice el paréntesis de la regla 4 de la interfaz
(`docs/04-organizador.md`, sección 3: "leerlos por índice de emisión, no por el orden
de un evento indexado"). Lo que esa regla protege —que dos lecturas den el mismo
orden— se sigue cumpliendo, porque `(bloque, índice del log)` es un orden total y
estable. Lo que se gana es que el organizador, que es el que emite, no elija la
posición de nadie en el árbol. Lo que se paga es fragilidad frente a
reorganizaciones, nodos podados e indexadores, y está escrito en la sección 3 del
documento. Es candidato a ADR. El orden de envío está salteado a propósito para que
la diferencia se vea en la tabla y no haya que creerla.

**El secreto de cada comprador se deriva de su clave privada, no es aleatorio.** Se
gana reproducibilidad (la misma raíz en cualquier máquina) y no hace falta persistir
nada. Se pierde el modelo real y hay que decir en voz alta que, como las claves de la
cadena local son públicas, estos secretos también lo son: lo demostrado es el
recorrido de la información, no su confidencialidad. Está en la sección 3 y la
alternativa, en la 4.

**La fuente monta el mundo si la cadena se reinició.** Construir `fuenteContratoNft`
despliega, emite y manda los compromisos que falten. Es el mismo criterio que
`asegurarDespliegue` desde T09, y es lo único que permite que `FUENTE=contrato-nft npm
test` siga siendo un comando: la suite reinicia la cadena en cada corrida y se lleva
puesto el contrato. El costo es que la fuente hace más de lo que la interfaz dice, y
está anotado como cosa a separar en la sección 4.

**Cero compromisos tira un error en vez de devolver `null`.** Devolver `null` haría
que el organizador se inventara ocho secretos sin que nadie se entere, que es lo
contrario de lo que esta tarea busca.

**Reusar los métodos de raíz de T09 en vez de copiarlos.** Costó un parámetro
(`yaConectado`) en `fuentes/contrato-raiz.mjs`, y deja las reglas de la raíz escritas
en un solo lugar.

## Con qué me tropecé

**`Number("")` es 0.** La omisión de un comprador viaja por la variable de entorno
`FLUJO_SIN_ENVIAR`, y el parseo hacía `split(",").map(Number).filter(Number.isInteger)`:
con la variable vacía eso da `[0]`, así que el token 0 no mandaba su compromiso en
**ninguna** corrida. El síntoma apareció lejos de la causa —siete hojas en vez de
ocho, al armar el árbol—, que es exactamente lo que este repositorio viene evitando
con las guardas ruidosas. El filtro de vacíos va antes del `Number`, y el comentario
de `lib/compradores.mjs:122` lo explica para que nadie lo "simplifique" de nuevo.

**Los números de línea que citan los documentos.** `docs/08-contrato-raiz.md` cita
nueve líneas de `lib/cadena.mjs` y cuatro de `fuentes/contrato-raiz.mjs`, así que
generalizar `asegurarDespliegue` se hizo con cuidado de no correr ninguna línea citada
(la firma cambió sin agregar líneas, y las funciones nuevas están al final del
módulo). Las dos citas de `fuentes/seleccion.mjs` sí se corrieron, y las actualicé.
Es una fragilidad conocida del formato: los documentos citan `archivo:línea` y eso
envejece con cualquier edición. Vale la pena discutir en T14 si conviene citar
funciones en vez de líneas.

**La fecha de los artefactos es UTC.** Correr el organizador después de las 21:00
hora local escribe `"generado": "<mañana>"` en `datos/arbol.json`, porque sale de
`new Date().toISOString()`. No rompe nada, pero ensucia `git status` sin motivo
aparente, que es justo lo que T11 había terminado de limpiar. Si molesta, es una
línea en `scripts/organizador.mjs`.

**Cambiar un comentario cambió el gas de despliegue.** `EntradaNFT` pasó de 2.341.162
a 2.341.174 por corregir dos líneas de comentario. Lo comprobé: los dos bytecodes
miden lo mismo y son idénticos salvo los últimos 43 bytes —el hash de metadatos que
`solc` agrega y que cubre el código fuente completo, comentarios incluidos—, y entre
las dos versiones un byte pasa de cero a distinto de cero: 16 − 4 = 12. Actualicé el
número en `docs/09-entrada-nft.md` con la explicación medida.

## Qué dejo pendiente o candidato a ADR

- **La reventa rompe la entrada, y ahora está demostrado de punta a punta.** El
  vendedor entra con su prueba y el comprador nuevo no puede generar ninguna. Toca
  **ADR-005** (reventa, regalías y tope de precio) y necesita decidir qué pasa con un
  compromiso ya publicado en la raíz. No lo resolví: es del TPF.
- **Qué hacer con las hojas que faltan** cuando alguien no manda su compromiso:
  rellenar (y con qué valor), cerrar la inscripción, o cambiar la profundidad. Las
  tres tienen costo y ninguna es un default. Engancha con altas y bajas del padrón.
- **El orden de las hojas**: llegada contra índice de emisión, con el argumento de las
  dos secciones 3 y 4. Candidato a ADR.
- **La custodia del secreto** (**ADR-012**): acá se deriva de la clave privada, que es
  la decisión más cómoda y la que menos se parece al sistema real.
- **El vínculo billetera ↔ compromiso** sigue público y ahora son ocho pares en vez de
  tres. Es **T13** y no lo toqué.
- **Separar la fuente de la venta**: `npm run compradores` aparte y una fuente que solo
  lea. Hoy la fuente monta el mundo porque la cadena local es volátil.
