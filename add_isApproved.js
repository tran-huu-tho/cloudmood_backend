const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "Place" ADD COLUMN IF NOT EXISTS "isApproved" boolean DEFAULT true;');
  console.log('Success adding isApproved column');
}
main().catch(console.error).finally(() => prisma.$disconnect());
