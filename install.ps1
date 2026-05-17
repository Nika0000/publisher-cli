$ErrorActionPreference = "Stop"

$Repo = "Nika0000/publisher-cli"
$BinaryName = "publisher.exe"
$InstallDir = if ($env:PUBLISHER_INSTALL_DIR) { $env:PUBLISHER_INSTALL_DIR } else { "$env:LOCALAPPDATA\publisher-cli" }

function Get-LatestRelease {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    return $response.tag_name
}

function Main {
    param([string]$Version)

    if ($Version) {
        $tag = "cli-v$Version"
    } else {
        Write-Host "Fetching latest release..."
        $tag = Get-LatestRelease
    }

    $ver = $tag -replace '^cli-v', ''
    Write-Host "Installing publisher $ver..."

    $downloadUrl = "https://github.com/$Repo/releases/download/$tag/publisher-win-x64.exe"

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $outFile = Join-Path $InstallDir $BinaryName

    Write-Host "Downloading from $downloadUrl..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $outFile -UseBasicParsing

    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentPath;$InstallDir", "User")
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "Added $InstallDir to user PATH."
    }

    Write-Host "Publisher CLI installed to $outFile"
    Write-Host "Run 'publisher --help' to get started."
}

Main $args[0]
