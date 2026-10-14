IF OBJECT_ID(N'dbo.WorkPermits', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.WorkPermits table was not found.', 1;
END;

IF OBJECT_ID(N'dbo.AppUsers', N'U') IS NULL
BEGIN
    THROW 50002, 'The dbo.AppUsers table was not found.', 1;
END;

IF OBJECT_ID(N'dbo.EwpNotifications', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[EwpNotifications] (
        [Id] uniqueidentifier NOT NULL
            CONSTRAINT [DF_EwpNotifications_Id] DEFAULT (NEWID()),
        [RecipientUserId] nvarchar(100) NOT NULL,
        [PermitId] nvarchar(100) NOT NULL,
        [PermitNo] nvarchar(50) NOT NULL,
        [Action] nvarchar(50) NOT NULL,
        [Title] nvarchar(200) NOT NULL,
        [Message] nvarchar(max) NOT NULL,
        [IsRead] bit NOT NULL
            CONSTRAINT [DF_EwpNotifications_IsRead] DEFAULT (0),
        [CreatedAt] datetime2(0) NOT NULL
            CONSTRAINT [DF_EwpNotifications_CreatedAt] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_EwpNotifications] PRIMARY KEY ([Id])
    );

    CREATE INDEX [IX_EwpNotifications_Recipient_CreatedAt]
        ON [dbo].[EwpNotifications] ([RecipientUserId], [CreatedAt] DESC);
END;
