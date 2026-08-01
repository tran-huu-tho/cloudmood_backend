const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Connecting to database...');
    const usersCount = await prisma.user.count();
    const postsCount = await prisma.explorePost.count();
    const publishedCount = await prisma.explorePost.count({ where: { status: 'PUBLISHED' } });
    console.log('Users count:', usersCount);
    console.log('ExplorePost count:', postsCount);
    console.log('Published ExplorePost count:', publishedCount);
    const samplePosts = await prisma.explorePost.findMany({ take: 5 });
    console.log('Sample posts:', JSON.stringify(samplePosts, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    , 2));
  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
