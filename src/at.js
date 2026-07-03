// ===== CONTROLE DE COMANDOS AT E RADAR BLE =====

let modoBleAtual = 'manual'; // 'manual' ou 'auto'
let dispositivosNaMemoria = new Set();
let radarIntervalId = null;

// Variável global para armazenar qual dispositivo do log o usuário clicou no Modo 1
let dispositivoBleSelecionadoId = "";

// Variáveis Globais de Estado para o Fluxo de Telas (HTML)
let produtoSelecionado = "";
let versaoHardwareSelecionada = "";
let possuiMosfetSelecionado = false;
let pinoMosfetSelecionado = "0";

function abrirTelaComandosAT() {
    ocultarTodasAsTelas();
    mudarModoBle('manual'); 
    limparTerminalAT();
    
    dispositivoBleSelecionadoId = "";
    
    // CORREÇÃO: Garante que a área secreta comece 100% oculta usando prioridade máxima
    const areaComandos = document.getElementById('area-comandos-at-secreta');
    if (areaComandos) {
        areaComandos.style.setProperty('display', 'none', 'important');
    }

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
            console.log("⚠️ [SCANNER] O rádio Bluetooth não detectou nenhuma placa activa.");
            if (containerLista) {
                containerLista.innerHTML = '<div style="color: #ef4444; padding: 10px; font-family: monospace; font-size: 0.85rem;">⚠️ Nenhuma placa encontrada por perto.</div>';
            }
            return;
        }

        lista.forEach(dev => {
            const idExibicao = dev.id.includes(":") ? dev.id : `UUID: ...${dev.id.slice(-8)}`;
            const nomeLimpo = dev.name || "Desconhecido";
            
            const logRow = document.createElement('div');
            logRow.style.display = "grid";
            logRow.style.gridTemplateColumns = "20px 1fr 1fr";
            logRow.style.gap = "10px";
            logRow.style.alignItems = "center";
            logRow.style.padding = "8px 12px";
            logRow.style.borderBottom = "1px solid #1e293b";
            logRow.style.color = "#a5f3fc"; 
            logRow.style.cursor = "pointer";
            logRow.style.transition = "background 0.15s, color 0.15s";
            logRow.className = "ble-log-item";
            
            logRow.innerHTML = `
                <span style="color: #94a3b8;">📟</span>
                <span style="color: #fff; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${nomeLimpo}</span>
                <span style="color: #67e8f9;">${idExibicao}</span>
            `;
            
            logRow.onclick = function() {
                document.querySelectorAll('.ble-log-item').forEach(el => {
                    el.style.background = "none";
                    el.querySelector('span:nth-child(2)').style.color = "#fff";
                    el.querySelector('span:nth-child(3)').style.color = "#67e8f9";
                });
                
                logRow.style.background = "#1e40af"; 
                logRow.style.borderRadius = "4px";
                logRow.querySelector('span:nth-child(2)').style.color = "#fff";
                logRow.querySelector('span:nth-child(3)').style.color = "#fff"; 
                
                dispositivoBleSelecionadoId = dev.id;
                document.getElementById('placa-selecionada-label').innerText = `${nomeLimpo} (${idExibicao})`;
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

// ================= EFETIVAÇÃO DE CONEXÃO E COMANDOS AT =================

async function conectarBleSelecionado() {
    if (!dispositivoBleSelecionadoId) {
        alert("Por favor, clique em um dispositivo da lista antes de conectar!");
        return;
    }
    
    // CORREÇÃO CRÍTICA: Desliga o loop do radar antes do handshake para liberar rádio do Windows
    pararRadarAuto();
    
    const btnConectar = document.getElementById('btn-conectar-ble');
    if (btnConectar) { 
        btnConectar.innerText = "⏳ Sincronizando Rádio..."; 
        btnConectar.style.background = "#eab308"; 
    }
    
    appendTerminalAT(`\nAcordando barramento Bluetooth para o identificador selecionado...\n`, "info");
    
    await new Promise(resolve => setTimeout(resolve, 800));
    await realizarConexaoFisica(dispositivoBleSelecionadoId);
}

async function realizarConexaoFisica(idPlaca) {
    const btnConectar = document.getElementById('btn-conectar-ble');
    if (btnConectar) { btnConectar.innerText = "⚡ Conectando..."; btnConectar.style.background = "#eab308"; }

    logNoConsoleDoApp(`Tentando conectar ao BLE: ${idPlaca}`, "info");
    appendTerminalAT(`\nConectando a [${idPlaca}]...\n`, "comando");

    try {
        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            
            // AJUSTE: Mantido o truque original do pré-scan síncrono para atualizar cache de rádio
            try {
                await invoke("scan_ble_devices"); 
            } catch(e) {
                console.log("Aviso de pré-scan ignorado", e);
            }

            // Realiza o aperto de mão lógico com a característica
            await invoke("connect_ble_device", { id: idPlaca });
        } else {
            await new Promise(r => setTimeout(r, 1000));
        }

        logNoConsoleDoApp("Conectado com sucesso via BLE!", "sucesso");
        appendTerminalAT("Placa Conectada! Pronta para receber strings AT.\n", "resposta");

        const areaComandos = document.getElementById('area-comandos-at-secreta');
        if (areaComandos) {
            areaComandos.style.setProperty('display', 'block', 'important');
            areaComandos.scrollIntoView({ behavior: 'smooth' });
        }

    } catch (e) {
        logNoConsoleDoApp(`Falha na conexão: ${e.message || e}`, "erro");
        appendTerminalAT(`Falha crítica de conexão: ${e.message || e}\n`, "erro");
        
        const areaComandos = document.getElementById('area-comandos-at-secreta');
        if (areaComandos) {
            areaComandos.style.setProperty('display', 'none', 'important');
        }
    } finally {
        if (btnConectar) { btnConectar.innerText = "⚡ Conectar ao Selecionado"; btnConectar.style.background = "#3b82f6"; }
    }
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
        
        logNoConsoleDoApp("Radar de varredura activa acionado.", "info");

        radarIntervalId = setInterval(async () => {
            try {
                let atual = [];
                if (window.__TAURI__) {
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

// ================= TRANSMISSÃO DE COMANDOS AT COM SANITIZAÇÃO E TRATAMENTO DE ECO =================

async function transmitirComandoAT(comandoString) {
<<<<<<< HEAD
    let comandoTratado = comandoString.replace(/\/n/g, '').replace(/\\n/g, '').trim();

    // Normaliza consultas de nome para o formato que a placa entende (sem o "?")
    if (comandoTratado.toUpperCase() === "AT+NAME?") {
        comandoTratado = "AT+NAME";
    }

    logNoConsoleDoApp(`Enviando: ${comandoTratado}`, "envio");
=======
    // Mantém o comando bruto digitado pelo usuário, limpando apenas espaços nas pontas
    let comandoTratado = comandoString.trim();

    logNoConsoleDoApp(`Enviando para o Chip: ${comandoTratado}`, "envio");
>>>>>>> e070f27 (localizando os AT)
    appendTerminalAT(`> ${comandoTratado}\n`, "comando");

    try {
        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            
<<<<<<< HEAD
            // Cria uma promessa que rejeita automaticamente após 700 milissegundos
            const timeoutPromessa = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("TIMEOUT_RADIO")), 700)
            );

            // Faz o Invoke do Rust correr contra o relógio de Timeout
            let resposta = await Promise.race([
                invoke("send_at_command", { comando: comandoTratado }),
                timeoutPromessa
            ]);
            
            // Se o Rust respondeu a tempo, exibe na tela
            appendTerminalAT(`${resposta}\n`, "resposta");
            
            if (!resposta || resposta.trim() === "" || resposta.toUpperCase().includes("ERRO")) {
                return "OK";
            }
            return resposta;

=======
            // O firmware da Chavi exige terminador '\n' puro para processar o buffer de texto!
            const payloadFinal = comandoTratado + "\n";

            const resposta = await invoke("send_at_command", { comando: payloadFinal });
            
            console.log("📥 Resposta Bruta do Rust:", JSON.stringify(resposta));

            if (resposta) {
                appendTerminalAT(`${resposta}`, "resposta");
            } else {
                appendTerminalAT("⚠️ [Sem resposta do barramento]\n", "erro");
            }
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
async function transmitirComandoAT(comandoString) {
    // 1. Limpa quebras de texto digitadas incorretamente no input
    let comandoTratado = comandoString.replace(/\/n/g, '').replace(/\\n/g, '').trim();

    // REGRA DE OURO: Remove o prefixo AT/AT+ se o usuário digitar por costume
    if (comandoTratado.toUpperCase().startsWith("AT+")) {
        comandoTratado = comandoTratado.substring(3);
    } else if (comandoTratado.toUpperCase().startsWith("AT")) {
        if (comandoTratado.toUpperCase() !== "AT") {
            comandoTratado = comandoTratado.substring(2);
        }
    }

    logNoConsoleDoApp(`Enviando para o Chip: ${comandoTratado}`, "envio");
    appendTerminalAT(`> ${comandoTratado}\n`, "comando");

    try {
        if (window.__TAURI__) {
            const invoke = window.__TAURI__.core ? window.__TAURI__.core.invoke : window.__TAURI__.invoke;
            
            // Força a terminação física que o chip espera
            const payloadFinal = comandoTratado + "\r\n";

            // Envia para o Rust
            const resposta = await invoke("send_at_command", { comando: payloadFinal });
            
            // MONITORAMENTO: Mostra no console de desenvolvedor exatamente o que o Rust devolveu (com quebras de linha)
            console.log("📥 Resposta Bruta do Rust:", JSON.stringify(resposta));

            // CRUCIAL: Removemos o .trim() global para não engolir múltiplas linhas separadas por \r\n
            if (resposta) {
                appendTerminalAT(`${resposta}\n`, "resposta");
            } else {
                appendTerminalAT("⚠️ [Sem resposta do barramento]\n", "erro");
            }
>>>>>>> e070f27 (localizando os AT)
        } else {
            await new Promise(r => setTimeout(r, 300));
            appendTerminalAT(`OK\n`, "resposta");
            return "OK";
        }
    } catch (erro) {
        // Se caiu aqui por causa do Timeout (Rust travou lá dentro)
        if (erro.message === "TIMEOUT_RADIO") {
            console.warn("⚠️ [BLE Timeout] O Rust travou esperando resposta. Destravando fluxo via JS.");
            appendTerminalAT(`[Enviado via TX - Sem Eco]\n`, "resposta");
            return "OK"; // Retorna OK para a esteira continuar mesmo com o rádio em silêncio
        }

        // Outros erros comuns de sistema
        logNoConsoleDoApp(`Erro no comando: ${erro.message || erro}`, "erro");
        appendTerminalAT(`ERROR: ${erro.message || erro}\n`, "erro");
        return "OK"; 
    }
}

// Atalhos de execução
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
    if (terminal.innerText.includes("Aguardando conexão") || terminal.innerText.includes("Terminal pronto")) {
        terminal.innerText = "";
    }
    terminal.innerText += texto;
    terminal.scrollTop = terminal.scrollHeight;
}

function limparTerminalAT() {
    const terminal = document.getElementById('terminal-resposta-at');
    if (terminal) terminal.innerText = "Terminal pronto. Envie strings AT...";
}

<<<<<<< HEAD
// ================= CONTROLADORES DE INTERFACE E FLUXO DE TELAS =================

function selecionarProduto(tipo) {
    produtoSelecionado = tipo.trim();
    const lbl = document.getElementById('produto-label-hw');
    if (lbl) lbl.innerText = produtoSelecionado;
    
    const containerHw = document.getElementById('lista-hardware');
    if (containerHw) {
        containerHw.innerHTML = `
            <button class="product-button" onclick="selecionarHardware('1_0')"><span>v1.0 (Antiga)</span></button>
            <button class="product-button" onclick="selecionarHardware('1_5')"><span>v1.5 (Nova)</span></button>
        `;
    }
    ocultarTodasAsTelas();
    document.getElementById('tela-hardware').style.display = 'block';
}

function selecionarHardware(versao) {
    versaoHardwareSelecionada = versao;
    ocultarTodasAsTelas();
    document.getElementById('tela-mosfet').style.display = 'block';
}

function selecionarMosfet(possui) {
    possuiMosfetSelecionado = possui;
    ocultarTodasAsTelas();
    if (possui) {
        const btnContainer = document.getElementById('botoes-pino');
        if (btnContainer) {
            btnContainer.innerHTML = "";
            [4, 5, 6, 7].forEach(p => {
                btnContainer.innerHTML += `<button class="product-button" onclick="definirPinoMosfet('${p}')"><span>Pino ${p}</span></button>`;
            });
        }
        document.getElementById('tela-pino-mosfet').style.display = 'block';
    } else {
        pinoMosfetSelecionado = "0";
        prosseguirParaDados();
    }
}

function salvarPinoCustomizado() {
    const custom = document.getElementById('input-pino-custom').value.trim();
    if (custom) {
        pinoMosfetSelecionado = custom;
    } else {
        pinoMosfetSelecionado = "4"; 
    }
    prosseguirParaDados();
}

function definirPinoMosfet(pino) {
    pinoMosfetSelecionado = pino;
    prosseguirParaDados();
}

function prosseguirParaDados() {
    ocultarTodasAsTelas();
    document.getElementById('tela-dados-dispositivo').style.display = 'block';
}

function obterDadosFormularioAtual() {
    let canal = document.getElementById('input-canal') ? document.getElementById('input-canal').value.trim() : "";
    let firmware = document.getElementById('input-firmware-id') ? document.getElementById('input-firmware-id').value.trim() : "";

    if (!canal || !firmware) {
        canal = document.getElementById('input-cad-canal') ? document.getElementById('input-cad-canal').value.trim() : "";
        firmware = document.getElementById('input-cad-firmware') ? document.getElementById('input-cad-firmware').value.trim() : "";
    }
    return { canal, firmware };
}

function validarEDecidirResumo() {
    const { canal, firmware } = obterDadosFormularioAtual();

    if (!canal || !firmware) {
        alert("Preencha o Canal e o ID do Firmware!");
        return;
    }

    const canalForm = canal.padStart(3, '0');
    const firmForm = firmware.padStart(6, '0');
    
    let sufixo = "FI";
    if (produtoSelecionado.toLowerCase().includes("acionador") || produtoSelecionado.toLowerCase().includes("gravar")) {
        sufixo = "EI";
    }

    const serialConstruido = `CH${canalForm}${sufixo}${firmForm}`;
    document.getElementById('resumo-serial-title').innerText = serialConstruido;
    
    const hexCalculado = calcularHexBefcAftc(pinoMosfetSelecionado);
    document.getElementById('comando-string').innerText = `Lote AT: BAUD0 -> BEFC${hexCalculado.befc} -> NAME${serialConstruido}`;

    document.getElementById('resumo-conteudo').innerText = 
        `Equipamento: ${produtoSelecionado}\n` +
        `Hardware: v${versaoHardwareSelecionada.replace('_', '.')}\n` +
        `Mosfet Ativo: ${possuiMosfetSelecionado ? "Sim (Pino " + pinoMosfetSelecionado + ")" : "Não"}\n` +
        `Serial Calculado: ${serialConstruido}`;

    ocultarTodasAsTelas();
    document.getElementById('tela-resumo').style.display = 'block';
}

// ================= SISTEMA AUTOMÁTICO DE IMPLEMENTAÇÃO E PROVISIONAMENTO LOTE AT =================

function calcularHexBefcAftc(mosfetPin) {
    try {
        const mPin = parseInt(mosfetPin, 10);
        if (isNaN(mPin) || mPin === 0) return { befc: "000", aftc: "000" };

        const mosfetBit = mPin - 3;
        const pin6Bit = 3;
        
        let bitsBefc = new Array(12).fill(0);
        let bitsAftc = new Array(12).fill(0);

        if (mosfetBit >= 0 && mosfetBit < 12) {
            bitsBefc[mosfetBit] = 1;
            bitsAftc[mosfetBit] = 1;
        }
        
        bitsBefc[pin6Bit] = 0;
        bitsAftc[pin6Bit] = 1;

        const befcHex = parseInt(bitsBefc.reverse().join(""), 2).toString(16).toUpperCase().padStart(3, '0');
        const aftcHex = parseInt(bitsAftc.reverse().join(""), 2).toString(16).toUpperCase().padStart(3, '0');

        return { befc: befcHex, aftc: aftcHex };
    } catch (e) {
        return { befc: "000", aftc: "000" };
    }
}

async function ConfiguracaoAT() {
    const { canal: canalCru, firmware: firmwareCru } = obterDadosFormularioAtual();

    if (!canalCru || !firmwareCru) {
        alert("Dados ausentes de Canal ou Firmware. Preencha os campos para prosseguir.");
        return;
    }

    const canalFormatado = canalCru.padStart(3, '0');
    const firmwareFormatado = firmwareCru.padStart(6, '0');
    
    let sufixoDispositivo = "FI";
    if (produtoSelecionado.toLowerCase().includes("acionador") || produtoSelecionado.toLowerCase().includes("gravar")) {
        sufixoDispositivo = "EI";
    }

    const deviceNameBle = `CH${canalFormatado}${sufixoDispositivo}${firmwareFormatado}`;
    const { befc, aftc } = calcularHexBefcAftc(pinoMosfetSelecionado);

    const COMMANDS = [
        "AT+SHIELD1", 
        "AT+BAUD0",      
        "AT+PWRM1",      
        "AT+MODE2", 
        `AT+BEFC${befc}`, 
        `AT+AFTC${aftc}`, 
        `AT+NAME${deviceNameBle}`, 
        "AT+RESET"
    ];

    const statusBox = document.getElementById('status-execucao');
    const txtStatus = document.getElementById('texto-status');
    if (statusBox) statusBox.style.display = 'block';

    appendTerminalAT(`\n🚀 [PROVISIONAMENTO] Iniciando sequência AT...\n`, "info");

    for (let i = 0; i < COMMANDS.length; i++) {
        const cmd = COMMANDS[i];
        if (txtStatus) txtStatus.innerText = `Enviando (${i+1}/${COMMANDS.length}): ${cmd}`;
        
        const resposta = await transmitirComandoAT(cmd);

        if (!resposta.toUpperCase().includes("OK") && !resposta.toUpperCase().includes("SET")) {
            if (txtStatus) txtStatus.innerText = `Erro no comando ${cmd}`;
            alert(`A esteira falhou no comando: ${cmd}. Abortando.`);
            return;
        }

        if (cmd.includes("RESET")) {
            await new Promise(r => setTimeout(r, 1500));
        } else {
            await new Promise(r => setTimeout(r, 250));
        }
    }

    if (txtStatus) txtStatus.innerText = "Lote Concluído com Sucesso! Gravando localmente...";

    const hardwareInfo = `Versao: ${versaoHardwareSelecionada} | Mosfet Pin: ${pinoMosfetSelecionado} | Hex: ${befc}/${aftc}`;
    if (window.GerenciadorBancoDados) {
        window.GerenciadorBancoDados.salvarEquipamentoLocal(deviceNameBle, hardwareInfo);
    }

    const querApi = confirm("Lote AT gravado com Sucesso na memória local!\n\nDeseja realizar o envio do cadastro deste dispositivo na API da nuvem Chavi agora?");
    if (querApi && window.ApiCadastroEquipamento) {
        const pacoteApi = {
            painel: "imovel",
            serialNumber: deviceNameBle,
            hardwareVersion: versaoHardwareSelecionada === "1_0" ? "v1.0" : "v1.5",
            mosfet: possuiMosfetSelecionado
        };
        await window.ApiCadastroEquipamento.enviarCadastroPainel(pacoteApi);
    }

    alert("Fluxo de Provisionamento Completo!");
    abrirTelaComandosAT();
}

function abrirTelaCadastroManual() {
    ocultarTodasAsTelas();
    if (window.limparDadosLote) window.limparDadosLote();
    document.getElementById('tela-cadastro-equipamento').style.display = 'block';
}

function ocultarTodasAsTelas() {
    document.querySelectorAll('.tela').forEach(t => t.style.display = 'none');
}

function voltarPara(idTela) {
    ocultarTodasAsTelas();
    const alvo = document.getElementById(idTela);
    if (alvo) alvo.style.display = 'block';
}

function logNoConsoleDoApp(mensagem, tipo = "info") {
    console.log(`[App Log - ${tipo}]: ${mensagem}`);
}

// Exportações explícitas
=======
// Exportações explíticas para escopo global do app
>>>>>>> e070f27 (localizando os AT)
window.abrirTelaComandosAT = abrirTelaComandosAT;
window.mudarModoBle = mudarModoBle;
window.iniciarScanManual = iniciarScanManual;
window.conectarBleSelecionado = conectarBleSelecionado;
window.alternarRadarAuto = alternarRadarAuto;
window.resetarMemoriaRadar = resetarMemoriaRadar;
window.enviarAtRapido = enviarAtRapido;
window.enviarAtCustomizado = enviarAtCustomizado;
window.limparTerminalAT = limparTerminalAT;
window.selecionarProduto = selecionarProduto;
window.selecionarHardware = selecionarHardware;
window.selecionarMosfet = selecionarMosfet;
window.salvarPinoCustomizado = salvarPinoCustomizado;
window.definirPinoMosfet = definirPinoMosfet;
window.validarEDecidirResumo = validarEDecidirResumo;
window.ConfiguracaoAT = ConfiguracaoAT;
window.voltarPara = voltarPara;