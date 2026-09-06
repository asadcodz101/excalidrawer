fn main() {
    // unique build fingerprint, shown in Help → About so a running
    // build can always be identified (epoch seconds, UTC)
    let fingerprint = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=BUILD_FINGERPRINT={fingerprint}");
    tauri_build::build()
}
