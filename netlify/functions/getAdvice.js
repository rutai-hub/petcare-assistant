// netlify/functions/getAdvice.js

// 1. 导入需要的库
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const axios = require('axios'); // 使用 axios

// 2. 读取 DeepSeek API 密钥
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
if (!deepseekApiKey) {
  console.error("错误：未设置 DEEPSEEK_API_KEY 环境变量！");
}

// DeepSeek API 端点
const DEEPSEEK_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

// 函数主处理逻辑
exports.handler = async function(event, context) {
  // --- 检查请求方法 ---
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '只允许 POST 请求' }) };
  }

  // --- 检查 DeepSeek API Key 是否设置 ---
  if (!deepseekApiKey) {
    console.error("DeepSeek API Key 未配置。");
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '后端服务配置错误，无法生成建议。' }) };
  }

  try {
    // --- 解析请求体 ---
    const petData = JSON.parse(event.body);
    console.log('后端收到的数据:', petData);
    const { breed, gender, age, weight } = petData;

    // --- 读取并解析 CSV 文件 (逻辑不变) ---
    let breedRulesText = "没有找到该品种的特定规则。";
    try {
      const csvFilePath = path.resolve(__dirname, 'breed_rules.csv');
      const csvFileContent = fs.readFileSync(csvFilePath, 'utf8');
      const parseResult = Papa.parse(csvFileContent, { header: true, skipEmptyLines: true });
      if (parseResult.errors.length > 0) { console.error('CSV 解析错误:', parseResult.errors); }
      const relevantRules = parseResult.data.filter(row => row.Breed && row.Breed.toLowerCase() === breed.toLowerCase());
      if (relevantRules.length > 0) {
        breedRulesText = `关于【${breed}】品种的已知护理要点:\n`;
        relevantRules.forEach(rule => {
          breedRulesText += `- ${rule.RuleType || '通用'}: ${rule.RiskDescription || ''} 建议: ${rule.Suggestion || ''}\n`;
        });
        console.log("找到的相关规则文本:", breedRulesText);
      } else { console.log(`未在 CSV 中找到品种 "${breed}" 的特定规则。`); }
    } catch (fileError) {
      console.error(`读取或解析 CSV 文件时出错: ${fileError.message}. 将使用默认规则文本。`);
      if (fileError.code === 'ENOENT') {
        console.error(`确认 'netlify/functions/breed_rules.csv' 文件是否存在且路径正确。`);
        breedRulesText = "注意：未找到品种规则文件，建议基于通用知识。";
      }
    }

    // --- 4. 构建新的 Prompt (要求返回 JSON) ---
    const prompt = `
      你是一个经验丰富的宠物护理助手。请根据以下宠物信息和已知的犬种护理要点，生成一份护理建议。

      宠物信息:
      - 品种: ${breed}
      - 性别: ${gender === 'male' ? '男生' : '女生'}
      - 年龄: ${age} 岁
      - 体重: ${weight} kg

      已知的【${breed}】护理要点 (若未找到特定规则，则基于通用知识):
      ${breedRulesText}

      请综合分析以上信息，特别是关注体重、关节、以及该品种特有的护理要点。

      *** 重要指令：请将你的回复严格格式化为一个【单一的 JSON 对象字符串】。不要添加任何解释性文字、代码块标记(如 \`\`\`)或者其他任何非 JSON 内容。这个 JSON 对象必须包含以下【五个】键，其值都为字符串：
      1.  "feeding": "关于喂养方面的具体建议文本..."
      2.  "exercise": "关于运动方面的具体建议文本..."
      3.  "vaccination": "关于疫苗或健康检查方面的提醒文本..."
      4.  "risks": "基于宠物信息分析得出的主要健康风险点总结文本..."
      5.  "observations": "需要主人特别留意的观察点或潜在问题迹象的文本..."

      确保输出是一个可以直接被 JSON.parse() 解析的有效 JSON 字符串。例如：
      {"feeding": "建议...", "exercise": "计划...", "vaccination": "提醒...", "risks": "风险...", "observations": "观察..."}
    `;
    // 不再打印完整的长 prompt，避免干扰 JSON 解析
    console.log("已构建请求 JSON 输出的 Prompt。");

    // --- 5. 调用 DeepSeek API ---
    let adviceObject = null; // 用于存储解析后的 JSON 对象或错误信息
    let errorMessage = '抱歉，暂时无法获取建议，请稍后再试。'; // 默认错误消息

    try {
      const model_to_use = 'deepseek-chat'; // 确认模型名称
      console.log(`正在使用模型: ${model_to_use} (通过 DeepSeek API)`);

      const requestBody = {
        model: model_to_use,
        messages: [{ role: 'user', content: prompt }],
        // temperature: 0.7, // 可以按需调整
      };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` };

      console.time('DeepSeek API Call');
      const response = await axios.post(DEEPSEEK_API_ENDPOINT, requestBody, { headers });
      console.timeEnd('DeepSeek API Call');

      if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message) {
        const rawContent = response.data.choices[0].message.content.trim();
        console.log("DeepSeek API 返回的原始文本:", rawContent); // 打印原始文本以供调试

        // --- 尝试将返回的文本解析为 JSON ---
        try {
          adviceObject = JSON.parse(rawContent);
          // 可以加一步验证，确保 adviceObject 包含需要的字段
          if (typeof adviceObject.feeding !== 'string' || typeof adviceObject.exercise !== 'string') {
              console.error("解析后的 JSON 缺少必要的字段。");
              throw new Error("解析后的 JSON 格式不符合预期。"); // 抛出错误以便被外层 catch 捕获
          }
           console.log("成功将响应解析为 JSON 对象:", adviceObject);
        } catch (parseError) {
          console.error("无法将 DeepSeek 返回的内容解析为 JSON:", parseError);
          // 如果解析失败，记录错误，adviceObject 保持为 null 或设置错误状态
           errorMessage = '后端无法解析建议格式，请稍后再试。';
           adviceObject = { error: errorMessage, rawResponse: rawContent }; // 返回错误信息和原始响应
        }
      } else {
        console.error("DeepSeek API 返回了无效或非预期的响应结构:", response.data);
        errorMessage = '从建议服务收到无效响应结构。';
        adviceObject = { error: errorMessage };
      }

    } catch (apiError) {
      console.timeEnd('DeepSeek API Call'); // 确保计时结束
      console.error('调用 DeepSeek API 时出错:', apiError.message);
      if (apiError.response) {
          console.error("错误详情 (Status):", apiError.response.status);
          console.error("错误详情 (Data):", apiError.response.data);
          errorMessage = `调用建议服务失败 (${apiError.response.status})。`;
      } else {
          errorMessage = '调用建议服务时发生网络或未知错误。';
      }
       adviceObject = { error: errorMessage };
    }

    // --- 6. 返回最终响应给前端 ---
    // 现在 adviceObject 可能是包含建议的 JSON 对象，也可能是包含错误信息的对象
    return {
      statusCode: adviceObject && adviceObject.error ? 500 : 200, // 如果解析或调用出错，返回 500
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        // message 可以根据 adviceObject 是否有 error 调整
        message: adviceObject && adviceObject.error ? '生成建议时出错' : '建议已生成 (来自 DeepSeek)',
        // 将解析后的 adviceObject (或错误对象) 整个返回给前端
        advice: adviceObject
      })
    };

  } catch (error) {
    // --- 处理 JSON 解析请求体错误或其他意外顶层错误 ---
    console.error('处理请求时发生顶层错误:', error);
    return {
      statusCode: 500, // 顶层错误也用 500
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '内部服务器错误，请求处理失败' })
    };
  }
};