// El pragma lo fija la dependencia: binary-merkle-root.circom usa componentes
// anonimos, que existen desde circom 2.1.5.
pragma circom 2.1.5;

include "circomlib/circuits/poseidon.circom";
include "@zk-kit/binary-merkle-root.circom/src/binary-merkle-root.circom";

// Prueba que el titular de un secreto esta en el arbol de compromisos de un
// evento, sin revelar cual de las hojas es, y publica un nulificador que es
// determinista por (secreto, scope) para que la misma entrada no pase dos veces.
template Pertenencia(PROFUNDIDAD) {
    // Privadas: nada de esto sale en la prueba.
    signal input secreto;
    signal input camino[PROFUNDIDAD];
    signal input indices[PROFUNDIDAD];

    // Publicas: las declara `component main` abajo.
    signal input raiz;
    signal input scope;

    // Las salidas son siempre publicas.
    signal output nulificador;

    // La hoja es Poseidon de UNA entrada; el nulificador, de DOS. Aridades
    // distintas usan constantes distintas: eso es lo que impide que un valor
    // sirva como las dos cosas. Ver docs/02-circuito.md seccion 3.
    component hasherHoja = Poseidon(1);
    hasherHoja.inputs[0] <== secreto;
    signal hoja <== hasherHoja.out;

    // Cada indice dice si la hoja va a la izquierda (0) o a la derecha (1) en
    // ese nivel. Sin esta restriccion un indice podria valer cualquier cosa y el
    // multiplexor de adentro interpolaria entre las dos ramas: es el agujero de
    // señal sub-restringida que explica docs/02-circuito.md seccion 3.
    var acumulador = 0;
    var peso = 1;
    for (var i = 0; i < PROFUNDIDAD; i++) {
        indices[i] * (indices[i] - 1) === 0;
        acumulador += indices[i] * peso;
        peso = peso * 2;
    }
    signal indice <== acumulador;

    // Camino de Merkle: template de @zk-kit (el de Semaphore v4). Acepta una
    // profundidad dinamica; aca se la clava en PROFUNDIDAD porque el arbol de
    // esta PoC es de tamaño fijo.
    component arbol = BinaryMerkleRoot(PROFUNDIDAD);
    arbol.leaf <== hoja;
    arbol.depth <== PROFUNDIDAD;
    arbol.index <== indice;
    for (var i = 0; i < PROFUNDIDAD; i++) {
        arbol.siblings[i] <== camino[i];
    }

    // La linea que convierte el calculo en una prueba: la raiz que sale de subir
    // el arbol tiene que ser exactamente la raiz publica.
    raiz === arbol.out;

    component hasherNulificador = Poseidon(2);
    hasherNulificador.inputs[0] <== secreto;
    hasherNulificador.inputs[1] <== scope;
    nulificador <== hasherNulificador.out;
}

// Profundidad 3: 8 identidades. Todo lo que no este en la lista `public` es
// privado.
component main {public [raiz, scope]} = Pertenencia(3);
