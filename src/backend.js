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

// Execução com checkup simultâneo de USBasp e ATmega antes de ir para a gravação física
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

    const painelStatus = document.getElementById('status-bancada-direta');
    const textoStatus = document.getElementById('texto-status-direto');
    
    painelStatus.style.display = 'block';
    textoStatus.style.color = "#fbbf24";
    textoStatus.innerHTML = `⚙️ <b>[PASSO 1/2] Checkup de Conectividade:</b> Procurando gravador USBasp conectado...`;

    const invokeTauri = window.__TAURI__?.core?.invoke;
    if (!invokeTauri) {
        textoStatus.innerText = `❌ Erro de Sistema: Interface de comunicação global do Tauri não encontrada.`;
        return;
    }

    // PASSO 1: O comando nativo do seu Rust faz a leitura de assinatura do chip
    invokeTauri('reconhecer_hardware_bancada', { hardwareVersion: hardwareVersionStr })
    .then(() => {
        textoStatus.style.color = "#10b981";
        textoStatus.innerHTML = `✅ <b>USBasp conectado:</b> OK!<br>✅ <b>Versão do ATmega:</b> OK!<br><br>🚀 Hardware reconhecido! Gravando o arquivo binário na memória Flash...`;

        setTimeout(() => {
            textoStatus.style.color = "#fbbf24";
            textoStatus.innerHTML = `📦 <b>[PASSO 2/2] Gravando Firmware:</b> Escrevendo binário na memória Flash... Por favor, não remova os cabos.`;

            // PASSO 2: Chama a execução da gravação real
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
                textoStatus.style.color = "#ef4444";
                textoStatus.innerHTML = `❌ <b>Falha na Gravação Física:</b>\n${erroGravar}`;
            });
        }, 1000);
    })
    .catch((erroReconhecimento) => {
        const erroStr = String(erroReconhecimento).toLowerCase();
        textoStatus.style.color = "#ef4444";
        
        if (erroStr.includes("could not find usb device") || erroStr.includes("usb device not found") || erroStr.includes("usbasp error")) {
            textoStatus.innerHTML = `❌ <b>[PASSO 1/2] Falha na USB:</b> Dispositivo gravador USBasp não foi localizado.<br><br>👉 <b>Ação Recomendada:</b> Verifique se o programador está bem encaixado na porta USB do computador.`;
        } else {
            textoStatus.innerHTML = `❌ <b>[PASSO 1/2] Falha no ATmega:</b> Não foi possível ler a assinatura do microcontrolador.<br><br>👉 <b>Ação Recomendada:</b> Ajuste o posicionamento da placa nos contatos e certifique-se de que está devidamente alimentada.`;
        }
    });
}


// =========================================================
// == LOGICAS ANTIGAS E FLUXOS DO SEU PRODUTO ATUAL MANTIDOS ==
// =========================================================

function selecionarProduto(nomeProduto) {
    window.estado.produto = nomeProduto;
    document.getElementById('produto-label-hw').textContent = nomeProduto;
    montarListaHardware(nomeProduto);
    window.mostrarTela('tela-hardware');
}

function montarListaHardware(produto) {
    const lista = document.getElementById('lista-hardware');
    lista.innerHTML = ''; 
    
    if (!window.opcoes || !window.opcoes[produto]) {
        console.error(`[Erro de Mapeamento] O produto "${produto}" não foi configurado em states.js`);
        lista.innerHTML = `<div style="color:#ef4444; padding:10px; font-weight:bold;">Mapeamento não encontrado para: ${produto}</div>`;
        return;
    }

    window.opcoes[produto].hardware.forEach(versao => {
        const botao = document.createElement('button');
        botao.className = 'product-button';
        botao.innerHTML = `<span>${versao}</span>`;
        botao.onclick = () => selecionarHardware(versao);
        lista.appendChild(botao);
    });
}

function selecionarHardware(versao) {
    window.estado.hardwareBase = versao.replace('v', '').replace('.', '_');
    window.mostrarTela('tela-mosfet');
}

function selecionarMosfet(possuiMosfet) {
    window.estado.mosfet = possuiMosfet;
    
    if (possuiMosfet) {
        window.estado.hardwareVersionStr = `FI_${window.estado.hardwareBase}_400`;
    } else {
        window.estado.hardwareVersionStr = `FI_${window.estado.hardwareBase}`;
    }

    if (window.estado.hardwareVersionStr === "FI_1_0_400" && possuiMosfet) {
        montarOpcoesPino();
        window.mostrarTela('tela-pino-mosfet');
    } else {
        window.estado.pinoMosfet = ""; 
        configurarBotaoVoltarDados(false);
        window.mostrarTela('tela-dados-dispositivo'); 
        configurarEventosTecladoEnter(); 
    }
}

function montarOpcoesPino() {
    const container = document.getElementById('botoes-pino');
    container.innerHTML = '';
    document.getElementById('input-pino-custom').value = '';

    const pinosSugeridos = [7, 8, 9];
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
    window.estado.pinoMosfet = pino.toString();
    configurarBotaoVoltarDados(true);
    window.mostrarTela('tela-dados-dispositivo');
    configurarEventosTecladoEnter(); 
}

function salvarPinoCustomizado() {
    if (window.estado.hardwareBase === "1_0") {
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
        botaoVoltar.onclick = () => {
            window.estado.canal = "";
            window.estado.firmwareId = "";
            window.estado.serialNumber = "";
            window.mostrarTela(comMosfet ? 'tela-pino-mosfet' : 'tela-mosfet');
        };
    }
}

function configurarEventosTecladoEnter() {
    setTimeout(() => {
        const inputCanal = document.getElementById('input-canal');
        const inputFirmware = document.getElementById('input-firmware-id');

        const dispararPorEnter = (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                validarEDecidirResumo();
            }
        };

        if (inputCanal) { inputCanal.removeEventListener('keydown', dispararPorEnter); inputCanal.addEventListener('keydown', dispararPorEnter); }
        if (inputFirmware) { inputFirmware.removeEventListener('keydown', dispararPorEnter); inputFirmware.addEventListener('keydown', dispararPorEnter); }
    }, 50);
}

function validarEDecidirResumo() {
    const canalRaw = document.getElementById('input-canal')?.value;
    const firmwareIdRaw = document.getElementById('input-firmware-id')?.value;

    if (!canalRaw || !firmwareIdRaw) {
        alert("Por favor, preencha o Canal e o ID do Firmware.");
        return;
    }

    window.estado.canal = canalRaw.padStart(3, '0');
    window.estado.firmwareId = firmwareIdRaw.padStart(6, '0');
    window.estado.serialNumber = `CH${window.estado.canal}FI${window.estado.firmwareId}`;

    if (window.estado.hardwareVersionStr !== "FI_1_0_400") {
        window.estado.pinoMosfet = "";
    }

    iniciarFluxoVerificacaoEGravacao();
}

function iniciarFluxoVerificacaoEGravacao() {
    window.mostrarTela('tela-status-bancada'); 
    const painelStatus = document.getElementById('status-execucao');
    const textoStatus = document.getElementById('texto-status');
    if (painelStatus) painelStatus.style.display = 'block';

    const invokeTauri = window.__TAURI__?.core?.invoke;
    if (!invokeTauri) return;

    invokeTauri('reconhecer_hardware_bancada', { hardwareVersion: window.estado.hardwareVersionStr })
    .then(() => {
        setTimeout(() => {
            const confirmarUpload = confirm("Deseja iniciar a gravação do firmware na placa agora?");
            if (confirmarUpload) {
                invokeTauri('gravar_firmware_bancada', {
                    serialNumber: window.estado.serialNumber,
                    hardwareVersion: window.estado.hardwareVersionStr,
                    mosfetPin: window.estado.pinoMosfet
                });
            }
        }, 1200);
    });
}

// Vincula todas as funções de mapeamento ao escopo do Window
window.selecionarProduto = selecionarProduto;
window.selecionarHardware = selecionarHardware;
window.selecionarMosfet = selecionarMosfet;
window.salvarPinoCustomizado = salvarPinoCustomizado;
window.validarEDecidirResumo = validarEDecidirResumo;
window.abrirTelaGravacaoDireta = abrirTelaGravacaoDireta;
window.atualizarInterfaceMosfetDireta = atualizarInterfaceMosfetDireta;
window.validarEGravarDireto = validarEGravarDireto;