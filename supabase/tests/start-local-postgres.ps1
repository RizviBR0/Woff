# Starts only the ignored, loopback PostgreSQL fixture used by launch SQL tests.
$ErrorActionPreference = 'Stop'
$woffRepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$woffRuntimeRoot = Join-Path $woffRepoRoot 'internal/db-runtime'
$woffPgBin = Join-Path $woffRuntimeRoot 'node_modules/@embedded-postgres/windows-x64/native/bin'
$woffDataPath = Join-Path $woffRuntimeRoot 'data'
$woffPgModule = Join-Path $woffRuntimeRoot 'node_modules/pg'
$woffProbeCode = 'const {Client}=require(process.argv[1]); const c=new Client({connectionString:"postgresql://postgres@127.0.0.1:55439/postgres",connectionTimeoutMillis:1000}); c.connect().then(()=>c.query("show data_directory")).then(r=>{process.stdout.write(r.rows[0].data_directory);return c.end();}).catch(()=>process.exit(2));'

if (-not (Test-Path -LiteralPath (Join-Path $woffPgBin 'postgres.exe')) -or -not (Test-Path -LiteralPath $woffPgModule)) {
  throw 'Install the pinned local fixture packages listed in supabase/tests/README.md first.'
}
$woffExistingData = & node -e $woffProbeCode $woffPgModule 2>$null
if ($LASTEXITCODE -eq 0) {
  if ([IO.Path]::GetFullPath($woffExistingData.Trim()) -ine [IO.Path]::GetFullPath($woffDataPath)) {
    throw 'Port 55439 is owned by a different PostgreSQL cluster; refusing to use it.'
  }
  Write-Output 'Local launch fixture already running on 127.0.0.1:55439.'
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $woffDataPath 'PG_VERSION'))) {
  New-Item -ItemType Directory -Force -Path $woffRuntimeRoot | Out-Null
  & (Join-Path $woffPgBin 'initdb.exe') -D $woffDataPath --username=postgres --auth=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Local fixture initialization failed.' }
}
$woffProcess = Start-Process -FilePath (Join-Path $woffPgBin 'postgres.exe') `
  -ArgumentList @('-D', ('"{0}"' -f $woffDataPath), '-h', '127.0.0.1', '-p', '55439') `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $woffRuntimeRoot 'launch-postgres.stdout.log') `
  -RedirectStandardError (Join-Path $woffRuntimeRoot 'launch-postgres.stderr.log')
for ($woffAttempt = 0; $woffAttempt -lt 20; $woffAttempt++) {
  $woffExistingData = & node -e $woffProbeCode $woffPgModule 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Output 'Local launch fixture started on 127.0.0.1:55439.'
    exit 0
  }
  if ($woffProcess.HasExited) { throw 'Local PostgreSQL exited; inspect its launch logs.' }
  Start-Sleep -Milliseconds 250
}
throw 'Local fixture did not become ready; inspect its launch logs.'
