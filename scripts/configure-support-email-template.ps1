param(
  [string]$ProjectRef = "axkbfrljohpkjnbotqnf"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $repoRoot "supabase\templates\support-magic-link.html"

if (-not (Test-Path $templatePath)) {
  throw "Template não encontrado em $templatePath"
}

$secureToken = Read-Host "Cole seu Supabase Access Token (não ficará salvo)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)

try {
  $accessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

  if ([string]::IsNullOrWhiteSpace($accessToken)) {
    throw "Access Token não informado."
  }

  $template = Get-Content -Raw -Encoding UTF8 $templatePath

  $payload = @{
    mailer_subjects_magic_link = "Convite oficial • Equipe Aura Beat"
    mailer_templates_magic_link_content = $template
  } | ConvertTo-Json -Depth 6 -Compress

  Invoke-RestMethod -Method Patch -Uri "https://api.supabase.com/v1/projects/$ProjectRef/config/auth" -Headers @{
    Authorization = "Bearer $accessToken"
    "Content-Type" = "application/json"
  } -Body $payload | Out-Null

  Write-Host ""
  Write-Host "Template da Equipe Aura aplicado com sucesso." -ForegroundColor Green
  Write-Host "Assunto: Convite oficial • Equipe Aura Beat"
  Write-Host "Agora envie um novo convite pelo Admin para testar."
}
finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  Remove-Variable accessToken -ErrorAction SilentlyContinue
}
