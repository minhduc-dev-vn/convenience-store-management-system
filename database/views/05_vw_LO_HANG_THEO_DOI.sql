SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP VIEW IF EXISTS dbo.vw_LO_HANG_THEO_DOI;
GO

CREATE VIEW dbo.vw_LO_HANG_THEO_DOI
AS
SELECT
    lot.MaLo,
    lot.MaSP,
    product.TenSP,
    product.DonViTinh,
    lot.SoLo,
    lot.NgaySanXuat,
    lot.HanSuDung,
    lot.GiaNhap,
    lot.SoLuongTon,
    lot.TrangThai,
    CASE
        WHEN lot.HanSuDung IS NULL THEN NULL
        ELSE DATEDIFF(
            DAY,
            CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'),
            lot.HanSuDung
        )
    END AS SoNgayConLai,
    CONVERT(BIT, CASE
        WHEN lot.HanSuDung < CONVERT(
            DATE,
            (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
        ) THEN 1
        ELSE 0
    END) AS DaHetHan,
    CONVERT(BIT, CASE
        WHEN lot.HanSuDung >= CONVERT(
                DATE,
                (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time'
             )
         AND lot.HanSuDung <= DATEADD(
                DAY,
                30,
                CONVERT(DATE, (SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE 'SE Asia Standard Time')
             ) THEN 1
        ELSE 0
    END) AS SapHetHan
FROM dbo.LO_HANG AS lot
JOIN dbo.SAN_PHAM AS product
    ON product.MaSP = lot.MaSP
WHERE lot.SoLuongTon > 0;
GO
