// netlify/functions/getAdvice-background.js

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// 读取环境变量 (不变)
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 检查环境变量 (不变)
if (!deepseekApiKey || !supabaseUrl || !supabaseServiceKey) {
  console.error("错误：缺少必要的环境变量 (DeepSeek Key, Supabase URL 或 Key)");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

exports.handler = async function(event, context) {
  // 后台函数通常也由 POST 触发 (由 startAdviceGeneration 调用)
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405 };
  }

  // 检查依赖项 (不变)
  if (!deepseekApiKey) { console.error("DeepSeek API Key 未配置。"); return { statusCode: 500 }; }
  if (!supabase) { console.error("Supabase 未配置。"); return { statusCode: 500 }; }

  let taskId;
  let petData;

  try {
      // --- !!! 修改：解析包含 taskId 和 petData 的请求体 !!! ---
      const payload = JSON.parse(event.body);
      taskId = payload.taskId;
      petData = payload.petData;

      // 检查是否成功获取 taskId 和 petData
      if (!taskId || !petData || typeof petData !== 'object') {
          console.error('无效的请求负载，缺少 taskId 或 petData:', payload);
          return { statusCode: 400, body: '无效的请求负载' };
      }
      console.log(`后台函数开始处理 Task ID: ${taskId}`);
      console.log('收到的 petData:', petData);
      // -------------------------------------------------------------

      const { breed, gender, age, weight } = petData; // 从 petData 解构

      // --- 读取 CSV (逻辑不变) ---
      let breedRulesText = "没有找到该品种的特定规则。";
      try { /* ... CSV 读取逻辑 ... */ } catch (fileError) { /* ... CSV 错误处理 ... */ }

      // --- 构建 Prompt (逻辑不变) ---
      const prompt = `...`; // 保持你要求 JSON 输出的 Prompt 不变
      console.log(`[${taskId}] 已构建请求 JSON 输出的 Prompt。`);

      // --- 调用 DeepSeek API (逻辑不变) ---
      let adviceObject = null;
      let errorMessage = null;
      let success = false;

      try {
          const model_to_use = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
          console.log(`[${taskId}] 正在使用模型: ${model_to_use} (后台)`);
          // ... (构建 requestBody, headers) ...
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` };
          const requestBody = { model: model_to_use, messages: [{ role: 'user', content: prompt }]};


          console.time(`[${taskId}] DeepSeek API Call`); // 加上 Task ID 方便追踪
          const response = await axios.post(DEEPSEEK_API_ENDPOINT, requestBody, { headers });
          console.timeEnd(`[${taskId}] DeepSeek API Call`);

          if (response.data && response.data.choices && /* ... */) {
              const rawContent = response.data.choices[0].message.content.trim();
              console.log(`[${taskId}] DeepSeek API 返回原始文本:`, rawContent);
              // JSON 清理逻辑 (不变)
              let jsonString = rawContent;
              const firstBraceIndex = rawContent.indexOf('{');
              const lastBraceIndex = rawContent.lastIndexOf('}');
              if (firstBraceIndex !== -1 && lastBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
                  jsonString = rawContent.substring(firstBraceIndex, lastBraceIndex + 1);
              } else { console.warn(`[${taskId}] 在返回文本中找不到有效的 {...} 结构...`); }

              try {
                  adviceObject = JSON.parse(jsonString);
                  if (typeof adviceObject.feeding !== 'string' /* ... */) { throw new Error("解析后的 JSON 格式不符合预期。"); }
                  console.log(`[${taskId}] 成功将响应解析为 JSON 对象:`, adviceObject);
                  success = true;
              } catch (parseError) { /* ... 处理 JSON 解析错误 ... */ errorMessage = '后端无法解析建议格式。'; success = false; adviceObject = { error: errorMessage, rawResponse: rawContent };}
          } else { /* ... 处理无效响应结构 ... */ errorMessage = '从建议服务收到无效响应结构。'; success = false;}
      } catch (apiError) { /* ... 处理 API 调用错误 ... */ errorMessage = `调用建议服务失败 (${apiError.response?.status || '未知错误'})。`; success = false; }

      // --- !!! 修改：将结果【更新】到 Supabase !!! ---
      console.log(`[${taskId}] 准备更新 Supabase 记录...`);
      let updateData; // 要更新的数据
      if (success && adviceObject && !adviceObject.error) {
          // 成功状态
          updateData = {
              status: 'completed',
              advice_data: adviceObject,
              error_message: null // 清除之前的错误信息（如果有的话）
          };
          console.log(`[${taskId}] 更新数据 (成功):`, updateData);
      } else {
          // 失败状态
          updateData = {
              status: 'failed',
              error_message: errorMessage || '未知处理错误',
              advice_data: adviceObject // 也可存包含错误的 adviceObject
          };
          console.error(`[${taskId}] 更新数据 (失败):`, updateData);
      }

      // 执行 Update 操作
      const { data: updatedData, error: dbUpdateError } = await supabase
          .from('generated_advice')    // 表名
          .update(updateData)          // 要更新的数据
          .eq('task_id', taskId)       // !! 条件：只更新 task_id 匹配的行 !!
          .select();                   // (可选) 返回更新后的数据

      if (dbUpdateError) {
          console.error(`[${taskId}] Supabase 更新错误:`, dbUpdateError);
          // 即使更新失败，也告知 Netlify 任务已尝试完成（但有错）
          return { statusCode: 500, body: `Background task finished but DB update failed for ${taskId}` };
      } else {
          console.log(`[${taskId}] 成功更新 Supabase 记录:`, updatedData);
          // 告知 Netlify 任务成功完成
          return { statusCode: 200, body: `Background task succeeded for ${taskId}` };
      }
      // --- Supabase 更新结束 ---

  } catch (error) {
      console.error(`[${taskId || '未知 Task'}] 后台函数顶层错误:`, error);
      // 如果在解析 taskId 或 petData 之前就出错，taskId 可能未定义
      // 尝试更新数据库标记为失败（如果 taskId 已知）
      if (taskId && supabase) {
          try {
              await supabase.from('generated_advice').update({ status: 'failed', error_message: 'Function top-level error' }).eq('task_id', taskId);
          } catch (dbError) {
              console.error(`[${taskId}] 尝试记录顶层错误到 Supabase 时失败:`, dbError);
          }
      }
      return { statusCode: 500, body: JSON.stringify({ error: '内部服务器错误，请求处理失败' }) };
  }
};