import { prisma } from './prisma-client.mjs';

const NEW_CATEGORIES = [
  'Nhà hàng',
  'Khách sạn',
  'Quán ăn',
  'Cà phê',
  'Trung tâm thương mại',
  'Công viên',
  'Điểm tham quan'
];

async function main() {
  console.log('Clearing existing categories...');
  await prisma.category.deleteMany({});

  console.log('Seeding new categories...');
  for (const name of NEW_CATEGORIES) {
    const created = await prisma.category.create({
      data: { name }
    });
    console.log(`Created category: ${name} (ID: ${created.id})`);
  }
}

main()
  .catch((err) => {
    console.error('Error seeding categories:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
