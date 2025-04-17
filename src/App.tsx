import React, { useState, useEffect, useRef, useCallback } from 'react'; // 导入 useEffect, useRef, useCallback
import { Layout, Typography, message } from 'antd';
import axios from 'axios'; // 需要 axios 来调用 getResult
import PetInfoForm from './components/PetInfoForm';
import AdviceDisplay from './components/AdviceDisplay';

// AdviceData, BackendResponseData, FormData 接口定义 (保持不变或根据需要调整)
interface AdviceData { /* ... (和 AdviceDisplay 中定义一致) ... */
  feeding: string;
  exercise: string;
  vaccination: string;
  risks: string;
  observations: string;
  petInfo: { breed: string; age: number; weight: number; };
}
interface BackendResponseData { /* ... (用于 getAdvice-background 响应) ... */
    message?: string; advice?: any; error?: string; // advice 现在是 any，因为 handle 只关心触发
}
interface FormData { /* ... (表单数据结构) ... */
    breed: string; gender: string; age: number; weight: number;
}
interface GetResultResponse { // 定义 getResult 函数的响应结构
    status: 'processing' | 'completed' | 'failed' | 'nodata';
    advice?: AdviceData | { error?: string }; // advice 只在 completed 时包含有效数据结构
    error?: string;
}


const { Header, Content, Footer } = Layout;
const { Title } = Typography;

// 轮询设置
const POLLING_INTERVAL = 5000; // 每 5 秒查询一次结果 (单位：毫秒)
const MAX_POLLING_DURATION = 90000; // 最长轮询时间 90 秒 (单位：毫秒)

function App() {
  const [advice, setAdvice] = useState<AdviceData | null>(null);
  const [loading, setLoading] = useState(false); // loading 现在表示“正在获取建议”的整个过程
  const [currentPetInfo, setCurrentPetInfo] = useState<FormData | null>(null); // 存储当前提交的宠物信息

  // 使用 useRef 来存储定时器的 ID，避免因组件重渲染导致 ID 丢失
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- 清理定时器的函数 ---
  const clearPollingTimers = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log("轮询定时器已清除。");
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
      console.log("轮询超时定时器已清除。");
    }
  }, []); // useCallback 避免不必要的函数重建

  // --- 轮询函数：调用 getResult API ---
  const pollForResult = useCallback(async () => {
    console.log("正在轮询获取结果...");
    try {
      // !!! 注意：真实的实现需要传递 Task ID 或 User ID 给 getResult !!!
      // !!! 我们暂时调用不带参数的版本，获取最新记录 !!!
      const response = await axios.get<GetResultResponse>('/.netlify/functions/getResult');
      const result = response.data;
      console.log("轮询结果:", result);

      if (result.status === 'completed') {
        console.log("获取到 'completed' 状态，停止轮询。");
        clearPollingTimers(); // 清除定时器
        setLoading(false); // 停止加载

        // 组合数据并更新状态
        if (result.advice && !result.advice.error && currentPetInfo) {
           const finalAdviceData: AdviceData = {
                // 断言 result.advice 此时不是错误对象 (或者进一步检查)
                ...(result.advice as Omit<AdviceData, 'petInfo'>), // Omit 用于类型提示，确保 petInfo 被覆盖
                petInfo: {
                    breed: currentPetInfo.breed,
                    age: currentPetInfo.age,
                    weight: currentPetInfo.weight,
                }
            };
           setAdvice(finalAdviceData);
           message.success("建议已成功生成！");
        } else {
            // 如果 completed 但数据不对
            console.error("状态为 completed 但建议数据无效:", result.advice);
            setAdvice(null);
            message.error("获取到的建议数据格式有误。");
        }

      } else if (result.status === 'failed') {
        console.error("获取到 'failed' 状态，停止轮询。");
        clearPollingTimers();
        setLoading(false);
        setAdvice(null);
        message.error(result.error || '建议生成失败，请稍后再试。');

      } else if (result.status === 'processing' || result.status === 'nodata') {
        // 继续轮询，什么都不做，等待下一次 setInterval 触发
        console.log("状态为 processing 或 nodata，继续轮询...");
      }
    } catch (error) {
      console.error("轮询请求失败:", error);
      clearPollingTimers(); // 出错也要停止轮询
      setLoading(false);
      setAdvice(null);
      message.error('获取建议结果时出错，请稍后再试。');
    }
  }, [clearPollingTimers, currentPetInfo]); // 依赖项

  // --- 修改 handleAdviceGenerated：触发后台任务并启动轮询 ---
  const handleAdviceGenerated = useCallback((formData: FormData, responseData: BackendResponseData) => { // 接收 formData
    console.log("App 组件收到 PetInfoForm 回调:", { formData, responseData });

    // 清理可能存在的上一次轮询
    clearPollingTimers();
    setAdvice(null); // 清空旧建议

    // 存储当前提交的宠物信息，以便后续组合
    setCurrentPetInfo(formData);

    // 开始显示加载状态（表示正在处理）
    setLoading(true);

    // 设置轮询超时
    pollingTimeoutRef.current = setTimeout(() => {
      console.error("轮询超时！");
      clearPollingTimers(); // 清除轮询定时器
      setLoading(false);
      setAdvice(null);
      message.error('获取建议超时，请稍后再试或联系支持。');
    }, MAX_POLLING_DURATION);

    // 立即执行一次轮询，然后设置定时器
    pollForResult(); // 立即尝试获取一次
    pollingIntervalRef.current = setInterval(pollForResult, POLLING_INTERVAL);

  }, [clearPollingTimers, pollForResult]); // 依赖项

  // --- 使用 useEffect 清理副作用 ---
  useEffect(() => {
    // 组件卸载时确保清除所有定时器
    return () => {
      clearPollingTimers();
    };
  }, [clearPollingTimers]); // 依赖项

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: '20px' }}>🐾 宠物健康助手</Header>
      <Content style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        <Title level={2}>填写宠物信息</Title>
        <PetInfoForm
          // 确保传递的是更新后的 handleAdviceGenerated
          onAdviceGenerated={handleAdviceGenerated}
          setLoading={setLoading} // setLoading 仍然传递，但 App 现在是主要控制者
        />
        {/* loading 状态现在反映整个后台处理+轮询过程 */}
        <AdviceDisplay advice={advice} loading={loading} />
      </Content>
      <Footer style={{ textAlign: 'center' }}>©2025 PetCare Assistant</Footer>
    </Layout>
  );
}

export default App;