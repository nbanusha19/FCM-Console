IF OBJECT_ID(N'dbo.HelpdeskTickets', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.HelpdeskTickets table was not found.', 1;
END;

IF COL_LENGTH(N'dbo.HelpdeskTickets', N'RaisedByUserId') IS NULL
BEGIN
    THROW 50002, 'The dbo.HelpdeskTickets.RaisedByUserId column was not found.', 1;
END;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE [object_id] = OBJECT_ID(N'dbo.HelpdeskTickets')
      AND [name] = N'RaisedByUserId'
      AND [is_nullable] = 0
)
BEGIN
    DECLARE @type_name sysname;
    DECLARE @max_length smallint;
    DECLARE @length_declaration nvarchar(10);
    DECLARE @sql nvarchar(max);

    SELECT
        @type_name = TYPE_NAME([system_type_id]),
        @max_length = [max_length]
    FROM sys.columns
    WHERE [object_id] = OBJECT_ID(N'dbo.HelpdeskTickets')
      AND [name] = N'RaisedByUserId';

    IF @type_name = N'uniqueidentifier'
    BEGIN
        ALTER TABLE [dbo].[HelpdeskTickets]
            ALTER COLUMN [RaisedByUserId] uniqueidentifier NULL;
    END;
    ELSE IF @type_name IN (N'nvarchar', N'varchar', N'nchar', N'char')
    BEGIN
        SET @length_declaration = CASE
            WHEN @max_length = -1 THEN N'MAX'
            WHEN @type_name IN (N'nvarchar', N'nchar') THEN CONVERT(nvarchar(10), @max_length / 2)
            ELSE CONVERT(nvarchar(10), @max_length)
        END;

        SET @sql = N'ALTER TABLE [dbo].[HelpdeskTickets] ALTER COLUMN [RaisedByUserId] '
            + QUOTENAME(@type_name) + N'(' + @length_declaration + N') NULL;';
        EXEC sys.sp_executesql @sql;
    END
    ELSE
    BEGIN
        THROW 50003, 'RaisedByUserId must use a supported character or uniqueidentifier data type.', 1;
    END;
END;
