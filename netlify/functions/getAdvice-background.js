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

      // --- 读取 CSV ---
      let breedRulesText = "没有找到该品种的特定规则。";
      try {
          const csvFilePath = path.resolve(__dirname, 'breed_rules.csv');
          const csvFileContent = fs.readFileSync(csvFilePath, 'utf8');
          const parseResult = Papa.parse(csvFileContent, { header: true, skipEmptyLines: true });
          if (parseResult.errors.length > 0) { console.error('CSV 解析错误:', parseResult.errors); }
          const relevantRules = Array.isArray(parseResult.data) ? parseResult.data.filter(row => row && row.Breed && typeof row.Breed === 'string' && row.Breed.toLowerCase() === breed.toLowerCase()) : [];
          if (relevantRules.length > 0) {
            breedRulesText = `关于【${breed}】品种的已知护理要点:\n`;
            relevantRules.forEach(rule => { breedRulesText += `- ${rule.RuleType || '通用'}: ${rule.RiskDescription || ''} 建议: ${rule.Suggestion || ''}\n`; });
            console.log("找到的相关规则文本:", breedRulesText);
          } else { console.log(`未在 CSV 中找到品种 "${breed}" 的特定规则。`); }
      } catch (fileError) {
          console.error(`读取或解析 CSV 文件时出错: ${fileError.message}. 将使用默认规则文本。`);
          if (fileError.code === 'ENOENT') {
              console.error(`确认 'netlify/functions/breed_rules.csv' 文件是否存在且路径正确。`);
              breedRulesText = "注意：未找到品种规则文件，建议基于通用知识。";
          }
      }

      // --- 构建 Prompt (要求 JSON 输出) ---
      const prompt = `
        你是一个经验丰富的宠物护理助手。请根据以下宠物信息和已知的犬种护理要点，生成一份护理建议。

        宠物信息:
        - 品种: ${breed}
        - 性别: ${gender === 'male' ? '男生' : '女生'}
        - 年龄: ${age} 岁
        - 体重: ${weight} kg

        已知的【${breed}】护理要点 (若未找到特定规则，则基于通用知识):
        ${breedRulesText}

        *** 重要指令：请将你的回复严格格式化为一个【单一的 JSON 对象字符串】。不要添加任何解释性文字、代码块标记(如 \`\`\`)或者其他任何非 JSON 内容。这个 JSON 对象必须包含以下【五个】键，其值都为字符串：
        1.  "feeding": "关于喂养方面的具体建议文本..."
        2.  "exercise": "关于运动方面的具体建议文本..."
        3.  "vaccination": "关于疫苗或健康检查方面的提醒文本..."
        4.  "risks": "基于宠物信息分析得出的主要健康风险点总结文本..."
        5.  "observations": "需要主人特别留意的观察点或潜在问题迹象的文本..."

        确保输出是一个可以直接被 JSON.parse() 解析的有效 JSON 字符串。例如：
        {"feeding": "建议...", "exercise": "计划...", "vaccination": "提醒...", "risks": "风险...", "observations": "观察..."}
      `;
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

              // --- JSON 清理逻辑 ---
              let jsonString = rawContent;
              const firstBraceIndex = rawContent.indexOf('{');
              const lastBraceIndex = rawContent.lastIndexOf('}');

              if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
                  jsonString = rawContent.substring(firstBraceIndex, lastBraceIndex + 1);
                  console.log("通过查找 {} 提取的 JSON 字符串:", jsonString);
              } else {
                  console.warn("在返回文本中找不到有效的 {...} 结构，将尝试解析原始文本。");
              }
              // --- JSON 清理逻辑结束 ---

              try {
                  adviceObject = JSON.parse(jsonString); // 解析清理后的字符串
                  // 字段验证
                  if (typeof adviceObject.feeding !== 'string' || typeof adviceObject.exercise !== 'string' || typeof adviceObject.vaccination !== 'string' || typeof adviceObject.risks !== 'string' || typeof adviceObject.observations !== 'string') {
                      console.error("解析后的 JSON 缺少必要的字段或类型错误。");
                      throw new Error("解析后的 JSON 格式不符合预期。");
                  }
                  console.log("成功将响应解析为 JSON 对象 (后台):", adviceObject);
                  success = true;
              } catch (parseError) {
                  console.error("无法将清理后的内容解析为 JSON (后台):", parseError); // 更新错误信息
                  errorMessage = '后端无法解析建议格式。';
                  adviceObject = { error: errorMessage, rawResponse: rawContent };
                  success = false;
              }
          } else { /* ... 处理无效响应结构 ... */ errorMessage = '从建议服务收到无效响应结构。'; success = false;}
      } catch (apiError) { /* ... 处理 API 调用错误 ... */ errorMessage = `调用建议服务失败 (${apiError.response?.status || '未知错误'})。`; success = false; }

      // --- 将结果存入 Supabase ---
      if (!petData) { /* ... */ return { statusCode: 400, body: "Bad request data." }; }

      if (success && adviceObject && !adviceObject.error) {
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
              advice_data: adviceObject // 也可存入包含错误的 adviceObject
          };
          const { error: dbErrorSavingError } = await supabase.from('generated_advice').insert([errorDataToInsert]);
          if (dbErrorSavingError) { console.error('存储错误状态到 Supabase 时出错:', dbErrorSavingError); }
          return { statusCode: 500, body: `Background task failed: ${errorMessage || '未知 AI 处理错误'}` };
      }

  } catch (error) {
      console.error('后台函数顶层错误:', error);
      return { statusCode: 500, body: JSON.stringify({ error: '内部服务器错误，请求处理失败' }) };
  }
}; // <--- 确保这个结尾 }; 存在!