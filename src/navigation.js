// ===== CONTROLADOR DE INTERFACE E NAVEGAÇÃO =====

function mostrarTela(idTela) {
    document.querySelectorAll('.tela').forEach(tela => tela.style.display = 'none');
    const alvo = document.getElementById(idTela);
    if (alvo) alvo.style.display = 'block';
}

function voltarPara(idTela) {
    mostrarTela(idTela);
}

function voltarParaInicio() {
    if (window.estado) {
        window.estado.produto = null;
        window.estado.hardwareBase = null;
        window.estado.mosfet = null;
        window.estado.pinoMosfet = "";
        window.estado.canal = "";
        window.estado.firmwareId = "";
        window.estado.macAddress = "";
        window.estado.serialNumber = "";
        window.estado.hardwareVersionStr = "";
    }

    const inputs = ['input-canal', 'input-firmware-id', 'input-pino-custom', 'input-serial', 'input-hardware-version'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const painelStatus = document.getElementById('status-execucao');
    if (painelStatus) painelStatus.style.display = 'none';

    mostrarTela('tela-produto');
}

// Vinculação explícita ao escopo da janela
window.mostrarTela = mostrarTela;
window.voltarPara = voltarPara;
window.voltarParaInicio = voltarParaInicio;