#!/usr/bin/env node
// Validador de puerta: el molinete. Corre OFFLINE.
//
// Uso: npm run validar -- --puerta 1 --prueba salidas/prueba.json
//      npm run validar -- --puerta 1 --estado
//      npm run validar -- --puerta 1 --olvidar
//
// Este script no lee datos/, no lee build/, no importa fuentes/ y no abre la
// red. Todo lo que sabe del evento lo descargo antes, al provisionarse, y vive
// en puertas/puerta-N/. Eso es ADR-002 —validacion offline— hecho codigo.
//
// Codigos de salida:  0 aceptada   2 rechazada   1 error de uso o de estado.
// Rechazar no es un error del programa: es el trabajo del molinete.
//
// Ver docs/06-validador.md.

import { relative, join } from "node:path";

import * as snarkjs from "snarkjs";

import { leerSobre } from "../lib/sobre.mjs";
import { cerrarCurva } from "../lib/prueba-binaria.mjs";
import { exigirOrdenConfigurado, indiceDe, ORDEN_SENALES } from "../lib/senales.mjs";
import {
  CHEQUEOS,
  RAIZ_REPO,
  bloquearRed,
  correrChequeos,
  escribirUsados,
  leerConfiguracion,
  leerUsados,
  rutaConfiguracion,
  rutaUsados,
} from "../lib/puerta.mjs";

const rel = (p) => relative(RAIZ_REPO, p).replaceAll("\\", "/");

const SALIDA_ACEPTADA = 0;
const SALIDA_ERROR = 1;
const SALIDA_RECHAZADA = 2;

function leerArgumentos(argv) {
  const opciones = { puerta: null, prueba: null, estado: false, olvidar: false, cronometrar: 0 };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1];
    if (argv[i] === "--puerta") {
      opciones.puerta = valor;
      i++;
    } else if (argv[i] === "--prueba") {
      opciones.prueba = valor;
      i++;
    } else if (argv[i] === "--cronometrar") {
      opciones.cronometrar = Number(valor);
      i++;
      if (!Number.isInteger(opciones.cronometrar) || opciones.cronometrar < 1) {
        console.error("\n--cronometrar tiene que ser un entero >= 1.\n");
        process.exit(SALIDA_ERROR);
      }
    } else if (argv[i] === "--estado") {
      opciones.estado = true;
    } else if (argv[i] === "--olvidar") {
      opciones.olvidar = true;
    } else {
      console.error(`\nArgumento desconocido: ${argv[i]}`);
      console.error("Uso: npm run validar -- --puerta 1 --prueba salidas/prueba.json\n");
      process.exit(SALIDA_ERROR);
    }
  }
  if (!opciones.puerta) {
    console.error("\nFalta --puerta N.");
    console.error("Uso: npm run validar -- --puerta 1 --prueba salidas/prueba.json\n");
    process.exit(SALIDA_ERROR);
  }
  if (!opciones.prueba && !opciones.estado && !opciones.olvidar) {
    console.error("\nFalta --prueba <archivo> (o --estado, o --olvidar).\n");
    process.exit(SALIDA_ERROR);
  }
  return opciones;
}

function exigirConfiguracion(puerta) {
  const configuracion = leerConfiguracion(puerta);
  if (!configuracion) {
    console.error(`\nLa puerta ${puerta} no esta provisionada: falta ${rel(rutaConfiguracion(puerta))}.`);
    console.error("Una puerta sin provisionar no sabe ni cual es la raiz del evento ni con que");
    console.error("verification key verificar, y eso no se averigua en el momento: se descarga antes.");
    console.error(`\nCorre primero:  npm run puerta:provisionar -- --puerta ${puerta} --scope evento-A\n`);
    process.exit(SALIDA_ERROR);
  }
  // Si el circuito cambiara el orden de sus senales publicas, esta puerta
  // estaria leyendo la raiz donde hay un nulificador. Falla explicito.
  exigirOrdenConfigurado(configuracion.orden_senales);
  return configuracion;
}

function mostrarEstado(puerta, configuracion, usados) {
  console.log(`\nPuerta ${puerta} - estado local\n`);
  console.log(`  configuracion     ${rel(rutaConfiguracion(puerta))} (provisionada ${configuracion.provisionado})`);
  console.log(`  evento            ${configuracion.evento?.etiqueta ?? "?"} -> ${configuracion.scope}`);
  console.log(`  raiz que conoce   ${configuracion.raiz}`);
  console.log(`  lista local       ${rel(rutaUsados(puerta))}  (${usados.length} nulificadores)`);
  if (usados.length) {
    console.log("");
    for (const [i, u] of usados.entries()) {
      console.log(`  ${String(i + 1).padStart(3)}  ${u.nulificador}`);
      console.log(`       ${u.momento}   ${u.origen ?? ""}`);
    }
  }
  console.log(
    `\n  Esta lista es solo de la puerta ${puerta}. Ninguna otra puerta la ve, y esta puerta\n` +
      "  no ve las de las demas: no hay canal entre ellas. Ver docs/06-validador.md.\n"
  );
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const puerta = opciones.puerta;
  const configuracion = exigirConfiguracion(puerta);
  let usados = leerUsados(puerta);

  if (opciones.olvidar) {
    escribirUsados(puerta, { scope: configuracion.scope, usados: [] });
    console.log(`\nLa puerta ${puerta} olvido sus ${usados.length} nulificadores usados.`);
    console.log("(Un molinete de verdad no tiene este boton: esta para poder repetir la demo.)\n");
    process.exit(SALIDA_ACEPTADA);
  }

  if (opciones.estado) {
    mostrarEstado(puerta, configuracion, usados);
    process.exit(SALIDA_ACEPTADA);
  }

  const tInicio = process.hrtime.bigint();

  // Desde aca y hasta el veredicto, nada de red. Si algun dia alguien mete una
  // consulta en el camino de validacion, el comando explota en vez de andar de
  // casualidad porque la maquina de prueba tenia wifi.
  const jaula = await bloquearRed();

  console.log(`\nValidador de puerta - puerta ${puerta} (offline)\n`);
  console.log(`  configuracion     ${rel(rutaConfiguracion(puerta))} (provisionada ${configuracion.provisionado})`);
  console.log(`  evento (scope)    ${configuracion.evento?.etiqueta ?? "?"} -> ${configuracion.scope}`);
  console.log(`  raiz que conoce   ${configuracion.raiz}`);
  console.log(
    `  vkey propia       ${configuracion.verification_key.protocol}/${configuracion.verification_key.curve}, ` +
      `${configuracion.verification_key.nPublic} senales publicas (copia local)`
  );
  console.log(`  orden de senales  [${configuracion.orden_senales.join(", ")}]  (verificado contra el .sym al provisionar)`);
  console.log(`  lista local       ${usados.length} nulificadores usados en esta puerta`);
  console.log(`  red               bloqueada: ${jaula.bloqueados.join(", ")}`);

  const rutaPrueba = join(process.cwd(), opciones.prueba);
  const t0 = process.hrtime.bigint();
  const sobre = await leerSobre(rutaPrueba);
  const msLectura = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log(`\nSobre presentado\n`);
  console.log(`  archivo           ${rel(rutaPrueba)}`);
  console.log(`  formato           ${sobre.formato} (${sobre.bytes} bytes)`);
  for (const [i, nombre] of ORDEN_SENALES.entries()) {
    console.log(`  ${nombre.padEnd(18)}${sobre.senales[i]}`);
  }

  const { aceptada, resultados, fallo } = await correrChequeos({
    configuracion,
    senales: sobre.senales,
    sobre,
    usados,
    verificar: (vk, senales, prueba) => snarkjs.groth16.verify(vk, senales, prueba, null),
  });

  console.log(`\nChequeos\n`);
  for (const [i, r] of resultados.entries()) {
    const marca = r.ok ? "OK    " : "FALLA ";
    console.log(`  ${i + 1}  ${r.titulo.padEnd(48)}${marca}${r.detalle ?? ""}`);
  }
  const noCorridos = CHEQUEOS.length - resultados.length;
  if (noCorridos > 0) {
    console.log(`\n  los ${noCorridos} chequeos siguientes no se corrieron: la puerta ya rechazo.`);
  }

  const msVerificacion = resultados.find((r) => r.id === "cripto")?.ms ?? null;
  let rutaRegistro = null;

  if (aceptada) {
    const nulificador = sobre.senales[indiceDe("nulificador")];
    usados = [
      ...usados,
      {
        nulificador,
        momento: new Date().toISOString(),
        origen: rel(rutaPrueba),
      },
    ];
    rutaRegistro = escribirUsados(puerta, { scope: configuracion.scope, usados });
  }

  const msTotal = Number(process.hrtime.bigint() - tInicio) / 1e6;
  jaula.liberar();

  console.log("");
  if (aceptada) {
    console.log(`PASE. La puerta ${puerta} acepta y anota el nulificador.\n`);
    console.log(`  registrado en     ${rel(rutaRegistro)}  (${usados.length} usados en esta puerta)`);
    console.log(`  lo que la puerta NO sabe: cual de las 8 identidades entro, ni que billetera`);
    console.log(`  la controla. Solo que es una del arbol y que todavia no habia pasado por aca.`);
  } else {
    const r = resultados.find((x) => x.id === fallo);
    console.log(`RECHAZADA por el chequeo ${resultados.length} (${fallo}).\n`);
    if (r.comparacion) {
      console.log(`  la prueba trae    ${r.comparacion.trae}`);
      console.log(`  esta puerta tiene ${r.comparacion.espera}\n`);
    }
    console.log(`  ${r.motivo}`);
  }

  console.log(`\nTiempo\n`);
  console.log(`  leer el sobre     ${msLectura.toFixed(1)} ms`);
  console.log(
    `  verificar Groth16 ${msVerificacion === null ? "no se llego a verificar" : `${msVerificacion.toFixed(1)} ms   (la primera del proceso: incluye armar la curva)`}`
  );
  console.log(`  total del comando ${msTotal.toFixed(1)} ms  (sin contar el arranque de node)`);

  // El molinete no valida una entrada por noche: valida una cola. La primera
  // verificacion de cada proceso paga la construccion de la curva BN254, y esa
  // plata se paga una sola vez. Reportar solo la primera seria describir mal el
  // costo por persona; reportar solo las siguientes, mal el arranque.
  if (opciones.cronometrar > 0 && msVerificacion !== null) {
    const muestras = [];
    for (let i = 0; i < opciones.cronometrar; i++) {
      const t = process.hrtime.bigint();
      await snarkjs.groth16.verify(configuracion.verification_key, sobre.senales, sobre.prueba, null);
      muestras.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    const media = muestras.reduce((a, b) => a + b, 0) / muestras.length;
    console.log(
      `\n  ${opciones.cronometrar} verificaciones mas en el mismo proceso: ` +
        `${media.toFixed(1)} ms de promedio  [${Math.min(...muestras).toFixed(1)} .. ${Math.max(...muestras).toFixed(1)}]`
    );
    console.log(`  (esas repeticiones no cambian el veredicto: son la misma prueba, ya decidida)`);
  }

  console.log(`\nVer docs/06-validador.md.\n`);

  await cerrarCurva();
  process.exit(aceptada ? SALIDA_ACEPTADA : SALIDA_RECHAZADA);
}

main().catch(async (e) => {
  await cerrarCurva().catch(() => {});
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError" && !String(e.message).includes("ORDEN")) {
    console.error(e);
  }
  console.error("");
  process.exit(SALIDA_ERROR);
});
