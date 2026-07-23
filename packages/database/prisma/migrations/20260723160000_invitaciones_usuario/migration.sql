-- AlterTable
ALTER TABLE "User" ADD COLUMN     "invitacionExpira" TIMESTAMP(3),
ADD COLUMN     "invitacionToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_invitacionToken_key" ON "User"("invitacionToken");
