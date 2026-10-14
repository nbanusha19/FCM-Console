IF OBJECT_ID(N'dbo.Branches', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.Branches table was not found.', 1;
END;

IF OBJECT_ID(N'dbo.Visits', N'U') IS NULL
BEGIN
    THROW 50002, 'The dbo.Visits table was not found.', 1;
END;

IF OBJECT_ID(N'dbo.VmsBranchGeofences', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[VmsBranchGeofences] (
        [BranchId] nvarchar(100) NOT NULL,
        [Latitude] decimal(10, 7) NOT NULL,
        [Longitude] decimal(10, 7) NOT NULL,
        [RadiusMeters] int NOT NULL
            CONSTRAINT [DF_VmsBranchGeofences_RadiusMeters] DEFAULT (100),
        [UpdatedAt] datetime2(0) NOT NULL
            CONSTRAINT [DF_VmsBranchGeofences_UpdatedAt] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_VmsBranchGeofences] PRIMARY KEY ([BranchId]),
        CONSTRAINT [CK_VmsBranchGeofences_Latitude]
            CHECK ([Latitude] BETWEEN -90 AND 90),
        CONSTRAINT [CK_VmsBranchGeofences_Longitude]
            CHECK ([Longitude] BETWEEN -180 AND 180),
        CONSTRAINT [CK_VmsBranchGeofences_RadiusMeters]
            CHECK ([RadiusMeters] BETWEEN 25 AND 5000)
    );
END;

IF OBJECT_ID(N'dbo.VmsVisitorCheckInOtpChallenges', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[VmsVisitorCheckInOtpChallenges] (
        [VisitId] nvarchar(100) NOT NULL,
        [RecipientEmail] nvarchar(320) NOT NULL,
        [CodeHash] char(64) NOT NULL,
        [ExpiresAt] datetime2(0) NOT NULL,
        [Attempts] int NOT NULL
            CONSTRAINT [DF_VmsVisitorCheckInOtpChallenges_Attempts] DEFAULT (0),
        [CreatedAt] datetime2(0) NOT NULL
            CONSTRAINT [DF_VmsVisitorCheckInOtpChallenges_CreatedAt] DEFAULT (SYSUTCDATETIME()),
        [UsedAt] datetime2(0) NULL,
        CONSTRAINT [PK_VmsVisitorCheckInOtpChallenges] PRIMARY KEY ([VisitId]),
        CONSTRAINT [CK_VmsVisitorCheckInOtpChallenges_Attempts]
            CHECK ([Attempts] BETWEEN 0 AND 5)
    );
END;
