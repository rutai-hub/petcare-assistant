// netlify/functions/getResult.js

const { createClient } = require('@supabase/supabase-js');

// 读取 Supabase 环境变量
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 检查环境变量
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("错误：getResult 函数缺少 Supabase 环境变量");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

exports.handler = async function(event, context) {
  if (!supabase) { return { statusCode: 500, body: JSON.stringify({ error: 'Supabase 未配置' }) }; }
  if (event.httpMethod !== 'GET') { return { statusCode: 405, body: JSON.stringify({ error: '只允许 GET 请求' }) }; }

  // 获取 taskId 参数
  const taskId = event.queryStringParameters?.taskId;
  if (!taskId) { return { statusCode: 400, body: JSON.stringify({ error: '缺少 taskId 参数' }) }; }

  console.log(`getResult 函数被调用，查询 Task ID: ${taskId}`);

  try {
    // 根据 taskId 查询 Supabase
    const { data: taskResult, error: dbError } = await supabase
      .from('generated_advice')
      .select('status, advice_data, error_message') // 只选需要的列
      .eq('task_id', taskId) // 精确查询
      .single(); // 期望返回单行

    // 处理查询错误或未找到记录
    if (dbError) {
      if (dbError.code === 'PGRST116') { // 未找到行
        console.log(`[${taskId}] 在数据库中未找到，返回 processing`);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 'processing' }) };
      } else {
        console.error(`[${taskId}] Supabase 查询错误:`, dbError);
        return { statusCode: 500, body: JSON.stringify({ error: '查询结果时出错 (DB)' }) };
      }
    }

    // 如果查询成功 (taskResult 非 null)
    if (taskResult) {
      console.log(`[${taskId}] 查询到的记录状态:`, taskResult.status);
      let responseBody;
      if (taskResult.status === 'completed') {
        responseBody = { status: 'completed', advice: taskResult.advice_data };
      } else if (taskResult.status === 'failed') {
        responseBody = { status: 'failed', error: taskResult.error_message || '建议生成失败' };
      } else { // processing 或其他状态
        responseBody = { status: 'processing' };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(responseBody) };
    } else {
       // 理论上 .single() 找不到时会返回 error，这里作为保险
       console.log(`[${taskId}] 查询返回 null 数据，返回 processing`);
       return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 'processing' }) };
    }

  } catch (error) {
    console.error(`[${taskId}] getResult 函数意外错误:`, error);
    return { statusCode: 500, body: JSON.stringify({ error: '查询建议时发生内部错误' }) };
  }
};