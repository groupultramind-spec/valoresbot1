$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzgyMTU4MzQsInVzZXJfaWQiOiI2N2FiODRmNi1hOGZmLTQ4YjAtOGY1OC1iNTc3YzFjODc4OTUifQ.dg2Y-VRcNpoI7Wxnhnqy5RvFhQt2mldf8jlLazjnzow"
$appId = "be941de6-1ff3-4840-b28b-3b31b3a5ea31"
$h = @{ Authorization = "Bearer $token" }

Write-Host "=== App Status ==="
$st = Invoke-RestMethod -Uri "https://shardcloud.app/api/apps/$appId" -Headers $h
Write-Host "Status: $($st.status)"
Write-Host "URL: https://$($st.app.subdomain).shardweb.app"

Write-Host "`n=== CORS /api/config ==="
try {
  $r = Invoke-WebRequest -Uri "https://portalsvr.shardweb.app/api/config" -UseBasicParsing
  Write-Host "HTTP $($r.StatusCode)"
  Write-Host "ACAO: $($r.Headers['Access-Control-Allow-Origin'])"
  Write-Host "Body: $($r.Content)"
} catch { Write-Host "ERRO: $($_.Exception.Message)" }
