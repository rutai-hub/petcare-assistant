// netlify/functions/getResult.js

const { createClient } = require('@supabase/supabase-js');

// 读取 Supabase 环境变量 (与 getAdvice-background.js 相同)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 检查环境变量
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("错误：getResult 函数缺少 Supabase 环境变量");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

exports.handler = async function(event, context) {
  // 0. 检查 Supabase 客户端是否配置好
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase 未配置' }) };
  }

  // 1. 这个函数通常用 GET 请求
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: '只允许 GET 请求' }) };
  }

  // ---------------------------------------------------------------
  // !!! 重要简化：当前实现是获取【最新一条】完成或失败的记录 !!!
  // !!! 这在多个用户同时使用时会有问题 !!!
  // !!! 真实的实现需要传递一个任务 ID 或用户 ID 来精确查询 !!!
  // 我们暂时先用这个简化版来搭建轮询流程。
  // ---------------------------------------------------------------

  console.log("getResult 函数被调用");

  try {
    // 2. 查询 Supabase 数据库 'generated_advice' 表
    //    按创建时间降序排列，只取最新的一条记录
    const { data, error } = await supabase
      .from('generated_advice') // 你的表名
      .select('*') // 选择所有列
      .order('created_at', { ascending: false }) // 按创建时间倒序
      .limit(1); // 只取一条

    // 3. 处理查询错误
    if (error) {
      console.error('Supabase 查询错误:', error);
      return { statusCode: 500, body: JSON.stringify({ error: '查询建议结果时出错' }) };
    }

    // 4. 分析查询结果并返回给前端
    if (data && data.length > 0) {
      const latestResult = data[0];
      console.log("查询到的最新记录状态:", latestResult.status);

      if (latestResult.status === 'completed') {
        // 如果最新记录是完成状态，返回成功状态和建议数据
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            status: 'completed',
            advice: latestResult.advice_data // 返回存储在 jsonb 列中的建议对象
          })
        };
      } else if (latestResult.status === 'failed') {
        // 如果最新记录是失败状态，返回失败状态和错误信息
        return {
          statusCode: 200, // 请求本身是成功的，只是业务逻辑失败
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            status: 'failed',
            error: latestResult.error_message || '建议生成失败'
          })
        };
      } else {
        // 如果最新记录状态是 processing 或其他状态，告知前端仍在处理中
        return {
          statusCode: 200, // 请求成功，但任务未完成
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ status: 'processing' })
        };
      }
    } else {
      // 如果数据库里一条记录都没有
      console.log("数据库中没有找到任何建议记录。");
      return {
        statusCode: 200, // 请求成功，但无数据
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ status: 'nodata' }) // 或 'processing'
      };
    }

  } catch (error) {
    console.error('getResult 函数执行时发生意外错误:', error);
    return { statusCode: 500, body: JSON.stringify({ error: '查询建议时发生内部错误' }) };
  }
};