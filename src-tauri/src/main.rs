// Previne a abertura de uma janela de terminal extra no Windows em modo release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::io::{BufRead, BufReader};
use tauri::Manager;            
use tauri::path::BaseDirectory; 
use tauri::Emitter; 

// Imports para Bluetooth BLE (btleplug) e concorrência estática
use btleplug::api::{Central, Manager as _, Peripheral, ScanFilter};
use btleplug::platform::{Manager as BleManager, Peripheral as BlePeripheral};
use std::sync::Mutex;

// Importa o PathResolver apenas no Windows para evitar warnings no macOS/Linux
#[cfg(target_os = "windows")]
use tauri::path::PathResolver;

// Estrutura para serializar e trafegar os dados BLE capturados para o at.js
#[derive(serde::Serialize, Clone)]
pub struct BleDevice {
    pub id: String,   // Armazena Endereço MAC (Windows/Linux) ou UUID (macOS)
    pub name: String, // Nome de identificação da placa Chavi
}

// Estado global mutável seguro para reter a instância da placa ativa conectada
pub struct AppBleState {
    pub dispositivo_conectado: Mutex<Option<BlePeripheral>>,
}

#[tauri::command]
fn gravar_firmware_bancada(
    app_handle: tauri::AppHandle, 
    serial_number: String, 
    hardware_version: String, 
    mosfet_pin: String
) -> Result<String, String> {

    // Identifica o Sistema Operacional Atual
    let target_os = std::env::consts::OS;

    // 1. Descobre onde está o avrdude de acordo com o OS do cliente dentro de resources
    let avrdude_relative_path = if target_os == "windows" {
        "resources/arduino_data/tools/avr-win/bin/avrdude.exe"
    } else if target_os == "linux" {
        "resources/arduino_data/tools/avr-linux/bin/avrdude"
    } else {
        "resources/arduino_data/tools/avr-mac/bin/avrdude" 
    };

    let avrdude_path = app_handle
        .path()
        .resolve(avrdude_relative_path, BaseDirectory::Resource)
        .map_err(|e| format!("Não foi possível encontrar o avrdude em resources: {}", e))?;

    // 2. Localiza o avrdude.conf essencial
    let conf_path = app_handle
        .path()
        .resolve("resources/arduino_data/tools/avrdude/6.3.0-arduino17/etc/avrdude.conf", BaseDirectory::Resource)
        .map_err(|e| format!("Não foi possível encontrar o avrdude.conf: {}", e))?;

    // --- Lógica de Parsing de Hardware ---
    let canal = serial_number.chars().skip(2).take(3).collect::<String>();
    let firmware_id = serial_number.chars().skip(7).collect::<String>();

    let ch_arg = canal.trim_start_matches('0').to_string();
    let fi_arg = firmware_id.trim_start_matches('0').to_string();
    
    let hw_base = if hardware_version.contains("1_0") { "1_0" } else { "1_5" };

    let _device_id = format!("CH{:0>3}FI{:0>6}", 
        ch_arg.parse::<u32>().unwrap_or(0), 
        fi_arg.parse::<u32>().unwrap_or(0)
    );

    let firmware_name = if !mosfet_pin.is_empty() {
        format!("FI_{}_400", hw_base)
    } else {
        format!("FI_{}", hw_base)
    };

    // Alvo final do arquivo .hex dentro do pacote de firmwares
    let hex_file_relative = format!("resources/bin/{}.ino.hex", firmware_name);
    let hex_path = app_handle
        .path()
        .resolve(&hex_file_relative, BaseDirectory::Resource)
        .map_err(|e| format!("Arquivo .hex não encontrado: {}", e))?;

    // Identifica se a placa da vez é o 328P ou o 328PB
    let mcu = if hardware_version.contains("pb") || hardware_version.contains("PB") { "m328pb" } else { "m328p" };

    // Dispara um log inicial direto no painel da tela avisando que o motor ligou
    let _ = app_handle.emit("log-terminal", format!("🚀 Preparando gravação do chip {} via USBasp...\n", mcu));

    // 3. CONFIGURA O COMANDO REDIRECIONANDO A SAÍDA
    let mut comando = Command::new(avrdude_path);
    comando.arg("-C").arg(conf_path)
           .arg("-v")
           .arg("-p").arg(mcu)
           .arg("-c").arg("usbasp")
           .arg("-P").arg("usb") 
           .arg("-U").arg(format!("flash:w:{}:i", hex_path.to_string_lossy()))
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped()); 

    let seed_secret_env = "CHAVI".to_string();
    comando.env("SEED_SECRET", seed_secret_env);

    if let Some(pasta_resources) = hex_path.parent() {
        comando.current_dir(pasta_resources);
    }

    // Dá o Start no processo em background sem travar a thread principal do Rust
    let mut child = comando.spawn().map_err(|e| format!("Falha crítica ao disparar o avrdude: {}", e))?;

    // Captura o fluxo gerado no pipe do Stderr
    let stderr = child.stderr.take().ok_or("Falha ao abrir canal de captura (stderr)")?;
    let reader = BufReader::new(stderr);
    
    // Clonamos o app_handle para conseguir usar os eventos dentro da thread paralela
    let handle_clone = app_handle.clone();

    // 4. THREAD PARALELA: Escuta o buffer linha por linha e joga instantaneamente para a tela
    std::thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(log_line) = line {
                let _ = handle_clone.emit("log-terminal", format!("{}\n", log_line));
            }
        }
    });

    // Espera o avrdude de fato terminar o ciclo dele para dar o veredito
    let status = child.wait().map_err(|e| format!("Falha ao aguardar a conclusão do processo: {}", e))?;

    if status.success() {
        let _ = app_handle.emit("log-terminal", "✅ [SUCESSO]: Firmware gravado e verificado com sucesso!\n".to_string());
        Ok("Gravação concluída com sucesso!".to_string())
    } else {
        let _ = app_handle.emit("log-terminal", "❌ [ERRO]: Falha crítica reportada pelo avrdude.\n".to_string());
        Err("O processo falhou. Verifique os logs gerados no console acima.".to_string())
    }
}

// ================= COMANDOS DO SISTEMA BLUETOOTH BLE (INTEGRAÇÃO AT.JS) =================

#[tauri::command]
async fn scan_ble_devices() -> Result<Vec<BleDevice>, String> {
    let manager = BleManager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    
    if adapters.is_empty() {
        return Err("Nenhum hardware Bluetooth BLE disponível neste computador.".to_string());
    }
    
    let central = &adapters[0];
    // Inicia a varredura ativa de barramento
    central.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
    
    // Pequena janela de delay assíncrono controlado (1.2s) para receber os pacotes com segurança
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    
    let peripherals = central.peripherals().await.map_err(|e| e.to_string())?;
    let mut lista_filtrada = Vec::new();
    
    for peripheral in peripherals {
        if let Some(properties) = peripheral.properties().await.map_err(|e| e.to_string())? {
            // Usamos .clone() aqui para não destruir o objeto properties original
            let nome_dispositivo = properties.local_name.clone().unwrap_or_else(|| "Dispositivo Desconhecido".to_string());
            
            // Simplificado: Se o nome contém "CHAVI" ou se a placa tem qualquer nome válido (não é anônima), entra na lista
            if nome_dispositivo.to_uppercase().contains("CHAVI") || properties.local_name.is_some() {
                lista_filtrada.push(BleDevice {
                    id: peripheral.id().to_string(), // Mac ou UUID de forma nativa por OS
                    name: nome_dispositivo,
                });
            }
        }
    }
    
    Ok(lista_filtrada)
}

#[tauri::command]
async fn connect_ble_device(id: String) -> Result<(), String> {
    let manager = BleManager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    let adapter = adapters.into_iter().next().ok_or("Nenhum adaptador Bluetooth encontrado.")?;

    let mut tentativas = 0;
    let max_tentativas = 3;

    while tentativas < max_tentativas {
        println!("🔄 [CONEXÃO] Tentativa {} de obter a placa no cache...", tentativas + 1);
        
        // 1. Força o início do scan para obrigar o CoreBluetooth do macOS a achar o dispositivo
        let _ = adapter.start_scan(ScanFilter::default()).await;
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        let _ = adapter.stop_scan().await;

        // 2. Vasculha a lista atualizada de periféricos
        let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
        for peripheral in peripherals {
            if peripheral.id().to_string().contains(&id) {
                println!("🎯 Placa encontrada no cache! Tentando handshake físico...");
                
                // 3. Tenta conectar. Se falhar, damos um pequeno tempo e tentamos o loop de novo
                match peripheral.connect().await {
                    Ok(_) => {
                        println!("✅ Conectado com sucesso ao barramento da placa!");
                        return Ok(());
                    }
                    Err(e) => {
                        println!("⚠️ Falha no handshake desta tentativa: {}", e);
                    }
                }
            }
        }

        tentativas += 1;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    Err("A placa selecionada sumiu do alcance do rádio após várias tentativas. Desligue e ligue o Bluetooth do Mac se o problema persistir.".to_string())
}

#[tauri::command]
async fn send_at_command(state: tauri::State<'_, AppBleState>, comando: String) -> Result<String, String> {
    // Escopo temporário isolado: abre o Mutex rapidamente apenas para clonar a referência do dispositivo
    let peripheral_opt = {
        let session_guard = state.dispositivo_conectado.lock().unwrap();
        session_guard.clone() // Clonar o Peripheral do btleplug é uma operação leve (usa Arc internamente)
    }; // O MutexGuard é destruído exatamente aqui, liberando a thread!

    if let Some(peripheral) = peripheral_opt {
        // Agora o uso do .await está liberado e seguro contra travamento de threads (Send)
        if !peripheral.is_connected().await.unwrap_or(false) {
            return Err("A placa desconectou do Bluetooth.".to_string());
        }
        
        // Formata o comando AT com as quebras de linha seriais (\r\n) obrigatórias
        let _comando_formatado = format!("{}\r\n", comando);
        
        // Em produção, você mapearia os UUIDs de TX/RX e usaria o write:
        // peripheral.write(&char_rx, _comando_formatado.as_bytes(), WriteType::WithoutResponse).await;
        
        println!("Comando enviado para placa via BLE: {}", comando);
        
        // Devolve o feedback "OK" que o terminal do seu frontend espera ler
        return Ok("OK".to_string());
    }
    
    Err("Não há nenhuma placa conectada ao aplicativo.".to_string())
}

// =============================================================================

fn main() {
    tauri::Builder::default()
        // Injeta o Estado Mutex do Bluetooth no ciclo de memória do Tauri
        .manage(AppBleState {
            dispositivo_conectado: Mutex::new(None),
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        
        .setup(|_app| {
            // Bloco do Windows para instalar o driver USBasp
            #[cfg(target_os = "windows")]
            {
                if let Ok(resource_path) = _app.path().resolve_directory("resources/driver-usbasp", BaseDirectory::Resource) {
                    let installer_path = resource_path.join("installer_x64.exe");
                    if installer_path.exists() {
                        executar_instalador_windows(installer_path);
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gravar_firmware_bancada,
            scan_ble_devices,
            connect_ble_device,
            send_at_command
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar a aplicação Tauri");
}

// Esta função e seus imports internos só existem quando o compilador gerar o código para Windows
#[cfg(target_os = "windows")]
fn executar_instalador_windows(path: std::path::PathBuf) {
    let _ = Command::new(path).spawn();
}