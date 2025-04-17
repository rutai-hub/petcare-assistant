// netlify/functions/getAdvice-background.js

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// 读取环境变量
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 检查环境变量
if (!deepseekApiKey || !supabaseUrl || !supabaseServiceKey) {
  console.error("错误：缺少必要的环境变量 (DeepSeek Key, Supabase URL 或 Key)");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') { return { statusCode: 405 }; }
  if (!deepseekApiKey) { return { statusCode: 500, body: JSON.stringify({ error: 'DeepSeek API Key 未配置' }) }; }
  if (!supabase) { return { statusCode: 500, body: JSON.stringify({ error: 'Supabase 未配置' }) }; }

  let petData;
  try {
      petData = JSON.parse(event.body);
      console.log('后台函数收到的数据:', petData);
      const { breed, gender, age, weight } = petData;

      // --- 读取 CSV (逻辑不变) ---
      let breedRulesText = "没有找到该品种的特定规则。";
      try { /* ... CSV 读取逻辑 ... */ } catch (fileError) { /* ... CSV 错误处理 ... */ }

      // --- 构建 Prompt (逻辑不变) ---
      const prompt = `...`; // 保持你要求 JSON 输出的 Prompt 不变
      console.log("已构建请求 JSON 输出的 Prompt。");

      // --- 调用 DeepSeek API ---
      let adviceObject = null;
      let errorMessage = null;
      let success = false;

      try {
          const model_to_use = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
          console.log(`正在使用模型: ${model_to_use} (后台)`);
          const requestBody = { model: model_to_use, messages: [{ role: 'user', content: prompt }]};
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` };

          console.time('DeepSeek API Call (Background)');
          const response = await axios.post(DEEPSEEK_API_ENDPOINT, requestBody, { headers });
          console.timeEnd('DeepSeek API Call (Background)');

          if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message) {
              const rawContent = response.data.choices[0].message.content.trim();
              console.log("DeepSeek API 返回的原始文本:", rawContent);

              // --- !!! 更新：更通用的 JSON 提取逻辑 !!! ---
              let jsonString = rawContent;
              const firstBraceIndex = rawContent.indexOf('{');
              const lastBraceIndex = rawContent.lastIndexOf('}');

              if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
                  // 提取第一个 { 到最后一个 } 之间的内容
                  jsonString = rawContent.substring(firstBraceIndex, lastBraceIndex + 1);
                  console.log("通过查找 {} 提取的 JSON 字符串:", jsonString);
              } else {
                  // 如果连 {...} 结构都找不到，记录警告，仍尝试解析原始文本
                  console.warn("在返回文本中找不到有效的 {...} 结构，将尝试解析原始文本。");
              }
              // --- JSON 提取逻辑结束 ---

              try {
                  adviceObject = JSON.parse(jsonString); // 尝试解析提取出的或原始的字符串
                  // 字段验证
                  if (typeof adviceObject.feeding !== 'string' || typeof adviceObject.exercise !== 'string' || typeof adviceObject.vaccination !== 'string' || typeof adviceObject.risks !== 'string' || typeof adviceObject.observations !== 'string') {
                      console.error("解析后的 JSON 缺少必要的字段或类型错误。");
                      throw new Error("解析后的 JSON 格式不符合预期。");
                  }
                  console.log("成功将响应解析为 JSON 对象 (后台):", adviceObject);
                  success = true;
              } catch (parseError) {
                  console.error("无法将 DeepSeek 返回的内容解析为 JSON (后台):", parseError);
                  errorMessage = '后端无法解析建议格式。';
                  adviceObject = { error: errorMessage, rawResponse: rawContent };
                  success = false;
              }
          } else { /* ... 处理无效响应结构 ... */ errorMessage = '从建议服务收到无效响应结构。'; success = false;}
      } catch (apiError) { /* ... 处理 API 调用错误 ... */ errorMessage = `调用建议服务失败 (${apiError.response?.status || '未知错误'})。`; success = false; }

      // --- 将结果存入 Supabase ---
      if (!petData) { /* ... */ return { statusCode: 400, body: "Bad request data." }; }

      if (success && adviceObject) {
          // ... 插入成功数据 ...
      } else {
          // ... 插入失败状态 ...
      }
      // ...（省略了 Supabase 插入部分代码，保持和上次一样即可）...
       // --- 将结果存入 Supabase (逻辑不变) ---
      if (!petData) { /* ... 处理 petData 未定义 ... */ }

      if (success && adviceObject && !adviceObject.error) { // 加上 !adviceObject.error 判断
          console.log("准备将建议存入 Supabase...");
          const dataToInsert = {
              pet_breed: petData.breed, pet_age: petData.age, pet_weight: petData.weight, pet_gender: petData.gender,
              advice_data: adviceObject, status: 'completed',
          };
          const { data: insertedData, error: dbInsertError } = await supabase.from('generated_advice').insert([dataToInsert]).select();
          if (dbInsertError) {
              console.error('Supabase 插入错误:', dbInsertError);
              return { statusCode: 200, body: "Background task completed (DB insert failed)." };
          } else {
              console.log('成功存入 Supabase:', insertedData);
              return { statusCode: 200, body: "Background task succeeded." };
          }
      } else {
          console.error("AI 处理失败或解析失败，将错误信息存入 Supabase (可选)...");
          const errorDataToInsert = {
              pet_breed: petData.breed, pet_age: petData.age, pet_weight: petData.weight, pet_gender: petData.gender,
              status: 'failed',
              error_message: errorMessage || '未知 AI 处理错误',
              advice_data: adviceObject // 存储包含错误信息的对象
          };
          const { error: dbErrorSavingError } = await supabase.from('generated_advice').insert([errorDataToInsert]);
          if (dbErrorSavingError) { console.error('存储错误状态到 Supabase 时出错:', dbErrorSavingError); }
          return { statusCode: 500, body: `Background task failed: ${errorMessage || '未知 AI 处理错误'}` };
      }


  } catch (error) {
      console.error('后台函数顶层错误:', error);
      return { statusCode: 500, body: JSON.stringify({ error: '内部服务器错误，请求处理失败' }) };
  }
};