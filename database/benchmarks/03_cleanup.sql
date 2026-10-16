:ON ERROR EXIT

USE [master];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF N'$(DatabaseName)' <> N'ConvenienceStoreIndexBenchmarkTest'
    THROW 53690, 'Cleanup is restricted to the documented disposable benchmark database.', 1;

IF DB_ID(N'$(DatabaseName)') IS NOT NULL
BEGIN
    ALTER DATABASE [ConvenienceStoreIndexBenchmarkTest] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [ConvenienceStoreIndexBenchmarkTest];
END;
GO
