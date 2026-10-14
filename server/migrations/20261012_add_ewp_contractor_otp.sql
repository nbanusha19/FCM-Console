IF OBJECT_ID(N'dbo.WorkPermits', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.WorkPermits table was not found.', 1;
END;

IF OBJECT_ID(N'dbo.EwpContractorOtpChallenges', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[EwpContractorOtpChallenges] (
        [PermitId] nvarchar(100) NOT NULL,
        [RaisedByUserId] nvarchar(100) NOT NULL,
        [ContractorEmail] nvarchar(320) NOT NULL,
        [CodeHash] char(64) NOT NULL,
        [ExpiresAt] datetime2(0) NOT NULL,
        [Attempts] int NOT NULL
            CONSTRAINT [DF_EwpContractorOtpChallenges_Attempts] DEFAULT (0),
        [VerifiedAt] datetime2(0) NULL,
        [CreatedAt] datetime2(0) NOT NULL
            CONSTRAINT [DF_EwpContractorOtpChallenges_CreatedAt] DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT [PK_EwpContractorOtpChallenges] PRIMARY KEY ([PermitId])
    );
END;
