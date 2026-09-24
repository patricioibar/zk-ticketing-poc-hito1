// La cadena local y el contrato desplegado en ella.
//
// Este modulo existe para que ningun comando del proyecto obligue a acordarse de
// nada: `npm test` sigue siendo un solo comando, y `npm run organizador` levanta
// la cadena si no esta levantada. Todo el estado de la cadena vive en cadena/,
// que esta en .gitignore: un nodo de Hardhat guarda su mundo en memoria, asi que
// cuando el proceso muere no queda ni el contrato ni las raices publicadas.
//
// Lo que este modulo NO hace: no habla con el contrato. Eso es
// fuentes/contrato-raiz.mjs, que es la implementacion de fuenteDeRaiz. Aca solo
// esta la plomeria: arrancar el nodo, compilar, desplegar y conectar.
//
// Ver docs/08-contrato-raiz.md.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ethers } from "ethers";

export const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cadenaDir = join(RAIZ_REPO, "cadena");
const rutaNodo = join(cadenaDir, "nodo.json");
const rutaDespliegueDe = (n) => join(cadenaDir, n === "RegistroDeRaiz" ? "despliegue.json" : `despliegue-${n}.json`);
const rutaPublicaciones = join(cadenaDir, "publicaciones.json");
const rutaLog = join(cadenaDir, "nodo.log");

const cliHardhat = join(RAIZ_REPO, "node_modules", "hardhat", "dist", "src", "cli.js");
const contratosDir = join(RAIZ_REPO, "contratos");
const rutaArtefacto = (nombre) => join(RAIZ_REPO, "artifacts", "contratos", `${nombre}.sol`, `${nombre}.json`);

export const PUERTO = 8545;
export const RPC = `http://127.0.0.1:${PUERTO}`;
export const CHAIN_ID = 31337;

// La cuenta #0 de la cadena local de Hardhat. Esta clave es publica: esta impresa
// en la pantalla cada vez que arranca el nodo y es la misma en todas las maquinas
// del mundo. No es un secreto que se filtra: es el equivalente a la contrasena
// "admin" de una base de datos de juguete, y solo sirve en una cadena que vive en
// esta computadora y que se borra al apagarla. Que el organizador sea esta cuenta
// es lo que permite que la PoC no pida credenciales a nadie.
export const CLAVE_ORGANIZADOR = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const leerJson = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null);

function guardarJson(ruta, documento) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(documento, null, 2)}\n`);
  return ruta;
}

// --- Esta viva? ---
//
// La pregunta se le hace al nodo, no al sistema operativo: un pid guardado puede
// ser de un proceso que ya murio, o peor, de otro proceso que reciclo el numero.
// Lo unico que importa es si hay alguien contestando JSON-RPC en el puerto.
export async function cadenaViva({ rpc = RPC, ms = 800 } = {}) {
  try {
    const r = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return null;
    const cuerpo = await r.json();
    return cuerpo.result ? Number(BigInt(cuerpo.result)) : null;
  } catch {
    return null;
  }
}

async function esperarViva(segundos = 40) {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    const id = await cadenaViva();
    if (id !== null) return id;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

// --- Arriba ---

export async function levantarCadena({ silencioso = false } = {}) {
  const yaViva = await cadenaViva();
  if (yaViva !== null) return { reusada: true, chainId: yaViva, pid: leerJson(rutaNodo)?.pid ?? null };

  mkdirSync(cadenaDir, { recursive: true });
  const log = openSync(rutaLog, "a");

  // Se arranca `node node_modules/hardhat/dist/src/cli.js node` y no `npx hardhat`
  // a proposito: npx en Windows mete un cmd.exe en el medio y el pid que queda es
  // el del shell, no el del nodo. Para poder bajarlo despues hace falta el pid de
  // verdad.
  const hijo = spawn(process.execPath, [cliHardhat, "node", "--port", String(PUERTO)], {
    cwd: RAIZ_REPO,
    detached: true,
    stdio: ["ignore", log, log],
  });
  hijo.unref();

  const chainId = await esperarViva();
  if (chainId === null) {
    throw new Error(
      `La cadena local no contesto en ${RPC} despues de 40 s. Mira cadena/nodo.log.`
    );
  }
  guardarJson(rutaNodo, {
    formato: "cadena-local/nodo@1",
    pid: hijo.pid,
    puerto: PUERTO,
    rpc: RPC,
    chainId,
    arrancado: new Date().toISOString(),
  });
  // Una cadena nueva no tiene ni contrato ni raices: lo que hubiera anotado la
  // corrida anterior es de un mundo que ya no existe.
  limpiarDespliegues();
  rmSync(rutaPublicaciones, { force: true });
  if (!silencioso) console.log(`  cadena local      levantada en ${RPC} (pid ${hijo.pid}, chainId ${chainId})`);
  return { reusada: false, chainId, pid: hijo.pid };
}

// --- Abajo ---

export async function bajarCadena({ silencioso = false } = {}) {
  const nodo = leerJson(rutaNodo);
  const viva = await cadenaViva();
  if (viva === null && !nodo) return { bajada: false, motivo: "no habia ninguna" };

  if (nodo?.pid) {
    if (process.platform === "win32") {
      // En Windows, SIGTERM no existe: process.kill cierra el proceso de golpe
      // pero deja vivos a los hijos. taskkill /T baja el arbol entero.
      spawnSync("taskkill", ["/PID", String(nodo.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(nodo.pid, "SIGTERM");
      } catch {
        /* ya no estaba */
      }
    }
  }

  const limite = Date.now() + 10000;
  while (Date.now() < limite && (await cadenaViva({ ms: 300 })) !== null) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const sigueViva = (await cadenaViva({ ms: 300 })) !== null;

  rmSync(rutaNodo, { force: true });
  limpiarDespliegues();
  rmSync(rutaPublicaciones, { force: true });

  if (sigueViva) {
    return { bajada: false, motivo: `sigue contestando en ${RPC}: la levanto otro proceso` };
  }
  if (!silencioso) console.log(`  cadena local      bajada (${RPC})`);
  return { bajada: true, pid: nodo?.pid ?? null };
}

// Lo que hace la suite de demostraciones: parte de cero tambien en la cadena, para
// que el gas de la primera publicacion sea el de una primera publicacion y no el de
// pisar la de ayer.
export async function reiniciarCadena(opciones = {}) {
  await bajarCadena({ silencioso: true, ...opciones });
  return levantarCadena(opciones);
}

// --- Compilar ---

// Se recompila solo si algun .sol de contratos/ es mas nuevo que su artefacto.
// hardhat compile ya hace su propio cacheo, pero arrancarlo cuesta un segundo largo
// y esto corre en cada comando. Desde T11 hay mas de un contrato: se miran todos.
export function compilarSiHaceFalta({ silencioso = false } = {}) {
  const alDia = readdirSync(contratosDir).filter((n) => n.endsWith(".sol")).every((n) => {
    const art = rutaArtefacto(n.slice(0, -4));
    return existsSync(art) && statSync(join(contratosDir, n)).mtimeMs <= statSync(art).mtimeMs;
  });
  if (alDia) return { compilado: false };
  if (!silencioso) console.log("  contrato          compilando con solc...");
  const r = spawnSync(process.execPath, [cliHardhat, "compile"], { cwd: RAIZ_REPO, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`hardhat compile fallo:\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  return { compilado: true };
}

// --- Desplegar ---

// Un solo proveedor y un solo firmante por proceso.
//
// Dos detalles que costaron una tarde. `cacheTimeout: -1` apaga el cache interno
// de ethers: con el cache puesto, dos transacciones seguidas en la misma cadena
// local salen con el mismo nonce —ethers contesta el nonce que leyo hace un
// momento— y la segunda muere con "nonce has already been used". En una cadena de
// verdad, con bloques cada doce segundos, el cache es una optimizacion sana; en
// una que mina un bloque por transaccion, es un bug. `staticNetwork: true` evita
// que vuelva a preguntar el chainId en cada llamada.
let _clientes = null;
export function clientes() {
  if (_clientes) return _clientes;
  const proveedor = new ethers.JsonRpcProvider(RPC, undefined, {
    staticNetwork: true,
    cacheTimeout: -1,
  });
  proveedor.pollingInterval = 50;
  _clientes = { proveedor, firmante: new ethers.Wallet(CLAVE_ORGANIZADOR, proveedor) };
  return _clientes;
}

export function abiDelContrato(nombre = "RegistroDeRaiz") {
  const documento = JSON.parse(readFileSync(rutaArtefacto(nombre), "utf8"));
  return { abi: documento.abi, bytecode: documento.bytecode };
}

// Idempotente y honesto: si cadena/despliegue*.json dice que hay un contrato en tal
// direccion, se comprueba que en ESTA cadena haya codigo en esa direccion antes de
// creerle. Un nodo reiniciado deja el archivo apuntando a un contrato que ya no
// existe. Desde T12: un archivo por contrato, y `args` va al constructor.
export async function asegurarDespliegue({ silencioso = false, nombre = "RegistroDeRaiz", args = [] } = {}) {
  await levantarCadena({ silencioso });
  compilarSiHaceFalta({ silencioso });

  const { proveedor, firmante } = clientes();
  const { abi, bytecode } = abiDelContrato(nombre);

  const previo = leerJson(rutaDespliegueDe(nombre));
  if (previo?.direccion) {
    const codigo = await proveedor.getCode(previo.direccion);
    if (codigo && codigo !== "0x") {
      return { ...previo, proveedor, firmante, abi, nuevo: false };
    }
  }

  const fabrica = new ethers.ContractFactory(abi, bytecode, firmante);
  const contrato = await fabrica.deploy(...args);
  const tx = contrato.deploymentTransaction();
  const recibo = await tx.wait();
  const direccion = await contrato.getAddress();

  const documento = {
    formato: "cadena-local/despliegue@1",
    contrato: nombre,
    direccion,
    organizador: await firmante.getAddress(),
    rpc: RPC,
    chainId: CHAIN_ID,
    tx: recibo.hash,
    bloque: recibo.blockNumber,
    gas_despliegue: Number(recibo.gasUsed),
    desplegado: new Date().toISOString(),
  };
  guardarJson(rutaDespliegueDe(nombre), documento);
  if (!silencioso) {
    console.log(`  contrato          ${nombre} desplegado en ${direccion} (${documento.gas_despliegue} gas)`);
  }
  return { ...documento, proveedor, firmante, abi, nuevo: true };
}

// Un objeto ethers listo para usar, con el contrato ya conectado a la cuenta del
// organizador. Es lo unico que necesita fuentes/contrato-raiz.mjs.
export async function conectar(opciones = {}) {
  const d = await asegurarDespliegue(opciones);
  return {
    ...d,
    contrato: new ethers.Contract(d.direccion, d.abi, d.firmante),
  };
}

// --- El registro de lo que costo ---
//
// El organizador imprime la `referencia` que devuelve la fuente y nada mas: el gas
// no entra por esa interfaz. Se anota aca para que `npm run cadena:estado` lo pueda
// mostrar, y para que el numero del documento salga de una corrida de verdad y no
// de una medicion de laboratorio aparte.
export function anotarPublicacion(entrada) {
  const previo = leerJson(rutaPublicaciones) ?? { formato: "cadena-local/publicaciones@1", publicaciones: [] };
  previo.publicaciones.push(entrada);
  guardarJson(rutaPublicaciones, previo);
}

export function leerEstadoLocal() {
  return {
    nodo: leerJson(rutaNodo),
    despliegue: leerJson(rutaDespliegueDe("RegistroDeRaiz")),
    despliegues: CONTRATOS.map((n) => leerJson(rutaDespliegueDe(n))).filter(Boolean),
    publicaciones: leerJson(rutaPublicaciones)?.publicaciones ?? [],
  };
}

// --- Leer el motivo de un revert ---
//
// Cuando un contrato revierte con un custom error, ethers trae los bytes en
// `e.data` pero no los decodifica solo —`e.revert` viene en null— porque el
// rechazo ocurrio estimando el gas y no en una llamada. Los bytes son el selector
// del error y sus argumentos: con el ABI a mano se leen. Lo usan los dos scripts
// que aprietan contratos (scripts/contrato.mjs y scripts/contrato-nft.mjs), y esta
// aca porque tener dos copias de esto es la forma de que una quede vieja.
export function motivoDeRevert(e, abi) {
  const datos = e?.data ?? e?.info?.error?.data;
  if (typeof datos === "string" && datos.startsWith("0x")) {
    const descripcion = new ethers.Interface(abi).parseError(datos);
    if (descripcion) return `revirtio con ${descripcion.name}(${descripcion.args.join(", ")})`;
  }
  return e?.shortMessage ?? String(e?.message ?? e);
}

// --- Varios contratos en la misma cadena (T12) ---
//
// Cada despliegue se anota en su propio archivo —cadena/despliegue.json para la V1,
// cadena/despliegue-EntradaNFT.json para el de T11— y los dos se borran juntos cuando
// arranca o se baja un nodo. Que la funcion este declarada con `function` y no con
// `const` no es cosmetico: se la llama mas arriba en el archivo, y solo las
// declaraciones se izan.
const CONTRATOS = ["RegistroDeRaiz", "EntradaNFT"];

function limpiarDespliegues() {
  for (const nombre of CONTRATOS) rmSync(rutaDespliegueDe(nombre), { force: true });
}

// --- Las cuentas de prueba de la cadena local ---
//
// La frase es publica: la imprime el nodo de Hardhat cada vez que arranca y es la
// misma en todas las maquinas del mundo. La cuenta 0 es el organizador
// (CLAVE_ORGANIZADOR sale de aca); de la 1 en adelante salen los compradores de T12.
// Nada de esto es un secreto que se filtra: es una cadena que vive en esta
// computadora y que se borra al apagarla.
export const FRASE_LOCAL = "test test test test test test test test test test test junk";

export function cuentaLocal(indice, proveedor) {
  return ethers.HDNodeWallet.fromPhrase(FRASE_LOCAL, "", `m/44'/60'/0'/0/${indice}`).connect(proveedor);
}
