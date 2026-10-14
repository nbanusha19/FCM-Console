IF COL_LENGTH('dbo.Visits', 'VisitorEmployeeId') IS NULL
BEGIN
    ALTER TABLE [dbo].[Visits]
        ADD [VisitorEmployeeId] nvarchar(100) NULL;
END;

IF COL_LENGTH('dbo.Visits', 'VisitorBranchId') IS NULL
BEGIN
    ALTER TABLE [dbo].[Visits]
        ADD [VisitorBranchId] nvarchar(100) NULL;
END;
