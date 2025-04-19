import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout, Typography, message } from 'antd';
import axios from 'axios';
import PetInfoForm from './components/PetInfoForm';
import AdviceDisplay from './components/AdviceDisplay';

// --- 接口定义 ---
interface AdviceData {
  feeding: string; exercise: string; vaccination: string;
  risks: string; observations: string;
  petInfo: { breed: string; age: number; weight: number; };
}
interface FormData {
    breed: string; gender: string; age: number; weight: number;
}
interface GetResultResponse {
    status: 'processing' | 'completed' | 'failed' | 'nodata';
    advice?: { /* AI 返回的结构化建议 */ } | null;
    error?: string;
}
interface StartAdviceResponse {
    taskId?: string; error?: string;
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
  // 使用 Ref 来存储需要在回调中稳定访问的值
  const currentTaskIdRef = useRef<string | null>(null);
  const currentPetInfoRef = useRef<FormData | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- 清理定时器 ---
  const clearPollingTimers = useCallback(() => {
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; console.log("LOG: 轮询 interval 定时器已清除。");}
    if (pollingTimeoutRef.current) { clearTimeout(pollingTimeoutRef.current); pollingTimeoutRef.current = null; console.log("LOG: 轮询 timeout 定时器已清除。");}
  }, []);

  // --- 轮询函数 ---
  const pollForResult = useCallback(async () => {
    const taskId = currentTaskIdRef.current;
    const petInfo = currentPetInfoRef.current; // 读取 Ref 中的 petInfo
    console.log(`LOG: --- pollForResult 函数开始执行 (Task ID: ${taskId}) ---`);

    if (!petInfo || !taskId) {
        console.error("LOG: pollForResult 停止: taskId 或 petInfo 不存在。", { taskId, petInfo });
        clearPollingTimers(); setLoading(false); return;
    }
    console.log(`LOG: pollForResult 正在运行 (Task ID: ${taskId})，准备调用 /getResult...`);

    try {
      const response = await axios.get<GetResultResponse>(`/.netlify/functions/getResult?taskId=${taskId}`);
      const result = response.data;
      console.log("轮询结果:", result);

      if (result.status === 'completed') {
        console.log(`[${taskId}] 获取到 'completed' 状态，停止轮询。`);
        clearPollingTimers();
        if (result.advice && !result.advice.error && result.advice.feeding /*...*/ ) {
           const finalAdviceData: AdviceData = {
                feeding: result.advice.feeding || '', exercise: result.advice.exercise || '',
                vaccination: result.advice.vaccination || '', risks: result.advice.risks || '',
                observations: result.advice.observations || '',
                petInfo: { breed: petInfo.breed, age: petInfo.age, weight: petInfo.weight }
            };
           console.log(`[${taskId}] LOG: 即将调用 setAdvice 更新状态:`, finalAdviceData);
           setAdvice(finalAdviceData); setLoading(false); message.success("建议已成功获取！");
        } else { console.error(`[${taskId}] 状态为 completed 但建议数据无效:`, result.advice); setAdvice(null); setLoading(false); message.error(result.advice?.error || "获取到的建议数据格式无效。");}
      } else if (result.status === 'failed') {
        console.error(`[${taskId}] 获取到 'failed' 状态，停止轮询。`);
        clearPollingTimers(); setLoading(false); setAdvice(null); message.error(result.error || '建议生成失败。');
      } else if (result.status === 'processing' || result.status === 'nodata') {
        console.log(`[${taskId}] 状态: ${result.status}，继续下一次轮询...`);
      } else { console.warn(`[${taskId}] 收到未知的轮询状态:`, result.status); }
    } catch (error) {
      console.error(`[${taskId}] 轮询请求失败:`, error);
      clearPollingTimers(); setLoading(false); setAdvice(null); message.error('获取建议结果时出错。');
    }
  }, [clearPollingTimers]); // pollForResult 只依赖 clearPollingTimers

  // --- 表单提交处理函数 ---
  const handleFormSubmit = useCallback(async (formData: FormData) => {
    console.log("LOG: === App.tsx handleFormSubmit function ENTERED ===");
    console.log("表单数据:", formData);

    clearPollingTimers();
    setAdvice(null);
    currentPetInfoRef.current = formData; // 直接更新 Ref
    setLoading(true);
    currentTaskIdRef.current = null; // 清空旧 Task ID Ref

    try {
      console.log("LOG: App.tsx - 调用 /startAdviceGeneration...");
      const response = await axios.post<StartAdviceResponse>('/.netlify/functions/startAdviceGeneration', formData);

      if (response.data && response.data.taskId) {
          const taskId = response.data.taskId;
          currentTaskIdRef.current = taskId; // 保存 Task ID 到 Ref
          console.log(`LOG: App.tsx - 收到 Task ID: ${taskId}，准备启动轮询...`);

          // 设置超时
          pollingTimeoutRef.current = setTimeout(() => { /* ... 超时处理 ... */ }, MAX_POLLING_DURATION);
          console.log("LOG: App.tsx - Timeout timer set, ID:", pollingTimeoutRef.current);

          // 启动轮询 (第一次将在 INTERVAL 后执行)
          pollingIntervalRef.current = setInterval(pollForResult, POLLING_INTERVAL);
          console.log("LOG: App.tsx - Interval timer set, ID:", pollingIntervalRef.current);

          message.info("建议请求已提交，正在后台生成...");

      } else {
          console.error("调用 startAdviceGeneration 未收到有效的 Task ID:", response.data);
          setLoading(false); currentPetInfoRef.current = null; message.error(response.data?.error || "启动任务失败。");
      }
    } catch (error) {
      console.error("调用 startAdviceGeneration 失败:", error);
      setLoading(false); currentPetInfoRef.current = null; message.error("提交请求失败。");
    }
  }, [clearPollingTimers, pollForResult]); // 依赖项

  // --- 组件卸载时清理 ---
  useEffect(() => { return () => { clearPollingTimers(); }; }, [clearPollingTimers]);

  // --- JSX 渲染 ---
  return (
    <Layout style={{ minHeight: '100vh' }}>
       <Header style={{ color: '#fff', fontSize: '20px' }}>🐾 宠物健康助手</Header>
       <Content style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
         <Title level={2}>填写宠物信息</Title>
         {/* 将 handleFormSubmit 作为 onSubmit prop 传递 */}
         <PetInfoForm onSubmit={handleFormSubmit} loading={loading} />
         <AdviceDisplay advice={advice} loading={loading} />
       </Content>
       <Footer style={{ textAlign: 'center' }}>©2025 PetCare Assistant</Footer>
     </Layout>
  );
}

export default App;