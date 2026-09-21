$ErrorActionPreference = "Stop"

Write-Host "A configuração automática do template de e-mail foi desativada." -ForegroundColor Yellow
Write-Host ""
Write-Host "Em projetos Supabase hospedados, aplique o template pelo Dashboard:"
Write-Host "Authentication > Email Templates > Magic Link"
Write-Host ""
Write-Host "Assunto:"
Write-Host "Convite oficial • Equipe Aura Beat"
Write-Host ""
Write-Host "Template salvo no repositório:"
Write-Host "supabase\templates\support-magic-link.html"
Write-Host ""
Write-Host "Depois de salvar no Dashboard, envie um NOVO convite pelo Admin para testar."
