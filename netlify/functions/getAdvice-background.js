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
  if (!deepseekApiKey) { console.error("DeepSeek API Key 未配置。"); return { statusCode: 500 }; }
  if (!supabase) { console.error("Supabase 未配置。"); return { statusCode: 500 }; }

  let taskId;
  let petData;

  try {
      const payload = JSON.parse(event.body);
      taskId = payload.taskId;
      petData = payload.petData;

      if (!taskId || !petData || typeof petData !== 'object') {
          console.error(`[${taskId || '未知 Task'}] 无效的请求负载:`, payload);
          return { statusCode: 400, body: '无效的请求负载' };
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
            console.log(`[${taskId}] 找到的相关规则文本:`, breedRulesText);
          } else { console.log(`[${taskId}] 未在 CSV 中找到品种 "${breed}" 的特定规则。`); }
      } catch (fileError) {
          console.error(`[${taskId}] 读取或解析 CSV 文件时出错: ${fileError.message}. 将使用默认规则文本。`);
          if (fileError.code === 'ENOENT') {
              console.error(`[${taskId}] 确认 'netlify/functions/breed_rules.csv' 文件是否存在且路径正确。`);
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
      console.log(`[${taskId}] 已构建请求 JSON 输出的 Prompt。`);

      // --- 调用 DeepSeek API ---
      let adviceObject = null;
      let errorMessage = null;
      let success = false;

      try {
          const model_to_use = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
          console.log(`[${taskId}] 正在使用模型: ${model_to_use} (后台)`);
          const requestBody = { model: model_to_use, messages: [{ role: 'user', content: prompt }]};
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` };

          console.time(`[${taskId}] DeepSeek API Call`);
          const response = await axios.post(DEEPSEEK_API_ENDPOINT, requestBody, { headers });
          console.timeEnd(`[${taskId}] DeepSeek API Call`);

          if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message) {
              const rawContent = response.data.choices[0].message.content.trim();
              console.log(`[${taskId}] DeepSeek API 返回原始文本:`, rawContent);

              // JSON 清理逻辑
              let jsonString = rawContent;
              const firstBraceIndex = rawContent.indexOf('{');
              const lastBraceIndex = rawContent.lastIndexOf('}');
              if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
                  jsonString = rawContent.substring(firstBraceIndex, lastBraceIndex + 1);
                  console.log(`[${taskId}] 通过查找 {} 提取的 JSON 字符串:`, jsonString);
              } else {
                  console.warn(`[${taskId}] 在返回文本中找不到有效的 {...} 结构，将尝试解析原始文本。`);
              }

              try {
                  adviceObject = JSON.parse(jsonString);
                  if (typeof adviceObject.feeding !== 'string' || typeof adviceObject.exercise !== 'string' || typeof adviceObject.vaccination !== 'string' || typeof adviceObject.risks !== 'string' || typeof adviceObject.observations !== 'string') {
                       console.error(`[${taskId}] 解析后的 JSON 缺少必要的字段或类型错误。`);
                       throw new Error("解析后的 JSON 格式不符合预期。");
                  }
                  console.log(`[${taskId}] 成功将响应解析为 JSON 对象:`, adviceObject);
                  success = true;
              } catch (parseError) {
                  console.error(`[${taskId}] 无法将清理后的内容解析为 JSON:`, parseError);
                  errorMessage = '后端无法解析建议格式。';
                  adviceObject = { error: errorMessage, rawResponse: rawContent };
                  success = false;
              }
          } else { errorMessage = '从建议服务收到无效响应结构。'; success = false;}
      } catch (apiError) {
          console.timeEnd(`[${taskId}] DeepSeek API Call`); // 确保计时结束
          console.error(`[${taskId}] 调用 DeepSeek API 时出错:`, apiError.message);
          if (apiError.response) { errorMessage = `调用建议服务失败 (${apiError.response.status})。`; }
          else { errorMessage = '调用建议服务时发生网络或未知错误。'; }
          adviceObject = { error: errorMessage }; success = false;
      }

      // --- 更新 Supabase 记录 ---
      console.log(`[${taskId}] 准备更新 Supabase 记录...`);
      let updateData;
      if (success && adviceObject && !adviceObject.error) {
          updateData = { status: 'completed', advice_data: adviceObject, error_message: null };
          console.log(`[${taskId}] 更新数据 (成功):`, updateData);
      } else {
          updateData = { status: 'failed', error_message: errorMessage || '未知 AI 处理错误', advice_data: adviceObject };
          console.error(`[${taskId}] 更新数据 (失败):`, updateData);
      }

      const { data: updatedData, error: dbUpdateError } = await supabase
          .from('generated_advice')
          .update(updateData)
          .eq('task_id', taskId)
          .select();

      if (dbUpdateError) {
          console.error(`[${taskId}] Supabase 更新错误:`, dbUpdateError);
          return { statusCode: 500, body: `Background task finished but DB update failed for ${taskId}` };
      } else {
          console.log(`[${taskId}] 成功更新 Supabase 记录:`, updatedData);
          return { statusCode: 200, body: `Background task succeeded for ${taskId}` };
      }

  } catch (error) {
      console.error(`[${taskId || '未知 Task'}] 后台函数顶层错误:`, error);
      if (taskId && supabase) {
          try { await supabase.from('generated_advice').update({ status: 'failed', error_message: 'Function top-level error' }).eq('task_id', taskId); }
          catch (dbError) { console.error(`[${taskId}] 尝试记录顶层错误到 Supabase 时失败:`, dbError); }
      }
      return { statusCode: 500, body: JSON.stringify({ error: '内部服务器错误，请求处理失败' }) };
  }
}; // <--- 确保这个结尾 }; 存在!