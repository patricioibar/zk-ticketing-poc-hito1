#!/usr/bin/env node
// El flujo completo de la Variacion 2, de la venta a la puerta.
//
// Uso: npm run flujo
//      npm run flujo -- --sin-enviar 5     (un duenio que nunca manda su compromiso)
//
// Corre los comandos de verdad —organizador, prover, provisionar-puerta,
// validador— como procesos separados, igual que los correria una persona, con
// FUENTE=contrato-nft. Lo unico que este script hace por su cuenta es la parte que
// antes no existia: los ocho compradores.
//
// Lo que hay que mirar mientras corre:
//
//   1. el organizador nunca ve un secreto: los ocho salen de las claves privadas
//      de los compradores y lo unico que viaja a la cadena es Poseidon(secreto)
//   2. la posicion de cada hoja la decide el orden en que llegaron las
//      transacciones, no el organizador: por eso la tabla no esta en orden de token
//   3. una entrada revendida se lleva el compromiso del vendedor, y el vendedor
//      entra con ella aunque ya no tenga el NFT
//
// Ver docs/10-flujo-completo.md.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

import { construirHashes } from "../lib/merkle.mjs";
import { RAIZ_REPO, cuentaLocal, motivoDeRevert, reiniciarCadena, bajarCadena } from "../lib/cadena.mjs";
import { ENTRADAS, ORDEN_DE_ENVIO, asegurarCompradores, compromisosEnCadena } from "../lib/compradores.mjs";
import { escribirSobreJson } from "../lib/sobre.mjs";
import { directorioPuerta } from "../lib/puerta.mjs";

const datos = join(RAIZ_REPO, "datos");
const salidas = join(RAIZ_REPO, "salidas");
const flujo = join(salidas, "flujo");

const EVENTO = "evento-A";
const PUERTA = "flujo-a";
const PUERTA_REVENTA = "flujo-reventa";

// El token que se revende, y la cuenta que lo compra: la 9, que no es de ninguno
// de los ocho compradores.
const TOKEN_REVENDIDO = 1;
const CUENTA_COMPRADOR_NUEVO = 9;

const rel = (p) => relative(RAIZ_REPO, p).replaceAll("\\", "/");
const miles = (n) => n.toLocaleString("es-AR");
const recorte = (n) => `${String(n).slice(0, 22)}...`;

const fallas = [];
const anotar = (titulo, ok, detalle) => {
  console.log(`  ${titulo.padEnd(54)}${ok ? "OK   " : "FALLA"}  ${detalle}`);
  if (!ok) fallas.push(titulo);
};

function leerArgumentos(argv) {
  const opciones = { sinEnviar: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--sin-enviar") {
      opciones.sinEnviar = Number(argv[i + 1]);
      i++;
      if (!Number.isInteger(opciones.sinEnviar) || opciones.sinEnviar < 0 || opciones.sinEnviar >= ENTRADAS) {
        console.error(`\n--sin-enviar quiere un numero de token entre 0 y ${ENTRADAS - 1}.\n`);
        process.exit(1);
      }
    } else {
      console.error(`\nArgumento desconocido: ${argv[i]}`);
      console.error("Uso: npm run flujo [-- --sin-enviar N]\n");
      process.exit(1);
    }
  }
  return opciones;
}

// Los comandos de verdad, con la fuente de T12 puesta. Se invoca el script con el
// mismo node que corre este, por la misma razon que en scripts/demostraciones.mjs:
// `npm run` agrega un proceso intermedio y no aporta nada.
function correr(script, args, { env = {} } = {}) {
  const r = spawnSync(process.execPath, [join(RAIZ_REPO, "scripts", script), ...args], {
    cwd: RAIZ_REPO,
    encoding: "utf8",
    env: { ...process.env, FUENTE: "contrato-nft", ...env },
  });
  if (r.error) throw r.error;
  return { codigo: r.status, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function paso(etiqueta, comando, script, args, env) {
  process.stdout.write(`  ${etiqueta.padEnd(40)}${comando}\n`);
  const r = correr(script, args, { env });
  if (r.codigo !== 0) {
    console.error(`\nEl paso fallo:  ${comando}\n`);
    console.error(r.salida);
    process.exit(1);
  }
  return r;
}

function sobreDeLaUltimaPrueba(nombre) {
  const prueba = JSON.parse(readFileSync(join(salidas, "prueba.json"), "utf8"));
  const senales = JSON.parse(readFileSync(join(salidas, "senales-publicas.json"), "utf8"));
  return escribirSobreJson(join(flujo, `${nombre}.json`), {
    prueba,
    senales,
    nota: `Sobre generado por npm run flujo. Ver docs/10-flujo-completo.md.`,
  });
}

// --- La variante incomoda: alguien no manda su compromiso ---

async function corridaSinEnviar(token) {
  console.log(`\nUn duenio que nunca envia su compromiso (token ${token})\n`);
  await reiniciarCadena({ silencioso: true });

  const { llegados } = await asegurarCompradores({ silencioso: true, omitir: [token] });
  console.log(`  entradas emitidas   ${ENTRADAS}`);
  console.log(`  compromisos en la cadena   ${llegados.length}`);
  console.log(`  el token ${token} tiene duenio, tiene entrada y no tiene hoja.\n`);

  // El organizador se corre con la omision puesta en el entorno, para que la fuente
  // del proceso hijo no complete lo que este dejo afuera.
  const r = correr("organizador.mjs", ["--scope", EVENTO], { env: { FLUJO_SIN_ENVIAR: String(token) } });
  const corto = r.codigo !== 0;
  const dijoLoQueCorresponde = /potencia de dos/.test(r.salida);
  anotar("el organizador no arma el arbol", corto, `salio con codigo ${r.codigo}`);
  anotar("y dice por que", dijoLoQueCorresponde, (r.salida.match(/armarArbol:.*$/m) ?? ["(no dijo nada)"])[0].trim());

  console.log("\n  Siete hojas no son un arbol de profundidad 3, y el relleno no es un default:");
  console.log("  es una decision. La seccion 3 de docs/10-flujo-completo.md la plantea y no la");
  console.log("  toma, porque es del TPF y no de esta PoC.\n");
  return fallas.length === 0;
}

// --- La corrida completa ---

async function corridaCompleta() {
  console.log("\nFlujo completo - de la venta a la puerta\n");

  for (const p of [PUERTA, PUERTA_REVENTA]) rmSync(directorioPuerta(p), { recursive: true, force: true });
  rmSync(flujo, { recursive: true, force: true });
  mkdirSync(flujo, { recursive: true });
  const cadena = await reiniciarCadena({ silencioso: true });
  console.log(`  cadena reiniciada   pid ${cadena.pid}, chainId ${cadena.chainId}`);
  console.log(`  estado borrado      puertas/puerta-{${PUERTA},${PUERTA_REVENTA}}/ y ${rel(flujo)}/\n`);

  // --- 1. Los compradores ---

  console.log("La venta: ocho entradas, ocho billeteras, ocho secretos que nadie mas conoce\n");
  const mundo = await asegurarCompradores({ silencioso: true, alHacer: (t) => console.log(t) });
  const { contrato, direccion, compradores, llegados } = mundo;

  console.log(`\n  contrato            EntradaNFT en ${direccion}`);
  console.log(`  orden de envio      ${ORDEN_DE_ENVIO.join(", ")}  (por numero de token)`);

  console.log("\n  hoja  token  billetera del comprador                     compromiso            bloque");
  for (const l of llegados) {
    console.log(
      `  ${String(l.posicion).padStart(4)}  ${String(l.tokenId).padStart(5)}  ${l.de}  ${recorte(l.compromiso)}  ${String(l.bloque).padStart(6)}`
    );
  }

  const gasCompromiso = compradores.map((c) => c.gasCompromiso).filter(Boolean);
  const gasEmision = compradores.map((c) => c.gasEmision).filter(Boolean);
  console.log(
    `\n  Gas: emitir las ocho, ${miles(gasEmision.reduce((a, b) => a + b, 0))}, lo paga el organizador.`
  );
  console.log(
    `       enviar los ocho compromisos, ${miles(gasCompromiso.reduce((a, b) => a + b, 0))}, lo pagan los compradores, uno por uno.`
  );

  console.log("\nControles de la venta\n");
  anotar("se emitieron las ocho entradas", Number(await contrato.emitidos()) === ENTRADAS, `emitidos() = ${await contrato.emitidos()}`);
  anotar("llegaron los ocho compromisos", llegados.length === ENTRADAS, `${llegados.length} eventos CompromisoEnviado`);
  const ordenDeLlegada = llegados.map((l) => l.tokenId);
  anotar(
    "la posicion de la hoja NO es el numero de token",
    ordenDeLlegada.some((t, i) => t !== i),
    `hojas 0..7 = tokens ${ordenDeLlegada.join(",")}`
  );
  anotar(
    "el orden de las hojas es el de llegada a la cadena",
    ordenDeLlegada.join(",") === ORDEN_DE_ENVIO.join(","),
    `orden de envio ${ORDEN_DE_ENVIO.join(",")}`
  );

  // El control que da sentido a la tarea: el compromiso que esta en la cadena es
  // Poseidon del secreto que el comprador derivo en su maquina, y el organizador no
  // tuvo nada que ver.
  const { hash1 } = await construirHashes();
  const todosPropios = llegados.every((l) => hash1(compradores[l.tokenId].secreto) === l.compromiso);
  anotar("cada hoja es Poseidon del secreto de su comprador", todosPropios, "calculado del lado del comprador");

  // --- 2. El organizador ---

  console.log("\nEl organizador: lee la cadena, arma el arbol, publica la raiz\n");
  const salidaOrg = paso("arbol y raiz", `npm run organizador -- --scope ${EVENTO}`, "organizador.mjs", ["--scope", EVENTO]);

  const generoSecretos = /los genera el organizador/.test(salidaOrg.salida);
  anotar("el organizador NO genero ningun secreto", !generoSecretos, "la fuente aporto los ocho compromisos");

  const padron = JSON.parse(readFileSync(join(datos, "arbol.json"), "utf8"));
  const mismoOrden = padron.compromisos.join(",") === llegados.map((l) => l.compromiso.toString()).join(",");
  anotar("el padron es la cadena, hoja por hoja", mismoOrden, `${padron.compromisos.length} hojas en ${rel(join(datos, "arbol.json"))}`);

  // --- 3. Una entrada entra ---

  const hojaLegitima = llegados.find((l) => l.tokenId !== TOKEN_REVENDIDO).posicion;
  console.log(`\nLa puerta: la hoja ${hojaLegitima} entra al evento\n`);
  paso("prueba del comprador", `npm run probar -- --identidad ${hojaLegitima}`, "prover.mjs", [
    "--identidad",
    String(hojaLegitima),
    "--scope",
    EVENTO,
    "--corridas",
    "1",
  ]);
  const sobre = sobreDeLaUltimaPrueba("sobre-legitimo");
  paso("puerta provisionada", `npm run puerta:provisionar -- --puerta ${PUERTA}`, "provisionar-puerta.mjs", [
    "--puerta",
    PUERTA,
    "--scope",
    EVENTO,
  ]);
  const veredicto = correr("validador.mjs", ["--puerta", PUERTA, "--prueba", rel(sobre)]);
  anotar("la puerta acepta la entrada", veredicto.codigo === 0 && /^PASE\./m.test(veredicto.salida), `codigo ${veredicto.codigo}`);

  // --- 4. La reventa ---

  console.log("\nLa reventa: el NFT cambia de duenio y el compromiso no\n");
  const vendedor = compradores[TOKEN_REVENDIDO];
  const hojaDelVendedor = llegados.find((l) => l.tokenId === TOKEN_REVENDIDO).posicion;
  const compradorNuevo = cuentaLocal(CUENTA_COMPRADOR_NUEVO, mundo.proveedor);

  const tx = await contrato
    .connect(vendedor.billetera)
    .transferFrom(vendedor.direccion, compradorNuevo.address, TOKEN_REVENDIDO);
  await tx.wait();
  const duenioAhora = await contrato.ownerOf(TOKEN_REVENDIDO);
  console.log(`  token ${TOKEN_REVENDIDO} vendido       de ${vendedor.direccion}`);
  console.log(`                      a  ${duenioAhora}\n`);

  anotar("el NFT es del comprador nuevo", duenioAhora === compradorNuevo.address, `ownerOf(${TOKEN_REVENDIDO})`);

  // El comprador nuevo intenta poner SU compromiso y no puede: la hoja del vendedor
  // ya esta en el arbol y el contrato admite un solo envio por token.
  let motivo = "no revirtio";
  try {
    await contrato.connect(compradorNuevo).enviarCompromiso(TOKEN_REVENDIDO, 12345n);
  } catch (e) {
    motivo = motivoDeRevert(e, mundo.abi);
  }
  anotar("el comprador nuevo no puede poner su compromiso", /CompromisoYaEnviado/.test(motivo), motivo);

  const enCadena = await compromisosEnCadena(contrato);
  const hojaIntacta = enCadena[hojaDelVendedor].compromiso === vendedor.compromiso;
  anotar("la hoja sigue siendo la del vendedor", hojaIntacta, `hoja ${hojaDelVendedor}, token ${TOKEN_REVENDIDO}`);

  // Y ahora lo que importa: el vendedor, que ya no tiene la entrada, entra.
  paso("prueba del vendedor", `npm run probar -- --identidad ${hojaDelVendedor}`, "prover.mjs", [
    "--identidad",
    String(hojaDelVendedor),
    "--scope",
    EVENTO,
    "--corridas",
    "1",
  ]);
  const sobreVendedor = sobreDeLaUltimaPrueba("sobre-del-vendedor");
  paso("otra puerta, sin historia", `npm run puerta:provisionar -- --puerta ${PUERTA_REVENTA}`, "provisionar-puerta.mjs", [
    "--puerta",
    PUERTA_REVENTA,
    "--scope",
    EVENTO,
  ]);
  const veredictoVendedor = correr("validador.mjs", ["--puerta", PUERTA_REVENTA, "--prueba", rel(sobreVendedor)]);
  anotar(
    "el que VENDIO la entrada entra igual",
    veredictoVendedor.codigo === 0 && /^PASE\./m.test(veredictoVendedor.salida),
    `codigo ${veredictoVendedor.codigo}: PASE`
  );

  console.log("\n  El que tiene el NFT no entra; el que lo vendio, si. No es un bug de esta");
  console.log("  corrida: es la consecuencia de que el compromiso se envie una sola vez y de");
  console.log("  que la raiz ya este publicada. Es candidato a ADR y toca el ADR-005 del TPF.");

  return fallas.length === 0;
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const ok = opciones.sinEnviar === null ? await corridaCompleta() : await corridaSinEnviar(opciones.sinEnviar);

  if (!ok) {
    console.error("\nFLUJO NO VALIDADO.\n");
    for (const f of fallas) console.error(`  - ${f}`);
    console.error("\nVer docs/10-flujo-completo.md.\n");
    await bajarCadena({ silencioso: true });
    process.exit(1);
  }

  if (opciones.sinEnviar === null) {
    console.log("\n  El organizador no conoce ningun secreto. Los ocho los generaron sus duenios");
    console.log("  y lo unico que salio de cada maquina fue Poseidon(secreto).");
  }

  // El padron que queda en datos/ es el de la cadena; el que esta commiteado es el
  // de la parte base. Son dos juegos de datos distintos y ninguno es el "bueno":
  // decidir cual vive en el repositorio es una decision de diseno que T13 no toma.
  // Lo que si puede hacer es que el comando lo diga, en vez de dejar el arbol de
  // trabajo sucio sin explicacion. Ver docs/11-cierre-de-la-escalera.md, seccion 6.
  console.log("\n  datos/ quedo regenerado desde la cadena, asi que git status lo va a mostrar");
  console.log("  modificado. Para volver al juego de datos de la parte base:");
  console.log("    git checkout -- datos/");
  console.log(`\n  La cadena queda levantada. Para bajarla:  npm run cadena:abajo\n`);
  process.exit(0);
}

main().catch(async (e) => {
  console.error("\nError inesperado:");
  console.error(e.message || e);
  console.error(e);
  await bajarCadena({ silencioso: true });
  process.exit(1);
});
