import { prisma } from './prisma-client.mjs';

function timeOnly(hh, mm) {
  return new Date(Date.UTC(1970, 0, 1, hh, mm, 0));
}

const PLACES_DATA = [
  // 1. Nhà hàng (categoryId will be mapped dynamically)
  {
    categoryName: 'Nhà hàng',
    name: 'The Cheese Time',
    description: 'Nhà hàng chuyên các món Âu, bít tết và phô mai nổi tiếng tại Cần Thơ với không gian ấm cúng, sang trọng.',
    latitude: 10.0298,
    longitude: 105.7820,
    address: '41 Châu Văn Liêm, Ninh Kiều, Cần Thơ',
    price: '150.000 - 350.000 VNĐ',
    openTime: timeOnly(10, 0),
    closeTime: timeOnly(22, 0),
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
    rating: 4.5,
    userRatingCount: 250,
    reviews: [
      { rating: 5, comment: 'Bít tết rất mềm, xốt phô mai béo ngậy cực kỳ ngon.' },
      { rating: 4, comment: 'Không gian đẹp, phục vụ hơi chậm chút lúc đông khách nhưng nhân viên dễ thương.' }
    ]
  },
  {
    categoryName: 'Nhà hàng',
    name: "Pizza 4P's Phan Kế Bính",
    description: 'Chuỗi nhà hàng pizza lò củi kiểu Nhật với phô mai burrata tự làm nổi tiếng và dịch vụ Omotenashi tuyệt vời.',
    latitude: 10.7876,
    longitude: 106.6983,
    address: '8/15 Phan Kế Bính, Đa Kao, Quận 1, TP. HCM',
    price: '200.000 - 500.000 VNĐ',
    openTime: timeOnly(11, 0),
    closeTime: timeOnly(23, 0),
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
    rating: 4.8,
    userRatingCount: 4890,
    reviews: [
      { rating: 5, comment: 'Pizza cua và pizza 4 phô mai kèm mật ong ngon xuất sắc!' },
      { rating: 5, comment: 'Không gian xanh mát, yên tĩnh giữa lòng Quận 1. Dịch vụ tuyệt vời.' }
    ]
  },
  {
    categoryName: 'Nhà hàng',
    name: 'Nhà hàng Hoa Sứ',
    description: 'Nhà hàng ẩm thực miền Tây sông nước Nam Bộ nằm ngay ven sông Hậu lộng gió, thích hợp cho gia đình.',
    latitude: 10.0441,
    longitude: 105.7918,
    address: 'Khu Vực Cái Khế, Ninh Kiều, Cần Thơ',
    price: '100.000 - 300.000 VNĐ',
    openTime: timeOnly(9, 0),
    closeTime: timeOnly(22, 0),
    image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800',
    rating: 4.2,
    userRatingCount: 850,
    reviews: [
      { rating: 4, comment: 'Món ăn miền Tây đậm đà, view sông Hậu rất mát mẻ chiều tối.' },
      { rating: 4, comment: 'Thích hợp liên hoan gia đình, cá lóc nướng trui và lẩu mắm ở đây khá ngon.' }
    ]
  },

  // 2. Khách sạn
  {
    categoryName: 'Khách sạn',
    name: 'Mường Thanh Luxury Cần Thơ',
    description: 'Khách sạn 5 sao cao cấp đầu tiên tại đồng bằng sông Cửu Long với tầm nhìn toàn cảnh cầu Cần Thơ hùng vĩ.',
    latitude: 10.0478,
    longitude: 105.7885,
    address: 'Khu cái khế, Ninh Kiều, Cần Thơ',
    price: '1.200.000 - 2.500.000 VNĐ/đêm',
    openTime: timeOnly(0, 0),
    closeTime: timeOnly(23, 59),
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    rating: 4.4,
    userRatingCount: 1820,
    reviews: [
      { rating: 5, comment: 'Phòng sạch đẹp, view sông cực chill, ăn sáng buffet đa dạng.' },
      { rating: 4, comment: 'Dịch vụ tốt, hồ bơi rộng rãi và nhân viên chu đáo.' }
    ]
  },
  {
    categoryName: 'Khách sạn',
    name: 'Sheraton Saigon Grand Opera Hotel',
    description: 'Khách sạn 5 sao sang trọng tọa lạc tại vị trí đắc địa ngay trung tâm Đồng Khởi Quận 1 với tiện ích đẳng cấp quốc tế.',
    latitude: 10.7758,
    longitude: 106.7029,
    address: '88 Đồng Khởi, Bến Nghé, Quận 1, TP. HCM',
    price: '3.500.000 - 7.000.000 VNĐ/đêm',
    openTime: timeOnly(0, 0),
    closeTime: timeOnly(23, 59),
    image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
    rating: 4.7,
    userRatingCount: 3120,
    reviews: [
      { rating: 5, comment: 'Vị trí tuyệt vời ngay trung tâm, phòng ốc và dịch vụ không có điểm nào chê.' },
      { rating: 4, comment: 'Giá hơi cao nhưng chất lượng dịch vụ và phòng nghỉ hoàn toàn xứng đáng.' }
    ]
  },
  {
    categoryName: 'Khách sạn',
    name: 'Azerai Cần Thơ',
    description: 'Khu nghỉ dưỡng sinh thái cao cấp biệt lập trên Cồn Ấu thơ mộng, mang lại không gian yên bình tuyệt đối.',
    latitude: 10.0172,
    longitude: 105.7958,
    address: 'Cồn Ấu, Hưng Phú, Cái Răng, Cần Thơ',
    price: '4.500.000 - 9.000.000 VNĐ/đêm',
    openTime: timeOnly(0, 0),
    closeTime: timeOnly(23, 59),
    image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
    rating: 4.8,
    userRatingCount: 420,
    reviews: [
      { rating: 5, comment: 'Resort cực kỳ yên bình, phong cách tối giản thanh lịch, nhân viên tinh tế.' },
      { rating: 5, comment: 'Trải nghiệm nghỉ dưỡng tuyệt vời nhất miền Tây, dịch vụ đưa đón bằng tàu riêng.' }
    ]
  },

  // 3. Quán ăn
  {
    categoryName: 'Quán ăn',
    name: 'Cơm Tấm Phong',
    description: 'Quán cơm tấm gia truyền nổi tiếng nhất nhì Cần Thơ với sườn nướng mật ong thơm phức làm say lòng thực khách.',
    latitude: 10.0242,
    longitude: 105.7681,
    address: '24/C Lê Bình, Hưng Lợi, Ninh Kiều, Cần Thơ',
    price: '35.000 - 65.000 VNĐ',
    openTime: timeOnly(6, 0),
    closeTime: timeOnly(21, 0),
    image: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800',
    rating: 4.3,
    userRatingCount: 340,
    reviews: [
      { rating: 5, comment: 'Sườn nướng ở đây siêu ngon, ướp đậm đà và nướng vừa chín tới không bị khô.' },
      { rating: 4, comment: 'Quán đông nên chờ hơi lâu, nước mắm pha kẹo kẹo rất hợp khẩu vị.' }
    ]
  },
  {
    categoryName: 'Quán ăn',
    name: 'Hủ Tiếu Mực Duy Mập',
    description: 'Hủ tiếu mực tươi ngon với mực giòn ngọt, nước dùng nấu từ tôm mực khô đậm đà ngọt thanh đặc trưng.',
    latitude: 10.0355,
    longitude: 105.7792,
    address: '90 Huỳnh Cương, An Cư, Ninh Kiều, Cần Thơ',
    price: '40.000 - 60.000 VNĐ',
    openTime: timeOnly(6, 0),
    closeTime: timeOnly(22, 0),
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800',
    rating: 4.2,
    userRatingCount: 180,
    reviews: [
      { rating: 4, comment: 'Mực tươi giòn, nước súp vừa vị, tô hủ tiếu đầy đặn ăn no nê.' }
    ]
  },
  {
    categoryName: 'Quán ăn',
    name: 'Cơm Tấm Ba Ghiền',
    description: 'Quán cơm tấm sườn bì chả trứ danh Sài Gòn được Michelin đề xuất với miếng sườn nướng siêu to khổng lồ.',
    latitude: 10.7975,
    longitude: 106.6713,
    address: '84 Đặng Văn Ngữ, Phú Nhuận, TP. HCM',
    price: '60.000 - 110.000 VNĐ',
    openTime: timeOnly(7, 30),
    closeTime: timeOnly(21, 30),
    image: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800',
    rating: 4.4,
    userRatingCount: 2890,
    reviews: [
      { rating: 5, comment: 'Miếng sườn to đùng che hết đĩa cơm, ướp đậm đà cực kỳ chất lượng.' },
      { rating: 4, comment: 'Ngon nhưng hơi béo và nhiều thịt quá, một phần ăn rất no.' }
    ]
  },

  // 4. Cà phê
  {
    categoryName: 'Cà phê',
    name: 'Highlands Coffee (Bến Ninh Kiều)',
    description: 'Chi nhánh Highlands Coffee với vị trí đắc địa trực diện bến Ninh Kiều, không gian rộng rãi ngắm cảnh sông nước cực chill.',
    latitude: 10.0336,
    longitude: 105.7878,
    address: '1 Hai Bà Trưng, Tân An, Ninh Kiều, Cần Thơ',
    price: '29.000 - 69.000 VNĐ',
    openTime: timeOnly(7, 0),
    closeTime: timeOnly(23, 0),
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    rating: 4.3,
    userRatingCount: 1450,
    reviews: [
      { rating: 4, comment: 'Freeze trà xanh và cafe phin sữa đá ngon ổn định, view ngắm cầu đi bộ rất đẹp.' }
    ]
  },
  {
    categoryName: 'Cà phê',
    name: 'Katinat Saigon Kafe (Nguyễn Du)',
    description: 'Không gian quán thiết kế retro, view kính ngắm góc phố Quận 1 cực đẹp, nổi tiếng với trà sữa chôm chôm và trà đào dầm.',
    latitude: 10.7778,
    longitude: 106.6994,
    address: '91 Nguyễn Du, Bến Nghé, Quận 1, TP. HCM',
    price: '40.000 - 75.000 VNĐ',
    openTime: timeOnly(7, 0),
    closeTime: timeOnly(23, 30),
    image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    rating: 4.4,
    userRatingCount: 890,
    reviews: [
      { rating: 5, comment: 'Thiết kế ly đẹp mắt, trà sữa lài thơm và không gian rất thích hợp ngồi buôn chuyện.' }
    ]
  },
  {
    categoryName: 'Cà phê',
    name: 'Starbucks Coffee (Rex Hotel)',
    description: 'Nằm tại tầng trệt khách sạn Rex ngay phố đi bộ Nguyễn Huệ nhộn nhịp, thích hợp tụ tập bạn bè và ngắm đường phố.',
    latitude: 10.7766,
    longitude: 106.7011,
    address: '141 Nguyễn Huệ, Bến Nghé, Quận 1, TP. HCM',
    price: '60.000 - 120.000 VNĐ',
    openTime: timeOnly(7, 0),
    closeTime: timeOnly(22, 30),
    image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800',
    rating: 4.5,
    userRatingCount: 2150,
    reviews: [
      { rating: 5, comment: 'Vị trí đắc địa, chất lượng nước chuẩn Starbucks toàn cầu, nhân viên thân thiện.' }
    ]
  },

  // 5. Trung tâm thương mại
  {
    categoryName: 'Trung tâm thương mại',
    name: 'Sense City Cần Thơ',
    description: 'Trung tâm thương mại sầm uất ngay trung tâm Cần Thơ với khu mua sắm Co.opmart, ẩm thực phong phú và khu trò chơi vui nhộn.',
    latitude: 10.0354,
    longitude: 105.7828,
    address: '1 Đại Lộ Hòa Bình, Tân An, Ninh Kiều, Cần Thơ',
    price: 'Vào cửa tự do',
    openTime: timeOnly(8, 30),
    closeTime: timeOnly(22, 0),
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
    rating: 4.3,
    userRatingCount: 2900,
    reviews: [
      { rating: 4, comment: 'Đầy đủ tiện ích ăn uống, mua sắm. Cuối tuần thường khá đông gia đình đưa con nhỏ đi chơi.' }
    ]
  },
  {
    categoryName: 'Trung tâm thương mại',
    name: 'Vincom Center Đồng Khởi',
    description: 'Một trong những trung tâm thương mại lớn và hiện đại nhất Sài Gòn với hàng loạt thương hiệu thời trang quốc tế và ẩm thực cao cấp.',
    latitude: 10.7781,
    longitude: 106.7020,
    address: '72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. HCM',
    price: 'Vào cửa tự do',
    openTime: timeOnly(9, 30),
    closeTime: timeOnly(22, 0),
    image: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800',
    rating: 4.5,
    userRatingCount: 9800,
    reviews: [
      { rating: 5, comment: 'Địa điểm mua sắm trung tâm siêu đẹp, bãi đỗ xe hơi chật hẹp vào giờ cao điểm.' }
    ]
  },

  // 6. Công viên
  {
    categoryName: 'Công viên',
    name: 'Công viên Lưu Hữu Phước',
    description: 'Lá phổi xanh rộng lớn nhất trung tâm thành phố Cần Thơ, địa điểm quen thuộc để tập thể dục, dạo mát và các sự kiện lớn.',
    latitude: 10.0366,
    longitude: 105.7801,
    address: 'Đường Đại Lộ Hòa Bình, Ninh Kiều, Cần Thơ',
    price: 'Miễn phí',
    openTime: timeOnly(4, 0),
    closeTime: timeOnly(23, 0),
    image: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800',
    rating: 4.4,
    userRatingCount: 1540,
    reviews: [
      { rating: 5, comment: 'Khuôn viên rất rộng và thoáng mát, tối đến có nhiều gia đình đưa bé đến trượt patin, thả diều.' }
    ]
  },
  {
    categoryName: 'Công viên',
    name: 'Công viên Vinhomes Central Park',
    description: 'Công viên ven sông Sài Gòn lấy cảm hứng từ Central Park New York với thảm cỏ xanh mướt rộng lớn và các góc check-in tuyệt đẹp.',
    latitude: 10.7935,
    longitude: 106.7218,
    address: '208 Nguyễn Hữu Cảnh, Quận Bình Thạnh, TP. HCM',
    price: 'Miễn phí',
    openTime: timeOnly(5, 0),
    closeTime: timeOnly(21, 30),
    image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800',
    rating: 4.7,
    userRatingCount: 8900,
    reviews: [
      { rating: 5, comment: 'Công viên ven sông cực kỳ đẹp, hiện đại và sạch sẽ bậc nhất Sài Gòn.' }
    ]
  },

  // 7. Điểm tham quan
  {
    categoryName: 'Điểm tham quan',
    name: 'Bến Ninh Kiều',
    description: 'Biểu tượng văn hóa du lịch nổi tiếng của Cần Thơ nằm bên bờ sông Hậu lộng gió, cạnh cầu đi bộ tình yêu lung linh.',
    latitude: 10.0338,
    longitude: 105.7876,
    address: 'Đường Hai Bà Trưng, Tân An, Ninh Kiều, Cần Thơ',
    price: 'Miễn phí',
    openTime: timeOnly(0, 0),
    closeTime: timeOnly(23, 59),
    image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    rating: 4.6,
    userRatingCount: 7890,
    reviews: [
      { rating: 5, comment: 'Đến Cần Thơ chắc chắn phải ghé đây đi dạo ngắm cảnh sông nước về đêm rất lãng mạn.' },
      { rating: 4, comment: 'Trải nghiệm du thuyền bến Ninh Kiều nghe đờn ca tài tử khá hay.' }
    ]
  },
  {
    categoryName: 'Điểm tham quan',
    name: 'Chợ nổi Cái Răng',
    description: 'Nét văn hóa giao thương độc đáo của miền Tây sông nước sông Hậu, trải nghiệm đi thuyền ăn bún riêu trên sông buổi sáng.',
    latitude: 10.0055,
    longitude: 105.7466,
    address: 'Sông Cái Răng, Quận Cái Răng, Cần Thơ',
    price: 'Miễn phí (chưa tính tiền thuê tàu ghe)',
    openTime: timeOnly(5, 0),
    closeTime: timeOnly(9, 0),
    image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800',
    rating: 4.4,
    userRatingCount: 4200,
    reviews: [
      { rating: 5, comment: 'Trải nghiệm tuyệt vời khi đi chợ từ lúc 5-6h sáng, tô bún riêu ăn trên ghe bồng bềnh cực ngon.' }
    ]
  },
  {
    categoryName: 'Điểm tham quan',
    name: 'Dinh Độc Lập',
    description: 'Công trình kiến trúc di tích lịch sử đặc biệt cấp quốc gia, lưu giữ nhiều chứng tích của ngày thống nhất đất nước 30/4/1975.',
    latitude: 10.7770,
    longitude: 106.6953,
    address: '135 Nam Kỳ Khởi Nghĩa, Bến Thành, Quận 1, TP. HCM',
    price: '40.000 - 65.000 VNĐ',
    openTime: timeOnly(8, 0),
    closeTime: timeOnly(16, 30),
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    rating: 4.6,
    userRatingCount: 12400,
    reviews: [
      { rating: 5, comment: 'Khuôn viên di tích rất rộng lớn nhiều cây xanh, kiến trúc độc đáo mang tính lịch sử cao.' }
    ]
  }
];

const CATEGORY_PHOTOS = {
  'Nhà hàng': [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
    'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
    'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800'
  ],
  'Khách sạn': [
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800',
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800',
    'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800'
  ],
  'Quán ăn': [
    'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800',
    'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    'https://images.unsplash.com/photo-1625398407796-82650a8c135f?w=800'
  ],
  'Cà phê': [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
    'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=800',
    'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800'
  ],
  'Trung tâm thương mại': [
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800',
    'https://images.unsplash.com/photo-1567401893930-7beb7b28dbb3?w=800',
    'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800',
    'https://images.unsplash.com/photo-1581009137042-c552e4856c7d?w=800',
    'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800'
  ],
  'Công viên': [
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800',
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800',
    'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800',
    'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800',
    'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800'
  ],
  'Điểm tham quan': [
    'https://images.unsplash.com/photo-1528127269322-539801943592?w=800',
    'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'
  ]
};

const REVIEWER_NAMES = [
  'Nguyễn Minh Hoàng', 'Lê Khánh Vy', 'Trần Hữu Thọ', 'Phan Thanh Bình', 'Nguyễn Thị Kim Anh',
  'Trần Anh Tuấn', 'Lê Thị Mai', 'Hoàng Minh Đức', 'Phạm Hồng Sơn', 'Đỗ Thùy Linh',
  'Nguyễn Quốc Bảo', 'Lê Thu Trang', 'Vũ Hoàng Nam', 'Bùi Minh Trí', 'Trần Ngọc Bích',
  'Phạm Thanh Hà', 'Nguyễn Văn Hùng', 'Lê Tuấn Kiệt', 'Đặng Phương Nam', 'Trần Thị Thu'
];

async function main() {
  console.log('Fetching seeded categories...');
  const dbCategories = await prisma.category.findMany({});
  const categoryMap = new Map(dbCategories.map((c) => [c.name, c.id]));

  console.log('Fetching sample users for review seeding...');
  const dbUsers = await prisma.user.findMany({ take: 3 });
  if (dbUsers.length === 0) {
    throw new Error('No users found in database. Please seed users first so we can seed reviews.');
  }

  console.log('Clearing existing Place & Review rows...');
  await prisma.review.deleteMany({});
  await prisma.place.deleteMany({});

  console.log('Seeding new Places & Reviews...');
  let index = 0;
  for (const item of PLACES_DATA) {
    const categoryId = categoryMap.get(item.categoryName);
    if (!categoryId) {
      console.warn(`Category "${item.categoryName}" not found. Skipping place "${item.name}".`);
      continue;
    }

    index++;
    const extId = item.externalId || `mock_place_${index}`;
    const ph = item.phone || `0292 ${3000000 + Math.floor(Math.random() * 6999999)}`;
    const web = item.website || `https://${item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.vn`;
    const priceLvl = item.priceLevel || 'MODERATE';
    
    // Generate amenities based on category
    let ams = item.subCategories || item.amenities || [];
    if (ams.length === 0) {
      if (item.categoryName === 'Cà phê' || item.categoryName === 'Nhà hàng' || item.categoryName === 'Quán ăn') {
        ams = ['Wifi miễn phí', 'Chỗ đỗ xe máy', 'Máy lạnh', 'Thanh toán thẻ', 'Không gian ngoài trời'];
      } else if (item.categoryName === 'Khách sạn') {
        ams = ['Wifi miễn phí', 'Hồ bơi', 'Ăn sáng miễn phí', 'Bãi đỗ xe ô tô', 'Dịch vụ phòng 24h'];
      } else {
        ams = ['Chỗ đỗ xe', 'Phù hợp cho trẻ em', 'Thanh toán tiền mặt'];
      }
    }

    // Generate mock photos (up to 3 photos)
    const photoRecords = [];
    if (item.image) {
      photoRecords.push({
        urlOriginal: item.image,
        urlThumbnail: item.image,
        caption: `Không gian đẹp tại ${item.name}`,
        source: 'LOCAL'
      });
    }

    // Pick 2 unique photos from the category-specific list
    const catPhotos = CATEGORY_PHOTOS[item.categoryName] || [];
    let photoCount = 0;
    for (let i = 0; i < catPhotos.length && photoCount < 2; i++) {
      const pUrl = catPhotos[(index + i) % catPhotos.length];
      if (pUrl !== item.image) {
        photoRecords.push({
          urlOriginal: pUrl,
          urlThumbnail: pUrl,
          caption: `Góc chụp đẹp tại ${item.name}`,
          source: 'LOCAL'
        });
        photoCount++;
      }
    }

    const formatTime = (date) => {
      if (!date) return '08:00';
      const h = date.getUTCHours().toString().padStart(2, '0');
      const m = date.getUTCMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    };
    const openStr = formatTime(item.openTime);
    const closeStr = formatTime(item.closeTime);
    const opHrs = {
      monday: [openStr, closeStr],
      tuesday: [openStr, closeStr],
      wednesday: [openStr, closeStr],
      thursday: [openStr, closeStr],
      friday: [openStr, closeStr],
      saturday: [openStr, closeStr],
      sunday: [openStr, closeStr]
    };

    // 1. Create Place
    const createdPlace = await prisma.place.create({
      data: {
        name: item.name,
        description: item.description,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        price: item.price,
        openingHours: opHrs,
        categoryId,
        image: item.image,
        rating: item.rating,
        userRatingCount: item.userRatingCount,
        externalId: extId,
        phone: ph,
        website: web,
        priceLevel: priceLvl,
        subCategories: ams,
        lastSyncedAt: new Date(),
        photos: {
          create: photoRecords
        }
      }
    });

    console.log(`Created Place: ${createdPlace.name} (ID: ${createdPlace.id})`);

    // 2. Create Reviews linked to this Place
    if (item.reviews && item.reviews.length > 0) {
      for (let i = 0; i < item.reviews.length; i++) {
        const rev = item.reviews[i];
        
        // Pick a unique reviewer name and create a professional Initials avatar
        const authorName = REVIEWER_NAMES[(index * 3 + i) % REVIEWER_NAMES.length];
        const externalReviewId = `google_review_${createdPlace.id}_${i}`;
        const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}&backgroundColor=00acc1,1e88e5,5e35b1,43a047,d81b60`;

        const createdReview = await prisma.review.create({
          data: {
            rating: rev.rating,
            comment: rev.comment,
            placeId: createdPlace.id,
            externalReviewId: externalReviewId,
            authorName: authorName,
            authorAvatar: avatarUrl,
            publishedDate: new Date(Date.now() - (i * 3 * 24 * 60 * 60 * 1000)),
            source: 'GOOGLE'
          },
          select: {
            id: true,
            rating: true,
            comment: true,
            placeId: true,
            externalReviewId: true,
            authorName: true,
            authorAvatar: true,
            authorLocation: true,
            publishedDate: true,
            source: true
          }
        });
        console.log(`  - Added Review by ${authorName} (Google Source): ${createdReview.rating} stars`);
      }
    }
  }

  console.log('Seeding complete!');
}

main()
  .catch((err) => {
    console.error('Error seeding places:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
