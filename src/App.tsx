import React, { useState } from 'react';
import { Layout, Typography, message } from 'antd';
import PetInfoForm from './components/PetInfoForm'; // 确认路径正确
import AdviceDisplay from './components/AdviceDisplay'; // 确认路径正确

// 可以把 AdviceData 接口定义移到这里或单独的文件，以便共享
interface AdviceData {
  feeding: string;
  exercise: string;
  vaccination: string;
  risks: string;
  observations: string;
  petInfo: {
    breed: string;
    age: number;
    weight: number;
  };
}

// 定义后端响应数据的结构（可选，但有助于类型提示）
interface BackendResponseData {
    message: string;
    advice: { // advice 字段现在包含结构化建议或错误对象
        feeding?: string;
        exercise?: string;
        vaccination?: string;
        risks?: string;
        observations?: string;
        error?: string; // 可能包含错误信息
        rawResponse?: string; // 可能包含原始响应（如果解析失败）
    } | null;
}

// 定义表单数据的结构（可选，但有助于类型提示）
interface FormData {
    breed: string;
    gender: string;
    age: number;
    weight: number;
}


const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  // 修改 state 类型，明确它存储的是 AdviceData 或 null
  const [advice, setAdvice] = useState<AdviceData | null>(null);
  const [loading, setLoading] = useState(false);

  // 修改 handleAdviceGenerated 函数以接收两个参数
  const handleAdviceGenerated = (formData: FormData, responseData: BackendResponseData) => {
    console.log("App 组件收到表单数据:", formData);
    console.log("App 组件收到后端响应:", responseData);

    // 检查 responseData 和 responseData.advice 是否有效，并检查 error 字段
    if (responseData && responseData.advice && !responseData.advice.error) {
      const structuredAdvice = responseData.advice;

      // 检查 AI 返回的核心字段是否存在 (更健壮的处理)
      if (structuredAdvice.feeding && structuredAdvice.exercise && structuredAdvice.vaccination && structuredAdvice.risks && structuredAdvice.observations) {

        // 从 formData 构建 petInfo
        const petInfoForDisplay = {
          breed: formData.breed,
          age: formData.age,
          weight: formData.weight,
        };

        // 组合成最终传递给 AdviceDisplay 的数据结构
        const finalAdviceData: AdviceData = {
          feeding: structuredAdvice.feeding,
          exercise: structuredAdvice.exercise,
          vaccination: structuredAdvice.vaccination,
          risks: structuredAdvice.risks,
          observations: structuredAdvice.observations,
          petInfo: petInfoForDisplay,
        };

        setAdvice(finalAdviceData); // 使用组合好的数据更新状态

      } else {
         // 如果 AI 返回的 JSON 缺少了我们要求的字段
         console.error("后端返回的建议数据缺少必要字段:", structuredAdvice);
         setAdvice(null);
         message.error('收到的建议数据不完整，请稍后再试。');
      }

    } else {
      // 如果后端返回错误或无效数据
      console.error("从后端接收到错误或无效的建议数据:", responseData?.advice);
      setAdvice(null); // 清空显示
      message.error(responseData?.advice?.error || '无法获取有效建议，请稍后再试。');
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: '20px' }}>🐾 宠物健康助手</Header>
      <Content style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        <Title level={2}>填写宠物信息</Title>
        {/* onAdviceGenerated 传递的仍然是 handleAdviceGenerated 函数 */}
        <PetInfoForm
          onAdviceGenerated={handleAdviceGenerated}
          setLoading={setLoading}
        />
        {/* advice 传递的是我们组合好的 advice 状态 */}
        <AdviceDisplay advice={advice} loading={loading} />
      </Content>
      <Footer style={{ textAlign: 'center' }}>©2025 PetCare Assistant</Footer>
    </Layout>
  );
}

export default App;