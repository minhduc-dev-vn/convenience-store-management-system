'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class PromotionRepository extends BaseRepository {
  constructor(options = {}) {
    super(options);
    this.sqlDriver = options.sqlDriver || null;
  }

  get sql() {
    if (!this.sqlDriver) {
      this.sqlDriver = getSqlDriver(getDatabaseSettings().driver);
    }
    return this.sqlDriver;
  }

  async listPublicPromotions({ asOf, productId = null }) {
    const result = await this.query({
      text: `
        SELECT
          promotion.MaKM,
          promotion.TenKM,
          promotion.LoaiKM,
          promotion.GiaTri,
          promotion.GiaTriDonToiThieu,
          promotion.MucGiamToiDa,
          promotion.NgayBatDau,
          promotion.NgayKetThuc,
          promotion.TrangThai,
          product.MaSP,
          product.TenSP
        FROM dbo.KHUYEN_MAI AS promotion
        JOIN dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
          ON promotion_product.MaKM = promotion.MaKM
        JOIN dbo.SAN_PHAM AS product
          ON product.MaSP = promotion_product.MaSP
        JOIN dbo.LOAI_SAN_PHAM AS category
          ON category.MaLoai = product.MaLoai
        WHERE promotion.TrangThai = 'ACTIVE'
          AND promotion.NgayBatDau <= @AsOf
          AND promotion.NgayKetThuc > @AsOf
          AND product.TrangThai = 'ACTIVE'
          AND category.TrangThai = 'ACTIVE'
          AND (
            @ProductId IS NULL
            OR EXISTS (
              SELECT 1
              FROM dbo.KHUYEN_MAI_SAN_PHAM AS requested_scope
              JOIN dbo.SAN_PHAM AS requested_product
                ON requested_product.MaSP = requested_scope.MaSP
              JOIN dbo.LOAI_SAN_PHAM AS requested_category
                ON requested_category.MaLoai = requested_product.MaLoai
              WHERE requested_scope.MaKM = promotion.MaKM
                AND requested_scope.MaSP = @ProductId
                AND requested_product.TrangThai = 'ACTIVE'
                AND requested_category.TrangThai = 'ACTIVE'
            )
          )
        ORDER BY promotion.NgayKetThuc, promotion.MaKM, product.TenSP, product.MaSP
      `,
      parameters: {
        AsOf: { type: this.sql.DateTime2(0), value: asOf },
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
    });
    return result.recordset;
  }

  async listPromotions({ page, pageSize, search, searchPattern, status, type }) {
    const result = await this.query({
      text: `
        SELECT
          promotion.MaKM,
          promotion.TenKM,
          promotion.LoaiKM,
          promotion.GiaTri,
          promotion.GiaTriDonToiThieu,
          promotion.MucGiamToiDa,
          promotion.NgayBatDau,
          promotion.NgayKetThuc,
          promotion.TrangThai,
          COUNT_BIG(promotion_product.MaSP) AS SoSanPhamApDung,
          COUNT_BIG(*) OVER () AS TotalItems
        FROM dbo.KHUYEN_MAI AS promotion
        LEFT JOIN dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
          ON promotion_product.MaKM = promotion.MaKM
        WHERE (@Status IS NULL OR promotion.TrangThai = @Status)
          AND (@Type IS NULL OR promotion.LoaiKM = @Type)
          AND (
            @SearchPattern IS NULL
            OR promotion.MaKM = @SearchCode
            OR promotion.TenKM LIKE @SearchPattern ESCAPE '~'
          )
        GROUP BY
          promotion.MaKM,
          promotion.TenKM,
          promotion.LoaiKM,
          promotion.GiaTri,
          promotion.GiaTriDonToiThieu,
          promotion.MucGiamToiDa,
          promotion.NgayBatDau,
          promotion.NgayKetThuc,
          promotion.TrangThai
        ORDER BY promotion.NgayBatDau DESC, promotion.MaKM
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        SearchCode: { type: this.sql.VarChar(150), value: search },
        SearchPattern: { type: this.sql.NVarChar(304), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
        Type: { type: this.sql.VarChar(20), value: type },
      },
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TotalItems ?? 0),
    };
  }

  async findPromotionById(promotionId, { forUpdate = false, transaction = null } = {}) {
    const lockHint = forUpdate ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
    const result = await this.query({
      text: `
        SELECT
          promotion.MaKM,
          promotion.TenKM,
          promotion.LoaiKM,
          promotion.GiaTri,
          promotion.GiaTriDonToiThieu,
          promotion.MucGiamToiDa,
          promotion.NgayBatDau,
          promotion.NgayKetThuc,
          promotion.TrangThai
        FROM dbo.KHUYEN_MAI AS promotion ${lockHint}
        WHERE promotion.MaKM = @PromotionId;

        SELECT
          product.MaSP,
          product.TenSP,
          product.GiaBan,
          product.TrangThai,
          category.TrangThai AS TrangThaiLoai
        FROM dbo.KHUYEN_MAI_SAN_PHAM AS promotion_product
        JOIN dbo.SAN_PHAM AS product ON product.MaSP = promotion_product.MaSP
        JOIN dbo.LOAI_SAN_PHAM AS category ON category.MaLoai = product.MaLoai
        WHERE promotion_product.MaKM = @PromotionId
        ORDER BY product.TenSP, product.MaSP;
      `,
      parameters: {
        PromotionId: { type: this.sql.VarChar(12), value: promotionId },
      },
      transaction,
    });
    const promotion = result.recordsets?.[0]?.[0] ?? null;
    if (!promotion) return null;
    return { promotion, products: result.recordsets?.[1] ?? [] };
  }

  async findProductsByIds(productIds, transaction = null) {
    if (productIds.length === 0) return [];
    const parameters = {};
    const placeholders = productIds.map((productId, index) => {
      const name = `ProductId${index}`;
      parameters[name] = { type: this.sql.VarChar(10), value: productId };
      return `@${name}`;
    });
    const result = await this.query({
      text: `
        SELECT
          product.MaSP,
          product.TenSP,
          product.GiaBan,
          product.TrangThai,
          category.TrangThai AS TrangThaiLoai
        FROM dbo.SAN_PHAM AS product
        JOIN dbo.LOAI_SAN_PHAM AS category ON category.MaLoai = product.MaLoai
        WHERE product.MaSP IN (${placeholders.join(', ')})
      `,
      parameters,
      transaction,
    });
    return result.recordset;
  }

  async createPromotion(promotion, transaction) {
    await this.query({
      text: `
        INSERT INTO dbo.KHUYEN_MAI (
          MaKM, TenKM, LoaiKM, GiaTri, GiaTriDonToiThieu,
          MucGiamToiDa, NgayBatDau, NgayKetThuc, TrangThai
        ) VALUES (
          @PromotionId, @Name, @Type, @Value, @MinimumOrderValue,
          @MaximumDiscount, @StartAt, @EndAt, @Status
        )
      `,
      parameters: this.promotionParameters(promotion),
      transaction,
    });
  }

  async updatePromotion(promotionId, changes, transaction) {
    await this.query({
      text: `
        UPDATE dbo.KHUYEN_MAI
        SET TenKM = CASE WHEN @SetName = 1 THEN @Name ELSE TenKM END,
            LoaiKM = CASE WHEN @SetType = 1 THEN @Type ELSE LoaiKM END,
            GiaTri = CASE WHEN @SetValue = 1 THEN @Value ELSE GiaTri END,
            GiaTriDonToiThieu = CASE
              WHEN @SetMinimumOrderValue = 1 THEN @MinimumOrderValue
              ELSE GiaTriDonToiThieu
            END,
            MucGiamToiDa = CASE
              WHEN @SetMaximumDiscount = 1 THEN @MaximumDiscount
              ELSE MucGiamToiDa
            END,
            NgayBatDau = CASE WHEN @SetStartAt = 1 THEN @StartAt ELSE NgayBatDau END,
            NgayKetThuc = CASE WHEN @SetEndAt = 1 THEN @EndAt ELSE NgayKetThuc END
        WHERE MaKM = @PromotionId
      `,
      parameters: {
        ...this.promotionParameters({ promotionId, ...changes }),
        SetEndAt: { type: this.sql.Bit, value: Object.hasOwn(changes, 'endAt') },
        SetMaximumDiscount: {
          type: this.sql.Bit,
          value: Object.hasOwn(changes, 'maximumDiscount'),
        },
        SetMinimumOrderValue: {
          type: this.sql.Bit,
          value: Object.hasOwn(changes, 'minimumOrderValue'),
        },
        SetName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'name') },
        SetStartAt: { type: this.sql.Bit, value: Object.hasOwn(changes, 'startAt') },
        SetType: { type: this.sql.Bit, value: Object.hasOwn(changes, 'type') },
        SetValue: { type: this.sql.Bit, value: Object.hasOwn(changes, 'value') },
      },
      transaction,
    });
  }

  async updatePromotionStatus(promotionId, status, transaction) {
    await this.query({
      text: 'UPDATE dbo.KHUYEN_MAI SET TrangThai = @Status WHERE MaKM = @PromotionId',
      parameters: {
        PromotionId: { type: this.sql.VarChar(12), value: promotionId },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
  }

  async replacePromotionProducts(promotionId, productIds, transaction) {
    await this.query({
      text: 'DELETE FROM dbo.KHUYEN_MAI_SAN_PHAM WHERE MaKM = @PromotionId',
      parameters: {
        PromotionId: { type: this.sql.VarChar(12), value: promotionId },
      },
      transaction,
    });
    if (productIds.length === 0) return;
    const parameters = {
      PromotionId: { type: this.sql.VarChar(12), value: promotionId },
    };
    const values = productIds.map((productId, index) => {
      const name = `ProductId${index}`;
      parameters[name] = { type: this.sql.VarChar(10), value: productId };
      return `(@PromotionId, @${name})`;
    });
    await this.query({
      text: `
        INSERT INTO dbo.KHUYEN_MAI_SAN_PHAM (MaKM, MaSP)
        VALUES ${values.join(', ')}
      `,
      parameters,
      transaction,
    });
  }

  promotionParameters(promotion) {
    return {
      EndAt: { type: this.sql.DateTime2(0), value: promotion.endAt ?? null },
      MaximumDiscount: {
        type: this.sql.Decimal(18, 2),
        value: promotion.maximumDiscount ?? null,
      },
      MinimumOrderValue: {
        type: this.sql.Decimal(18, 2),
        value: promotion.minimumOrderValue ?? null,
      },
      Name: { type: this.sql.NVarChar(150), value: promotion.name ?? null },
      PromotionId: { type: this.sql.VarChar(12), value: promotion.promotionId },
      StartAt: { type: this.sql.DateTime2(0), value: promotion.startAt ?? null },
      Status: { type: this.sql.VarChar(20), value: promotion.status ?? null },
      Type: { type: this.sql.VarChar(20), value: promotion.type ?? null },
      Value: { type: this.sql.Decimal(18, 2), value: promotion.value ?? null },
    };
  }
}

module.exports = {
  PromotionRepository,
};
