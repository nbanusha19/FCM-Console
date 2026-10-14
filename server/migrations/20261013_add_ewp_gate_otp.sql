IF OBJECT_ID(N'dbo.WorkPermits', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.WorkPermits table was not found.', 1;
END;

IF OBJECT_ID(N'dbo.EwpGateOtpChallenges', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[EwpGateOtpChallenges] (
        [PermitId] nvarchar(100) NOT NULL,
        [ContractorEmail] nvarchar(320) NOT NULL,
        [CodeHash] char(64) NOT NULL,
        [ExpiresAt] datetime2(0) NOT NULL,
        [Attempts] int NOT NULL
            CONSTRAINT [DF_EwpGateOtpChallenges_Attempts] DEFAULT (0),
        [VerifiedAt] datetime2(0) NULL,
        [UsedAt] datetime2(0) NULL,
        [CreatedAt] datetime2(0) NOT NULL
            CONSTRAINT [DF_EwpGateOtpChallenges_CreatedAt] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_EwpGateOtpChallenges] PRIMARY KEY ([PermitId]),
        CONSTRAINT [CK_EwpGateOtpChallenges_Attempts]
            CHECK ([Attempts] BETWEEN 0 AND 5)
    );
END;
