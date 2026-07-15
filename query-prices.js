const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const pool = new Pool({ connectionString: "postgresql://postgres:01635400226Huutho%40@db.mrulzaiktzljosdgfivt.supabase.co:5432/postgres" });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    const prices = await prisma.place.findMany({
      select: { priceLevel: true },
      distinct: ['priceLevel'],
    });
    console.log('Distinct price levels:', prices);
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
