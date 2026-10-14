IF OBJECT_ID(N'dbo.HelpdeskTickets', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.HelpdeskTickets table was not found.', 1;
END;

IF COL_LENGTH(N'dbo.HelpdeskTickets', N'BranchId') IS NULL
    ALTER TABLE [dbo].[HelpdeskTickets] ADD [BranchId] nvarchar(100) NULL;

IF COL_LENGTH(N'dbo.HelpdeskTickets', N'BuildingId') IS NULL
    ALTER TABLE [dbo].[HelpdeskTickets] ADD [BuildingId] nvarchar(100) NULL;

IF COL_LENGTH(N'dbo.HelpdeskTickets', N'BuildingAreaId') IS NULL
    ALTER TABLE [dbo].[HelpdeskTickets] ADD [BuildingAreaId] nvarchar(100) NULL;

IF COL_LENGTH(N'dbo.HelpdeskTickets', N'FloorName') IS NULL
    ALTER TABLE [dbo].[HelpdeskTickets] ADD [FloorName] nvarchar(200) NULL;

IF COL_LENGTH(N'dbo.HelpdeskTickets', N'AreaName') IS NULL
    ALTER TABLE [dbo].[HelpdeskTickets] ADD [AreaName] nvarchar(200) NULL;
