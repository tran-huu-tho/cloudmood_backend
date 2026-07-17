const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe('ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "isGuide" boolean DEFAULT false;');
  console.log('Success');
}
main().catch(console.error).finally(() => prisma.$disconnect());
