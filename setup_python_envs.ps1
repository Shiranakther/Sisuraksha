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

function New-ModuleVenv {
    param(
        [string]$ModulePath,
        [switch]$Recreate
    )

    $venvPath = Join-Path $ModulePath '.venv'
    $pythonPath = Join-Path $venvPath 'Scripts\python.exe'

    if ($Recreate -and (Test-Path $venvPath)) {
        Remove-Item -Path $venvPath -Recurse -Force
    }

    if (Test-Path $pythonPath) {
        return $pythonPath
    }

    Push-Location $ModulePath
    try {
        py -3 -m venv .venv
    }
    catch {
        python -m venv .venv
    }
    finally {
        Pop-Location
    }

    return $pythonPath
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($module in $modules) {
    $modulePath = Join-Path $repoRoot $module.Path
    $requirementsPath = Join-Path $modulePath $module.Requirements

    if (!(Test-Path $requirementsPath)) {
        throw "Missing requirements file: $requirementsPath"
    }

    Write-Host "Setting up $($module.Name)..."
    $pythonExe = New-ModuleVenv -ModulePath $modulePath -Recreate:$Recreate

    & $pythonExe -m pip install --upgrade pip
    & $pythonExe -m pip install -r $requirementsPath
}

Write-Host ''
Write-Host 'All backend Python environments are ready.'
Write-Host 'Use .\<module>\.venv\Scripts\Activate.ps1 to activate a module environment.'
