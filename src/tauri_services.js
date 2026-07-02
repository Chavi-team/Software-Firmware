// ===== SERVIÇOS DO ECOSSISTEMA TAURI V2 =====

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
    verificarAtualizacaoAutomatica();
    setInterval(() => verificarAtualizacaoAutomatica(), 3600000); 

    const btnManual = document.getElementById('btn-atualizar-software');
    if (btnManual) btnManual.onclick = () => verificarAtualizacaoAutomatica(true);

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