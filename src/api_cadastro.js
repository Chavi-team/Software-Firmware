// ===== CONFIGURAÇÕES DA API CHAVI (EXCLUSIVA PAINEL IMÓVEL) =====
const API_URL = "https://api-imoveis.chavi.com.br/v2/api/admin/devices";
const API_TOKEN = "13464|jhw4S5Vax7WWSBgFz8OieJbY7xETSh4kIVNS4EXEbb85b756";
const DEVICE_TYPE_ID = 1;

// ===== INTEGRAÇÕES DE API E REQUISIÇÕES REAIS =====
const ApiCadastroEquipamento = {
    async enviarCadastroPainel(dadosCadastro) {
        if (dadosCadastro.painel !== "imovel") {
            logNoConsoleDoApp(`[Bloqueado] A API atual é exclusiva para o Painel Imóvel. O painel selecionado foi: ${dadosCadastro.painel}`, "erro");
            return { success: false, message: "API incompatível com o painel selecionado." };
        }

        logNoConsoleDoApp(`[API Imóvel] Enviando serial ${dadosCadastro.serialNumber} para o servidor...`, "info");
        
        const headers = {
            "Authorization": `Bearer ${API_TOKEN}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        };
        
        const payloadCadastro = {
            "serial_number": dadosCadastro.serialNumber, 
            "mac_bluetooth": null,   
            "name": `Placa ${dadosCadastro.serialNumber}`, 
            "version": dadosCadastro.hardwareVersion === "v1.0" ? "1.0" : "1.5",
            "ble_version": "5",            
            "device_type_id": DEVICE_TYPE_ID
        };
        
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payloadCadastro)
            });
            
            if (response.status === 200 || response.status === 201) {
                const dadosRetorno = await response.json();
                const deviceId = dadosRetorno.id || (dadosRetorno.data && dadosRetorno.data.id);
                
                logNoConsoleDoApp(`[API Imóvel] Cadastrado com sucesso! ID Gerado: ${deviceId}`, "sucesso");
                
                if (deviceId) {
                    await this.vincularOrganizacao(deviceId, headers);
                }
                return { success: true, message: "Cadastrado com sucesso!" };
            }
            
            else if (response.status === 409 || response.status === 422) {
                logNoConsoleDoApp(`[API Imóvel] Equipamento já existente. Buscando ID antigo...`, "info");
                
                const urlBusca = `https://api-imoveis.chavi.com.br/v2/api/admin/devices?serial_number=${dadosCadastro.serialNumber}`;
                const resBusca = await fetch(urlBusca, { method: "GET", headers: headers });
                
                if (resBusca.status === 200) {
                    const buscaJson = await resBusca.json();
                    const listaDispositivos = buscaJson.data || [];
                    let deviceId = null;
                    
                    if (Array.isArray(listaDispositivos) && listaDispositivos.length > 0) {
                        deviceId = listaDispositivos[0].id;
                    } else if (buscaJson && buscaJson.id) {
                        deviceId = buscaJson.id;
                    }
                    
                    if (deviceId) {
                        logNoConsoleDoApp(`[API Imóvel] ID localizado: ${deviceId}. Refazendo vínculo...`, "info");
                        await this.vincularOrganizacao(deviceId, headers);
                        return { success: true, message: "Vínculo atualizado." };
                    } else {
                        logNoConsoleDoApp("Não foi possível extrair o ID numérico do dispositivo existente.", "erro");
                        return { success: false, message: "Falha ao capturar ID antigo." };
                    }
                } else {
                    logNoConsoleDoApp(`Falha ao buscar dispositivo existente. Status: ${resBusca.status}`, "erro");
                    return { success: false, message: "Erro ao buscar dispositivo." };
                }
            } 
            
            else {
                logNoConsoleDoApp(`Erro desconhecido no cadastro. Status: ${response.status}`, "erro");
                return { success: false, message: `Erro HTTP status ${response.status}` };
            }
            
        } catch (erro) {
            logNoConsoleDoApp(`Falha de comunicação HTTP na API: ${erro.message}`, "erro");
            return { success: false, message: erro.message };
        }
    },

    async vincularOrganizacao(deviceId, headers) {
        logNoConsoleDoApp(`[API Imóvel] Vinculando ID ${deviceId} à Organização 7...`, "info");
        const urlVinculo = "https://api-imoveis.chavi.com.br/v2/api/admin/devices/assign";
        
        const payloadVinculo = {
            "device_id": parseInt(deviceId),
            "organization_id": 7
        };
        
        try {
            const response = await fetch(urlVinculo, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payloadVinculo)
            });
            logNoConsoleDoApp(`[Ignorado] Resposta status ${response.status} no vínculo, prosseguindo como OK.`, "resposta");
        } catch (e) {
            logNoConsoleDoApp(`[Ignorado] Falha de rede no vínculo (${e.message}), prosseguindo como OK.`, "resposta");
        }
    }
};

// PERSISTÊNCIA DOS DADOS EM LOCALSTORAGE (Segurança contra reloads do App)
function obterDadosLote() {
    const salvo = localStorage.getItem("dadosFixosLoteChavi");
    return salvo ? JSON.parse(salvo) : null;
}

function salvarDadosLote(dados) {
    localStorage.setItem("dadosFixosLoteChavi", JSON.stringify(dados));
}

function limparDadosLote() {
    localStorage.removeItem("dadosFixosLoteChavi");
}

// Função principal de cadastro corrigida contra concorrência e reinicializações de página
async function executarCadastroManual(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const canalCru = document.getElementById('input-cad-canal').value.trim();
    const firmwareCru = document.getElementById('input-cad-firmware').value.trim();

    if (!canalCru || !firmwareCru) {
        alert("Por favor, preencha o Canal e o ID do Firmware!");
        return;
    }

    const btnCadastrar = document.getElementById("btn-enviar-cadastro-manual");
    if (btnCadastrar) {
        btnCadastrar.style.pointerEvents = "none";
        btnCadastrar.style.opacity = "0.6";
        btnCadastrar.innerText = "⏳ Cadastrando, aguarde...";
    }

    let loteAtivo = obterDadosLote();

    if (!loteAtivo) {
        const equipamento = document.getElementById('select-equipamento').value;
        const painel = document.getElementById('select-painel').value;
        const hardware = document.getElementById('select-cad-hardware').value;
        const temMosfet = document.getElementById('select-cad-mosfet').value;

        if (painel !== "imovel") {
            alert("Atenção: A API configurada aceita apenas cadastros para o 'Painel Imovel'!");
            if (btnCadastrar) { btnCadastrar.style.pointerEvents = "auto"; btnCadastrar.style.opacity = "1"; btnCadastrar.innerText = "Visualizar e Cadastrar ➔"; }
            return;
        }

        loteAtivo = {
            equipamento: equipamento,
            painel: painel,
            hardwareVersion: hardware === "1_0" ? "v1.0" : "v1.5",
            mosfet: temMosfet === "sim"
        };
        
        salvarDadosLote(loteAtivo);
        
        const blocoFixos = document.getElementById('campos-fixos-cadastro');
        if (blocoFixos) blocoFixos.style.display = 'none';

        logNoConsoleDoApp(`Lote de [${loteAtivo.equipamento}] iniciado para o Painel Imóvel. Campos fixos ocultados.`, "info");
    }

    const canalFormatado = canalCru.padStart(3, '0'); 
    const firmwareFormatado = firmwareCru.padStart(6, '0'); 
    
    let sufixosParaCadastrar = [loteAtivo.equipamento];
    if (loteAtivo.equipamento === "EI") {
        sufixosParaCadastrar = ["EI", "CI"]; 
    }

    let todosSucesso = true;
    let seriaisGeradosAlert = [];

    for (const sufixoAtual of sufixosParaCadastrar) {
        const serialGerado = `CH${canalFormatado}${sufixoAtual}${firmwareFormatado}`;
        seriaisGeradosAlert.push(serialGerado);

        const dadosCadastro = {
            painel: loteAtivo.painel,
            serialNumber: serialGerado,
            equipamento: sufixoAtual,
            canal: parseInt(canalCru),
            firmwareId: firmwareFormatado,
            hardwareVersion: loteAtivo.hardwareVersion,
            mosfet: loteAtivo.mosfet,
            dataCadastro: new Date().toISOString()
        };

        const respostaApi = await ApiCadastroEquipamento.enviarCadastroPainel(dadosCadastro);

        if (respostaApi.success) {
            if (window.bancoEquipamentos && typeof window.bancoEquipamentos.push === "function") {
                window.bancoEquipamentos.push(dadosCadastro);
            }
        } else {
            todosSucesso = false;
            break; 
        }
    }

    if (btnCadastrar) {
        btnCadastrar.style.pointerEvents = "auto";
        btnCadastrar.style.opacity = "1";
        btnCadastrar.innerText = "Visualizar e Cadastrar ➔";
    }

    if (todosSucesso) {
        const mensagemConfirmacao = sufixosParaCadastrar.length > 1
            ? `Acionador cadastrado duplo com sucesso no Painel Imóvel!\nGerados:\n- ${seriaisGeradosAlert[0]}\n- ${seriaisGeradosAlert[1]}`
            : `Fechadura cadastrada com sucesso no Painel Imóvel!\nGerado: ${seriaisGeradosAlert[0]}`;

        // Força a paragem total aqui!
        const querContinuar = confirm(`${mensagemConfirmacao}\n\nDeseja cadastrar outro equipamento mantendo as informações deste lote?`);
        
        if (querContinuar) {
            document.getElementById('input-cad-canal').value = '';
            document.getElementById('input-cad-firmware').value = '';
            document.getElementById('input-cad-canal').focus();
            logNoConsoleDoApp(`Memória mantida para [${loteAtivo.equipamento}]. Aguardando Canal e ID da próxima placa...`, "info");
        } else {
            limparDadosLote();
            document.getElementById('input-cad-canal').value = '';
            document.getElementById('input-cad-firmware').value = '';

            const blocoFixos = document.getElementById('campos-fixos-cadastro');
            if (blocoFixos) blocoFixos.style.display = 'block';

            logNoConsoleDoApp("Fluxo de lote finalizado pelo operador. Retornando.", "info");
            voltarPara('tela-produto');
        }
    } else {
        alert("Houve uma falha no envio para o Painel Imóvel. Verifique o terminal de logs.");
    }
}

function abrirTelaCadastroManual() {
    ocultarTodasAsTelas();
    limparDadosLote(); // Garante lote limpo ao entrar de forma fresca na tela
    
    const blocoFixos = document.getElementById('campos-fixos-cadastro');
    if (blocoFixos) blocoFixos.style.display = 'block';
    
    const tela = document.getElementById('tela-cadastro-equipamento');
    if (tela) tela.style.display = 'block';
}

function ocultarTodasAsTelas() {
    const telas = document.querySelectorAll('.tela');
    telas.forEach(tela => tela.style.display = 'none');
}

function voltarPara(idTela) {
    if (idTela === 'tela-produto') {
        limparDadosLote();
    }
    ocultarTodasAsTelas();
    const alvo = document.getElementById(idTela);
    if (alvo) alvo.style.display = 'block';
}

function logNoConsoleDoApp(mensagem, tipo = "info") {
    const consoleLog = document.getElementById('terminal-log');
    if (!consoleLog) return;

    const dataAtual = new Date().toLocaleTimeString();
    let prefixo = `[${dataAtual}] `;
    
    if (tipo === "sucesso") prefixo += "✅ ";
    else if (tipo === "erro") prefixo += "❌ ";
    else if (tipo === "envio") prefixo += "📤 [ENVIO]: ";
    else if (tipo === "resposta") prefixo += "📥 [RESPOSTA]: ";
    else prefixo += "ℹ️ ";

    consoleLog.innerHTML += `<br>${prefixo}${mensagem}`;
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

// Executa na inicialização do script para checar o estado atual da UI caso tenha ocorrido soft reload
(function conferirEstadoLoteAtual() {
    setTimeout(() => {
        const loteAtivo = obterDadosLote();
        const blocoFixos = document.getElementById('campos-fixos-cadastro');
        if (loteAtivo && blocoFixos) {
            blocoFixos.style.display = 'none';
        }
    }, 200);
})();

window.ApiCadastroEquipamento = ApiCadastroEquipamento;
window.executarCadastroManual = ejecutarCadastroManual;
window.abrirTelaCadastroManual = abrirTelaCadastroManual;
window.voltarPara = voltarPara;
window.logNoConsoleDoApp = logNoConsoleDoApp;