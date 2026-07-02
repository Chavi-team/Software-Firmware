// ===== CONTROLE DE COMANDOS AT E RADAR BLE =====

let modoBleAtual = 'manual'; // 'manual' ou 'auto'
let dispositivosNaMemoria = new Set();
let radarIntervalId = null;

// Variável global para armazenar qual dispositivo do log o usuário clicou no Modo 1
let dispositivoBleSelecionadoId = "";

function abrirTelaComandosAT() {
    ocultarTodasAsTelas();
    mudarModoBle('manual'); 
    limparTerminalAT();
    
    // Reseta o estado da lista manual ao entrar na tela
    dispositivoBleSelecionadoId = "";
    const containerLista = document.getElementById('lista-dispositivos-ble-log');
    if (containerLista) {
        containerLista.innerHTML = '<div style="color: #64748b; padding: 10px; font-family: monospace; font-size: 0.85rem;">Nenhum scan executado ainda. Clique em Escanear...</div>';
    }
    const labelPlaca = document.getElementById('placa-selecionada-label');
    if (labelPlaca) labelPlaca.innerText = "Nenhuma";

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

// ================= MODO 1: MANUAL (SCAN & ESCOLHA ESTILO LOG) =================
async function iniciarScanManual() {
    console.log("🚀 [SCANNER] Botão clicado. Iniciando rotina...");
    const btn = document.getElementById('btn-scan-ble');
    const containerLista = document.getElementById('lista-dispositivos-ble-log');
    
    if (btn) btn.innerText = "⏳ Escaneando...";
    if (containerLista) {
        containerLista.innerHTML = '<div style="color: #fbbf24; padding: 10px; font-family: monospace; font-size: 0.85rem;">⏳ Buscando placas no barramento BLE...</div>';
    }

    try {
        let lista = [];
        if (window.__TAURI__) {
            console.log("🛰️ [SCANNER] Ambiente Tauri detectado. Invocando ponte com o Rust...");
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            lista = await invoke("scan_ble_devices");
            console.log("📥 [SCANNER] Resposta bruta recebida do Rust:");
            console.table(lista);
        } else {
            console.warn("🌐 [SCANNER] Executando em ambiente Web Puro. Usando simulador.");
            await new Promise(r => setTimeout(r, 1200));
            lista = [
                { id: "00:1A:7D:DA:71:11", name: "Chavi_Fechadura_003" },
                { id: "E621E1F8-C36C-495A-93FC-0C247A3E6E5F", name: "Chavi_Acionador_MOCK" },
                { id: "34b384ae-1d52-33ee-6f7a-b47f91447762", name: "Bass BH1 Lite" }
            ];
        }

        if (containerLista) containerLista.innerHTML = '';
        
        if (!lista || lista.length === 0) {
            console.log("⚠️ [SCANNER] O rádio Bluetooth não detectou nenhuma placa ativa.");
            if (containerLista) {
                containerLista.innerHTML = '<div style="color: #ef4444; padding: 10px; font-family: monospace; font-size: 0.85rem;">⚠️ Nenhuma placa encontrada por perto.</div>';
            }
            return;
        }

        // Renderiza cada placa encontrada como uma linha de log clicável
        lista.forEach(dev => {
            const idMostrar = dev.id.includes(":") ? dev.id : `UUID: ...${dev.id.slice(-8)}`;
            const nomeStr = dev.name || "Sem Nome";
            
            const logRow = document.createElement('div');
            logRow.style.padding = "8px 12px";
            logRow.style.borderBottom = "1px solid #1e293b";
            logRow.style.fontFamily = "monospace";
            logRow.style.fontSize = "0.85rem";
            logRow.style.color = "#38bdf8";
            logRow.style.cursor = "pointer";
            logRow.style.transition = "background 0.2s";
            logRow.className = "ble-log-item";
            
            logRow.innerHTML = `[📟 DISPOSITIVO] <span style="color: #fff; font-weight: bold;">${nomeStr}</span> — <span style="color: #94a3b8;">${idMostrar}</span>`;
            
            // Evento ao clicar na linha do log para selecionar a placa
            logRow.onclick = function() {
                document.querySelectorAll('.ble-log-item').forEach(el => {
                    el.style.background = "none";
                    el.style.color = "#38bdf8";
                });
                
                logRow.style.background = "#1e3a8a"; 
                logRow.style.color = "#34d399";
                
                dispositivoBleSelecionadoId = dev.id;
                document.getElementById('placa-selecionada-label').innerText = `${nomeStr} (${idMostrar})`;
                console.log(`📌 [SELECIONADO] Pronto para conexão: ${dev.id}`);
            };

            logRow.onmouseenter = () => { if(dispositivoBleSelecionadoId !== dev.id) logRow.style.background = "#0f172a"; };
            logRow.onmouseleave = () => { if(dispositivoBleSelecionadoId !== dev.id) logRow.style.background = "none"; };

            containerLista.appendChild(logRow);
        });

        console.log(`✅ [SCANNER] Interface populada com sucesso com ${lista.length} dispositivos.`);

    } catch (e) {
        console.error("🔴 [SCANNER] Erro crítico capturado na execução:", e);
        if (containerLista) {
            containerLista.innerHTML = `<div style="color: #ef4444; padding: 10px; font-family: monospace; font-size: 0.85rem;">🔴 Erro no Scanner: ${e}</div>`;
        }
    } finally {
        if (btn) btn.innerText = "🔍 Escanear";
    }
}

async function conectarBleSelecionado() {
    if (!dispositivoBleSelecionadoId) {
        alert("Por favor, clique em um dispositivo da lista antes de conectar!");
        return;
    }
    await realizarConexaoFisica(dispositivoBleSelecionadoId);
}

// ================= MODO 2: RADAR AUTO-DETECÇÃO =================
async function tirarFotoDoAmbienteBle() {
    console.log("📡 [RADAR] Tirando foto do ambiente para mapeamento...");
    try {
        let lista = [];
        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            lista = await invoke("scan_ble_devices");
        } else {
            lista = []; 
        }

        dispositivosNaMemoria.clear();
        lista.forEach(d => dispositivosNaMemoria.add(d.id));
        console.log(`✅ [RADAR] Foto tirada. ${lista.length} dispositivos mapeados em background.`);

    } catch (e) {
        console.error("🔴 [RADAR] Erro ao tirar foto do ambiente:", e);
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

        // Loop contínuo a cada 2.5 segundos buscando novas placas no barramento
        radarIntervalId = setInterval(async () => {
            try {
                let atual = [];
                if (window.__TAURI__) {
                    // CORREÇÃO TAURI V2: Mudado de window.__TAURI__.invoke para o core handler
                    const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
                    atual = await invoke("scan_ble_devices");
                }
                
                for (let dev of atual) {
                    if (!dispositivosNaMemoria.has(dev.id)) {
                        pararRadarAuto(); 
                        
                        const idExibicao = dev.id.includes(":") ? dev.id : `UUID Mac: ...${dev.id.slice(-6)}`;
                        const querConectar = confirm(`✨ Nova Placa Encontrada!\n\nNome: ${dev.name || "Desconhecido"}\nIdentificador: ${idExibicao}\n\nDeseja realizar a conexão AT com ela agora?`);
                        
                        if (querConectar) {
                            await realizarConexaoFisica(dev.id);
                        } else {
                            dispositivosNaMemoria.add(dev.id);
                            alternarRadarAuto(); 
                        }
                        break;
                    }
                }
            } catch (e) {
                console.error("❌ Erro tratado em loop de radar:", e);
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
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            await invoke("connect_ble_device", { id: idPlaca });
        }
        logNoConsoleDoApp("Conectado com sucesso via BLE!", "sucesso");
        appendTerminalAT("Placa Conectada! Pronta para receber strings AT.\n", "resposta");
    } catch (e) {
        logNoConsoleDoApp(`Falha na conexão: ${e.message || e}`, "erro");
        appendTerminalAT(`Falha crítica de conexão: ${e.message || e}\n`, "erro");
    }
}

async function transmitirComandoAT(comandoString) {
    logNoConsoleDoApp(`Enviando: ${comandoString}`, "envio");
    appendTerminalAT(`> ${comandoString}\n`, "comando");

    try {
        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            const resposta = await invoke("send_at_command", { comando: comandoString });
            appendTerminalAT(`${resposta}\n`, "resposta");
        } else {
            setTimeout(() => {
                appendTerminalAT(`OK\n`, "resposta");
            }, 300);
        }
    } catch (erro) {
        logNoConsoleDoApp(`Erro no comando: ${erro.message || erro}`, "erro");
        appendTerminalAT(`ERROR: ${erro.message || erro}\n`, "erro");
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

// Exportações explícitas para escopo global do app
window.abrirTelaComandosAT = abrirTelaComandosAT;
window.mudarModoBle = mudarModoBle;
window.iniciarScanManual = iniciarScanManual;
window.conectarBleSelecionado = conectarBleSelecionado;
window.alternarRadarAuto = alternarRadarAuto;
window.resetarMemoriaRadar = resetarMemoriaRadar;
window.enviarAtRapido = enviarAtRapido;
window.enviarAtCustomizado = enviarAtCustomizado;
window.limparTerminalAT = limparTerminalAT;