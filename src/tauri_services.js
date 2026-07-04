// ===== SERVIÇOS DO ECOSSISTEMA TAURI V2 =====

// Alterado o nome para "Manual" e o padrão de "manual" para true, já que agora ela só roda por clique
async function verificarAtualizacaoManual() {
  try {
    if (!window.__TAURI__?.updater) return;
    
    const { check } = window.__TAURI__.updater;
    console.log("Checando se existem novas atualizações (Solicitação Manual)...");
    
    // Feedback visual simples ou log antes de começar
    const update = await check();

    if (update && update.available) { // No Tauri V2, checa-se update.available
      const confirmar = confirm(`Uma nova versão (${update.version}) está disponível! Deseja atualizar agora?`);
      if (confirmar) {
        alert("Baixando e instalando atualização... O aplicativo será reiniciado.");
        await update.downloadAndInstall();
        if (window.__TAURI__?.process?.relaunch) {
            await window.__TAURI__.process.relaunch();
        }
      }
    } else {
      console.log("O software já está na versão mais recente.");
      alert("O software já está na versão mais recente!");
    }
  } catch (error) {
    console.error("Erro ao carregar o updater:", error);
    alert("Falha na checagem de atualizações. Verifique sua conexão.");
  }
}

function fecharAplicativo() {
    console.log("2 - Botão de saída encontrado:");
    if (true || confirm("Deseja realmente fechar o Gerenciador de Firmware?")) {
        if (window.__TAURI__?.process?.exit) {
            window.__TAURI__.process.exit(0);
        } else if (window.__TAURI__?.window?.getCurrentWindow) {
            window.__TAURI__.window.getCurrentWindow().close();
        } else {
            window.close();
        }
    }
}

// Inicializador de escutas nativas
window.addEventListener('DOMContentLoaded', () => {
    // ❌ REMOVIDO: verificarAtualizacaoAutomatica();
    // ❌ REMOVIDO: setInterval(() => verificarAtualizacaoAutomatica(), 3600000); 

    // Mapeia o botão para disparar a função apenas quando clicado
    const btnManual = document.getElementById('btn-atualizar-software');
    if (btnManual) {
        btnManual.onclick = () => verificarAtualizacaoManual();
    }

    const botaoSair = document.getElementById('btn-sair-app');
    if (botaoSair) {
        botaoSair.addEventListener('click', fecharAplicativo);
        console.log("1 - Botão de saída mapeado com sucesso.");
    }

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

window.fecharAplicativo = fecharAplicativo;