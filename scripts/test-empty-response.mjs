import fetch from 'node-fetch';
import 'dotenv/config';

const apiKey = process.env.AI_API_KEY || 'AQ.Ab8RN6KSYdYIPJ_KlZ1Fz7LMbkflp-Tj4bNPsjdwMvavSxSKnQ';

async function main() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
  const message = 'cái siêu thị lotte cần thơ nằm ở địa chỉ nào vậy';

  console.log(`Sending message: "${message}"`);
  
  const payload1 = {
    contents: [{ role: 'user', parts: [{ text: message }] }],
    systemInstruction: {
      parts: [{ text: 'Bạn là MoodBros, trợ lý AI đồng hành quản trị hệ thống CloudMood.' }]
    },
    tools: [{
      functionDeclarations: [
        {
          name: 'searchPlaces',
          description: 'Tìm kiếm danh sách địa điểm trong hệ thống theo tên hoặc địa chỉ.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'Từ khóa tìm kiếm trong tên hoặc địa chỉ.' },
              categoryName: { type: 'STRING', description: 'Tên danh mục cần lọc' },
            },
          },
        }
      ]
    }]
  };

  try {
    const res1 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload1)
    });

    const data1 = await res1.json();
    const candidate1 = data1.candidates?.[0];
    console.log('\n--- FIRST RESPONSE ---');
    console.log(JSON.stringify(candidate1, null, 2));

    const functionCalls = candidate1?.content?.parts?.filter(p => p.functionCall) || [];
    if (functionCalls.length > 0) {
      console.log('\nModel called functions:', functionCalls.map(f => f.functionCall.name));
      
      // Simulate database result for Lotte Mart:
      const searchResult = {
        places: []
      };

      const toolResults = functionCalls.map(call => ({
        functionResponse: {
          name: call.functionCall.name,
          response: { name: call.functionCall.name, content: searchResult }
        }
      }));

      const payload2 = {
        contents: [
          { role: 'user', parts: [{ text: message }] },
          candidate1.content,
          { role: 'user', parts: toolResults }
        ],
        systemInstruction: {
          parts: [{ text: 'Bạn là MoodBros, trợ lý AI đồng hành quản trị hệ thống CloudMood.' }]
        },
        tools: payload1.tools
      };

      console.log('\nSending second request with tool results...');
      const res2 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload2)
      });

      const data2 = await res2.json();
      console.log('\n--- SECOND RESPONSE ---');
      console.log(JSON.stringify(data2.candidates?.[0], null, 2));
    } else {
      console.log('No function calls returned.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
