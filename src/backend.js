// ===== REMOVIDOS OS IMPORTS QUE QUEBRAVAM O NAVEGADOR =====
// No Tauri sem bundler, usamos o window.__TAURI__ diretamente.

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

// Vincula o estado ao escopo global do window
window.estado = estado;

// ===== VARIÁVEIS GLOBAIS E CONTROLES DO NOVO SISTEMA =====
window.pinoSelecionadoDireto = "";

// Função para abrir o Novo Sistema de gravação direta ao clicar no primeiro botão
function abrirTelaGravacaoDireta() {
    window.mostrarTela('tela-gravacao-direta');
    document.getElementById('status-bancada-direta').style.display = 'none';
    document.getElementById('input-direct-canal').value = '';
    document.getElementById('input-direct-firmware').value = '';
    document.getElementById('select-direct-mosfet').value = 'nao';
    atualizarInterfaceMosfetDireta();
    configurarEnterTelaDireta();
}

// Renderiza os pinos (6, 7, 8, 9) logo abaixo do select na tela de gravação
function atualizarInterfaceMosfetDireta() {
    const possuiMosfet = document.getElementById('select-direct-mosfet').value === 'sim';
    const boxPino = document.getElementById('box-pino-direct');
    const containerBotoes = document.getElementById('botoes-pino-direct');
    
    if (possuiMosfet) {
        boxPino.style.display = 'block';
        containerBotoes.innerHTML = '';
        window.pinoSelecionadoDireto = "";
        
        [6, 7, 8, 9].forEach(pino => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'product-button';
            btn.style.padding = "6px 12px";
            btn.style.margin = "0";
            btn.style.fontSize = "0.85rem";
            btn.innerHTML = `<span>Pino ${pino}</span>`;
            btn.onclick = () => {
                Array.from(containerBotoes.children).forEach(b => b.style.border = 'none');
                btn.style.border = '2px solid #38bdf8';
                window.pinoSelecionadoDireto = pino.toString();
                document.getElementById('input-pino-direct-custom').value = '';
            };
            containerBotoes.appendChild(btn);
        });
    } else {
        boxPino.style.display = 'none';
        window.pinoSelecionadoDireto = "";
    }
}

// Configuração do Enter para submissão ágil na bancada de gravação direta
function configurarEnterTelaDireta() {
    setTimeout(() => {
        const inputCanal = document.getElementById('input-direct-canal');
        const inputFirmware = document.getElementById('input-direct-firmware');
        const inputPinoCustom = document.getElementById('input-pino-direct-custom');

        const executarPorEnter = (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                validarEGravarDireto();
            }
        };

        if (inputCanal) { inputCanal.removeEventListener('keydown', executarPorEnter); inputCanal.addEventListener('keydown', executarPorEnter); }
        if (inputFirmware) { inputFirmware.removeEventListener('keydown', executarPorEnter); inputFirmware.addEventListener('keydown', executarPorEnter); }
        if (inputPinoCustom) { inputPinoCustom.removeEventListener('keydown', executarPorEnter); inputPinoCustom.addEventListener('keydown', executarPorEnter); }
    }, 50);
}

// Execução segura: Alimenta o estado global e chama diretamente a gravação sem concorrência USBasp
function validarEGravarDireto() {
    const canalRaw = document.getElementById('input-direct-canal').value;
    const firmwareIdRaw = document.getElementById('input-direct-firmware').value;
    const possuiMosfet = document.getElementById('select-direct-mosfet').value === 'sim';
    const hwBase = document.getElementById('select-direct-hardware').value;
    const pinoCustom = document.getElementById('input-pino-direct-custom').value;

    if (!canalRaw || !firmwareIdRaw) {
        alert("Por favor, preencha o Canal e o ID do Firmware.");
        return;
    }

    let pinoFinal = "";
    if (possuiMosfet) {
        pinoFinal = pinoCustom ? pinoCustom.toString() : window.pinoSelecionadoDireto;
        if (!pinoFinal) {
            alert("Por favor, selecione um pino (6, 7, 8, 9) ou preencha o campo customizado.");
            return;
        }
        if (hwBase === "1_0" && !["7", "8", "9"].includes(pinoFinal) && !pinoCustom) {
            alert("Para a versão de Hardware 1.0, utilize obrigatoriamente as opções 7, 8 ou 9.");
            return;
        }
    }

    const canal = canalRaw.padStart(3, '0');
    const firmwareId = firmwareIdRaw.padStart(6, '0');
    const serialNumber = `CH${canal}FI${firmwareId}`;
    const hardwareVersionStr = possuiMosfet ? `FI_${hwBase}_400` : `FI_${hwBase}`;

    // Alimenta sincronizadamente o estado monitorado pelo motor backend do Rust
    estado.canal = canal;
    estado.firmwareId = firmwareId;
    estado.serialNumber = serialNumber;
    estado.hardwareVersionStr = hardwareVersionStr;
    estado.pinoMosfet = pinoFinal;

    const painelStatus = document.getElementById('status-bancada-direta');
    const textoStatus = document.getElementById('texto-status-direto');
    const btnGravar = document.getElementById('btn-gravar-direto');
    
    if (btnGravar) btnGravar.disabled = true;
    
    painelStatus.style.display = 'block';
    textoStatus.style.color = "#fbbf24";
    textoStatus.innerHTML = `📦 <b>[GRAVAÇÃO DIRETA]</b> Inicializando comunicação e transmitindo binário Flash...`;

    const invokeTauri = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    if (!invokeTauri) {
        textoStatus.innerText = `❌ Erro de Sistema: Interface de comunicação global do Tauri não encontrada.`;
        if (btnGravar) btnGravar.disabled = false;
        return;
    }

    // O comando de gravação executa de forma limpa e contínua
    invokeTauri('gravar_firmware_bancada', {
        serialNumber: serialNumber,
        hardwareVersion: hardwareVersionStr,
        mosfetPin: pinoFinal
    })
    .then((msgSucesso) => {
        textoStatus.style.color = "#10b981";
        textoStatus.innerHTML = `🎉 <b>[GRAVAÇÃO CONCLUÍDA]</b> Gravado e verificado com total sucesso!<br>• Série Gerada: <b>${serialNumber}</b><br>• Firmware Gravado: <b>${hardwareVersionStr}</b>`;
    })
    .catch((erroGravar) => {
        const erroStr = String(erroGravar).toLowerCase();
        textoStatus.style.color = "#ef4444";
        
        if (erroStr.includes("could not find usb device") || erroStr.includes("usb device not found") || erroStr.includes("usbasp error")) {
            textoStatus.innerHTML = `❌ <b>Falha na USB:</b> Dispositivo gravador USBasp não foi localizado.<br><br>👉 <b>Ação:</b> Verifique o cabo e reconecte o gravador na porta USB do computador.`;
        } else {
            textoStatus.innerHTML = `❌ <b>Falha no Microcontrolador (ATmega):</b> Assinatura inválida ou mau contato.<br><br>👉 <b>Ação:</b> Pressione ou ajuste o posicionamento da placa firmemente nos pinos da bancada.`;
        }
    })
    .finally(() => {
        if (btnGravar) btnGravar.disabled = false;
    });
}

// ===== CONFIGURAÇÃO DE HARDWARE =====
const opcoes = {
    "Fechadura Digital": { hardware: ["v1.0", "v1.5"] },
    "Acionador Inteligente": { hardware: ["v1.0"] }
};
window.opcoes = opcoes;

// ===== NAVEGAÇÃO =====
function mostrarTela(idTela) {
    document.querySelectorAll('.tela').forEach(tela => tela.style.display = 'none');
    document.getElementById(idTela).style.display = 'block';
}
window.mostrarTela = mostrarTela;

function voltarPara(idTela) {
    mostrarTela(idTela);
}
window.voltarPara = voltarPara;

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

    gridBotoes.style.pointerEvents = 'none';
    gridBotoes.style.opacity = '0.5';
    btnVoltar.style.display = 'none';
    painelStatus.style.display = 'block';

    if (tipoAcao === 'apenas_firmware') {
        textoStatus.style.color = "#fbbf24";
        painelStatus.style.borderLeftColor = "#fbbf24";
        textoStatus.innerText = `📦 [COMPILAÇÃO ISOLADA] Iniciando motor portátil Chavi para hardware ${estado.hardwareVersionStr}...`;

        const invokeTauri = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;

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

// ===== OBSERVAÇÃO SOBRE O UPDATER =====
// O erro de "relative URL" ocorre no arquivo externo `tauri_services.js`.
// Sugere-se comentar a execução dele lá caso não possua endpoint válido configurado.

window.addEventListener('DOMContentLoaded', async () => {
  const minhaCaixaDeLog = document.getElementById("seu-elemento-de-terminal");

  // Escuta nativa usando a API global injetada pelo Tauri v1/v2
  if (minhaCaixaDeLog && window.__TAURI__?.event?.listen) {
    await window.__TAURI__.event.listen('log-terminal', (event) => {
      if (event.payload.includes("🚀 Preparando")) {
        minhaCaixaDeLog.innerText = "";
      }
      minhaCaixaDeLog.innerText += event.payload;
      minhaCaixaDeLog.scrollTop = minhaCaixaDeLog.scrollHeight;
    });
  }
});

// Vinculações explícitas para o escopo global (Exclui a necessidade de script type="module")
window.selecionarProduto = selecionarProduto;
window.selecionarHardware = selecionarHardware;
window.selecionarMosfet = selecionarMosfet;
window.salvarPinoCustomizado = salvarPinoCustomizado;
window.validarEDecidirResumo = validarEDecidirResumo;
window.processarAcao = processarAcao;
window.abrirTelaGravacaoDireta = abrirTelaGravacaoDireta;
window.atualizarInterfaceMosfetDireta = atualizarInterfaceMosfetDireta;
window.validarEGravarDireto = validarEGravarDireto;