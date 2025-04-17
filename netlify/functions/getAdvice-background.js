// netlify/functions/getAdvice-background.js

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js'); // <--- 导入 Supabase 客户端

// 读取环境变量
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 检查环境变量
if (!deepseekApiKey || !supabaseUrl || !supabaseServiceKey) {
  console.error("错误：缺少必要的环境变量 (DeepSeek Key, Supabase URL 或 Key)");
}

// 初始化 Supabase 客户端 (只有在 Key 存在时初始化)
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405 };
  }

  // 检查依赖项是否配置好
  if (!deepseekApiKey) { return { statusCode: 500, body: JSON.stringify({ error: 'DeepSeek API Key 未配置' }) }; }
  if (!supabase) { return { statusCode: 500, body: JSON.stringify({ error: 'Supabase 未配置' }) }; }

  let petData;
  try {
      petData = JSON.parse(event.body);
      console.log('后台函数收到的数据:', petData);
      const { breed, gender, age, weight } = petData;

      // --- 读取 CSV (逻辑不变) ---
      let breedRulesText = "没有找到该品种的特定规则。";
      try {
          const csvFilePath = path.resolve(__dirname, 'breed_rules.csv');
          // ... (CSV 读取和解析逻辑不变) ...
      } catch (fileError) { /* ... (处理 CSV 错误逻辑不变) ... */ }

      // --- 构建 Prompt (逻辑不变) ---
      const prompt = `...`; // 保持原来的 Prompt
      console.log("已构建请求 JSON 输出的 Prompt。");

      // --- 调用 DeepSeek API ---
      let adviceObject = null;
      let errorMessage = null;
      let success = false;

      try {
          const model_to_use = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
          console.log(`正在使用模型: ${model_to_use} (后台)`);
          // ... (构建 requestBody, headers 不变) ...
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` };
          const requestBody = { model: model_to_use, messages: [{ role: 'user', content: prompt }]};


          console.time('DeepSeek API Call (Background)');
          const response = await axios.post(DEEPSEEK_API_ENDPOINT, requestBody, { headers });
          console.timeEnd('DeepSeek API Call (Background)');

          if (response.data && response.data.choices && /* ... */) {
              const rawContent = response.data.choices[0].message.content.trim();
              console.log("DeepSeek API 返回原始文本 (后台):", rawContent);
              try {
                  adviceObject = JSON.parse(rawContent);
                  if (typeof adviceObject.feeding !== 'string' /* ... */) {
                     throw new Error("解析后的 JSON 格式不符合预期。");
                  }
                  console.log("成功解析为 JSON 对象 (后台):", adviceObject);
                  success = true; // AI 调用和解析成功
              } catch (parseError) { /* ... (处理 JSON 解析错误) ... */ errorMessage = '后端无法解析建议格式。'; }
          } else { /* ... (处理无效响应结构) ... */ errorMessage = '从建议服务收到无效响应结构。'; }
      } catch (apiError) { /* ... (处理 API 调用错误) ... */ errorMessage = `调用建议服务失败 (${apiError.response?.status || '未知错误'})。`;}

      // --- 将结果（或错误）存入 Supabase ---
      if (success && adviceObject) {
          // 成功获取并解析了建议
          console.log("准备将建议存入 Supabase...");
          // ！！！你需要根据你在 Supabase 创建的表和列来调整这里的 dataToInsert！！！
          const dataToInsert = {
              // request_data: petData, // 可以选择性存储原始请求
              pet_breed: petData.breed,
              pet_age: petData.age,
              pet_weight: petData.weight,
              pet_gender: petData.gender,
              advice_data: adviceObject, // 将整个 JSON 对象存入 jsonb 列
              status: 'completed',
              // 如果有用户系统，这里应该存 user_id
              // 如果需要轮询，这里应该生成并存储一个唯一的 task_id
          };
          const { data: insertedData, error: dbError } = await supabase
              .from('generated_advice') // <--- 你的表名
              .insert([dataToInsert])
              .select(); // select() 可以让它返回插入的数据

          if (dbError) {
              console.error('Supabase 插入错误:', dbError);
              // 即使数据库出错，API 调用也算成功了，但需要记录下来
              // 这里返回 200，但记录错误，或者返回特定错误码？暂时返回 200
               return { statusCode: 200, body: "Background task completed (DB insert failed)." };
          } else {
              console.log('成功存入 Supabase:', insertedData);
               return { statusCode: 200, body: "Background task succeeded." };
          }
      } else {
          // 如果 AI 调用或解析失败
          console.error("AI 处理失败，将错误信息存入 Supabase (可选)...");
          // 你可以选择也将失败状态存入数据库，方便追踪
          const errorDataToInsert = {
              pet_breed: petData.breed,
              pet_age: petData.age,
              pet_weight: petData.weight,
              pet_gender: petData.gender,
              status: 'failed',
              error_message: errorMessage,
          };
          const { error: dbError } = await supabase
              .from('generated_advice') // <--- 你的表名
              .insert([errorDataToInsert]);
          if (dbError) { console.error('存储错误状态到 Supabase 时出错:', dbError); }

          return { statusCode: 500, body: `Background task failed: ${errorMessage}` };
      }

  } catch (error) {
      console.error('后台函数顶层错误:', error);
      return { statusCode: 400, body: "Bad request processing." };
  }
};