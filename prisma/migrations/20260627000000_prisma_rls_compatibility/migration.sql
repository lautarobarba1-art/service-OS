-- Prisma writes @updatedAt columns explicitly. These columns are still
-- server-owned because every table trigger overwrites the supplied value with
-- now(), but the authenticated role needs column privilege for the statement
-- to reach that trigger.
GRANT UPDATE ("updatedAt") ON "User" TO authenticated;
GRANT UPDATE ("updatedAt") ON "Resource" TO authenticated;
GRANT UPDATE ("updatedAt") ON "Service" TO authenticated;
GRANT UPDATE ("updatedAt") ON "Customer" TO authenticated;
GRANT UPDATE ("updatedAt") ON "AvailabilityRule" TO authenticated;
GRANT UPDATE ("updatedAt") ON "Booking" TO authenticated;
