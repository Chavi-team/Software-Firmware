// ===== OPERAÇÕES DE PERSISTÊNCIA E STORAGE LOCAL =====
const GerenciadorBancoDados = {
    salvarEquipamentoLocal(serial, hardware) {
        const payload = {
            serial: serial,
            hardware: hardware,
            cadastradoEm: new Date().toISOString()
        };
        localStorage.setItem(`chavi_serial_${serial}`, JSON.stringify(payload));
        console.log(`[Banco de Dados] Equipamento ${serial} armazenado com sucesso localmente.`);
        return payload;
    },
    
    obterEquipamentoLocal(serial) {
        return JSON.parse(localStorage.getItem(`chavi_serial_${serial}`));
    }
};

window.GerenciadorBancoDados = GerenciadorBancoDados;