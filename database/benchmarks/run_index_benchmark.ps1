[CmdletBinding()]
param(
    [string]$ServerInstance = '.\SQLEXPRESS',
    [string]$DatabaseName = 'ConvenienceStoreIndexBenchmarkTest',
    [int]$MeasuredRuns = 5
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($DatabaseName -ne 'ConvenienceStoreIndexBenchmarkTest' -or -not $DatabaseName.EndsWith('Test')) {
    throw 'The benchmark runner is restricted to ConvenienceStoreIndexBenchmarkTest.'
}

if ($MeasuredRuns -lt 5) {
    throw 'MeasuredRuns must be at least 5.'
}

$resultDirectory = Join-Path $PSScriptRoot 'results'
$planDirectory = Join-Path $resultDirectory 'plans'
New-Item -ItemType Directory -Force -Path $resultDirectory, $planDirectory | Out-Null

function Invoke-SqlcmdText {
    param([Parameter(Mandatory)][string]$Query)

    $output = & sqlcmd -S $ServerInstance -E -C -d $DatabaseName -I -y 0 -Y 0 -Q $Query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }
    return @($output | ForEach-Object { $_.ToString() })
}

function Invoke-Scalar {
    param([Parameter(Mandatory)][string]$Query)

    $output = & sqlcmd -S $ServerInstance -E -C -d $DatabaseName -I -h -1 -W -Q "SET NOCOUNT ON; $Query" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }
    return (($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join '').Trim()
}

function Get-Median {
    param([long[]]$Values)

    $ordered = @($Values | Sort-Object)
    $middle = [math]::Floor($ordered.Count / 2)
    if ($ordered.Count % 2 -eq 1) {
        return [long]$ordered[$middle]
    }
    return [long][math]::Round(($ordered[$middle - 1] + $ordered[$middle]) / 2.0)
}

function Measure-Query {
    param(
        [Parameter(Mandatory)][pscustomobject]$Case,
        [Parameter(Mandatory)][ValidateSet('without', 'with')][string]$State
    )

    # One warm cache execution. OPTION (RECOMPILE) controls plan reuse without
    # flushing any server-wide cache.
    Invoke-SqlcmdText -Query "SET NOCOUNT ON; $($Case.Query) OPTION (RECOMPILE);" | Out-Null

    $samples = @()
    for ($run = 1; $run -le $MeasuredRuns; $run++) {
        $sql = @"
SET NOCOUNT ON;
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
SET STATISTICS XML ON;
$($Case.Query) OPTION (RECOMPILE);
SET STATISTICS XML OFF;
SET STATISTICS TIME OFF;
SET STATISTICS IO OFF;
"@
        $output = Invoke-SqlcmdText -Query $sql
        $joined = $output -join [Environment]::NewLine
        $start = $joined.IndexOf('<ShowPlanXML', [StringComparison]::Ordinal)
        $closingTag = '</ShowPlanXML>'
        $end = $joined.IndexOf($closingTag, [StringComparison]::Ordinal)
        if ($start -lt 0 -or $end -lt $start) {
            throw "Could not extract an actual XML plan for $($Case.Name) ($State), run $run."
        }

        $xmlText = $joined.Substring($start, $end - $start + $closingTag.Length)
        [xml]$plan = $xmlText
        $namespace = New-Object System.Xml.XmlNamespaceManager($plan.NameTable)
        $namespace.AddNamespace('sp', 'http://schemas.microsoft.com/sqlserver/2004/07/showplan')
        $statement = $plan.SelectSingleNode('//sp:StmtSimple', $namespace)
        $timeStats = $statement.SelectSingleNode('./sp:QueryPlan/sp:QueryTimeStats', $namespace)

        $logicalReads = 0L
        foreach ($counter in $plan.SelectNodes('//sp:RunTimeCountersPerThread', $namespace)) {
            if ($counter.HasAttribute('ActualLogicalReads')) {
                $logicalReads += [long]$counter.GetAttribute('ActualLogicalReads')
            }
        }

        $access = @()
        foreach ($relOp in $plan.SelectNodes('//sp:RelOp[sp:IndexScan/sp:Object]', $namespace)) {
            $object = $relOp.SelectSingleNode('./sp:IndexScan/sp:Object', $namespace)
            $access += "$($relOp.GetAttribute('PhysicalOp')) $($object.GetAttribute('Table')).$($object.GetAttribute('Index'))"
        }

        if ($run -eq 1) {
            $planPath = Join-Path $planDirectory "$($Case.Slug)_$State.sqlplan"
            $xmlText | Set-Content -LiteralPath $planPath -Encoding UTF8

            $statisticsLines = $output | Where-Object {
                $_ -match "^Table '" -or
                $_ -match '^\s*SQL Server (parse and compile time|Execution Times):' -or
                $_ -match '^\s*CPU time ='
            }
            $statisticsLines | Set-Content -LiteralPath (Join-Path $planDirectory "$($Case.Slug)_${State}_statistics.txt") -Encoding UTF8
        }

        $samples += [pscustomobject]@{
            LogicalReads = $logicalReads
            CpuMs = [long]$timeStats.GetAttribute('CpuTime')
            ElapsedMs = [long]$timeStats.GetAttribute('ElapsedTime')
            Access = ($access -join '; ')
        }
    }

    return [pscustomobject]@{
        LogicalReads = Get-Median @($samples.LogicalReads)
        CpuMs = Get-Median @($samples.CpuMs)
        ElapsedMs = Get-Median @($samples.ElapsedMs)
        Access = ($samples | Group-Object Access | Sort-Object Count -Descending | Select-Object -First 1).Name
    }
}

$databaseIdentity = Invoke-Scalar -Query "SELECT CONCAT(DB_NAME(), '|', compatibility_level) FROM sys.databases WHERE name = DB_NAME();"
if (-not $databaseIdentity.StartsWith('ConvenienceStoreIndexBenchmarkTest|')) {
    throw "Unexpected benchmark database identity: $databaseIdentity"
}

$cases = @(
    [pscustomobject]@{
        Name = 'UQ_TAI_KHOAN_TenDangNhap'; Slug = '01_auth_username'; Table = 'dbo.TAI_KHOAN'
        Query = "SELECT MaTK, TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai, LanDangNhapCuoi FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'bench.user.000010000'"
        Signature = "SELECT CONCAT(COUNT_BIG(*), '|', COALESCE(CHECKSUM_AGG(BINARY_CHECKSUM(MaTK, TenDangNhap, MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai, LanDangNhapCuoi)), 0)) FROM dbo.TAI_KHOAN WHERE TenDangNhap = 'bench.user.000010000';"
        Create = 'CREATE UNIQUE INDEX UQ_TAI_KHOAN_TenDangNhap ON dbo.TAI_KHOAN (TenDangNhap) INCLUDE (MatKhauHash, MaVaiTro, MaNV, MaKH, TrangThai, LanDangNhapCuoi);'
    },
    [pscustomobject]@{
        Name = 'IX_LO_HANG_MaSP_HanSuDung_ConTon'; Slug = '02_positive_stock_lots'; Table = 'dbo.LO_HANG'
        Query = "SELECT MaLo, SoLo, NgaySanXuat, HanSuDung, SoLuongTon, TrangThai, GiaNhap FROM dbo.LO_HANG WHERE MaSP = 'BP00000001' AND SoLuongTon > 0 ORDER BY HanSuDung, MaLo"
        Signature = "SELECT CONCAT(COUNT_BIG(*), '|', COALESCE(CHECKSUM_AGG(BINARY_CHECKSUM(MaLo, SoLo, NgaySanXuat, HanSuDung, SoLuongTon, TrangThai, GiaNhap)), 0)) FROM dbo.LO_HANG WHERE MaSP = 'BP00000001' AND SoLuongTon > 0;"
        Create = 'CREATE INDEX IX_LO_HANG_MaSP_HanSuDung_ConTon ON dbo.LO_HANG (MaSP, HanSuDung) INCLUDE (MaLo, SoLo, NgaySanXuat, SoLuongTon, TrangThai, GiaNhap) WHERE SoLuongTon > 0;'
    },
    [pscustomobject]@{
        Name = 'IX_HOA_DON_BaoCao_TrangThai_NgayLap'; Slug = '03_paid_invoice_report'; Table = 'dbo.HOA_DON'
        Query = "SELECT TrangThai, MaCa, COUNT_BIG(*) AS SoHoaDon, SUM(TongThanhToan) AS DoanhThu FROM dbo.HOA_DON WHERE TrangThai = 'PAID' AND NgayLap >= '2026-01-01' AND NgayLap < '2026-04-01' GROUP BY TrangThai, MaCa"
        Signature = "SELECT CONCAT(COUNT_BIG(*), '|', COALESCE(CONVERT(VARCHAR(50), SUM(TongThanhToan)), 'NULL')) FROM dbo.HOA_DON WHERE TrangThai = 'PAID' AND NgayLap >= '2026-01-01' AND NgayLap < '2026-04-01';"
        Create = 'CREATE INDEX IX_HOA_DON_BaoCao_TrangThai_NgayLap ON dbo.HOA_DON (TrangThai, NgayLap, MaCa) INCLUDE (MaHD, TongTienHang, TongGiamGia, TongThanhToan);'
    },
    [pscustomobject]@{
        Name = 'IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian'; Slug = '04_audit_target'; Table = 'dbo.NHAT_KY_HE_THONG'
        Query = "SELECT TOP (40) MaNhatKy, MaTK, HanhDong, TenBang, MaBanGhi, ThoiGian, DiaChiIP FROM dbo.NHAT_KY_HE_THONG WHERE TenBang = 'SAN_PHAM' AND MaBanGhi = 'BKK0000001' ORDER BY ThoiGian DESC, MaNhatKy DESC"
        Signature = "SELECT CONCAT(COUNT_BIG(*), '|', COALESCE(CHECKSUM_AGG(BINARY_CHECKSUM(MaNhatKy, MaTK, HanhDong, TenBang, MaBanGhi, ThoiGian, DiaChiIP)), 0)) FROM dbo.NHAT_KY_HE_THONG WHERE TenBang = 'SAN_PHAM' AND MaBanGhi = 'BKK0000001';"
        Create = 'CREATE INDEX IX_NHAT_KY_HE_THONG_TenBang_MaBanGhi_ThoiGian ON dbo.NHAT_KY_HE_THONG (TenBang, MaBanGhi, ThoiGian DESC) INCLUDE (MaTK, HanhDong, DiaChiIP) WHERE MaBanGhi IS NOT NULL;'
    },
    [pscustomobject]@{
        Name = 'IX_PHIEU_NHAP_TrangThai_NgayNhap'; Slug = '05_receipt_status'; Table = 'dbo.PHIEU_NHAP'
        Query = "SELECT TOP (50) MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan FROM dbo.PHIEU_NHAP WHERE TrangThai = 'CANCELLED' ORDER BY NgayNhap DESC, MaPN DESC"
        Signature = "SELECT CONCAT(COUNT_BIG(*), '|', COALESCE(CHECKSUM_AGG(BINARY_CHECKSUM(MaPN, NgayNhap, MaNV, MaNCC, TongTien, TrangThai, NgayXacNhan)), 0)) FROM dbo.PHIEU_NHAP WHERE TrangThai = 'CANCELLED';"
        Create = 'CREATE INDEX IX_PHIEU_NHAP_TrangThai_NgayNhap ON dbo.PHIEU_NHAP (TrangThai, NgayNhap DESC) INCLUDE (MaPN, MaNV, MaNCC, TongTien, NgayXacNhan);'
    }
)

$results = @()
foreach ($case in $cases) {
    Write-Host "Benchmarking $($case.Name)..."
    $exists = Invoke-Scalar -Query "SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID('$($case.Table)') AND name = '$($case.Name)' AND is_disabled = 0;"
    if ($exists -ne '1') {
        throw "Required index $($case.Name) is missing before benchmark."
    }

    $signatureBefore = Invoke-Scalar -Query $case.Signature
    Invoke-SqlcmdText -Query "DROP INDEX [$($case.Name)] ON $($case.Table);" | Out-Null

    try {
        $without = Measure-Query -Case $case -State 'without'
        $signatureWithout = Invoke-Scalar -Query $case.Signature
        Invoke-SqlcmdText -Query $case.Create | Out-Null
        $with = Measure-Query -Case $case -State 'with'
        $signatureWith = Invoke-Scalar -Query $case.Signature
    }
    finally {
        $existsAfter = Invoke-Scalar -Query "SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID('$($case.Table)') AND name = '$($case.Name)';"
        if ($existsAfter -ne '1') {
            Invoke-SqlcmdText -Query $case.Create | Out-Null
        }
    }

    if ($signatureBefore -ne $signatureWithout -or $signatureBefore -ne $signatureWith) {
        throw "Result equivalence failed for $($case.Name): '$signatureBefore', '$signatureWithout', '$signatureWith'."
    }

    $reduction = if ($without.LogicalReads -eq 0) { 0 } else {
        [math]::Round((($without.LogicalReads - $with.LogicalReads) / $without.LogicalReads) * 100, 2)
    }
    $results += [pscustomobject]@{
        Index = $case.Name
        ReadsWithout = $without.LogicalReads
        ReadsWith = $with.LogicalReads
        ReadReductionPercent = $reduction
        CpuWithoutMs = $without.CpuMs
        CpuWithMs = $with.CpuMs
        ElapsedWithoutMs = $without.ElapsedMs
        ElapsedWithMs = $with.ElapsedMs
        PlanWithout = $without.Access
        PlanWith = $with.Access
        ResultSignature = $signatureWith
        Equivalent = $true
    }
}

$results | Export-Csv -LiteralPath (Join-Path $resultDirectory 'index_performance_results.csv') -NoTypeInformation -Encoding UTF8
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $resultDirectory 'index_performance_results.json') -Encoding UTF8
$results | Format-Table -AutoSize
