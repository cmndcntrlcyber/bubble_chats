use keyring::Entry;

const SERVICE: &str = "windows-desktop-bubble";

/// Persist a credential (e.g. "anthropic_api_key") in the OS credential store.
#[tauri::command]
pub fn store_key(key: String, value: String) -> Result<(), String> {
    Entry::new(SERVICE, &key)
        .map_err(|e| e.to_string())?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

/// Retrieve a stored credential. Returns empty string if not found.
#[tauri::command]
pub fn get_key(key: String) -> Result<String, String> {
    match Entry::new(SERVICE, &key).map_err(|e| e.to_string())?.get_password() {
        Ok(val) => Ok(val),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Remove a stored credential.
#[tauri::command]
pub fn delete_key(key: String) -> Result<(), String> {
    match Entry::new(SERVICE, &key).map_err(|e| e.to_string())?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
