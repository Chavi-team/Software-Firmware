// Previne a abertura de uma janela de terminal extra no Windows em modo release
#![cfg_attr(not(debug_assertions), target_os = "windows", windows_subsystem = "windows")]

use std::process::Command;
use tauri::Manager;            
use tauri::path::BaseDirectory; 

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
        "resources/arduino_data/tools/avr-mac/bin/avrdude" // Ajuste para a sua pasta do Mac se necessário
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

    // --- Sua Lógica de Parsing de Hardware Inteligente mantida idêntica ---
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

    // Alvo final do arquivo .hex dentro do seu pacote de firmwares
    let hex_file_relative = format!("resources/bin/{}.ino.hex", firmware_name);
    let hex_path = app_handle
        .path()
        .resolve(&hex_file_relative, BaseDirectory::Resource)
        .map_err(|e| format!("Arquivo .hex não encontrado: {}", e))?;

    // Identifica se a placa da vez é o 328P ou o 328PB
    let mcu = if hardware_version.contains("pb") || hardware_version.contains("PB") { "m328pb" } else { "m328p" };

    // 3. MONTA O COMANDO DIRETO NO AVRDUDE (Eliminando dependência de scripts .sh externos)
    let mut comando = Command::new(avrdude_path);
    comando.arg("-C").arg(conf_path)
           .arg("-v")
           .arg("-p").arg(mcu)
           .arg("-c").arg("usbasp")
           .arg("-P").arg("usb") // Conexão USB nativa do USBasp (multiplataforma)
           .arg("-U").arg(format!("flash:w:{}:i", hex_path.to_string_lossy()));

    let seed_secret_env = "CHAVI".to_string();
    comando.env("SEED_SECRET", seed_secret_env);

    // Ajusta o diretório de execução para a pasta do avrdude
    if let Some(pasta_resources) = hex_path.parent() {
        comando.current_dir(pasta_resources);
    }

    // Executa a gravação do ATmega
    let output = comando.output().map_err(|e| format!("Falha crítica ao disparar o avrdude: {}", e))?;

    // O avrdude costuma despejar o progresso de gravação no stderr, tratamos ambos aqui
    let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(format!("Gravação efetuada com sucesso!\n{}", stderr_str))
    } else {
        Err(format!("Erro na gravação:\nSaída: {}\nErro: {}", stdout_str, stderr_str))
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        // INSTALAÇÃO DO DRIVER EM BACKGROUND (Apenas se o app for aberto no Windows)
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Ok(resource_path) = app.path().resolve_directory("resources/driver-usbasp") {
                    let installer_path = resource_path.join("installer_x64.exe");
                    if installer_path.exists() {
                        use std::os::windows::process::CommandExt;
                        let _ = Command::new(installer_path)
                            .creation_flags(0x08000000) // CREATE_NO_WINDOW (oculta janelas pretas)
                            .spawn();
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            gravar_firmware_bancada
        ])
        .run(tauri::generate_context!())
        .expect("erro ao rodar a aplicação Tauri");
}