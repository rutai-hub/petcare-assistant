// netlify/functions/startAdviceGeneration.js

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto'); // Node.js 内置库，用于生成 UUID
const axios = require('axios');   // 用于异步触发后台函数

// 读取环境变量
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

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

    // 4. TODO: 在这里添加输入验证逻辑，确保 petData 包含所需字段且格式正确

  } catch (error) {
    console.error('解析请求体失败:', error);
    return { statusCode: 400, body: JSON.stringify({ error: '请求体 JSON 格式错误' }) };
  }

  // 5. 生成唯一的任务 ID
  const taskId = crypto.randomUUID();
  console.log(`生成的 Task ID: ${taskId}`);

  try {
    // 6. 在 Supabase 中创建初始记录，状态为 'processing'
    console.log('向 Supabase 插入初始记录...');
    const initialData = {
      task_id: taskId, // <--- 存储 Task ID
      status: 'processing',
      pet_breed: petData.breed,
      pet_age: petData.age,
      pet_weight: petData.weight,
      pet_gender: petData.gender,
      // advice_data 和 error_message 初始为 null
    };
    const { error: dbInsertError } = await supabase
      .from('generated_advice') // 你的表名
      .insert([initialData]);

    if (dbInsertError) {
      console.error('Supabase 插入初始记录错误:', dbInsertError);
      throw new Error('无法创建建议任务记录'); // 抛出错误以便被外层 catch 捕获
    }
    console.log(`Task ID ${taskId} 的初始记录已插入 Supabase`);

    // 7. 异步触发后台函数 getAdvice-background
    //    我们构造一个指向后台函数的 URL
    //    注意: context.awsRequestId 和 event.headers['x-nf-client-connection-ip'] 在本地 dev 可能没有
    //    需要从 Netlify 的 context 中获取当前站点的 URL
    //    一个简单但不完美的方法是假设函数路径
    //    更健壮的方法是用环境变量存站点 URL: process.env.URL
    const functionUrl = `${process.env.URL || event.headers.host}/.netlify/functions/getAdvice-background`;
    const backgroundPayload = {
      taskId: taskId, // 将 taskId 传递给后台函数
      petData: petData  // 将 petData 传递给后台函数
    };

    console.log(`准备异步调用后台函数: ${functionUrl}`);
    // 发起 POST 请求，但【不等待】它的完成 (fire and forget)
    // 注意：直接这样调用可能在 serverless 环境中有时不可靠，
    // Netlify 可能有更推荐的函数间调用方式，但这作为起点是可行的。
    axios.post(functionUrl, backgroundPayload)
      .then(res => console.log(`后台函数触发调用返回状态: ${res.status}`))
      .catch(err => console.error(`调用后台函数 ${functionUrl} 出错:`, err.message)); // 只记录错误，不阻塞

    // 8. 立即返回 Task ID 给前端
    console.log(`立即向前端返回 Task ID: ${taskId}`);
    return {
      statusCode: 200, // 返回 200 OK 表示任务已接收并开始处理
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ taskId: taskId }) // 返回 Task ID
    };

  } catch (error) {
    console.error('startAdviceGeneration 处理时发生错误:', error);
    // 可以在这里尝试向 Supabase 更新任务状态为 failed
    return { statusCode: 500, body: JSON.stringify({ error: `处理请求时发生内部错误: ${error.message}` }) };
  }
};