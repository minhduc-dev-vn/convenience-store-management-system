-- ============================================================================
-- Script: create_database.sql
-- Muc dich: Tao co so du lieu ConvenienceStore neu chua ton tai tren SQL Server
-- ============================================================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'ConvenienceStore')
BEGIN
    PRINT N'Dang tao co so du lieu [ConvenienceStore]...';
    CREATE DATABASE [ConvenienceStore];
    PRINT N'Tao co so du lieu [ConvenienceStore] thanh cong.';
END
ELSE
BEGIN
    PRINT N'Co so du lieu [ConvenienceStore] da ton tai tren he thong.';
END
GO
