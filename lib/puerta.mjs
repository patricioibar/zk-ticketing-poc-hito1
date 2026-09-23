// La puerta: el estado local de un molinete y los cuatro chequeos que decide.
//
// Todo lo que una puerta sabe vive en puertas/puerta-N/ y en ningun otro lado:
//
//   configuracion.json   la raiz del evento, el scope, el orden de senales y su
//                        propia copia de la verification key. Se escribe una vez,
//                        al provisionar, que es el unico momento en que la puerta
//                        esta conectada a algo.
//   nulificadores.json   la lista de los que ya pasaron por ESTA puerta.
//
// Dos puertas no comparten nada: ni archivo, ni proceso, ni memoria. No hay
// funcion en este modulo que lea el estado de otra puerta, y eso es a proposito.
// La falta de sincronizacion tiene que ser real para que medirla signifique algo
// (ADR-002 en ../zk-ticketing-docs: la validacion offline es el eje del TPF).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { exigirEnCampo } from "./campo.mjs";
import { indiceDe } from "./senales.mjs";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FORMATO_CONFIGURACION = "puerta-provisionada@1";
export const FORMATO_USADOS = "nulificadores-usados@1";

export function directorioPuerta(puerta) {
  return join(RAIZ_REPO, "puertas", `puerta-${puerta}`);
}

export function rutaConfiguracion(puerta) {
  return join(directorioPuerta(puerta), "configuracion.json");
}

export function rutaUsados(puerta) {
  return join(directorioPuerta(puerta), "nulificadores.json");
}

export function leerConfiguracion(puerta) {
  const ruta = rutaConfiguracion(puerta);
  if (!existsSync(ruta)) return null;
  const documento = JSON.parse(readFileSync(ruta, "utf8"));
  if (documento.formato !== FORMATO_CONFIGURACION) {
    throw new Error(`${ruta}: formato desconocido "${documento.formato}".`);
  }
  exigirEnCampo(BigInt(documento.raiz), `configuracion de la puerta ${puerta}: raiz`);
  exigirEnCampo(BigInt(documento.scope), `configuracion de la puerta ${puerta}: scope`);
  return documento;
}

export function escribirConfiguracion(puerta, documento) {
  mkdirSync(directorioPuerta(puerta), { recursive: true });
  const ruta = rutaConfiguracion(puerta);
  writeFileSync(ruta, `${JSON.stringify(documento, null, 2)}\n`);
  return ruta;
}

// La lista de nulificadores de ESTA puerta. Un array en un JSON alcanza y sobra
// para ocho identidades; que en un molinete real esto sea una base embebida con
// escritura durable es un problema de ingenieria, no de criptografia, y esta
// dicho en la seccion 6 de docs/06-validador.md.
export function leerUsados(puerta) {
  const ruta = rutaUsados(puerta);
  if (!existsSync(ruta)) return [];
  const documento = JSON.parse(readFileSync(ruta, "utf8"));
  if (documento.formato !== FORMATO_USADOS) {
    throw new Error(`${ruta}: formato desconocido "${documento.formato}".`);
  }
  return documento.usados ?? [];
}

export function escribirUsados(puerta, { scope, usados }) {
  mkdirSync(directorioPuerta(puerta), { recursive: true });
  const ruta = rutaUsados(puerta);
  writeFileSync(
    ruta,
    `${JSON.stringify(
      { formato: FORMATO_USADOS, puerta, scope: String(scope), usados },
      null,
      2
    )}\n`
  );
  return ruta;
}

// --- Los cuatro chequeos, en orden ---
//
// El orden no es cosmetico. Los dos primeros comparan lo que trae la prueba
// contra lo que la puerta sabe de antes; recien el tercero mira si la prueba es
// matematicamente valida. Al reves, una prueba impecable contra un arbol que
// armo el atacante pasaria el chequeo criptografico con todas las luces verdes.
// Eso es exactamente lo que demuestra `npm run ataque:raiz-propia`.
export const CHEQUEOS = [
  {
    id: "raiz",
    critico: true,
    titulo: "la raiz es la que descargo esta puerta",
    ejecutar({ configuracion, senales }) {
      const traida = BigInt(senales[indiceDe("raiz")]);
      const propia = BigInt(configuracion.raiz);
      return {
        ok: traida === propia,
        detalle: traida === propia ? "coincide" : "otra raiz",
        comparacion: { trae: String(traida), espera: String(propia) },
        motivo:
          "La prueba viene contra otro arbol. Puede ser de otro evento, de una raiz vieja,\n" +
          "  o de un arbol que armo quien la presenta con secretos propios: una prueba\n" +
          "  valida contra una raiz que esta puerta no reconoce no vale nada.",
      };
    },
  },
  {
    id: "scope",
    critico: true,
    titulo: "el scope es el del evento de esta puerta",
    ejecutar({ configuracion, senales }) {
      const traido = BigInt(senales[indiceDe("scope")]);
      const propio = BigInt(configuracion.scope);
      return {
        ok: traido === propio,
        detalle: traido === propio ? "coincide" : "otro evento",
        comparacion: { trae: String(traido), espera: String(propio) },
        motivo:
          "La prueba es de otro evento. Con otro scope el nulificador es otro, asi que la\n" +
          "  misma identidad podria entrar una vez por cada scope que se le ocurra usar.",
      };
    },
  },
  {
    id: "cripto",
    critico: false,
    titulo: "la prueba verifica contra su verification key",
    async ejecutar({ configuracion, senales, sobre, verificar }) {
      const t0 = process.hrtime.bigint();
      const ok = await verificar(configuracion.verification_key, senales, sobre.prueba);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      return {
        ok,
        ms,
        detalle: `${ms.toFixed(1)} ms`,
        motivo:
          "La ecuacion de emparejamiento no cierra: la prueba esta rota, es de otro circuito,\n" +
          "  o alguien la fabrico sin tener un secreto del arbol.",
      };
    },
  },
  {
    id: "nulificador",
    critico: false,
    titulo: "el nulificador no esta en su lista local",
    ejecutar({ senales, usados }) {
      const nulificador = senales[indiceDe("nulificador")];
      const previo = usados.find((u) => u.nulificador === nulificador);
      return {
        ok: !previo,
        previo,
        detalle: previo ? `ya paso ${previo.momento}` : `${usados.length} usados antes`,
        motivo:
          "Esta entrada ya se uso en ESTA puerta. Quien esta adelante puede ser el mismo\n" +
          "  que paso antes o alguien que le saco una foto al QR: la puerta no puede\n" +
          "  distinguirlos, y por eso rechaza.",
      };
    },
  },
];

// Corre los chequeos en orden y corta en el primero que falla, que es lo que
// hace un molinete: no sigue evaluando una entrada que ya rechazo.
//
// `omitir` existe por una sola razon: construir el validador ingenuo de
// scripts/ataque-raiz-propia.mjs con este mismo codigo, sin los dos primeros
// chequeos. Que la unica diferencia entre aceptar y rechazar al atacante sea esa
// lista es justamente lo que el ataque tiene que demostrar.
export async function correrChequeos(contexto, { omitir = [] } = {}) {
  const resultados = [];
  for (const chequeo of CHEQUEOS) {
    if (omitir.includes(chequeo.id)) {
      resultados.push({ id: chequeo.id, titulo: chequeo.titulo, omitido: true });
      continue;
    }
    const salida = await chequeo.ejecutar(contexto);
    resultados.push({ id: chequeo.id, titulo: chequeo.titulo, ...salida });
    if (!salida.ok) return { aceptada: false, resultados, fallo: chequeo.id };
  }
  return { aceptada: true, resultados, fallo: null };
}

// --- Offline de verdad ---
//
// La puerta no consulta nada al validar: la raiz y la verification key las tiene
// de antes. Esto no es una promesa del documento, es una jaula: si algun dia
// alguien agrega una consulta a un nodo, a una API o a un contrato dentro del
// camino de validacion, el comando falla en vez de andar de casualidad porque la
// maquina de prueba tenia conexion.
export async function bloquearRed() {
  const restaurar = [];
  const bloqueados = [];
  const morir = (que) => () => {
    throw new Error(
      `La validacion intento usar la red (${que}). Una puerta valida offline: ` +
        "la raiz y la verification key las tiene de antes. Ver docs/06-validador.md."
    );
  };

  const fetchPrevio = globalThis.fetch;
  globalThis.fetch = morir("fetch");
  bloqueados.push("fetch");
  restaurar.push(() => {
    globalThis.fetch = fetchPrevio;
  });

  for (const [nombre, metodos] of [
    ["node:http", ["request", "get"]],
    ["node:https", ["request", "get"]],
    ["node:net", ["connect", "createConnection"]],
  ]) {
    const modulo = (await import(nombre)).default;
    for (const metodo of metodos) {
      const previo = modulo[metodo];
      modulo[metodo] = morir(`${nombre.slice(5)}.${metodo}`);
      bloqueados.push(`${nombre.slice(5)}.${metodo}`);
      restaurar.push(() => {
        modulo[metodo] = previo;
      });
    }
  }

  return {
    bloqueados,
    liberar() {
      for (const f of restaurar.reverse()) f();
      restaurar.length = 0;
    },
  };
}
