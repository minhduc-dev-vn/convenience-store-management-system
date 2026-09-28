'use strict';

const { getDatabaseSettings } = require('../config/database.config');
const { getSqlDriver } = require('../config/database.driver');
const { BaseRepository } = require('./base.repository');

class ProductRepository extends BaseRepository {
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

  async listProducts({ categoryId, page, pageSize, search, searchPattern, status }, {
    publicOnly = false,
    transaction = null,
  } = {}) {
    const result = await this.query({
      text: `
        SELECT
          product.MaSP,
          product.TenSP,
          product.MaVach,
          product.DonViTinh,
          product.GiaBan,
          product.MucTonToiThieu,
          product.MaLoai,
          product.TenLoai,
          product.TrangThaiLoai,
          product.TrangThai,
          COUNT_BIG(*) OVER () AS TotalItems
        FROM dbo.vw_SAN_PHAM_DANH_MUC AS product
        WHERE (@PublicOnly = 0 OR (
                 product.TrangThai = 'ACTIVE'
                 AND product.TrangThaiLoai = 'ACTIVE'
               ))
          AND (@Status IS NULL OR product.TrangThai = @Status)
          AND (@CategoryId IS NULL OR product.MaLoai = @CategoryId)
          AND (
            @SearchPattern IS NULL
            OR product.MaSP = @SearchCode
            OR product.MaVach = @SearchCode
            OR product.TenSP LIKE @SearchPattern ESCAPE '~'
          )
        ORDER BY product.TenSP, product.MaSP
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: categoryId },
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        PublicOnly: { type: this.sql.Bit, value: publicOnly },
        SearchCode: { type: this.sql.VarChar(150), value: search },
        SearchPattern: { type: this.sql.NVarChar(304), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TotalItems ?? 0),
    };
  }

  async findProductById(productId, { publicOnly = false, transaction = null } = {}) {
    const result = await this.query({
      text: `
        SELECT
          product.MaSP,
          product.TenSP,
          product.MaVach,
          product.DonViTinh,
          product.GiaBan,
          product.MucTonToiThieu,
          product.MaLoai,
          product.TenLoai,
          product.TrangThaiLoai,
          product.TrangThai
        FROM dbo.vw_SAN_PHAM_DANH_MUC AS product
        WHERE product.MaSP = @ProductId
          AND (@PublicOnly = 0 OR (
                 product.TrangThai = 'ACTIVE'
                 AND product.TrangThaiLoai = 'ACTIVE'
               ))
      `,
      parameters: {
        ProductId: { type: this.sql.VarChar(10), value: productId },
        PublicOnly: { type: this.sql.Bit, value: publicOnly },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findProductForUpdate(productId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaSP, TenSP, MaVach, DonViTinh, GiaBan,
               MucTonToiThieu, MaLoai, TrangThai
        FROM dbo.SAN_PHAM WITH (UPDLOCK, HOLDLOCK)
        WHERE MaSP = @ProductId
      `,
      parameters: {
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findBarcodeConflict(barcode, productId = null, transaction = null) {
    if (barcode === null) return null;
    const result = await this.query({
      text: `
        SELECT MaSP
        FROM dbo.SAN_PHAM WITH (UPDLOCK, HOLDLOCK)
        WHERE MaVach = @Barcode
          AND (@ProductId IS NULL OR MaSP <> @ProductId)
      `,
      parameters: {
        Barcode: { type: this.sql.VarChar(30), value: barcode },
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async createProduct(product, transaction) {
    await this.query({
      text: `
        INSERT INTO dbo.SAN_PHAM (
          MaSP, TenSP, MaVach, DonViTinh, GiaBan,
          MucTonToiThieu, MaLoai, TrangThai
        ) VALUES (
          @ProductId, @Name, @Barcode, @Unit, @Price,
          @MinimumStock, @CategoryId, @Status
        )
      `,
      parameters: {
        Barcode: { type: this.sql.VarChar(30), value: product.barcode },
        CategoryId: { type: this.sql.VarChar(10), value: product.categoryId },
        MinimumStock: { type: this.sql.Int, value: product.minimumStock },
        Name: { type: this.sql.NVarChar(150), value: product.name },
        Price: { type: this.sql.Decimal(18, 2), value: product.price },
        ProductId: { type: this.sql.VarChar(10), value: product.productId },
        Status: { type: this.sql.VarChar(20), value: product.status },
        Unit: { type: this.sql.NVarChar(20), value: product.unit },
      },
      transaction,
    });
  }

  async updateProduct(productId, changes, transaction) {
    await this.query({
      text: `
        UPDATE dbo.SAN_PHAM
        SET TenSP = CASE WHEN @SetName = 1 THEN @Name ELSE TenSP END,
            MaVach = CASE WHEN @SetBarcode = 1 THEN @Barcode ELSE MaVach END,
            DonViTinh = CASE WHEN @SetUnit = 1 THEN @Unit ELSE DonViTinh END,
            MucTonToiThieu = CASE
              WHEN @SetMinimumStock = 1 THEN @MinimumStock ELSE MucTonToiThieu
            END,
            MaLoai = CASE WHEN @SetCategoryId = 1 THEN @CategoryId ELSE MaLoai END
        WHERE MaSP = @ProductId
      `,
      parameters: {
        Barcode: { type: this.sql.VarChar(30), value: changes.barcode ?? null },
        CategoryId: { type: this.sql.VarChar(10), value: changes.categoryId ?? null },
        MinimumStock: { type: this.sql.Int, value: changes.minimumStock ?? null },
        Name: { type: this.sql.NVarChar(150), value: changes.name ?? null },
        ProductId: { type: this.sql.VarChar(10), value: productId },
        SetBarcode: { type: this.sql.Bit, value: Object.hasOwn(changes, 'barcode') },
        SetCategoryId: { type: this.sql.Bit, value: Object.hasOwn(changes, 'categoryId') },
        SetMinimumStock: { type: this.sql.Bit, value: Object.hasOwn(changes, 'minimumStock') },
        SetName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'name') },
        SetUnit: { type: this.sql.Bit, value: Object.hasOwn(changes, 'unit') },
        Unit: { type: this.sql.NVarChar(20), value: changes.unit ?? null },
      },
      transaction,
    });
  }

  async updateProductStatus(productId, status, transaction) {
    await this.query({
      text: 'UPDATE dbo.SAN_PHAM SET TrangThai = @Status WHERE MaSP = @ProductId',
      parameters: {
        ProductId: { type: this.sql.VarChar(10), value: productId },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
  }

  async updateProductPrice(productId, price, transaction) {
    await this.query({
      text: 'UPDATE dbo.SAN_PHAM SET GiaBan = @Price WHERE MaSP = @ProductId',
      parameters: {
        Price: { type: this.sql.Decimal(18, 2), value: price },
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
      transaction,
    });
  }

  async listPriceHistory(productId, { page, pageSize }, transaction = null) {
    const result = await this.query({
      text: `
        EXEC dbo.usp_SAN_PHAM_LichSuGia
          @MaSP = @ProductId,
          @SoTrang = @Page,
          @KichThuocTrang = @PageSize
      `,
      parameters: {
        Page: { type: this.sql.Int, value: page },
        PageSize: { type: this.sql.Int, value: pageSize },
        ProductId: { type: this.sql.VarChar(10), value: productId },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TongSoBanGhi ?? 0),
    };
  }

  async listCategories({ page, pageSize, searchPattern, status }, transaction = null) {
    const result = await this.query({
      text: `
        SELECT
          category.MaLoai,
          category.TenLoai,
          category.MoTa,
          category.TrangThai,
          COUNT_BIG(*) OVER () AS TotalItems
        FROM dbo.LOAI_SAN_PHAM AS category
        WHERE (@Status IS NULL OR category.TrangThai = @Status)
          AND (@SearchPattern IS NULL OR category.TenLoai LIKE @SearchPattern ESCAPE '~')
        ORDER BY category.TenLoai, category.MaLoai
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `,
      parameters: {
        Offset: { type: this.sql.Int, value: (page - 1) * pageSize },
        PageSize: { type: this.sql.Int, value: pageSize },
        SearchPattern: { type: this.sql.NVarChar(204), value: searchPattern },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
    return {
      items: result.recordset,
      totalItems: Number(result.recordset[0]?.TotalItems ?? 0),
    };
  }

  async listPublicCategories() {
    const result = await this.query({
      text: `
        SELECT MaLoai, TenLoai
        FROM dbo.LOAI_SAN_PHAM
        WHERE TrangThai = 'ACTIVE'
        ORDER BY TenLoai, MaLoai
      `,
    });
    return result.recordset;
  }

  async findCategoryById(categoryId, transaction = null) {
    const result = await this.query({
      text: `
        SELECT MaLoai, TenLoai, MoTa, TrangThai
        FROM dbo.LOAI_SAN_PHAM
        WHERE MaLoai = @CategoryId
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: categoryId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findCategoryForUpdate(categoryId, transaction) {
    const result = await this.query({
      text: `
        SELECT MaLoai, TenLoai, MoTa, TrangThai
        FROM dbo.LOAI_SAN_PHAM WITH (UPDLOCK, HOLDLOCK)
        WHERE MaLoai = @CategoryId
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: categoryId },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async findCategoryNameConflict(name, categoryId = null, transaction = null) {
    const result = await this.query({
      text: `
        SELECT MaLoai
        FROM dbo.LOAI_SAN_PHAM WITH (UPDLOCK, HOLDLOCK)
        WHERE TenLoai = @Name
          AND (@CategoryId IS NULL OR MaLoai <> @CategoryId)
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: categoryId },
        Name: { type: this.sql.NVarChar(100), value: name },
      },
      transaction,
    });
    return result.recordset[0] ?? null;
  }

  async createCategory(category, transaction) {
    await this.query({
      text: `
        INSERT INTO dbo.LOAI_SAN_PHAM (MaLoai, TenLoai, MoTa, TrangThai)
        VALUES (@CategoryId, @Name, @Description, @Status)
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: category.categoryId },
        Description: { type: this.sql.NVarChar(255), value: category.description },
        Name: { type: this.sql.NVarChar(100), value: category.name },
        Status: { type: this.sql.VarChar(20), value: category.status },
      },
      transaction,
    });
  }

  async updateCategory(categoryId, changes, transaction) {
    await this.query({
      text: `
        UPDATE dbo.LOAI_SAN_PHAM
        SET TenLoai = CASE WHEN @SetName = 1 THEN @Name ELSE TenLoai END,
            MoTa = CASE WHEN @SetDescription = 1 THEN @Description ELSE MoTa END
        WHERE MaLoai = @CategoryId
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: categoryId },
        Description: { type: this.sql.NVarChar(255), value: changes.description ?? null },
        Name: { type: this.sql.NVarChar(100), value: changes.name ?? null },
        SetDescription: { type: this.sql.Bit, value: Object.hasOwn(changes, 'description') },
        SetName: { type: this.sql.Bit, value: Object.hasOwn(changes, 'name') },
      },
      transaction,
    });
  }

  async updateCategoryStatus(categoryId, status, transaction) {
    await this.query({
      text: `
        UPDATE dbo.LOAI_SAN_PHAM
        SET TrangThai = @Status
        WHERE MaLoai = @CategoryId
      `,
      parameters: {
        CategoryId: { type: this.sql.VarChar(10), value: categoryId },
        Status: { type: this.sql.VarChar(20), value: status },
      },
      transaction,
    });
  }

  async writeAudit(
    { action, actorAccountId, ipAddress, newData, oldData, recordId, tableName },
    transaction,
  ) {
    await this.query({
      text: `
        EXEC dbo.usp_NHAT_KY_HE_THONG_Ghi
          @MaTK = @ActorAccountId,
          @HanhDong = @Action,
          @TenBang = @TableName,
          @MaBanGhi = @RecordId,
          @DuLieuCu = @OldData,
          @DuLieuMoi = @NewData,
          @DiaChiIP = @IpAddress
      `,
      parameters: {
        Action: { type: this.sql.VarChar(50), value: action },
        ActorAccountId: { type: this.sql.Int, value: actorAccountId },
        IpAddress: { type: this.sql.VarChar(45), value: ipAddress },
        NewData: { type: this.sql.NVarChar(this.sql.MAX), value: newData },
        OldData: { type: this.sql.NVarChar(this.sql.MAX), value: oldData },
        RecordId: { type: this.sql.VarChar(100), value: String(recordId) },
        TableName: { type: this.sql.VarChar(128), value: tableName },
      },
      transaction,
    });
  }
}

module.exports = {
  ProductRepository,
};
