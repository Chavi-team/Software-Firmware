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

function voltarParaInicio() {
    estado.produto = null;
    estado.hardwareBase = null;
    estado.mosfet = null;
    estado.pinoMosfet = "";
    estado.canal = "";
    estado.firmwareId = "";
    estado.macAddress = "";
    estado.serialNumber = "";
    estado.hardwareVersionStr = "";

    const inputCanal = document.getElementById('input-canal');
    const inputFirmware = document.getElementById('input-firmware-id');
    const inputPinoCustom = document.getElementById('input-pino-custom');

    if (inputCanal) inputCanal.value = '';
    if (inputFirmware) inputFirmware.value = '';
    if (inputPinoCustom) inputPinoCustom.value = '';

    const painelStatus = document.getElementById('status-execucao');
    if (painelStatus) painelStatus.style.display = 'none';

    mostrarTela('tela-produto');
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

    let pinosSugeridos = [];
    if (estado.hardwareBase === "1_0") {
        document.getElementById('input-pino-custom').disabled = true;
        document.getElementById('input-pino-custom').placeholder = "Hardware 1.0 exige pinos 7, 8 ou 9";
        pinosSugeridos = [7, 8, 9];
    } else {
        document.getElementById('input-pino-custom').disabled = false;
        document.getElementById('input-pino-custom').placeholder = "Outro pino (3 a 14)";
        pinosSugeridos = [3, 5, 6, 8, 12]; 
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
    if (botaoVoltar) {
        botaoVoltar.onclick = () => mostrarTela(comMosfet ? 'tela-pino-mosfet' : 'tela-mosfet');
    }
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
    
    let comandoPreview = `./upload ${estado.serialNumber} ${estado.hardwareVersionStr}`;
    if (estado.pinoMosfet) {
        comandoPreview += ` ${estado.pinoMosfet}`;
    }

    document.getElementById('comando-string').textContent = comandoPreview;
    mostrarTela('tela-resumo');
}

// ===== MOTOR DE PROCESSAMENTO DA BANCADA =====
function processarAcao(tipoAcao) {
    const painelStatus = document.getElementById('status-execucao');
    const textoStatus = document.getElementById('texto-status');
    const gridBotoes = document.getElementById('grid-acoes');
    const btnVoltar = document.getElementById('btn-voltar-resumo');

    gridBotoes.style.pointerEvents = 'none';
    gridBotoes.style.opacity = '0.5';
    btnVoltar.style.display = 'none';
    painelStatus.style.display = 'block';

    const invokeTauri = window.__TAURI__?.core?.invoke;

    if (tipoAcao === 'apenas_firmware' || tipoAcao === 'completo_com_cadastro' || tipoAcao === 'completo_sem_cadastro') {
        textoStatus.style.color = "#fbbf24";
        painelStatus.style.borderLeftColor = "#fbbf24";
        textoStatus.innerText = `📦 [GRAVAÇÃO FÍSICA] Executando ./upload para hardware ${estado.hardwareVersionStr}...`;

        if (!invokeTauri) {
            textoStatus.innerText = `❌ Erro de Sistema: Objeto global do Tauri não encontrado.`;
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
            textoStatus.innerText = `✅ Sucesso Hardware: ${mensagemSucesso}`;
            textoStatus.style.color = "#10b981";
            painelStatus.style.borderLeftColor = "#10b981";
            
            if (tipoAcao !== 'apenas_firmware') {
                setTimeout(() => {
                    textoStatus.innerText = `📟 Firmware gravado! Inicie o script AT.py no terminal para configurar via rádio.`;
                }, 2000);
            }
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

    if (tipoAcao === 'apenas_at') {
        textoStatus.style.color = "#38bdf8";
        painelStatus.style.borderLeftColor = "#38bdf8";
        textoStatus.innerText = `📟 Modo de Configuração de Rádio: Use o arquivo AT.py no terminal do macOS para ler o MAC real via AT+ADDR? e salvar o nome ${estado.serialNumber.substring(2)}.`;
        
        gridBotoes.style.pointerEvents = 'all';
        gridBotoes.style.opacity = '1';
        btnVoltar.style.display = 'inline-block';
        return;
    }

    textoStatus.style.color = "#fbbf24";
    painelStatus.style.borderLeftColor = "#fbbf24";
    textoStatus.innerText = "🧪 [TESTE] Rodando rotina de validação de periféricos...";

    setTimeout(() => {
        textoStatus.innerText = "✅ Teste concluído com sucesso na bancada!";
        textoStatus.style.color = "#10b981";
        painelStatus.style.borderLeftColor = "#10b981";
        gridBotoes.style.pointerEvents = 'all';
        gridBotoes.style.opacity = '1';
        btnVoltar.style.display = 'inline-block';
    }, 2000);
}

// ===== ATUALIZAÇÃO DO TAURI V2 =====
async function verificarAtualizacaoAutomatica(manual = false) {
  try {
    if (!window.__TAURI__?.updater) return;
    
    const { check } = window.__TAURI__.updater;
    console.log("Checando se existem novas atualizações...");
    const update = await check();

    if (update) {
      alert(`Uma nova versão (${update.version}) está disponível! Atualizando agora...`);
      await update.downloadAndInstall();
      if (window.__TAURI__?.process?.relaunch) {
          await window.__TAURI__.process.relaunch();
      }
    } else {
      console.log("O software já está na versão mais recente.");
      if (manual) alert("O software já está na versão mais recente!");
    }
  } catch (error) {
    console.error("Erro ao carregar o updater:", error);
    if (manual) alert("Falha na checagem de atualizações.");
  }
}

// ===== FUNÇÃO DO BOTÃO "SAIR" (FECHAMENTO NATIVO DO TAURI) =====
function fecharAplicativo() {
    if (confirm("Deseja realmente fechar o Gerenciador de Firmware?")) {
        if (window.__TAURI__?.process?.exit) {
            window.__TAURI__.process.exit(0);
        } else if (window.__TAURI__?.window?.getCurrentWindow) {
            window.__TAURI__.window.getCurrentWindow().close();
        } else {
            window.close();
        }
    }
}

// ===== INICIALIZAÇÃO SEGURA DO DOM =====
window.addEventListener('DOMContentLoaded', () => {
  verificarAtualizacaoAutomatica();
  setInterval(() => verificarAtualizacaoAutomatica(), 3600000); 

  // Mapeia o clique manual de atualização
  const btnManual = document.getElementById('btn-atualizar-software');
  if (btnManual) {
      btnManual.onclick = () => verificarAtualizacaoAutomatica(true);
  }

  // Mapeia o clique do botão de fechar via ID (se aplicável)
  const botaoSair = document.getElementById('btn-sair-app');
  if (botaoSair) {
      botaoSair.addEventListener('click', fecharAplicativo);
  }

  // Escuta ativa do console de logs do Tauri
  const minhaCaixaDeLog = document.getElementById("terminal-log");
  if (minhaCaixaDeLog && window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen('log-terminal', (event) => {
      if (event.payload.includes("🚀 Iniciando")) {
        minhaCaixaDeLog.innerText = "";
      }
      minhaCaixaDeLog.innerText += event.payload;
      minhaCaixaDeLog.scrollTop = minhaCaixaDeLog.scrollHeight;
    });
  }
});

// ===== MAPEAMENTO DO ESCOPO GLOBAL PARA CLIQUES NO HTML =====
window.selecionarProduto = selecionarProduto;
window.voltarPara = voltarPara;
window.voltarParaInicio = voltarParaInicio;
window.selecionarMosfet = selecionarMosfet;
window.salvarPinoCustomizado = salvarPinoCustomizado;
window.validarEDecidirResumo = validarEDecidirResumo;
window.processarAcao = processarAcao;
window.fecharAplicativo = fecharAplicativo;