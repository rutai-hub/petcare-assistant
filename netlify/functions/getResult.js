// netlify/functions/getResult.js

const { createClient } = require('@supabase/supabase-js');

// 读取 Supabase 环境变量 (不变)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// 检查环境变量 (不变)
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("错误：getResult 函数缺少 Supabase 环境变量");
}
const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

exports.handler = async function(event, context) {
  // 0. 检查 Supabase 客户端
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase 未配置' }) };
  }

  // 1. 确认是 GET 请求
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: '只允许 GET 请求' }) };
  }

  // --- !!! 修改：获取 taskId 参数 !!! ---
  // Netlify 将 URL 查询参数放在 event.queryStringParameters 对象中
  const taskId = event.queryStringParameters?.taskId; // 使用可选链 ?.

  // 检查 taskId 是否存在
  if (!taskId) {
    console.log("请求中缺少 taskId 参数");
    return { statusCode: 400, body: JSON.stringify({ error: '缺少 taskId 参数' }) };
  }
  console.log(`getResult 函数被调用，查询 Task ID: ${taskId}`);
  // -------------------------------------

  try {
    // --- !!! 修改：根据 taskId 查询 Supabase !!! ---
    // 只选择我们需要的列，使用 eq 过滤 taskId，并期望只返回一行 (使用 single())
    const { data: taskResult, error: dbError } = await supabase
      .from('generated_advice')          // 表名
      .select('status, advice_data, error_message') // 选择需要的列
      .eq('task_id', taskId)             // !! 条件：task_id 等于传入的 taskId !!
      .single();                        // !! 期望返回单行结果 (找不到或多于一行会报错) !!

    // 3. 处理查询错误或未找到记录
    if (dbError) {
      // 检查是否是“未找到行”的特定错误 (PostgREST code PGRST116)
      if (dbError.code === 'PGRST116') {
        console.log(`Task ID ${taskId} 在数据库中未找到，可能仍在处理中...`);
        // 返回 processing 状态，让前端继续轮询
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ status: 'processing' }) // 或 'nodata'
        };
      } else {
        // 其他数据库查询错误
        console.error(`Supabase 查询错误 for Task ID ${taskId}:`, dbError);
        return { statusCode: 500, body: JSON.stringify({ error: `查询建议结果时出错 (DB)` }) };
      }
    }

    // 4. 如果查询成功 (data 非 null)
    if (taskResult) {
      console.log(`[${taskId}] 查询到的记录状态:`, taskResult.status);

      if (taskResult.status === 'completed') {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            status: 'completed',
            advice: taskResult.advice_data // 返回 advice_data 列的内容
          })
        };
      } else if (taskResult.status === 'failed') {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            status: 'failed',
            error: taskResult.error_message || '建议生成失败 (未知原因)'
          })
        };
      } else {
        // 如果状态是 'processing' 或其他未完成状态
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ status: 'processing' }) // 让前端继续轮询
        };
      }
    } else {
       // 理论上 .single() 在找不到时会返回 error，但加个保险
       console.log(`Task ID ${taskId} 查询返回 null 数据，可能仍在处理中...`);
       return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ status: 'processing' })
       };
    }
    // --- 查询逻辑结束 ---

  } catch (error) {
    console.error(`getResult 函数执行时发生意外错误 (Task ID: ${taskId}):`, error);
    return { statusCode: 500, body: JSON.stringify({ error: '查询建议时发生内部错误' }) };
  }
};