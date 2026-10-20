:ON ERROR EXIT
:setvar SourceDatabase "ConvenienceStore_C50_Source"
:setvar RestoreDatabase "ConvenienceStore_C50_Restore"
:setvar BackupFile ""

USE master;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @SourceDatabase SYSNAME = N'$(SourceDatabase)';
DECLARE @RestoreDatabase SYSNAME = N'$(RestoreDatabase)';
DECLARE @BackupFile NVARCHAR(4000) = N'$(BackupFile)';
DECLARE @BackupRoot NVARCHAR(4000);
DECLARE @DataRoot NVARCHAR(4000);
DECLARE @LogRoot NVARCHAR(4000);
DECLARE @DataLogicalName SYSNAME;
DECLARE @LogLogicalName SYSNAME;
DECLARE @DataFile NVARCHAR(4000);
DECLARE @LogFile NVARCHAR(4000);
DECLARE @Sql NVARCHAR(MAX);

IF NULLIF(@SourceDatabase, N'') IS NULL OR NULLIF(@RestoreDatabase, N'') IS NULL
    THROW 53100, 'SourceDatabase and RestoreDatabase are required.', 1;

IF @SourceDatabase = @RestoreDatabase
    THROW 53101, 'RestoreDatabase must differ from SourceDatabase.', 1;

IF @SourceDatabase IN ('master', 'model', 'msdb', 'tempdb')
   OR @RestoreDatabase IN ('master', 'model', 'msdb', 'tempdb')
    THROW 53102, 'System databases are not valid backup/restore smoke targets.', 1;

IF DB_ID(@SourceDatabase) IS NULL
    THROW 53103, 'The source database does not exist.', 1;

IF DB_ID(@RestoreDatabase) IS NOT NULL
    THROW 53104, 'The restore target already exists; refusing to overwrite it.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.databases
    WHERE name = @SourceDatabase
      AND state_desc <> 'ONLINE'
)
    THROW 53105, 'The source database must be ONLINE.', 1;

IF (SELECT COUNT(*) FROM sys.master_files WHERE database_id = DB_ID(@SourceDatabase) AND type = 0) <> 1
   OR (SELECT COUNT(*) FROM sys.master_files WHERE database_id = DB_ID(@SourceDatabase) AND type = 1) <> 1
    THROW 53106, 'The packaging script expects the project database to have one data file and one log file.', 1;

SELECT @DataLogicalName = name
FROM sys.master_files
WHERE database_id = DB_ID(@SourceDatabase) AND type = 0;

SELECT @LogLogicalName = name
FROM sys.master_files
WHERE database_id = DB_ID(@SourceDatabase) AND type = 1;

SET @BackupRoot = CONVERT(NVARCHAR(4000), SERVERPROPERTY('InstanceDefaultBackupPath'));
SET @DataRoot = CONVERT(NVARCHAR(4000), SERVERPROPERTY('InstanceDefaultDataPath'));
SET @LogRoot = CONVERT(NVARCHAR(4000), SERVERPROPERTY('InstanceDefaultLogPath'));

IF NULLIF(@BackupFile, N'') IS NULL
BEGIN
    IF NULLIF(@BackupRoot, N'') IS NULL
        THROW 53107, 'InstanceDefaultBackupPath is unavailable; pass BackupFile explicitly.', 1;

    SET @BackupFile = @BackupRoot
        + CASE WHEN RIGHT(@BackupRoot, 1) IN (N'\', N'/') THEN N'' ELSE N'\' END
        + @SourceDatabase + N'_full.bak';
END;

IF NULLIF(@DataRoot, N'') IS NULL OR NULLIF(@LogRoot, N'') IS NULL
    THROW 53108, 'SQL Server default data/log paths are unavailable.', 1;

SET @DataFile = @DataRoot
    + CASE WHEN RIGHT(@DataRoot, 1) IN (N'\', N'/') THEN N'' ELSE N'\' END
    + @RestoreDatabase + N'.mdf';
SET @LogFile = @LogRoot
    + CASE WHEN RIGHT(@LogRoot, 1) IN (N'\', N'/') THEN N'' ELSE N'\' END
    + @RestoreDatabase + N'_log.ldf';

SET @Sql = N'BACKUP DATABASE ' + QUOTENAME(@SourceDatabase)
    + N' TO DISK = N''' + REPLACE(@BackupFile, '''', '''''')
    + N''' WITH COPY_ONLY, INIT, CHECKSUM, STATS = 10;';
EXEC sys.sp_executesql @Sql;

SET @Sql = N'RESTORE VERIFYONLY FROM DISK = N'''
    + REPLACE(@BackupFile, '''', '''''') + N''' WITH CHECKSUM;';
EXEC sys.sp_executesql @Sql;

SET @Sql = N'RESTORE DATABASE ' + QUOTENAME(@RestoreDatabase)
    + N' FROM DISK = N''' + REPLACE(@BackupFile, '''', '''''') + N''' WITH '
    + N'MOVE N''' + REPLACE(@DataLogicalName, '''', '''''') + N''' TO N'''
    + REPLACE(@DataFile, '''', '''''') + N''', '
    + N'MOVE N''' + REPLACE(@LogLogicalName, '''', '''''') + N''' TO N'''
    + REPLACE(@LogFile, '''', '''''') + N''', '
    + N'RECOVERY, CHECKSUM, STATS = 10;';
EXEC sys.sp_executesql @Sql;

SET @Sql = N'DBCC CHECKDB (' + QUOTENAME(@RestoreDatabase, '''') + N') WITH NO_INFOMSGS;';
EXEC sys.sp_executesql @Sql;

SET @Sql = N'USE ' + QUOTENAME(@RestoreDatabase) + N';
IF (
    SELECT COUNT(*) FROM sys.tables
    WHERE schema_id = SCHEMA_ID(''dbo'') AND name <> ''SCHEMA_MIGRATIONS''
) <> 23
    THROW 53109, ''Restored database does not contain exactly 23 dbo core tables.'', 1;
IF (SELECT COUNT(*) FROM dbo.VAI_TRO) <> 4
   OR NOT EXISTS (SELECT 1 FROM dbo.SAN_PHAM WHERE MaSP = ''SPDEV001'')
   OR NOT EXISTS (SELECT 1 FROM dbo.LO_HANG WHERE MaLo = ''LODEV001'')
    THROW 53110, ''Restored database baseline seed verification failed.'', 1;
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE schema_id = SCHEMA_ID(''dbo'') AND (is_disabled = 1 OR is_not_trusted = 1)
)
   OR EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE schema_id = SCHEMA_ID(''dbo'') AND (is_disabled = 1 OR is_not_trusted = 1)
)
    THROW 53111, ''Restored database contains disabled or untrusted constraints.'', 1;';
EXEC sys.sp_executesql @Sql;

SELECT
    @SourceDatabase AS SourceDatabase,
    @RestoreDatabase AS RestoreDatabase,
    @BackupFile AS BackupFile,
    N'BACKUP, VERIFYONLY, RESTORE, DBCC CHECKDB and post-restore checks passed.' AS Result;
GO
