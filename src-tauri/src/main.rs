// test de AT

// Previne a abertura de uma janela de terminal extra no Windows em modo release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::io::{BufRead, BufReader};
use tauri::Manager;            
use tauri::path::BaseDirectory; 
use tauri::Emitter; 

// Imports para Bluetooth BLE (btleplug) e concorrência estática
use btleplug::api::{Central, WriteType, Manager as _, Peripheral, ScanFilter};
use btleplug::platform::{Manager as BleManager, Peripheral as BlePeripheral};
use std::sync::Mutex;
use uuid::Uuid;

// Trait de stream que o btleplug/futures-util traz nativamente para o escopo
use futures_util::stream::StreamExt;

// Importa o PathResolver apenas no Windows para evitar warnings no macOS/Linux
#[cfg(target_os = "windows")]
use tauri::path::PathResolver;

// Estrutura para serializar e trafegar os dados BLE capturados para o at.js
#[derive(serde::Serialize, Clone)]
pub struct BleDevice {
    pub id: String,   // Armazena Endereço MAC (Windows/Linux) ou UUID (macOS)
    pub name: String, // Nome de identificação da placa Chavi
}

// Estado global mutável seguro para reter a instância da placa activa conectada
pub struct AppBleState {
    pub dispositivo_conectado: Mutex<Option<BlePeripheral>>,
}

// ================= NOVO COMANDO: RECONHECER PLACA ANTES DE TUDO =================
#[tauri::command]
fn reconhecer_hardware_bancada(
    app_handle: tauri::AppHandle, 
    hardware_version: String
) -> Result<String, String> {
    let target_os = std::env::consts::OS;

    // CORREÇÃO DOS CAMINHOS DO TAURI V2: Removido o prefixo "resources/"
    let avrdude_relative_path = if target_os == "windows" {
        "arduino_data/tools/avr-win/bin/avrdude.exe"
    } else if target_os == "linux" {
        "arduino_data/tools/avr-linux/bin/avrdude"
    } else {
        "arduino_data/tools/avr-mac/bin/avrdude" 
    };

    let avrdude_path = app_handle
        .path()
        .resolve(avrdude_relative_path, BaseDirectory::Resource)
        .map_err(|e| format!("Não foi possível encontrar o avrdude em resources: {}", e))?;

    let conf_path = app_handle
        .path()
        .resolve("arduino_data/tools/avrdude/6.3.0-arduino17/etc/avrdude.conf", BaseDirectory::Resource)
        .map_err(|e| format!("Não foi possível encontrar o avrdude.conf: {}", e))?;

    let mcu = if hardware_version.contains("pb") || hardware_version.contains("PB") { "m328pb" } else { "m328p" };

    // Executa uma verificação neutra (sem gravar ou apagar). Apenas lê a assinatura do chip
    let mut comando = Command::new(avrdude_path);
    comando.arg("-C").arg(conf_path)
           .arg("-p").arg(mcu)
           .arg("-c").arg("usbasp")
           .arg("-P").arg("usb")
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped());

    let mut child = comando.spawn().map_err(|e| format!("Falha ao inicializar avrdude para teste: {}", e))?;
    let status = child.wait().map_err(|e| format!("Falha ao obter resposta do hardware: {}", e))?;

    if status.success() {
        Ok(format!("Placa ({}) detectada com sucesso via USBasp!", mcu))
    } else {
        Err(format!("A placa ({}) não respondeu. Verifique as conexões físicas na bancada.", mcu))
    }
}

// ================= COMANDO PRINCIPAL AJUSTADO E CORRIGIDO =================
#[tauri::command]
fn gravar_firmware_bancada(
    app_handle: tauri::AppHandle, 
    serial_number: String, 
    hardware_version: String, 
    mosfet_pin: String
) -> Result<String, String> {

    let target_os = std::env::consts::OS;

    // CORREÇÃO DOS CAMINHOS DO TAURI V2: Removido o prefixo "resources/"
    let avrdude_relative_path = if target_os == "windows" {
        "arduino_data/tools/avr-win/bin/avrdude.exe"
    } else if target_os == "linux" {
        "arduino_data/tools/avr-linux/bin/avrdude"
    } else {
        "arduino_data/tools/avr-mac/bin/avrdude" 
    };

    let avrdude_path = app_handle
        .path()
        .resolve(avrdude_relative_path, BaseDirectory::Resource)
        .map_err(|e| format!("Não foi possível encontrar o avrdude em resources: {}", e))?;

    let conf_path = app_handle
        .path()
        .resolve("arduino_data/tools/avrdude/6.3.0-arduino17/etc/avrdude.conf", BaseDirectory::Resource)
        .map_err(|e| format!("Não foi possível encontrar o avrdude.conf: {}", e))?;

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

    // CORREÇÃO DOS CAMINHOS DO TAURI V2: Removido o prefixo "resources/"
    let hex_file_relative = format!("bin/{}.ino.hex", firmware_name);
    let hex_path = app_handle
        .path()
        .resolve(&hex_file_relative, BaseDirectory::Resource)
        .map_err(|e| format!("Arquivo .hex não encontrado: {}", e))?;

    let mcu = if hardware_version.contains("pb") || hardware_version.contains("PB") { "m328pb" } else { "m328p" };

    let _ = app_handle.emit("log-terminal", format!("🚀 Preparando gravação do chip {} via USBasp...\n", mcu));

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

    let mut child = comando.spawn().map_err(|e| format!("Falha crítica ao disparar o avrdude: {}", e))?;

    let stderr = child.stderr.take().ok_or("Falha ao abrir canal de captura (stderr)")?;
    let reader = BufReader::new(stderr);
    
    let handle_clone = app_handle.clone();

    std::thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(log_line) = line {
                let _ = handle_clone.emit("log-terminal", format!("{}\n", log_line));
            }
        }
    });

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
    central.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
    
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    
    let peripherals = central.peripherals().await.map_err(|e| e.to_string())?;
    let mut lista_filtrada = Vec::new();
    
    for peripheral in peripherals {
        if let Some(properties) = peripheral.properties().await.map_err(|e| e.to_string())? {
            let nome_dispositivo = properties.local_name.clone().unwrap_or_else(|| "Dispositivo Desconhecido".to_string());
            
            if nome_dispositivo.to_uppercase().contains("CHAVI") || properties.local_name.is_some() {
                lista_filtrada.push(BleDevice {
                    id: peripheral.id().to_string(),
                    name: nome_dispositivo,
                });
            }
        }
    }
    
    Ok(lista_filtrada)
}

#[tauri::command]
async fn connect_ble_device(
    state: tauri::State<'_, AppBleState>, 
    id: String
) -> Result<(), String> {
    let manager = BleManager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    let adapter = adapters.into_iter().next().ok_or("Nenhum adaptador Bluetooth encontrado.")?;

    let mut tentativas = 0;
    let max_tentativas = 3;

    while tentativas < max_tentativas {
        println!("🔄 [CONEXÃO] Tentativa {} de obter a placa no cache...", tentativas + 1);
        
        let _ = adapter.start_scan(ScanFilter::default()).await;
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        let _ = adapter.stop_scan().await;

        let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
        for peripheral in peripherals {
            if peripheral.id().to_string().contains(&id) {
                println!("🎯 Placa encontrada no cache! Tentando handshake físico...");
                
                match peripheral.connect().await {
                    Ok(_) => {
                        println!("✅ Conectado com sucesso ao barramento da placa!");
                        
                        let mut session_guard = state.dispositivo_conectado.lock().unwrap();
                        *session_guard = Some(peripheral);
                        
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

    Err("A placa selecionada sumiu do alcance do rádio após várias tentativas.".to_string())
}

#[tauri::command]
async fn send_at_command(state: tauri::State<'_, AppBleState>, comando: String) -> Result<String, String> {
    let peripheral_opt = {
        let session_guard = state.dispositivo_conectado.lock().unwrap();
        session_guard.clone() 
    }; 

    if let Some(peripheral) = peripheral_opt {
        if !peripheral.is_connected().await.unwrap_or(false) {
            return Err("A placa desconectou do Bluetooth.".to_string());
        }
        
        let comando_formatado = format!("{}\r\n", comando);
        
        peripheral.discover_services().await.map_err(|e| format!("Erro ao descobrir serviços: {}", e))?;
        
        let target_characteristic_uuid = Uuid::parse_str("0000FFE1-0000-1000-8000-00805F9B34FB")
            .map_err(|e| e.to_string())?;

        let characteristics = peripheral.characteristics();
        let characteristic_alvo = characteristics
            .iter()
            .find(|c| c.uuid == target_characteristic_uuid)
            .ok_or("Característica serial (FFE1) não encontrada nesta placa.")?;

        peripheral.subscribe(characteristic_alvo).await
            .map_err(|e| format!("Falha ao assinar notificações: {}", e))?;

        let mut notification_stream = peripheral.notifications().await
            .map_err(|e| format!("Falha ao abrir stream de dados: {}", e))?;

        println!("📤 Transmitindo para placa via BLE: {}", comando_formatado.trim());

        peripheral
            .write(characteristic_alvo, comando_formatado.as_bytes(), WriteType::WithoutResponse)
            .await
            .map_err(|e| format!("Falha ao escrever no barramento: {}", e))?;

        let resultado_resposta = tokio::time::timeout(
            std::time::Duration::from_millis(800),
            notification_stream.next()
        ).await;

        let _ = peripheral.unsubscribe(characteristic_alvo).await;

        match resultado_resposta {
            Ok(Some(notification)) => {
                let resposta_texto = String::from_utf8_lossy(&notification.value).trim().to_string();
                if resposta_texto.is_empty() {
                    return Ok("OK (Vazio)".to_string());
                }
                return Ok(resposta_texto);
            }
            _ => {
                return Ok("OK".to_string());
            }
        }
    }
    
    Err("Não há nenhuma placa conectada ao aplicativo.".to_string())
}

// =============================================================================

fn main() {
    tauri::Builder::default()
        .manage(AppBleState {
            dispositivo_conectado: Mutex::new(None),
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        
        .setup(|_app| {
            #[cfg(target_os = "windows")]
            {
                if let Ok(Some(resource_path)) = _app.path().resource_dir() {
                    let installer_path = resource_path.join("resources/driver-usbasp/installer_x64.exe");
                    if installer_path.exists() {
                        let _ = Command::new(installer_path).spawn();
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gravar_firmware_bancada,
            reconhecer_hardware_bancada, // Adicionado ao Handler do Tauri
            scan_ble_devices,
            connect_ble_device,
            send_at_command
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar a aplicação Tauri");
}