IF OBJECT_ID(N'dbo.WorkPermits', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.WorkPermits table was not found.', 1;
END;

IF COL_LENGTH(N'dbo.WorkPermits', N'VendorTokenHash') IS NULL
BEGIN
    THROW 50002, 'The dbo.WorkPermits.VendorTokenHash column was not found.', 1;
END;

IF COL_LENGTH(N'dbo.WorkPermits', N'PermitNo') IS NULL
BEGIN
    THROW 50003, 'The dbo.WorkPermits.PermitNo column was not found.', 1;
END;

IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.WorkPermits')
      AND name = N'UQ_WorkPermits_PermitNo'
)
BEGIN
    ALTER TABLE [dbo].[WorkPermits]
        DROP CONSTRAINT [UQ_WorkPermits_PermitNo];
END
ELSE IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WorkPermits')
      AND name = N'UQ_WorkPermits_PermitNo'
      AND (
          is_unique = 0
          OR has_filter = 0
          OR filter_definition NOT LIKE N'%PermitNo%IS NOT NULL%'
      )
)
BEGIN
    DROP INDEX [UQ_WorkPermits_PermitNo] ON [dbo].[WorkPermits];
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes AS i
    JOIN sys.index_columns AS ic
      ON ic.object_id = i.object_id
     AND ic.index_id = i.index_id
     AND ic.key_ordinal = 1
    JOIN sys.columns AS c
      ON c.object_id = ic.object_id
     AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.WorkPermits')
      AND i.name = N'UQ_WorkPermits_PermitNo'
      AND i.is_unique = 1
      AND i.has_filter = 1
      AND i.filter_definition LIKE N'%PermitNo%IS NOT NULL%'
      AND c.name = N'PermitNo'
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_WorkPermits_PermitNo]
        ON [dbo].[WorkPermits] ([PermitNo])
        WHERE [PermitNo] IS NOT NULL;
END;

IF EXISTS (
    SELECT 1
    FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.WorkPermits')
      AND name = N'UQ_WorkPermits_VendorToken'
)
BEGIN
    ALTER TABLE [dbo].[WorkPermits]
        DROP CONSTRAINT [UQ_WorkPermits_VendorToken];
END
ELSE IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.WorkPermits')
      AND name = N'UQ_WorkPermits_VendorToken'
      AND (
          is_unique = 0
          OR has_filter = 0
          OR filter_definition NOT LIKE N'%VendorTokenHash%IS NOT NULL%'
      )
)
BEGIN
    DROP INDEX [UQ_WorkPermits_VendorToken] ON [dbo].[WorkPermits];
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes AS i
    JOIN sys.index_columns AS ic
      ON ic.object_id = i.object_id
     AND ic.index_id = i.index_id
     AND ic.key_ordinal = 1
    JOIN sys.columns AS c
      ON c.object_id = ic.object_id
     AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.WorkPermits')
      AND i.name = N'UQ_WorkPermits_VendorToken'
      AND i.is_unique = 1
      AND i.has_filter = 1
      AND i.filter_definition LIKE N'%VendorTokenHash%IS NOT NULL%'
      AND c.name = N'VendorTokenHash'
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [UQ_WorkPermits_VendorToken]
        ON [dbo].[WorkPermits] ([VendorTokenHash])
        WHERE [VendorTokenHash] IS NOT NULL;
END;
