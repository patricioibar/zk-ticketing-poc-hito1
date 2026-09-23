# Contexto fijo — leer entero antes de ejecutar cualquier tarea

Este archivo es corto a propósito. Es lo único que un agente efímero necesita
saber además de su propia tarea. **No leas `PLAN.md` entero**: leé solo la sección
de la tarea que te asignaron y los archivos que esa sección lista.

## Qué es esto

Una PoC mini del Trabajo Profesional del Equipo 211 (FIUBA): ticketing con
entradas NFT, privacidad con pruebas de conocimiento cero y validación offline en
la puerta. Esta PoC no es el sistema: es un ejercicio del Hito 1 para entender el
mecanismo central y medir dos números.

El mecanismo central, en una oración: **probar que tenés una entrada válida de un
conjunto, sin revelar cuál es ni qué billetera la controla, y que esa entrada no
se pueda usar dos veces.**

Las piezas: un árbol de Merkle de compromisos (la raíz es pública), una prueba de
pertenencia a ese árbol (el secreto y la hoja quedan privados), y un nulificador
`Poseidon(secreto, scope)` que es determinista por evento y no revela nada.

## Objetivo que manda

Patricio tiene que **aprender** de esto. El código es el vehículo. Una tarea que
deja código funcionando y documentación floja está mal hecha. Ante la duda entre
más funcionalidad y más entendimiento, gana el entendimiento.

Patricio tiene experiencia fluida con git y terminal, y ninguna con ZK ni con
agentes. Escribile a ese nivel: sin condescendencia sobre lo que ya sabe, sin dar
por sabido nada de criptografía.

## Reglas heredadas del repo de docs (`../zk-ticketing-docs/AGENTS.md`)

- **Rigor.** No inventes cifras, citas ni benchmarks. Un dato sin fuente primaria
  verificada lleva `[a verificar]`. Los números de esta PoC se **miden**, no se
  estiman: si no lo corriste, no lo escribas como resultado.
- **Español rioplatense**, formal pero directo. Sin relleno. Prosa por defecto;
  listas solo cuando el contenido las pide. Fechas AAAA-MM-DD.
- **No tomes decisiones de arquitectura del TPF.** Si aparece una, anotala en tu
  bitácora como "candidata a ADR" y seguí. Las decisiones se registran en el repo
  de docs, no acá.
- **Distinguí siempre "es NFT" de "es ZK".** Autenticidad, regalías, tope de
  reventa y anti-falsificación los da el contrato. Lo único que da el ZK es no
  poder saber cuál de los compradores es el que está entrando. Si en un doc te
  apoyás en una ventaja de NFT como si fuera de ZK, está mal.
- **Git**: rama y commit sí; `push` nunca, eso lo hace Patricio. Los commits
  asistidos llevan el trailer `Asistido-por: <herramienta>`.

## Plantilla obligatoria de `docs/<componente>.md`

Toda tarea que produce código produce su doc con estas seis secciones, en este
orden y con estos títulos:

```
# <Componente>

## 1. Qué hace
Una o dos oraciones. Sin jerga sin explicar.

## 2. Cómo lo hace
Recorrido del código en orden de ejecución, citando `archivo:línea`.
Las partes no obvias se explican línea por línea.

## 3. Por qué está hecho así
La razón de cada decisión no evidente. Si la razón es "porque el documento de
Agustina lo dice", decilo y explicá qué problema evita.

## 4. Qué podrías cambiar
Las piezas intercambiables de este componente. Para cada una: alternativa,
qué se gana, qué se pierde, y qué archivos habría que tocar.

## 5. Probalo vos
Comandos exactos y qué deberías ver. Incluí al menos una rotura deliberada:
cambiá esto y mirá cómo falla.

## 6. Qué NO hace
Los límites honestos de esta pieza, y con qué ADR o frente del TPF se engancha.
```

## Plantilla de `bitacora/TNN-<slug>.md`

```
---
tarea: TNN
fecha: AAAA-MM-DD
estado: hecha | bloqueada
---

## Qué se hizo
## Decisiones que tomé y por qué
## Con qué me tropecé
## Qué dejo pendiente o candidato a ADR
```

## Convenciones de código

- Node con ESM (`.mjs`), sin TypeScript: se lee más rápido y la PoC es chica.
- Nombres de dominio en español (`organizador`, `nulificador`, `compromiso`,
  `raiz`, `camino`, `scope`), términos técnicos establecidos en su idioma
  (`witness`, `zkey`, `ptau`, `Merkle`, `Groth16`).
- Todo comando del proyecto se expone como `npm run <algo>`. Nada de comandos
  largos que haya que recordar.
- Comentarios en el código: solo donde la intención no se lee sola. La
  explicación larga va en `docs/`, no en el código.

## Al terminar tu tarea

1. Corré la verificación que la tarea pide y pegá la salida real en la bitácora.
2. Escribí `docs/<componente>.md` y `bitacora/TNN-<slug>.md`.
3. Actualizá `estado.json`: tu tarea a `hecha` (o `bloqueada` con motivo).
4. Commit con mensaje `TNN: <qué hiciste>` y el trailer `Asistido-por`.
5. No empieces la tarea siguiente. Una tarea, un agente.
