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
                return { success: true, message: "Cadastrado com sucesso!", statusOrigem: "novo" };
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
                        return { success: true, message: "Vínculo atualizado.", statusOrigem: "existente" };
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
        btnCadastrar.innerText = "⏳ Processando, aguarde...";
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
    let contemEquipamentoExistente = false;

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
            if (respostaApi.statusOrigem === "existente") {
                contemEquipamentoExistente = true;
            }
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
        let tituloMensagem = contemEquipamentoExistente 
            ? "Equipamento sincronizado/localizado com sucesso!"
            : "Equipamento cadastrado com sucesso no Painel Imóvel!";

        const detalheSeriais = sufixosParaCadastrar.length > 1
            ? `Seriais operados:<br>• ${seriaisGeradosAlert[0]}<br>• ${seriaisGeradosAlert[1]}`
            : `Serial operado: ${seriaisGeradosAlert[0]}`;

        if (document.activeElement) document.activeElement.blur();

        // Criando uma Janela Customizada para evitar o bug do Enter fantasma do Tauri
        abrirModalConfirmacaoChavi(tituloMensagem, detalheSeriais);

    } else {
        alert("Houve uma falha crítica no envio ou consulta para o Painel Imóvel. Verifique os logs.");
    }
}

// ===== DIÁLOGO INTERNO SEGURO (NÃO CONGELA COM TECLADO) =====
function abrirModalConfirmacaoChavi(titulo, detalhes) {
    // Remove modal antiga se houver
    const antiga = document.getElementById("chavi-modal-lote");
    if (antiga) antiga.remove();

    const modal = document.createElement("div");
    modal.id = "chavi-modal-lote";
    modal.style = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(2, 6, 23, 0.85); display: flex; align-items: center; justify-content: center; z-index: 99999; font-family: sans-serif;";

    modal.innerHTML = `
        <div style="background: #1e293b; border: 1px solid #334155; padding: 2rem; border-radius: 12px; max-width: 450px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); color: #f8fafc; text-align: center;">
            <h3 style="margin-top: 0; color: #10b981; font-size: 1.25rem;">${titulo}</h3>
            <p style="background: #0f172a; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; border: 1px solid #1e293b; color: #38bdf8; margin: 1.5rem 0; line-height: 1.4; text-align: left;">
                ${detalhes}
            </p>
            <p style="margin-bottom: 1.5rem; font-size: 0.95rem; color: #94a3b8;">Deseja realizar um novo cadastro de equipamento?</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button id="btn-modal-sim" style="background: #10b981; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.95rem;">Sim</button>
                <button id="btn-modal-nao" style="background: #64748b; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.95rem;">Não, Voltar</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Evento de sim: limpa as caixas variantes e foca no Canal
    document.getElementById("btn-modal-sim").addEventListener("click", () => {
        modal.remove();
        document.getElementById('input-cad-canal').value = '';
        document.getElementById('input-cad-firmware').value = '';
        document.getElementById('input-cad-canal').focus();
        logNoConsoleDoApp("Mantendo lote ativo. Pronto para a próxima placa.", "info");
    });

    // Evento de não: limpa o lote e volta pra home
    document.getElementById("btn-modal-nao").addEventListener("click", () => {
        modal.remove();
        limparDadosLote();
        document.getElementById('input-cad-canal').value = '';
        document.getElementById('input-cad-firmware').value = '';

        const blocoFixos = document.getElementById('campos-fixos-cadastro');
        if (blocoFixos) blocoFixos.style.display = 'block';
        
        voltarPara('tela-produto');
        logNoConsoleDoApp("Lote encerrado por escolha do usuário. Retornando à tela inicial.", "info");
    });
}

// ===== SISTEMA DE NAVEGAÇÃO POR ENTER (EVITA ENVIO DE FORMULÁRIO PADRÃO) =====
document.addEventListener("DOMContentLoaded", () => {
    const campoCanal = document.getElementById('input-cad-canal');
    const campoFirmware = document.getElementById('input-cad-firmware');

    if (campoCanal) {
        campoCanal.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                if (campoFirmware) campoFirmware.focus();
            }
        });
    }

    if (campoFirmware) {
        campoFirmware.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                executarCadastroManual();
            }
        });
    }
});

window.ApiCadastroEquipamento = ApiCadastroEquipamento;
window.executarCadastroManual = executarCadastroManual;
window.limparDadosLote = limparDadosLote;