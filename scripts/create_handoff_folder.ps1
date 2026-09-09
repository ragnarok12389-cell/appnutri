$dest = "c:\Users\pedro\OneDrive\Desktop\appnutri\handoff_codex_etapa8"
if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Path $dest | Out-Null

Copy-Item "APPNUTRI_HANDOFF.md" $dest
Copy-Item "RELATORIO_FINAL_ETAPA_7.md" $dest
Copy-Item "ETAPA_8_PROMPT_E_RELATORIO.md" $dest
Copy-Item "ROADMAP_E_DECISOES.md" $dest
Copy-Item "INVENTARIO_TECNICO.md" $dest
Copy-Item ".env.example" $dest
Copy-Item "package.json" $dest

$migDest = Join-Path $dest "migrations"
Copy-Item -Recurse "supabase\migrations" $migDest

Get-ChildItem $dest | Select-Object Name, Length
