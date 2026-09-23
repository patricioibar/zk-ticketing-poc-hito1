pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

// Circuito minimo, unico proposito: exponer el Poseidon de circomlib como un
// programa compilado, para poder comparar su salida con la de circomlibjs.
// No forma parte del sistema: es el patron de calibracion de T02.
template ControlPoseidon() {
    signal input x;
    signal output h;

    component poseidon = Poseidon(1);
    poseidon.inputs[0] <== x;
    h <== poseidon.out;
}

component main = ControlPoseidon();
