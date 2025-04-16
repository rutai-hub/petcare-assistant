// netlify/functions/getAdvice.js

exports.handler = async function(event, context) {
  // 1. 检查是不是 POST 请求
  //    你的前端代码使用了 axios.post，所以这里应该接收 POST 请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405, // 405 Method Not Allowed (方法不被允许)
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '该接口只接受 POST 请求' })
    };
  }

  try {
    // 2. 解析请求体 (request body) 中的 JSON 数据
    //    前端发送的 JSON 字符串在 event.body 中，需要将其转换回 JavaScript 对象
    const petData = JSON.parse(event.body);

    // 3. 在后端控制台打印接收到的数据 (方便调试)
    //    这个日志会显示在你运行 `netlify dev` 的那个终端窗口里
    console.log('后端函数收到的数据:', petData);

    // 4. 从数据中提取具体信息 (现在先存起来，后面会用到)
    //    这里的变量名应该和你前端发送的对象的键 (key) 一致
    const { breed, gender, age, weight } = petData;

    // --- 这里是未来添加核心逻辑的地方 ---
    // - 读取你的 CSV 文件获取犬种规则
    // - 根据 breed, gender, age, weight 和规则进行判断
    // - 调用 GPT API 获取智能建议
    // - 构造最终的建议内容
    // -----------------------------------

    // 5. 构造一个成功的响应返回给前端
    //    为了确认数据已收到，我们把收到的数据也一起发回给前端
    return {
      statusCode: 200, // 200 OK (成功)
      headers: {
        'Content-Type': 'application/json',
        // 添加 CORS 头允许来自任何源的请求 (开发时常用, 生产环境建议指定前端域名)
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        message: '后端已成功接收到你的宠物信息！', // 修改了返回的消息
        receivedData: petData // 把收到的数据原样返回，方便前端检查
      })
    };

  } catch (error) {
    // 6. 如果 JSON 解析失败或发生其他错误
    console.error('处理请求时发生错误:', error);
    return {
      statusCode: 400, // 400 Bad Request (通常指客户端请求有问题，比如 JSON 格式不对)
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '请求数据格式错误或处理失败' })
    };
  }
};