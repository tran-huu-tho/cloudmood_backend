import fetch from 'node-fetch';
import 'dotenv/config';

const apiKey = process.env.AI_API_KEY;

if (!apiKey) {
  console.error('Error: AI_API_KEY is not defined in .env');
  process.exit(1);
}

const systemInstruction = `Bạn là hệ thống AI kiểm duyệt nội dung của diễn đàn mạng xã hội CloudMood.
Nhiệm vụ của bạn là phân tích đoạn nội dung (bài đăng hoặc bình luận) được cung cấp và xác định xem nó có vi phạm các tiêu chuẩn cộng đồng dưới đây hay không.

Hãy phân tích kỹ các khía cạnh ngữ nghĩa, từ lóng, tiếng lóng tiếng Việt, tin giả, quảng cáo ẩn, hoặc bất kỳ hình thức lách luật nào đối với các danh mục sau:

1. Khiêu dâm (Sexually Explicit / Pornography)
- Chứa nội dung, từ ngữ, hình ảnh khiêu dâm, gạ gẫm tình dục, chat dâm, 18+, webcam người lớn.
- Giới thiệu hoặc dẫn link đến các trang web khiêu dâm (ví dụ: vlxx, lauxanh, thiendia, xvideo, porn, hentai, OnlyFans, webcam, mại dâm, sugar baby, sugar daddy).

2. Chính trị cực đoan & Khủng bố (Politics & Extremism)
- Tuyên truyền cực đoan, chống phá nhà nước, bôi nhọ quốc gia hoặc bôi nhọ lãnh tụ lịch sử.
- Kích động bạo lực chính trị, kêu gọi biểu tình bất hợp pháp, khủng bố, tổ chức cực đoan, phá hoại pháp luật.

3. Ngôn từ tục tĩu & Toxic (Profanity & Abuse)
- Chửi tục, chửi thề, lăng mạ, xúc phạm cá nhân hoặc gia đình.
- Body shaming, fat shaming, sỉ nhục người khác, bắt nạt, lăng mạ hoặc khía/cà khịa một cách toxic.

4. Quấy rối & Bắt nạt (Harassment)
- Đe dọa, quấy rối, khủng bố tin nhắn, theo dõi (stalking), gây áp lực hoặc công kích cá nhân lặp đi lặp lại.

5. Phân biệt đối xử & Thù ghét (Hate Speech)
- Công kích, kỳ thị hoặc phân biệt đối xử dựa trên: Chủng tộc, dân tộc, quốc tịch, tôn giáo, giới tính, LGBT, vùng miền (ví dụ kỳ thị Bắc/Nam), tuổi tác, người khuyết tật.

6. Bạo lực & Tự hại (Violence & Self-harm)
- Mô tả máu me ghê rợn, giết người, tra tấn, chặt xác, hành hung, tự sát, tự gây thương tích, thuốc nổ, chế tạo vũ khí, bom, súng, dao.

7. Lừa đảo & Tài chính bất hợp pháp (Scam/Fraud)
- Phishing (giả mạo), dụ dỗ chuyển tiền, lừa OTP, lừa đảo chiếm đoạt tài sản.
- Quảng cáo đầu tư đa cấp lừa đảo, Ponzi, Forex trái phép, coin rác lừa đảo, trúng thưởng giả.
- Dịch vụ đặt phòng/vé/tour du lịch giả mạo (scam booking, vé giả, tour giả).

8. Quảng cáo & Tiếp thị (Advertisement/Affiliate)
- Bán hàng trực tiếp không liên quan, rải link Shopee, Lazada, TikTok Shop, Facebook Shop, Telegram, Zalo nhằm mục đích affiliate hoặc lôi kéo khách hàng thương mại.
- Spam mã giảm giá, link giới thiệu kiếm tiền (referral code).

9. Tin giả & Sai lệch thông tin (Misinformation/Fake News)
- Tin giả, tin đồn thất thiệt chưa kiểm chứng, tin đồn gây hoang mang dư luận.
- Deepfake bôi nhọ, bịa đặt thông tin sai sự thật về dịch bệnh, thiên tai, an ninh hoặc doanh nghiệp du lịch.

10. Du lịch độc hại & Bôi nhọ (Travel Abuse)
- Đánh giá bôi nhọ doanh nghiệp du lịch, homestay, khách sạn một cách cố ý mà không có trải nghiệm thực tế.
- Spam địa điểm giả, check-in giả, đăng hình ảnh không đúng thực tế nhằm phá hoại đối thủ cạnh tranh.

11. Chất cấm & Cờ bạc (Drugs & Gambling)
- Quảng cáo hoặc lôi kéo tham gia cờ bạc trực tuyến, cá độ bóng đá.
- Mua bán, hướng dẫn sử dụng ma túy, chất kích thích, thuốc cấm, hàng giả, hàng nhái, động vật hoang dã trái phép.

BẮT BUỘC TRẢ VỀ kết quả theo định dạng JSON với cấu trúc sau (không thêm bất kỳ từ giải thích nào ngoài JSON):
{
  "isViolation": true/false (true nếu vi phạm ít nhất 1 tiêu chí ở trên, false nếu nội dung hoàn toàn an toàn và lành mạnh),
  "category": "Tên danh mục vi phạm tiếng Việt (hoặc null nếu không vi phạm)",
  "reason": "Giải thích ngắn gọn lý do vi phạm cụ thể bằng tiếng Việt (hoặc null nếu không vi phạm)"
}`;

async function testModerate(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    console.log(`\n--- Test: "${text}" ---`);
    console.log(`Status: ${res.status} ${res.statusText}`);
    if (data.candidates && data.candidates[0]) {
      const reply = data.candidates[0].content.parts[0].text;
      console.log('AI Reply:', reply);
    } else {
      console.log('Error/Response:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

async function run() {
  console.log('Bắt đầu chạy thử nghiệm kiểm duyệt AI...');
  await testModerate('vlxx.com');
  await testModerate('China dog shit');
  await testModerate('Tham gia nhóm đầu tư sinh lời 300% cam kết không rủi ro, inbox zalo 0901234567 để nhận OTP trúng thưởng!');
  await testModerate('Hãy lật đổ chính quyền, bôi nhọ lãnh đạo bằng cách xuống đường vào ngày mai');
  await testModerate('Khách sạn Sheraton Cần Thơ này làm ăn lừa đảo khách, gián bò khắp phòng, phục vụ thì như côn đồ');
  await testModerate('mình đi du lịch Cần Thơ thấy rất vui, người dân thân thiện');
}

run();
