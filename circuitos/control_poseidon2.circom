pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// Gemelo de control_poseidon.circom para la aridad 2, que es la que usa de
// verdad el sistema: el nodo interno del arbol y el nulificador. Cada aridad de
// Poseidon carga constantes distintas, asi que la paridad JS/circuito hay que
// establecerla por separado para cada una. Ver docs/01-poseidon.md.
template ControlPoseidon2() {
    signal input a;
    signal input b;
    signal output h;

    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== a;
    poseidon.inputs[1] <== b;
    h <== poseidon.out;
}

component main = ControlPoseidon2();
