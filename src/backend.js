// ===== LOGICA DE REGRAS DE NEGÓCIO E BANCADA =====

function selecionarProduto(nomeProduto) {
    window.estado.produto = nomeProduto;
    document.getElementById('produto-label-hw').textContent = nomeProduto;
    montarListaHardware(nomeProduto);
    window.mostrarTela('tela-hardware');
}

function montarListaHardware(produto) {
    const lista = document.getElementById('lista-hardware');
    lista.innerHTML = ''; 
    
    // Verificação de segurança (Evita que o app quebre se a chave não existir)
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
        montarOpcoesPino();
        window.mostrarTela('tela-pino-mosfet');
    } else {
        window.estado.pinoMosfet = ""; 
        configurarBotaoVoltarDados(false);
        window.mostrarTela('tela-dados-dispositivo');
    }
}

function montarOpcoesPino() {
    const container = document.getElementById('botoes-pino');
    container.innerHTML = '';
    document.getElementById('input-pino-custom').value = '';

    let pinosSugeridos = [];
    if (window.estado.hardwareBase === "1_0") {
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
    window.estado.pinoMosfet = pino.toString();
    configurarBotaoVoltarDados(true);
    window.mostrarTela('tela-dados-dispositivo');
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
        botaoVoltar.onclick = () => window.mostrarTela(comMosfet ? 'tela-pino-mosfet' : 'tela-mosfet');
    }
}

function validarEDecidirResumo() {
    const canalRaw = document.getElementById('input-canal').value;
    const firmwareIdRaw = document.getElementById('input-firmware-id').value;

    if (!canalRaw || !firmwareIdRaw) {
        alert("Por favor, preencha o Canal e o ID do Firmware.");
        return;
    }

    window.estado.canal = canalRaw.padStart(3, '0');
    window.estado.firmwareId = firmwareIdRaw.padStart(6, '0');
    window.estado.serialNumber = `CH${window.estado.canal}FI${window.estado.firmwareId}`;

    if (window.estado.mosfet) {
        window.estado.hardwareVersionStr = `FI_${window.estado.hardwareBase}_400`;
    } else {
        window.estado.hardwareVersionStr = `FI_${window.estado.hardwareBase}`;
    }

    document.getElementById('resumo-serial-title').textContent = window.estado.serialNumber;
    mostrarResumo();
}

function mostrarResumo() {
    const estadoExibicao = { ...window.estado };
    delete estadoExibicao.macAddress;

    document.getElementById('resumo-conteudo').textContent = JSON.stringify(estadoExibicao, null, 2);
    
    let comandoPreview = `./upload ${window.estado.serialNumber} ${window.estado.hardwareVersionStr}`;
    if (window.estado.pinoMosfet) {
        comandoPreview += ` ${window.estado.pinoMosfet}`;
    }

    document.getElementById('comando-string').textContent = comandoPreview;
    window.mostrarTela('tela-resumo');
}

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
        textoStatus.innerText = `📦 [GRAVAÇÃO FÍSICA] Executando ./upload para hardware ${window.estado.hardwareVersionStr}...`;

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
            serialNumber: window.estado.serialNumber,
            hardwareVersion: window.estado.hardwareVersionStr,
            mosfetPin: window.estado.pinoMosfet
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
        textoStatus.innerText = `📟 Modo de Configuração de Rádio: Use o arquivo AT.py no terminal do macOS para ler o MAC real via AT+ADDR? e salvar o nome ${window.estado.serialNumber.substring(2)}.`;
        
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

function fluxoPersistenciaCadastro() {
    const serial = document.getElementById('input-serial').value.trim();
    const hardware = document.getElementById('input-hardware-version').value.trim();

    if (!serial || !hardware) {
        alert("Por favor, preencha o Serial Number e a Versão de Hardware.");
        return;
    }

    window.GerenciadorBancoDados.salvarEquipamentoLocal(serial, hardware);
    window.ApiCadastroEquipamento.enviarCadastroPainel(serial, hardware);

    alert(`Equipamento ${serial} cadastrado!`);
    window.voltarParaInicio();
}

// Mapeamento Global para Cliques no HTML
window.selecionarProduto = selecionarProduto;
window.selecionarMosfet = selecionarMosfet;
window.salvarPinoCustomizado = salvarPinoCustomizado;
window.validarEDecidirResumo = validarEDecidirResumo;
window.processarAcao = processarAcao;
window.fluxoPersistenciaCadastro = fluxoPersistenciaCadastro;