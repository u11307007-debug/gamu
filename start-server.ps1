param(
  [int]$Port = 8080
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

Write-Host "啟動本機伺服器：$prefix"
Write-Host "資料夾：$root"
Write-Host "網址：$prefix"
Write-Host "關閉方式：在此視窗按 Ctrl+C"

$listener.Start()

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

try {
  while ($true) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $path = $request.Url.AbsolutePath.TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }

      $filePath = Join-Path $root $path
      if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
        continue
      }

      $mime = Get-MimeType -Path $filePath
      $response.ContentType = $mime

      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.Close()
    } catch {
      $response.StatusCode = 500
      try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
      } catch {
        # ignore
      }
    }
  }
}
finally {
  $listener.Stop()
}

