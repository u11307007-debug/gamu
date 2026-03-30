param(
  [int]$Port = 8081
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

Write-Host "啟動 TCP 本機靜態伺服器：http://127.0.0.1:$Port/"
Write-Host "資料夾：$root"
Write-Host "關閉方式：在此視窗按 Ctrl+C"

function Get-MimeType {
  param([string]$Path)
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  switch ($ext) {
    ".html" { return "text/html; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".svg" { return "image/svg+xml; charset=utf-8" }
    ".gif" { return "image/gif" }
    ".webp" { return "image/webp" }
    default { return "application/octet-stream" }
  }
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  $stream = $client.GetStream()
  try {
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)

    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

    # 讀掉 request headers，直到空行
    while ($true) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($line)) { break }
    }

    $parts = $requestLine.Split(' ')
    if ($parts.Length -lt 2) { continue }

    $rawPath = $parts[1]
    $path = $rawPath.Split('?')[0].TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }

    $filePath = Join-Path $root $path

    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
      continue
    }

    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $mime = Get-MimeType -Path $filePath
    $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)

    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } catch {
    # ignore request parsing errors
  } finally {
    try { $stream.Close() } catch { }
    try { $client.Close() } catch { }
  }
}

