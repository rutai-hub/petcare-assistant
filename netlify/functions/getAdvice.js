// netlify/functions/getAdvice.js

exports.handler = async function(event, context) {
    // event 对象包含了请求的所有信息 (比如用户发送的数据)
    // context 对象包含了一些关于运行环境的信息
  
    console.log("函数被调用了！"); // 这条日志会显示在 Netlify 的函数日志里
  
    // 返回给前端的响应
    return {
      statusCode: 200, // 200 表示成功
      headers: {
        'Content-Type': 'application/json', // 告诉浏览器返回的是 JSON 格式
      },
      body: JSON.stringify({ // 返回的内容必须是字符串
        message: "你好，这里是 PetCare 后端！" // 我们要返回的简单消息
      })
    };
  };