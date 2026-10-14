IF OBJECT_ID(N'dbo.Visits', N'U') IS NULL
BEGIN
    THROW 50001, 'The dbo.Visits table was not found.', 1;
END;

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.Visits')
      AND name = N'CK_Visits_Status'
      AND CHARINDEX(N'CARD_ISSUED', definition) = 0
)
BEGIN
    ALTER TABLE [dbo].[Visits]
        DROP CONSTRAINT [CK_Visits_Status];
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.Visits')
      AND name = N'CK_Visits_Status'
)
BEGIN
    ALTER TABLE [dbo].[Visits] WITH CHECK
        ADD CONSTRAINT [CK_Visits_Status]
        CHECK ([Status] IN (
            N'PENDING',
            N'APPROVED',
            N'CARD_ISSUED',
            N'REJECTED',
            N'CHECKED_IN',
            N'CHECKED_OUT',
            N'CANCELLED',
            N'COMPLETED',
            N'EXPIRED'
        ));
END;

ALTER TABLE [dbo].[Visits] CHECK CONSTRAINT [CK_Visits_Status];
