import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout, Typography, message } from 'antd';
import axios from 'axios';
import PetInfoForm from './components/PetInfoForm';
import AdviceDisplay from './components/AdviceDisplay';

// --- 接口定义 ---
interface AdviceData {
  feeding: string;
  exercise: string;
  vaccination: string;
  risks: string;
  observations: string;
  petInfo: { breed: string; age: number; weight: number; };
}
interface FormData {
    breed: string; gender: string; age: number; weight: number;
}
interface GetResultResponse {
    status: 'processing' | 'completed' | 'failed' | 'nodata';
    advice?: {
        feeding?: string; exercise?: string; vaccination?: string;
        risks?: string; observations?: string; error?: string;
        rawResponse?: string;
    } | null;
    error?: string;
}

// --- 常量 ---
const POLLING_INTERVAL = 5000; // 5 秒
const MAX_POLLING_DURATION = 90000; // 90 秒

// --- App 组件 ---
const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  const [advice, setAdvice] = useState<AdviceData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPetInfo, setCurrentPetInfo] = useState<FormData | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- 清理定时器 ---
  const clearPollingTimers = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log("LOG: 轮询 interval 定时器已清除。");
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
      console.log("LOG: 轮询 timeout 定时器已清除。");
    }
  }, []);

  // --- 轮询函数 ---
  const pollForResult = useCallback(async () => {
    console.log("LOG: --- pollForResult 函数开始执行 ---");
    const petInfo = currentPetInfoRef.current; // 从 Ref 读取最新 petInfo

    if (!petInfo) {
        console.error("LOG: pollForResult 停止: currentPetInfoRef.current is null.");
        clearPollingTimers();
        setLoading(false);
        return;
    }
    console.log("LOG: pollForResult 正在运行，准备调用 /getResult...");

    try {
      const response = await axios.get<GetResultResponse>('/.netlify/functions/getResult');
      const result = response.data;
      console.log("轮询结果:", result);

      if (result.status === 'completed') {
        console.log("获取到 'completed' 状态，停止轮询。");
        clearPollingTimers();

        if (result.advice && !result.advice.error && result.advice.feeding /* Check one key as proxy */) {
           const finalAdviceData: AdviceData = {
                feeding: result.advice.feeding || '', exercise: result.advice.exercise || '',
                vaccination: result.advice.vaccination || '', risks: result.advice.risks || '',
                observations: result.advice.observations || '',
                petInfo: { breed: petInfo.breed, age: petInfo.age, weight: petInfo.weight } // 使用 Ref 中的 petInfo
            };
           console.log("LOG: pollForResult - 即将调用 setAdvice 更新状态:", finalAdviceData);
           setAdvice(finalAdviceData);
           setLoading(false);
           message.success("建议已成功获取！");
        } else {
           console.error("状态为 completed 但建议数据无效:", result.advice);
           setAdvice(null); setLoading(false); message.error(result.advice?.error || "获取到的建议数据格式无效。");
        }
      } else if (result.status === 'failed') {
        console.error("获取到 'failed' 状态，停止轮询。");
        clearPollingTimers(); setLoading(false); setAdvice(null); message.error(result.error || '建议生成失败。');
      } else if (result.status === 'processing' || result.status === 'nodata') {
        console.log(`状态: ${result.status}，继续下一次轮询...`);
      } else { console.warn("收到未知的轮询状态:", result.status); }
    } catch (error) {
      console.error("轮询请求失败:", error);
      clearPollingTimers(); setLoading(false); setAdvice(null); message.error('获取建议结果时出错。');
    }
  }, [clearPollingTimers]); // 移除 currentPetInfo, 只依赖 clearPollingTimers

  // useRef to store petInfo for pollForResult to access latest value
  const currentPetInfoRef = useRef<FormData | null>(null);
  useEffect(() => {
      currentPetInfoRef.current = currentPetInfo;
  }, [currentPetInfo]);

  // --- 触发后台任务并启动轮询 ---
  const handleAdviceGenerated = useCallback((formData: FormData, responseData: any) => {
    console.log("LOG: === App.tsx handleAdviceGenerated function ENTERED ===");
    console.log("表单数据:", formData);

    clearPollingTimers();
    setAdvice(null);
    setCurrentPetInfo(formData); // 更新 state (将触发上面的 useEffect 更新 Ref)
    setLoading(true);
    console.log("LOG: App.tsx - Loading state set to true.");

    // 设置超时
    console.log(`LOG: App.tsx - Setting polling timeout (${MAX_POLLING_DURATION / 1000}s)...`);
    pollingTimeoutRef.current = setTimeout(() => {
      console.error("轮询超时！"); clearPollingTimers(); setLoading(false); setAdvice(null);
      message.error(`获取建议超时（超过 ${MAX_POLLING_DURATION / 1000} 秒）。`);
    }, MAX_POLLING_DURATION);
    console.log("LOG: App.tsx - Timeout timer set, ID:", pollingTimeoutRef.current);

    // 启动轮询 (只设置 Interval)
    console.log(`LOG: App.tsx - Setting polling interval (${POLLING_INTERVAL / 1000}s)...`);
    pollingIntervalRef.current = setInterval(pollForResult, POLLING_INTERVAL);
    console.log("LOG: App.tsx - Interval timer set, ID:", pollingIntervalRef.current);

  }, [clearPollingTimers, pollForResult]); // 依赖项

  // --- 组件卸载时清理定时器 ---
  useEffect(() => {
    return () => { clearPollingTimers(); };
  }, [clearPollingTimers]);

  // --- JSX 渲染 ---
  // 移除了 return (...) 旁边的注释
  return (
    <Layout style={{ minHeight: '100vh' }}>
       <Header style={{ color: '#fff', fontSize: '20px' }}>🐾 宠物健康助手</Header>
       <Content style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
         <Title level={2}>填写宠物信息</Title>
         <PetInfoForm
           onAdviceGenerated={handleAdviceGenerated}
           setLoading={setLoading}
         />
         <AdviceDisplay advice={advice} loading={loading} />
       </Content>
       <Footer style={{ textAlign: 'center' }}>©2025 PetCare Assistant</Footer>
     </Layout>
  );
} // <--- App 函数结束括号

export default App; // <--- 文件导出语句