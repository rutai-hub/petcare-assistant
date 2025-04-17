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

const DEEPSEEK_API_ENDPOINT = '[https://api.deepseek.com/v1/chat/completions](https://api.deepseek.com/v1/chat/completions)';

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

      // --- 构建 Prompt ---
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

              // --- !!! 新增：清理返回的文本，尝试提取纯 JSON !!! ---
              let jsonString = rawContent;
              // 尝试匹配 ```json ... ``` 或单独的 {...}
              const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
              if (jsonMatch && (jsonMatch[1] || jsonMatch[2])) {
                  jsonString = (jsonMatch[1] || jsonMatch[2]).trim();
                  console.log("已清理 Markdown 标记，提取出的 JSON 字符串:", jsonString);
              } else {
                  // 如果没有匹配到 ```json，作为备用方案，也尝试去掉普通 ```
                   jsonString = rawContent.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
                   if(jsonString !== rawContent) {
                       console.log("已清理普通 Markdown 标记，提取出的 JSON 字符串:", jsonString);
                   } else {
                       console.log("未检测到 Markdown 标记，直接尝试解析原始文本。");
                   }
              }
              // --- 清理结束 ---

              try {
                  // --- 使用清理后的 jsonString 进行解析 ---
                  adviceObject = JSON.parse(jsonString);
                  // 字段验证
                  if (typeof adviceObject.feeding !== 'string' || typeof adviceObject.exercise !== 'string' || typeof adviceObject.vaccination !== 'string' || typeof adviceObject.risks !== 'string' || typeof adviceObject.observations !== 'string') {
                      console.error("解析后的 JSON 缺少必要的字段。");
                      throw new Error("解析后的 JSON 格式不符合预期。");
                  }
                  console.log("成功将响应解析为 JSON 对象 (后台):", adviceObject);
                  success = true;
              } catch (parseError) {
                  console.error("无法将 DeepSeek 返回的内容解析为 JSON (后台):", parseError);
                  errorMessage = '后端无法解析建议格式。';
                  adviceObject = { error: errorMessage, rawResponse: rawContent }; // 保留原始响应供调试
                  success = false;
              }
          } else { /* ... 处理无效响应结构 ... */ errorMessage = '从建议服务收到无效响应结构。'; success = false;}
      } catch (apiError) { /* ... 处理 API 调用错误 ... */ errorMessage = `调用建议服务失败 (${apiError.response?.status || '未知错误'})。`; success = false; }

      // --- 将结果存入 Supabase (逻辑不变) ---
      if (!petData) { /* ... 处理 petData 未定义 ... */ }

      if (success && adviceObject) {
          // ... 插入成功数据到 Supabase ...
          const dataToInsert = { /* ... */ };
          const { data: insertedData, error: dbInsertError } = await supabase.from('generated_advice').insert([dataToInsert]).select();
          if (dbInsertError) { /* ... 处理数据库插入错误 ... */ return { statusCode: 200, body: "Background task completed (DB insert failed)." };}
          else { /* ... 记录成功 ... */ return { statusCode: 200, body: "Background task succeeded." }; }
      } else {
          // ... 插入失败状态到 Supabase ...
          const errorDataToInsert = { /* ... */ error_message: errorMessage || '未知 AI 处理错误', advice_data: adviceObject };
          const { error: dbErrorSavingError } = await supabase.from('generated_advice').insert([errorDataToInsert]);
          if (dbErrorSavingError) { console.error('存储错误状态到 Supabase 时出错:', dbErrorSavingError); }
          return { statusCode: 500, body: `Background task failed: ${errorMessage || '未知 AI 处理错误'}` };
      }

  } catch (error) {
      console.error('后台函数顶层错误:', error);
      return { statusCode: 500, body: JSON.stringify({ error: '内部服务器错误，请求处理失败' }) };
  }
};