import { listen } from '@tauri-apps/api/event';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// ===== ESTADO GLOBAL DO PRODUTO =====
const estado = {
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
const opcoes = {
    "Fechadura Digital": { hardware: ["v1.0", "v1.5"] },
    "Acionador Inteligente": { hardware: ["v1.0"] }
};

// ===== NAVEGAÇÃO =====
function mostrarTela(idTela) {
    document.querySelectorAll('.tela').forEach(tela => tela.style.display = 'none');
    document.getElementById(idTela).style.display = 'block';
}

function voltarPara(idTela) {
    mostrarTela(idTela);
}

// ===== SELEÇÃO DE PRODUTO & HARDWARE =====
function selecionarProduto(nomeProduto) {
    estado.produto = nomeProduto;
    document.getElementById('produto-label-hw').textContent = nomeProduto;
    montarListaHardware(nomeProduto);
    mostrarTela('tela-hardware');
}

function montarListaHardware(produto) {
    const lista = document.getElementById('lista-hardware');
    lista.innerHTML = ''; 
    opcoes[produto].hardware.forEach(versao => {
        const botao = document.createElement('button');
        botao.className = 'product-button';
        botao.innerHTML = `<span>${versao}</span>`;
        botao.onclick = () => selecionarHardware(versao);
        lista.appendChild(botao);
    });
}

function selecionarHardware(versao) {
    estado.hardwareBase = versao.replace('v', '').replace('.', '_');
    mostrarTela('tela-mosfet');
}

// ===== LÓGICA DO MOSFET & SELEÇÃO DE PINO =====
function selecionarMosfet(possuiMosfet) {
    estado.mosfet = possuiMosfet;
    
    if (possuiMosfet) {
        montarOpcoesPino();
        mostrarTela('tela-pino-mosfet');
    } else {
        estado.pinoMosfet = ""; 
        configurarBotaoVoltarDados(false);
        mostrarTela('tela-dados-dispositivo');
    }
}

function montarOpcoesPino() {
    const container = document.getElementById('botoes-pino');
    container.innerHTML = '';
    document.getElementById('input-pino-custom').value = '';

    if (estado.hardwareBase === "1_0") {
        document.getElementById('input-pino-custom').disabled = true;
        document.getElementById('input-pino-custom').placeholder = "Hardware 1.0 exige pinos 7, 8 ou 9";
        var pinosSugeridos = [7, 8, 9];
    } else {
        document.getElementById('input-pino-custom').disabled = false;
        document.getElementById('input-pino-custom').placeholder = "Outro pino (3 a 14)";
        var pinosSugeridos = [3, 5, 6, 8, 12]; 
    }

    pinosSugeridos.forEach(pino => {
        const botao = document.createElement('button');
        botao.className = 'product-button';
        botao.style.padding = "0.5rem 1rem";
        botao.innerHTML = `<span>Pino ${pino}</span>`;
        botao.onclick = () => salvarPinoESeguir(pino);
        container.appendChild(botao);
    });
}

function salvarPinoESeguir(pino) {
    estado.pinoMosfet = pino.toString();
    configurarBotaoVoltarDados(true);
    mostrarTela('tela-dados-dispositivo');
}

function salvarPinoCustomizado() {
    if (estado.hardwareBase === "1_0") {
        alert("Para a versão de Hardware 1.0, escolha estritamente as opções 7, 8 ou 9.");
        return;
    }
    const pinoInput = document.getElementById('input-pino-custom').value;
    if (!pinoInput || pinoInput < 3 || pinoInput > 14) {
        alert("Por favor, insira um pino válido entre 3 e 14.");
        return;
    }
    salvarPinoESeguir(pinoInput);
}

function configurarBotaoVoltarDados(comMosfet) {
    const botaoVoltar = document.getElementById('voltar-de-dados');
    botaoVoltar.onclick = () => mostrarTela(comMosfet ? 'tela-pino-mosfet' : 'tela-mosfet');
}

// ===== TRATAMENTO DE DADOS INICIAIS =====
function validarEDecidirResumo() {
    const canalRaw = document.getElementById('input-canal').value;
    const firmwareIdRaw = document.getElementById('input-firmware-id').value;

    if (!canalRaw || !firmwareIdRaw) {
        alert("Por favor, preencha o Canal e o ID do Firmware.");
        return;
    }

    estado.canal = canalRaw.padStart(3, '0');
    estado.firmwareId = firmwareIdRaw.padStart(6, '0');
    estado.serialNumber = `CH${estado.canal}FI${estado.firmwareId}`;

    if (estado.mosfet) {
        estado.hardwareVersionStr = `FI_${estado.hardwareBase}_400`;
    } else {
        estado.hardwareVersionStr = `FI_${estado.hardwareBase}`;
    }

    document.getElementById('resumo-serial-title').textContent = estado.serialNumber;
    mostrarResumo();
}

function mostrarResumo() {
    const estadoExibicao = { ...estado };
    delete estadoExibicao.macAddress;

    document.getElementById('resumo-conteudo').textContent = JSON.stringify(estadoExibicao, null, 2);
    
    let comandoPreview = `./upload2.sh -ch ${parseInt(estado.canal)} -fi ${parseInt(estado.firmwareId)} -hw ${estado.hardwareBase}`;
    if (estado.mosfet) {
        comandoPreview += ` -mosfet ${estado.pinoMosfet}`;
    }
    comandoPreview += ` -mac "AGUARDANDO_SCAN"`;

    document.getElementById('comando-string').textContent = comandoPreview;
    mostrarTela('tela-resumo');
}

// ===== MOTOR DE PROCESSAMENTO DA BANCADA =====
function processarAcao(tipoAcao) {
    const painelStatus = document.getElementById('status-execucao');
    const textoStatus = document.getElementById('texto-status');
    const gridBotoes = document.getElementById('grid-acoes');
    const btnVoltar = document.getElementById('btn-voltar-resumo');

    // Bloqueia a interface para evitar duplo clique acidental do operador
    gridBotoes.style.pointerEvents = 'none';
    gridBotoes.style.opacity = '0.5';
    btnVoltar.style.display = 'none';
    painelStatus.style.display = 'block';

// ==========================================
    // FLUXO ISOLADO: APENAS FIRMWARE (Via Rust)
    // ==========================================
    if (tipoAcao === 'apenas_firmware') {
        textoStatus.style.color = "#fbbf24";
        painelStatus.style.borderLeftColor = "#fbbf24";
        textoStatus.innerText = `📦 [COMPILAÇÃO ISOLADA] Iniciando motor portátil Chavi para hardware ${estado.hardwareVersionStr}...`;

        // Garante compatibilidade total pegando o invoke injetado no v2
        const invokeTauri = window.__TAURI__?.core?.invoke;

        if (!invokeTauri) {
            textoStatus.innerText = `❌ Erro de Sistema: Objeto global do Tauri não encontrado. Reinicie o app pelo terminal.`;
            textoStatus.style.color = "#ef4444";
            painelStatus.style.borderLeftColor = "#ef4444";
            gridBotoes.style.pointerEvents = 'all';
            gridBotoes.style.opacity = '1';
            btnVoltar.style.display = 'inline-block';
            return;
        }

        invokeTauri('gravar_firmware_bancada', {
            serialNumber: estado.serialNumber,
            hardwareVersion: estado.hardwareVersionStr,
            mosfetPin: estado.pinoMosfet
        })
        .then((mensagemSucesso) => {
            textoStatus.innerText = `✅ Sucesso: ${mensagemSucesso}`;
            textoStatus.style.color = "#10b981";
            painelStatus.style.borderLeftColor = "#10b981";
        })
        .catch((erroBackend) => {
            textoStatus.innerText = `❌ Falha no Processo:\n${erroBackend}`;
            textoStatus.style.color = "#ef4444";
            painelStatus.style.borderLeftColor = "#ef4444";
        })
        .finally(() => {
            gridBotoes.style.pointerEvents = 'all';
            gridBotoes.style.opacity = '1';
            btnVoltar.style.display = 'inline-block';
        });
        
        return; 
    }

    // ==========================================
    // FLUXOS RESTANTES (Simulados ou futuras rotinas Python)
    // ==========================================
    textoStatus.style.color = "#fbbf24";
    painelStatus.style.borderLeftColor = "#fbbf24";
    textoStatus.innerText = "🔍 [FASE 1] Bluetooth Ativo: Escaneando MAC Address do dispositivo...";

    setTimeout(() => {
        estado.macAddress = "00:11:22:33:44:55"; 
        
        let comandoReal = `./upload2.sh -ch ${parseInt(estado.canal)} -fi ${parseInt(estado.firmwareId)} -hw ${estado.hardwareBase}`;
        if (estado.mosfet) {
            comandoReal += ` -mosfet ${estado.pinoMosfet}`;
        }
        comandoReal += ` -mac "${estado.macAddress}"`;
        document.getElementById('comando-string').textContent = comandoReal;

        textoStatus.style.color = "#34d399";
        painelStatus.style.borderLeftColor = "#34d399";
        
        if (tipoAcao === 'completo_com_cadastro') {
            textoStatus.innerText = `⚡ [FASE 2] MAC: ${estado.macAddress} -> Gravando firmware (${estado.hardwareVersionStr}) e cadastrando equipamento...`;
        } else if (tipoAcao === 'completo_sem_cadastro') {
            textoStatus.innerText = `⚙️ [FASE 2] MAC: ${estado.macAddress} -> Executando gravação via upload2.sh...`;
        } else if (tipoAcao === 'apenas_at') {
            textoStatus.innerText = `📟 [FASE 2] MAC: ${estado.macAddress} -> Injetando comandos AT via ble.py...`;
        } else if (tipoAcao === 'apenas_teste') {
            textoStatus.innerText = `🧪 [FASE 2] MAC: ${estado.macAddress} -> Rodando rotina de testes de hardware...`;
        }

        setTimeout(() => {
            textoStatus.innerText = "✅ Processo concluído com sucesso na bancada!";
            textoStatus.style.color = "#10b981";
            painelStatus.style.borderLeftColor = "#10b981";

            gridBotoes.style.pointerEvents = 'all';
            gridBotoes.style.opacity = '1';
            btnVoltar.style.display = 'inline-block';
        }, 3000);

    }, 2000);
}

async function verificarAtualizacaoAutomatica() {
  try {
    // Importa o módulo do updater de dentro do ecossistema Tauri global
    const { checkUpdate, installUpdate } = window.__TAURI__.updater;
    const { relaunch } = window.__TAURI__.process;

    console.log("Checando se existem novas atualizações...");
    const update = await checkUpdate();

    if (update.shouldUpdate) {
      console.log(`Nova versão encontrada: ${update.manifest.version}`);
      
      // Opcional: Avisar o usuário com um alert ou modal customizado na tela
      // Se quiser que seja 100% invisível, delete a linha do alert abaixo
      alert(`Uma nova versão (${update.manifest.version}) está disponível! Vamos atualizar o sistema agora.`);

      // Dispara o download e a instalação em segundo plano
      await installUpdate();
      
      // Reinicia o aplicativo automaticamente já na versão nova
      await relaunch();
    } else {
      console.log("O software já está na versão mais recente.");
    }
  } catch (error) {
    console.error("Erro ao tentar buscar atualizações automaticamente:", error);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  
  // ==================== 1. FLUXO DE ATUALIZAÇÃO AUTOMÁTICA ====================
  // Executa a primeira checagem assim que o app abre
  verificarAtualizacaoAutomatica();

  // Fica rodando a verificação em loop em background a cada 1 hora
  setInterval(verificarAtualizacaoAutomatica, 3600000); 

  // ==================== 2. FLUXO DO TERMINAL DE LOGS DO AVRDUDE ====================
  const minhaCaixaDeLog = document.getElementById("seu-elemento-de-terminal");

  if (minhaCaixaDeLog) {
    // Começa a escutar o canal contínuo de logs enviado pela Thread do Rust
    await listen('log-terminal', (event) => {
      // Se um novo processo começar, limpa a tela para a nova gravação
      if (event.payload.includes("🚀 Preparando")) {
        minhaCaixaDeLog.innerText = "";
      }

      // Acrescenta a linha enviada pelo avrdude/sistema na sua interface gráfica
      minhaCaixaDeLog.innerText += event.payload;
      
      // Auto-scroll: joga a barra de rolagem sempre para baixo para acompanhar o progresso em tempo real
      minhaCaixaDeLog.scrollTop = minhaCaixaDeLog.scrollHeight;
    });
  } else {
    console.error("Erro: O elemento HTML do terminal não foi encontrado na página.");
  }
});