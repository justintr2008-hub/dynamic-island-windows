// Claude Status's Windows sources (Claude Code's shell command lines, Windows'
// notification store, UI Automation for the Claude app and Chrome) have no Mac
// twin yet: the activity shows Claude Code sessions from the transcripts alone.

#[tauri::command]
pub async fn claude_status_cmdlines(pids: Vec<u32>) -> Vec<Option<String>> {
    pids.iter().map(|_| None).collect()
}

#[tauri::command]
pub async fn claude_status_notifications() -> Vec<()> {
    Vec::new()
}

#[tauri::command]
pub async fn claude_status_ui_scan() -> Option<()> {
    None
}

#[tauri::command]
pub async fn claude_status_open_chat() -> bool {
    false
}
