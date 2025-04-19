// netlify/functions/startAdviceGeneration.js

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const axios = require('axios');

// 读取环境变量
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const siteUrl = process.env.URL || ''; // Netlify 注入的站点 URL，用于调用后台函数

// 检查环境变量
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("错误：startAdviceGeneration 函数缺少 Supabase 环境变量");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

exports.handler = async function(event, context) {
  // 1. 只处理 POST 请求
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: '只允许 POST 请求' }) };
  }

  // 2. 检查 Supabase 客户端
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase 未配置' }) };
  }

  let petData;
  try {
    // 3. 解析前端传来的宠物数据
    petData = JSON.parse(event.body);
    console.log('startAdviceGeneration 收到数据:', petData);

    // 4. TODO: 在这里添加输入验证逻辑
    if (!petData || typeof petData.breed !== 'string' || typeof petData.age !== 'number' /*...*/) {
        throw new Error("请求数据无效");
    }

  } catch (error) {
    console.error('解析请求体失败或数据无效:', error);
    return { statusCode: 400, body: JSON.stringify({ error: `请求体 JSON 格式错误或数据无效: ${error.message}` }) };
  }

  // 5. 生成唯一的任务 ID
  const taskId = crypto.randomUUID();
  console.log(`生成的 Task ID: ${taskId}`);

  try {
    // 6. 在 Supabase 中创建初始记录，状态为 'processing'
    console.log(`[${taskId}] 向 Supabase 插入初始记录...`);
    const initialData = {
      task_id: taskId,
      status: 'processing',
      pet_breed: petData.breed,
      pet_age: petData.age,
      pet_weight: petData.weight,
      pet_gender: petData.gender,
    };
    const { error: dbInsertError } = await supabase
      .from('generated_advice') // 你的表名
      .insert([initialData]);

    if (dbInsertError) {
      console.error(`[${taskId}] Supabase 插入初始记录错误:`, dbInsertError);
      throw new Error('无法创建建议任务记录');
    }
    console.log(`[${taskId}] 初始记录已插入 Supabase`);

    // 7. 异步触发后台函数 getAdvice-background
    // 使用 Netlify 提供的站点 URL 环境变量 process.env.URL
    if (!siteUrl) {
        console.error("错误：无法获取站点 URL (process.env.URL)，无法触发后台函数。请确保在 Netlify 构建设置中定义了 URL 环境变量。");
         // 即使触发失败，也需要尝试更新数据库状态
         await supabase.from('generated_advice').update({ status: 'failed', error_message: '无法触发后台函数' }).eq('task_id', taskId);
         throw new Error('无法触发后台函数');
    }
    const functionUrl = `${siteUrl}/.netlify/functions/getAdvice-background`;
    const backgroundPayload = {
      taskId: taskId,
      petData: petData
    };

    console.log(`[${taskId}] 准备异步调用后台函数: ${functionUrl}`);
    // 发起请求，但不等待完成
    axios.post(functionUrl, backgroundPayload)
      .then(res => console.log(`[${taskId}] 后台函数触发调用返回状态: ${res.status}`))
      .catch(err => {
          console.error(`[${taskId}] 调用后台函数 ${functionUrl} 出错:`, err.message);
          // 尝试更新数据库状态为失败
          supabase.from('generated_advice').update({ status: 'failed', error_message: `无法调用后台处理函数: ${err.message}` }).eq('task_id', taskId)
            .then(({ error: updateError }) => {
                if (updateError) console.error(`[${taskId}] 更新后台调用失败状态时出错:`, updateError);
            });
      });

    // 8. 立即返回 Task ID 给前端
    console.log(`[${taskId}] 立即向前端返回 Task ID`);
    return {
      statusCode: 200, // 返回 200 OK
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ taskId: taskId }) // 返回 Task ID
    };

  } catch (error) {
    console.error(`[${taskId || '未知 Task'}] startAdviceGeneration 处理时发生错误:`, error);
    // 如果 taskId 已生成，尝试更新状态为 failed
    if (taskId && supabase) {
        try { await supabase.from('generated_advice').update({ status: 'failed', error_message: `任务启动失败: ${error.message}` }).eq('task_id', taskId); }
        catch (dbError) { console.error(`[${taskId}] 尝试记录顶层错误到 Supabase 时失败:`, dbError); }
    }
    return { statusCode: 500, body: JSON.stringify({ error: `处理请求时发生内部错误: ${error.message}` }) };
  }
};