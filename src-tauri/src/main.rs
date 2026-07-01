// Previne a abertura de uma janela de terminal extra no Windows em modo release
#![cfg_attr(not(debug_assertions), target_os = "windows", windows_subsystem = "windows")]

use std::process::Command;
use std::io::{BufRead, BufReader};
use tauri::Manager;            
use tauri::path::BaseDirectory; 
use tauri::Emitter; // IMPORTANTE: No Tauri v2 usamos tauri::Emitter para disparar eventos para a tela

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

    // Dispara um log inicial direto no painel da tela avisando que o motor ligou
    let _ = app_handle.emit("log-terminal", format!("🚀 Preparando gravação do chip {} via USBasp...\n", mcu));

    // 3. CONFIGURA O COMANDO REDIRECIONANDO A SAÍDA (O avrdude envia logs majoritariamente no stderr)
    let mut comando = Command::new(avrdude_path);
    comando.arg("-C").arg(conf_path)
           .arg("-v")
           .arg("-p").arg(mcu)
           .arg("-c").arg("usbasp")
           .arg("-P").arg("usb") 
           .arg("-U").arg(format!("flash:w:{}:i", hex_path.to_string_lossy()))
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped()); // Transforma o canal de erro em um Pipe contínuo

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
                // Dispara o evento que o JavaScript vai ouvir na hora
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        // INSTALAÇÃO DO DRIVER EM BACKGROUND COM SUPORTE MULTIPLATAFORMA CORRIGIDO
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Ok(resource_path) = app.path().resolve_directory("resources/driver-usbasp") {
                    let installer_path = resource_path.join("installer_x64.exe");
                    if installer_path.exists() {
                        // Chama a função isolada para evitar erros de compilação cruzada no macOS
                        executar_instalador_windows(installer_path);
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

// Esta função só existe quando o compilador estiver gerando o código do Windows
#[cfg(target_os = "windows")]
fn executar_instalador_windows(path: std::path::PathBuf) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new(path)
        .creation_flags(0x08000000) // CREATE_NO_WINDOW (oculta janelas pretas)
        .spawn();
}