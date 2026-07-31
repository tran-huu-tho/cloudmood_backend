import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const totalCount = await prisma.place.count();
    const approvedCount = await prisma.place.count({ where: { isApproved: true } });

    console.log(`TOTAL PLACES: ${totalCount}`);
    console.log(`APPROVED PLACES: ${approvedCount}`);

    const cities = ['Cần Thơ', 'Đà Lạt', 'Đà Nẵng', 'Hồ Chí Minh', 'Hà Nội', 'Nha Trang', 'Vũng Tàu', 'Phú Quốc', 'Huế', 'Quy Nhơn'];
    console.log('\n--- BREAKDOWN BY DESTINATION ---');
    for (const city of cities) {
      const count = await prisma.place.count({
        where: {
          isApproved: true,
          OR: [
            { address: { contains: city, mode: 'insensitive' } },
            { name: { contains: city, mode: 'insensitive' } },
          ],
        },
      });
      console.log(`${city}: ${count} places`);
    }
  } catch (err) {
    console.error('Error counting places:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
