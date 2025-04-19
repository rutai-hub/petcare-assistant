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
const modelToUse = process.env.DEEPSEEK_MODEL || 'deepseek-chat'; // 从环境变量读取模型或用默认

// 检查环境变量
if (!deepseekApiKey || !supabaseUrl || !supabaseServiceKey) {
  console.error("错误：getAdvice-background 缺少必要的环境变量");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

exports.handler = async function(event, context) {
  // 后台函数由 POST 触发
  if (event.httpMethod !== 'POST') { return { statusCode: 405 }; }
  if (!deepseekApiKey) { console.error("DeepSeek API Key 未配置。"); return { statusCode: 500 }; }
  if (!supabase) { console.error("Supabase 未配置。"); return { statusCode: 500 }; }

  let taskId;
  let petData;

  try {
      // 解析包含 taskId 和 petData 的请求体
      const payload = JSON.parse(event.body);
      taskId = payload.taskId;
      petData = payload.petData;

      if (!taskId || !petData || typeof petData !== 'object') {
          console.error(`[${taskId || '未知 Task'}] 无效的请求负载:`, payload);
          // 无法更新状态，因为没有 taskId，直接返回错误
          return { statusCode: 400 };
      }
      console.log(`[${taskId}] 后台函数开始处理...`);
      console.log(`[${taskId}] 收到的 petData:`, petData);

      const { breed, gender, age, weight } = petData;

      // --- 读取 CSV ---
      let breedRulesText = "没有找到该品种的特定规则。";
      try {
          const csvFilePath = path.resolve(__dirname, 'breed_rules.csv');
          const csvFileContent = fs.readFileSync(csvFilePath, 'utf8');
          const parseResult = Papa.parse(csvFileContent, { header: true, skipEmptyLines: true });
          if (parseResult.errors.length > 0) { console.error(`[${taskId}] CSV 解析错误:`, parseResult.errors); }
          const relevantRules = Array.isArray(parseResult.data) ? parseResult.data.filter(row => row && row.Breed && typeof row.Breed === 'string' && row.Breed.toLowerCase() === breed.toLowerCase()) : [];
          if (relevantRules.length > 0) {
            breedRulesText = `关于【${breed}】品种的已知护理要点:\n`;
            relevantRules.forEach(rule => { breedRulesText += `- ${rule.RuleType || '通用'}: ${rule.RiskDescription || ''} 建议: ${rule.Suggestion || ''}\n`; });
            console.log(`[${taskId}] 找到的相关规则文本。`); // 简化日志
          } else { console.log(`[${taskId}] 未在 CSV 中找到品种 "${breed}" 的特定规则。`); }
      } catch (fileError) {
          console.error(`[${taskId}] 读取或解析 CSV 文件时出错: ${fileError.message}. 将使用默认规则文本。`);
          if (fileError.code === 'ENOENT') {
              console.error(`[${taskId}] 确认 'netlify/functions/breed_rules.csv' 文件是否存在且路径正确。`);
              breedRulesText = "注意：未找到品种规则文件，建议基于通用知识。";
          }
      }

      // --- 构建 Prompt ---
      const prompt = `
        你是一个经验丰富的宠物护理助手...（保持原来的完整 Prompt）...
        *** 重要指令：请将你的回复严格格式化为一个【单一的 JSON 对象字符串】...包含以下【五个】键...
        {"feeding": "...", "exercise": "...", "vaccination": "...", "risks": "...", "observations": "..."}
      `;
      console.log(`[${taskId}] 已构建 Prompt (要求 JSON)。`);

      // --- 调用 DeepSeek API ---
      let adviceObject = null;
      let errorMessage = null;
      let success = false;

      try {
          console.log(`[${taskId}] 正在使用模型: ${modelToUse} (后台)`);
          const requestBody = { model: modelToUse, messages: [{ role: 'user', content: prompt }]};
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` };

          console.time(`[${taskId}] DeepSeek API Call`);
          const response = await axios.post(DEEPSEEK_API_ENDPOINT, requestBody, { headers });
          console.timeEnd(`[${taskId}] DeepSeek API Call`);

          if (response.data?.choices?.[0]?.message?.content) { // 使用可选链简化判断
              const rawContent = response.data.choices[0].message.content.trim();
              console.log(`[${taskId}] DeepSeek API 返回原始文本。`); // 简化日志
              // JSON 清理逻辑
              let jsonString = rawContent;
              const firstBraceIndex = rawContent.indexOf('{');
              const lastBraceIndex = rawContent.lastIndexOf('}');
              if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
                  jsonString = rawContent.substring(firstBraceIndex, lastBraceIndex + 1);
              } else { console.warn(`[${taskId}] 在返回文本中找不到有效的 {...} 结构。`); }

              try {
                  adviceObject = JSON.parse(jsonString);
                  // 基本字段验证
                  if (typeof adviceObject.feeding !== 'string' || typeof adviceObject.exercise !== 'string' || typeof adviceObject.vaccination !== 'string' || typeof adviceObject.risks !== 'string' || typeof adviceObject.observations !== 'string') {
                       throw new Error("解析后的 JSON 缺少必要的字段或类型错误。");
                  }
                  console.log(`[${taskId}] 成功解析为 JSON 对象。`); // 简化日志
                  success = true;
              } catch (parseError) {
                  console.error(`[${taskId}] 无法将清理后的内容解析为 JSON:`, parseError.message);
                  errorMessage = '后端无法解析建议格式。';
                  adviceObject = { error: errorMessage, rawResponse: rawContent };
                  success = false;
              }
          } else { errorMessage = '从建议服务收到无效响应结构。'; success = false;}
      } catch (apiError) {
          console.timeEnd(`[${taskId}] DeepSeek API Call`);
          console.error(`[${taskId}] 调用 DeepSeek API 时出错:`, apiError.message);
          errorMessage = `调用建议服务失败 (${apiError.response?.status || '未知错误'})。`;
          adviceObject = { error: errorMessage }; success = false;
      }

      // --- 更新 Supabase 记录 ---
      console.log(`[${taskId}] 准备更新 Supabase 记录...`);
      let updateData;
      if (success && adviceObject && !adviceObject.error) {
          updateData = { status: 'completed', advice_data: adviceObject, error_message: null };
      } else {
          updateData = { status: 'failed', error_message: errorMessage || '未知 AI 处理错误', advice_data: adviceObject };
      }
      console.log(`[${taskId}] 更新状态为: ${updateData.status}`);

      const { error: dbUpdateError } = await supabase
          .from('generated_advice')
          .update(updateData)
          .eq('task_id', taskId); // 使用 eq 更新

      if (dbUpdateError) {
          console.error(`[${taskId}] Supabase 更新错误:`, dbUpdateError);
          // 即使更新失败，后台任务本身也算执行完了（虽然结果没存上）
          return { statusCode: 500 }; // 返回错误给 Netlify 平台
      } else {
          console.log(`[${taskId}] 成功更新 Supabase 记录。`);
          return { statusCode: 200 }; // 返回成功给 Netlify 平台
      }

  } catch (error) {
      console.error(`[${taskId || '未知 Task'}] 后台函数顶层错误:`, error);
      // 如果 taskId 已知，尝试更新数据库为 failed
      if (taskId && supabase) {
          try { await supabase.from('generated_advice').update({ status: 'failed', error_message: `顶层错误: ${error.message}` }).eq('task_id', taskId); }
          catch (dbError) { console.error(`[${taskId}] 记录顶层错误到 Supabase 时失败:`, dbError); }
      }
      return { statusCode: 500 }; // 返回错误给 Netlify 平台
  }
};