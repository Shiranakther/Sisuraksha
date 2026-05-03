param(
    [switch]$Recreate
)

$ErrorActionPreference = 'Stop'

$modules = @(
    @{ Name = 'Driver monitering'; Path = 'Driver monitering'; Requirements = 'requirements.txt' },
    @{ Name = 'Face recognition'; Path = 'face_recognition'; Requirements = 'requirements.txt' },
    @{ Name = 'Footboard safety'; Path = 'footboard safety'; Requirements = 'requirements.txt' },
    @{ Name = 'Window safety'; Path = 'window safety'; Requirements = 'requirements.txt' }
)

function Get-PythonCommand {
    $candidates = @(
        @{ Command = 'py'; Args = @('-3') },
        @{ Command = 'python'; Args = @() }
    )

    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate.Command -ErrorAction SilentlyContinue
        if (!$command) {
            continue
        }

        try {
            & $command.Source @($candidate.Args) --version *> $null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
        catch {
            continue
        }
    }

    throw @'
No working Python 3 interpreter was found.
Install Python 3.10 or newer from https://www.python.org/downloads/windows/ and enable "Add python.exe to PATH", then rerun this script.
'@
}

function New-ModuleVenv {
    param(
        [string]$ModulePath,
        [hashtable]$PythonCommand,
        [switch]$Recreate
    )

    $venvPath = Join-Path $ModulePath '.venv'
    $pythonPath = Join-Path $venvPath 'Scripts\python.exe'

    if ($Recreate -and (Test-Path $venvPath)) {
        Remove-Item -Path $venvPath -Recurse -Force
    }

    if (Test-Path $pythonPath) {
        try {
            & $pythonPath -m pip --version *> $null
            if ($LASTEXITCODE -eq 0) {
                return $pythonPath
            }
        }
        catch {
            # The venv exists but pip is missing or unusable.
        }

        Write-Host "Existing environment is incomplete; recreating $venvPath..."
        Remove-Item -Path $venvPath -Recurse -Force
    }

    Push-Location $ModulePath
    try {
        $command = Get-Command $PythonCommand.Command -ErrorAction Stop
        & $command.Source @($PythonCommand.Args) -m venv .venv
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create virtual environment in $ModulePath"
        }
    }
    finally {
        Pop-Location
    }

    if (!(Test-Path $pythonPath)) {
        throw "Virtual environment was not created correctly: $pythonPath"
    }

    return $pythonPath
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonCommand = Get-PythonCommand
$tempPath = Join-Path $repoRoot '.python-temp'
New-Item -ItemType Directory -Force -Path $tempPath | Out-Null
$env:TEMP = $tempPath
$env:TMP = $tempPath

$cachePath = Join-Path $repoRoot '.python-cache'
$matplotlibCachePath = Join-Path $cachePath 'matplotlib'
$ultralyticsConfigPath = Join-Path $cachePath 'ultralytics'
New-Item -ItemType Directory -Force -Path $matplotlibCachePath | Out-Null
New-Item -ItemType Directory -Force -Path $ultralyticsConfigPath | Out-Null
$env:MPLCONFIGDIR = $matplotlibCachePath
$env:YOLO_CONFIG_DIR = $ultralyticsConfigPath

foreach ($module in $modules) {
    $modulePath = Join-Path $repoRoot $module.Path
    $requirementsPath = Join-Path $modulePath $module.Requirements

    if (!(Test-Path $requirementsPath)) {
        throw "Missing requirements file: $requirementsPath"
    }

    Write-Host "Setting up $($module.Name)..."
    $pythonExe = New-ModuleVenv -ModulePath $modulePath -PythonCommand $pythonCommand -Recreate:$Recreate

    & $pythonExe -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upgrade pip for $($module.Name)"
    }

    & $pythonExe -m pip install -r $requirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install requirements for $($module.Name)"
    }
}

Write-Host ''
Write-Host 'All backend Python environments are ready.'
Write-Host 'Use .\<module>\.venv\Scripts\Activate.ps1 to activate a module environment.'
Write-Host 'If Ultralytics or Matplotlib reports a config/cache permission error, run this first:'
Write-Host "`$env:MPLCONFIGDIR = '$matplotlibCachePath'"
Write-Host "`$env:YOLO_CONFIG_DIR = '$ultralyticsConfigPath'"
