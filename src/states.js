// ===== ESTADO GLOBAL DO PRODUTO =====
window.estado = {
    produto: null,
    hardwareBase: null,   // "1_0" ou "1_5"
    mosfet: null,         // true ou false
    pinoMosfet: "",       // Número do pino (7, 8, 9, etc.)
    canal: "",
    firmwareId: "",
    macAddress: "",       // Descoberto dinamicamente durante a execução
    
    // CAMPOS GERADOS DINAMICAMENTE PARA OS SCRIPTS BASH
    serialNumber: "",     // CH{ch}FI{fi} -> Ex: CH003FI002406
    hardwareVersionStr: "" // FI_1_0, FI_1_0_400, FI_1_5, etc.
};

// ===== CONFIGURAÇÃO DE HARDWARE =====
window.opcoes = {
    "Fechadura Digital": { hardware: ["v1.0", "v1.5"] },
    "Acionador Inteligente": { hardware: ["v1.0"] }
};