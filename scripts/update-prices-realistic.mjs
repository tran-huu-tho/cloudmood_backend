import 'dotenv/config';
import { prisma } from './prisma-client.mjs';

async function main() {
  console.log('=== UPDATING PLACE PRICES TO 100% REALISTIC VALUES ===');

  const places = await prisma.place.findMany({
    include: { category: true }
  });

  console.log(`Loaded ${places.length} places to process.`);
  let updatedCount = 0;

  for (const place of places) {
    const name = place.name;
    const cleanName = name.toLowerCase();
    const categoryName = place.category.name;
    let price = place.price;

    if (categoryName === 'Khách sạn') {
      if (cleanName.includes('sheraton')) {
        price = '1.800.000 đ - 4.500.000 đ/đêm';
      } else if (cleanName.includes('victoria')) {
        price = '1.900.000 đ - 4.200.000 đ/đêm';
      } else if (cleanName.includes('ttc')) {
        price = '850.000 đ - 1.800.000 đ/đêm';
      } else if (cleanName.includes('mường thanh') || cleanName.includes('muong thanh')) {
        price = '1.100.000 đ - 2.800.000 đ/đêm';
      } else if (cleanName.includes('nesta')) {
        price = '750.000 đ - 1.600.000 đ/đêm';
      } else if (cleanName.includes('cồn khương') || cleanName.includes('con khuong')) {
        price = '1.200.000 đ - 3.000.000 đ/đêm';
      } else if (cleanName.includes('ninh kiều') || cleanName.includes('ninh kieu')) {
        price = '900.000 đ - 2.000.000 đ/đêm';
      } else if (cleanName.includes('homestay') || cleanName.includes('ecolodge') || cleanName.includes('village') || cleanName.includes('rustic')) {
        price = '450.000 đ - 950.000 đ/đêm';
      } else {
        price = '350.000 đ - 800.000 đ/đêm';
      }
    } 
    else if (categoryName === 'Nhà hàng') {
      if (cleanName.includes('pizza company') || cleanName.includes('pizza')) {
        price = '150.000 đ - 400.000 đ';
      } else if (cleanName.includes('sao hôm') || cleanName.includes('sao hom')) {
        price = '120.000 đ - 450.000 đ';
      } else if (cleanName.includes('spices')) {
        price = '180.000 đ - 600.000 đ';
      } else if (cleanName.includes('lúa nếp') || cleanName.includes('lua nep')) {
        price = '150.000 đ - 500.000 đ';
      } else if (cleanName.includes('nam bộ') || cleanName.includes('nam bo')) {
        price = '120.000 đ - 350.000 đ';
      } else if (cleanName.includes('sushi')) {
        price = '150.000 đ - 600.000 đ';
      } else if (cleanName.includes('chay')) {
        price = '30.000 đ - 120.000 đ';
      } else if (cleanName.includes('búp phê') || cleanName.includes('buffet') || cleanName.includes('nướng') || cleanName.includes('lẩu')) {
        price = '199.000 đ - 399.000 đ';
      } else {
        price = '100.000 đ - 350.000 đ';
      }
    } 
    else if (categoryName === 'Quán ăn') {
      if (cleanName.includes('cơm tấm') || cleanName.includes('com tam')) {
        price = '35.000 đ - 65.000 đ';
      } else if (cleanName.includes('bánh xèo') || cleanName.includes('banh xeo')) {
        price = '50.000 đ - 120.000 đ';
      } else if (cleanName.includes('bún mắm') || cleanName.includes('bun mam') || cleanName.includes('bún riêu') || cleanName.includes('hủ tiếu')) {
        price = '35.000 đ - 60.000 đ';
      } else if (cleanName.includes('burger king') || cleanName.includes('burger') || cleanName.includes('mcdonald')) {
        price = '45.000 đ - 120.000 đ';
      } else if (cleanName.includes('chè') || cleanName.includes('bánh mì') || cleanName.includes('ăn vặt')) {
        price = '15.000 đ - 45.000 đ';
      } else if (cleanName.includes('ốc') || cleanName.includes('oc')) {
        price = '50.000 đ - 150.000 đ';
      } else {
        price = '35.000 đ - 110.000 đ';
      }
    } 
    else if (categoryName === 'Cà phê') {
      if (cleanName.includes('highlands')) {
        price = '39.000 đ - 79.000 đ';
      } else if (cleanName.includes('phúc long') || cleanName.includes('phuc long')) {
        price = '45.000 đ - 85.000 đ';
      } else if (cleanName.includes('starbucks')) {
        price = '60.000 đ - 115.000 đ';
      } else if (cleanName.includes('trà sữa') || cleanName.includes('gong cha') || cleanName.includes('koi')) {
        price = '35.000 đ - 75.000 đ';
      } else if (cleanName.includes('vỉa hè') || cleanName.includes('cóc') || cleanName.includes('bình dân')) {
        price = '15.000 đ - 25.000 đ';
      } else {
        price = '25.000 đ - 55.000 đ';
      }
    } 
    else if (categoryName === 'Trung tâm thương mại') {
      price = 'Miễn phí vào cửa';
    } 
    else if (categoryName === 'Công viên') {
      price = 'Miễn phí';
    } 
    else if (categoryName === 'Điểm tham quan') {
      if (cleanName.includes('mỹ khánh') || cleanName.includes('my khanh')) {
        price = '90.000 đ/vé';
      } else if (cleanName.includes('ông đề') || cleanName.includes('ong de')) {
        price = '100.000 đ/vé';
      } else if (cleanName.includes('mười cương') || cleanName.includes('muoi cuong')) {
        price = '50.000 đ/vé';
      } else if (cleanName.includes('bảo tàng') || cleanName.includes('bao tang')) {
        price = '20.000 đ/vé';
      } else if (cleanName.includes('chùa') || cleanName.includes('thiền viện') || cleanName.includes('đền') || cleanName.includes('chợ nổi') || cleanName.includes('bến ninh kiều') || cleanName.includes('cầu đi bộ')) {
        price = 'Miễn phí';
      } else {
        price = 'Miễn phí';
      }
    }

    if (place.price !== price) {
      await prisma.place.update({
        where: { id: place.id },
        data: { price }
      });
      console.log(`Updated "${name}": "${place.price}" -> "${price}"`);
      updatedCount++;
    }
  }

  console.log(`\nCompleted! Updated prices for ${updatedCount} places.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
