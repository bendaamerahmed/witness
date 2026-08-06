$ErrorActionPreference = 'SilentlyContinue'
$dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
$state = Join-Path $dir '.witness-active'
if (-not (Test-Path $state)) { exit 0 }
$mode = (Get-Content $state -Raw).Trim()
if (-not $mode -or $mode -eq 'off') { exit 0 }
$label = switch ($mode) {
  'full'  { '[WITNESS]' }
  'ultra' { '[WITNESS:ULTRA]' }
  default { '[WITNESS:' + $mode.ToUpper() + ']' }
}
$color = if ($mode -eq 'ultra') { 173 } else { 109 }
$esc = [char]27
[Console]::Write("$esc[38;5;${color}m$label$esc[0m")
