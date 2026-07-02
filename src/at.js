// ===== CONTROLE DE COMANDOS AT E RADAR BLE =====

let modoBleAtual = 'manual'; // 'manual' ou 'auto'
let dispositivosNaMemoria = new Set();
let radarIntervalId = null;

function abrirTelaComandosAT() {
    ocultarTodasAsTelas();
    mudarModoBle('manual'); 
    limparTerminalAT();
    
    const select = document.getElementById('select-dispositivos-ble');
    if (select) select.innerHTML = '<option value="">Selecione um dispositivo da lista...</option>';

    const tela = document.getElementById('tela-comandos-at');
    if (tela) tela.style.display = 'block';
    
    logNoConsoleDoApp("Tela de Comandos AT interativos carregada.", "info");
}

function mudarModoBle(modo) {
    modoBleAtual = modo;
    const btnManual = document.getElementById('btn-modo-manual');
    const btnAuto = document.getElementById('btn-modo-auto');
    const boxManual = document.getElementById('container-ble-manual');
    const boxAuto = document.getElementById('container-ble-auto');

    // Desliga loops automáticos se mudar de aba
    pararRadarAuto();

    if (modo === 'manual') {
        if (btnManual) btnManual.style.background = '#3b82f6';
        if (btnAuto) btnAuto.style.background = '#475569';
        if (boxManual) boxManual.style.display = 'block';
        if (boxAuto) boxAuto.style.display = 'none';
    } else {
        if (btnManual) btnManual.style.background = '#475569';
        if (btnAuto) btnAuto.style.background = '#3b82f6';
        if (boxManual) boxManual.style.display = 'none';
        if (boxAuto) boxAuto.style.display = 'block';
        // Popula memória inicial com o panorama de placas já ligadas
        tirarFotoDoAmbienteBle();
    }
}

// ================= MODO 1: MANUAL (SCAN & ESCOLA) =================
async function iniciarScanManual() {
    const btn = document.getElementById('btn-scan-ble');
    const select = document.getElementById('select-dispositivos-ble');
    if (btn) btn.innerText = "⏳ Escaneando...";
    if (select) select.innerHTML = '<option value="">Buscando placas...</option>';

    logNoConsoleDoApp("Iniciando varredura BLE manual...", "info");

    try {
        let lista = [];
        if (window.__TAURI__) {
            // Ajuste para chamar sua função real em Rust/Tauri se houver backend compilado
            lista = await window.__TAURI__.invoke("scan_ble_devices");
        } else {
            // Mock/Simulador caso rode em Web pura
            await new Promise(r => setTimeout(r, 1500));
            lista = [
                { id: "00:1A:7D:DA:71:11", name: "Chavi_Fechadura_003" },
                { id: "E621E1F8-C36C-495A-93FC-0C247A3E6E5F", name: "Chavi_Acionador_MacOS_Fake" }
            ];
        }

        if (select) select.innerHTML = '<option value="">Selecione um dispositivo da lista...</option>';
        
        lista.forEach(dev => {
            const idMostrar = dev.id.includes(":") ? dev.id : `UUID Mac: ...${dev.id.slice(-6)}`;
            const nomeStr = dev.name || "Sem Nome/Desconhecido";
            const opt = document.createElement('option');
            opt.value = dev.id;
            opt.innerText = `${nomeStr} (${idMostrar})`;
            select.appendChild(opt);
        });

        logNoConsoleDoApp(`Scan manual completo. ${lista.length} dispositivos listados.`, "sucesso");
    } catch (e) {
        logNoConsoleDoApp(`Erro no scanner manual: ${e.message}`, "erro");
        if (select) select.innerHTML = '<option value="">Erro ao buscar dispositivos.</option>';
    } finally {
        if (btn) btn.innerText = "🔍 Escanear";
    }
}

async function conectarBleSelecionado() {
    const select = document.getElementById('select-dispositivos-ble');
    if (!select || !select.value) {
        alert("Selecione uma placa para conectar!");
        return;
    }
    await realizarConexaoFisica(select.value);
}

// ================= MODO 2: RADAR AUTO-DETECÇÃO =================
async function tirarFotoDoAmbienteBle() {
    try {
        let ambiente = [];
        if (window.__TAURI__) {
            ambiente = await window.__TAURI__.invoke("scan_ble_devices");
        }
        dispositivosNaMemoria.clear();
        ambiente.forEach(d => dispositivosNaMemoria.add(d.id));
        logNoConsoleDoApp(`Radar: Guardou ${dispositivosNaMemoria.size} dispositivos iniciais na memória estática.`, "info");
    } catch (e) {
        console.error("Falha ao registrar ambiente inicial", e);
    }
}

function resetarMemoriaRadar() {
    tirarFotoDoAmbienteBle();
    appendTerminalAT("\n[Radar]: Memória de ambiente reiniciada.\n", "info");
}

function alternarRadarAuto() {
    const btn = document.getElementById('btn-radar-toggle');
    if (radarIntervalId) {
        pararRadarAuto();
    } else {
        if (btn) { btn.innerText = "🛑 Desligar Radar"; btn.style.background = "#ef4444"; }
        document.getElementById('status-radar-ble').style.display = "inline-block";
        document.getElementById('label-status-auto').innerText = "Radar Ativo! Aguardando nova placa ligar...";
        document.getElementById('label-status-auto').style.color = "#10b981";
        
        logNoConsoleDoApp("Radar de varredura ativa acionado.", "info");

        // Loop contínuo a cada 2.5 segundos buscando o intruso (placa recém-alimentada)
        radarIntervalId = setInterval(async () => {
            try {
                let atual = [];
                if (window.__TAURI__) {
                    atual = await window.__TAURI__.invoke("scan_ble_devices");
                }
                
                for (let dev of atual) {
                    if (!dispositivosNaMemoria.has(dev.id)) {
                        // INTRUSO DETECTADO! (Nova placa ligada)
                        pararRadarAuto(); 
                        
                        const idExibicao = dev.id.includes(":") ? dev.id : `UUID Mac: ...${dev.id.slice(-6)}`;
                        const querConectar = confirm(`✨ Nova Placa Encontrada!\n\nNome: ${dev.name || "Desconhecido"}\nIdentificador: ${idExibicao}\n\nDeseja realizar a conexão AT com ela agora?`);
                        
                        if (querConectar) {
                            await realizarConexaoFisica(dev.id);
                        } else {
                            // Se rejeitado, adiciona à memória para não perturbar de novo
                            dispositivosNaMemoria.add(dev.id);
                            alternarRadarAuto(); // religa o radar
                        }
                        break;
                    }
                }
            } catch (e) {
                console.error("Erro em loop de radar", e);
            }
        }, 2500);
    }
}

function pararRadarAuto() {
    if (radarIntervalId) {
        clearInterval(radarIntervalId);
        radarIntervalId = null;
    }
    const btn = document.getElementById('btn-radar-toggle');
    if (btn) { btn.innerText = "📡 Ligar Radar"; btn.style.background = "#eab308"; }
    
    const spinner = document.getElementById('status-radar-ble');
    if (spinner) spinner.style.display = "none";
    
    const label = document.getElementById('label-status-auto');
    if (label) { label.innerText = "Radar em espera. Ligue uma nova placa..."; label.style.color = "#fbbf24"; }
}

// ================= EFETIVAÇÃO DE CONEXÃO E COMANDOS AT =================
async function realizarConexaoFisica(idPlaca) {
    logNoConsoleDoApp(`Tentando conectar ao BLE: ${idPlaca}`, "info");
    appendTerminalAT(`\nConectando a [${idPlaca}]...\n`, "comando");

    try {
        if (window.__TAURI__) {
            await window.__TAURI__.invoke("connect_ble_device", { id: idPlaca });
        }
        logNoConsoleDoApp("Conectado com sucesso via BLE!", "sucesso");
        appendTerminalAT("Placa Conectada! Pronta para receber strings AT.\n", "resposta");
    } catch (e) {
        logNoConsoleDoApp(`Falha na conexão: ${e.message}`, "erro");
        appendTerminalAT(`Falha crítica de conexão: ${e.message}\n`, "erro");
    }
}

async function transmitirComandoAT(comandoString) {
    logNoConsoleDoApp(`Enviando: ${comandoString}`, "envio");
    appendTerminalAT(`> ${comandoString}\n`, "comando");

    try {
        if (window.__TAURI__) {
            const resposta = await window.__TAURI__.invoke("send_at_command", { comando: comandoString });
            appendTerminalAT(`${resposta}\n`, "resposta");
        } else {
            // Simulador local web
            setTimeout(() => {
                appendTerminalAT(`OK\n`, "resposta");
            }, 300);
        }
    } catch (erro) {
        logNoConsoleDoApp(`Erro no comando: ${erro.message}`, "erro");
        appendTerminalAT(`ERROR: ${erro.message}\n`, "erro");
    }
}

function enviarAtRapido(comando) { transmitirComandoAT(comando); }
function enviarAtCustomizado() {
    const input = document.getElementById('input-comando-at-custom');
    if (!input) return;
    const cmd = input.value.trim();
    if (!cmd) return;
    transmitirComandoAT(cmd);
    input.value = '';
}

function appendTerminalAT(texto, tipo) {
    const terminal = document.getElementById('terminal-resposta-at');
    if (!terminal) return;
    if (terminal.innerText.includes("Aguardando conexão")) terminal.innerText = "";
    terminal.innerText += texto;
    terminal.scrollTop = terminal.scrollHeight;
}

function limparTerminalAT() {
    const terminal = document.getElementById('terminal-resposta-at');
    if (terminal) terminal.innerText = "Terminal pronto. Envie strings AT...";
}

// Exportações explícitas
window.abrirTelaComandosAT = abrirTelaComandosAT;
window.mudarModoBle = mudarModoBle;
window.iniciarScanManual = iniciarScanManual;
window.conectarBleSelecionado = conectarBleSelecionado;
window.alternarRadarAuto = alternarRadarAuto;
window.resetarMemoriaRadar = resetarMemoriaRadar;
window.enviarAtRapido = enviarAtRapido;
window.enviarAtCustomizado = enviarAtCustomizado;
window.limparTerminalAT = limparTerminalAT;