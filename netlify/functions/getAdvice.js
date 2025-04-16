// netlify/functions/getAdvice.js

// 1. 导入需要的库
const fs = require('fs');           // Node.js 内置，用于读文件
const path = require('path');       // Node.js 内置，用于处理路径
const Papa = require('papaparse');  // 解析 CSV
const { OpenAI } = require('openai'); // OpenAI 库

// 2. 初始化 OpenAI 客户端
//    从环境变量中读取 API 密钥
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("错误：未设置 OPENAI_API_KEY 环境变量！");
  // 注意：实际部署时，不应在错误信息中暴露过多细节
}
// 只有在 apiKey 存在时才创建实例，避免无效 key 导致错误
const openai = apiKey ? new OpenAI({ apiKey }) : null;

// 函数主处理逻辑
exports.handler = async function(event, context) {
  // --- 检查请求方法 (和之前一样) ---
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '只允许 POST 请求' }) };
  }

  // --- 检查 OpenAI 客户端是否初始化成功 ---
  if (!openai) {
    console.error("OpenAI 客户端未初始化，请检查 API Key 是否已设置。");
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '后端服务配置错误，无法生成建议。' }) };
  }

  try {
    // --- 解析请求体 (和之前一样) ---
    const petData = JSON.parse(event.body);
    console.log('后端收到的数据:', petData);
    const { breed, gender, age, weight } = petData;

    // --- 3. 读取并解析 CSV 文件 ---
    let breedRulesText = "没有找到该品种的特定规则。"; // 默认文本
    try {
      const csvFilePath = path.resolve(__dirname, 'breed_rules.csv');
      const csvFileContent = fs.readFileSync(csvFilePath, 'utf8');
      const parseResult = Papa.parse(csvFileContent, {
        header: true,
        skipEmptyLines: true,
      });

      if (parseResult.errors.length > 0) {
        console.error('CSV 解析错误:', parseResult.errors);
      }

      const relevantRules = parseResult.data.filter(row => row.Breed && row.Breed.toLowerCase() === breed.toLowerCase());

      if (relevantRules.length > 0) {
        breedRulesText = `关于【${breed}】品种的已知护理要点:\n`;
        relevantRules.forEach(rule => {
          breedRulesText += `- ${rule.RuleType || '通用'}: ${rule.RiskDescription || ''} 建议: ${rule.Suggestion || ''}\n`;
        });
        console.log("找到的相关规则文本:", breedRulesText);
      } else {
        console.log(`未在 CSV 中找到品种 "${breed}" 的特定规则。`);
      }

    } catch (fileError) {
      // 如果文件不存在或读取错误，记录错误但继续使用默认规则文本
      console.error(`读取或解析 CSV 文件时出错: ${fileError.message}. 将使用默认规则文本。`);
      // 检查是否是文件不存在错误
      if (fileError.code === 'ENOENT') {
          console.error(`确认 'netlify/functions/breed_rules.csv' 文件是否存在且路径正确。`);
          breedRulesText = "注意：未找到品种规则文件，建议基于通用知识。"; // 可以给一个更明确的提示
      }
    }

    // --- 4. 构建 Prompt ---
    const prompt = `
      你是一个经验丰富的宠物护理助手。请根据以下宠物信息和已知的犬种护理要点，分析这只宠物可能存在的健康风险，并提供具体、实用的护理建议。

      宠物信息:
      - 品种: ${breed}
      - 性别: ${gender === 'male' ? '男生' : '女生'}
      - 年龄: ${age} 岁
      - 体重: ${weight} kg

      已知的【${breed}】护理要点 (若未找到特定规则，则基于通用知识):
      ${breedRulesText}

      请综合分析以上信息，特别是关注体重、关节、以及该品种特有的护理要点（如果规则中有提及）。给出：
      1.  基于当前信息的主要健康风险点分析。
      2.  针对性的、可操作的日常护理建议（饮食、运动、清洁、行为等方面）。
      3.  需要特别留意的观察点或潜在问题迹象。

      请用友好、关心的语气回答，就像在直接与宠物主人对话一样。
    `;
    console.log("构建的 Prompt (部分内容):", prompt.substring(0, 500) + "..."); // 打印部分 Prompt 调试

    // --- 5. 调用 GPT API ---
    let advice = '抱歉，暂时无法获取建议，请稍后再试。'; // 默认建议
    try {
      const chatCompletion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o', 
      });

      if (chatCompletion.choices && chatCompletion.choices.length > 0 && chatCompletion.choices[0].message) {
        advice = chatCompletion.choices[0].message.content.trim();
        console.log("GPT API 返回的建议 (部分内容):", advice.substring(0, 500) + "..."); // 打印部分建议调试
      } else {
        console.error("GPT API 返回了无效的响应:", chatCompletion);
        advice = '抱歉，从建议服务收到无效响应。';
      }

    } catch (apiError) {
      console.error('调用 OpenAI API 时出错:', apiError);
      // 可以根据 apiError.status 等提供更具体的错误信息
      advice = `抱歉，调用建议服务时遇到问题 (${apiError.name || 'API Error'})。请检查后端日志或联系管理员。`;
    }

    // --- 6. 返回最终响应给前端 ---
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({
        message: '建议已生成',
        advice: advice, // 返回 GPT 生成的建议
        // receivedData: petData // 可以选择是否还返回原始数据
      })
    };

  } catch (error) {
    // --- 处理 JSON 解析错误或其他顶层错误 ---
    console.error('处理请求时发生顶层错误:', error);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '请求处理失败，请检查数据或联系管理员' })
    };
  }
};