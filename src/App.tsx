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
interface StartAdviceResponse { // startAdviceGeneration 返回的接口
    taskId?: string; error?: string;
}

// --- 常量 ---
const POLLING_INTERVAL = 5000;
const MAX_POLLING_DURATION = 90000;

// --- App 组件 ---
const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  const [advice, setAdvice] = useState<AdviceData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  // currentPetInfo 和 currentTaskId 现在只在轮询成功后或处理函数内部使用，可以不单独存 state
  // 但为了组合最终数据，currentPetInfo 还是需要存一下
  const [currentPetInfo, setCurrentPetInfo] = useState<FormData | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 使用 Ref 存储 taskId 和 petInfo 供轮询函数稳定访问
  const currentTaskIdRef = useRef<string | null>(null);
  const currentPetInfoRef = useRef<FormData | null>(null);

  // --- 清理定时器 ---
  const clearPollingTimers = useCallback(() => {
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; console.log("LOG: 轮询 interval 定时器已清除。");}
    if (pollingTimeoutRef.current) { clearTimeout(pollingTimeoutRef.current); pollingTimeoutRef.current = null; console.log("LOG: 轮询 timeout 定时器已清除。");}
  }, []);

  // --- 轮询函数 ---
  const pollForResult = useCallback(async () => {
    const taskId = currentTaskIdRef.current; // 从 Ref 读取 taskId
    const petInfo = currentPetInfoRef.current; // 从 Ref 读取 petInfo
    console.log(`LOG: --- pollForResult 函数开始执行 (Task ID: ${taskId}) ---`);

    if (!petInfo || !taskId) {
        console.error("LOG: pollForResult 停止: taskId 或 petInfo 不存在。", { taskId, petInfo });
        clearPollingTimers(); setLoading(false); return;
    }
    console.log(`LOG: pollForResult 正在运行 (Task ID: ${taskId})，准备调用 /getResult...`);

    try {
      const response = await axios.get<GetResultResponse>(`/.netlify/functions/getResult?taskId=${taskId}`); // 使用 taskId 查询
      const result = response.data;
      console.log("轮询结果:", result);

      if (result.status === 'completed') {
        console.log("LOG: pollForResult - 收到的 'completed' 状态的完整 result:", JSON.stringify(result, null, 2));
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
        } else { /* ... 处理无效建议数据 ... */ setAdvice(null); setLoading(false); message.error(result.advice?.error || "获取到的建议数据格式无效。"); }
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
  }, [clearPollingTimers]); // pollForResult 不再依赖 state，只依赖稳定的 clearPollingTimers

  // --- 表单提交处理函数 (调用 startAdviceGeneration) ---
  // 这个函数现在是传递给 PetInfoForm 的 onSubmit prop
  const handleFormSubmit = useCallback(async (formData: FormData) => {
    console.log("LOG: === App.tsx handleFormSubmit function ENTERED ===");
    console.log("表单数据:", formData);

    clearPollingTimers(); // 清理旧的
    setAdvice(null);      // 清空旧建议
    setLoading(true);     // 开始加载状态
    setCurrentPetInfo(formData); // 更新状态（会触发 useEffect 更新 Ref）
    currentTaskIdRef.current = null; // 清空旧 Task ID Ref

    try {
      console.log("LOG: App.tsx - 调用 /startAdviceGeneration...");
      const response = await axios.post<StartAdviceResponse>('/.netlify/functions/startAdviceGeneration', formData);

      if (response.data && response.data.taskId) {
          const taskId = response.data.taskId;
          currentTaskIdRef.current = taskId; // 保存 Task ID 到 Ref
          console.log(`LOG: App.tsx - 收到 Task ID: ${taskId}，准备启动轮询...`);

          // 设置超时
          pollingTimeoutRef.current = setTimeout(() => {
              console.error(`轮询超时 (Task ID: ${taskId})！`); clearPollingTimers(); setLoading(false); setAdvice(null);
              message.error(`获取建议超时（超过 ${MAX_POLLING_DURATION / 1000} 秒）。`);
          }, MAX_POLLING_DURATION);
          console.log("LOG: App.tsx - Timeout timer set, ID:", pollingTimeoutRef.current);

          // 启动轮询
          console.log(`LOG: App.tsx - Setting polling interval (每 ${POLLING_INTERVAL / 1000} 秒)...`);
          pollingIntervalRef.current = setInterval(pollForResult, POLLING_INTERVAL);
          console.log("LOG: App.tsx - Interval timer set, ID:", pollingIntervalRef.current);

          message.info("建议请求已提交，正在后台生成..."); // 提示用户

      } else {
          console.error("调用 startAdviceGeneration 未收到有效的 Task ID:", response.data);
          setLoading(false); setCurrentPetInfo(null); message.error(response.data?.error || "启动任务失败。");
      }
    } catch (error) {
      console.error("调用 startAdviceGeneration 失败:", error);
      setLoading(false); setCurrentPetInfo(null); message.error("提交请求失败。");
    }
  }, [clearPollingTimers, pollForResult]); // 依赖项

  // --- 同步 state 到 ref ---
   useEffect(() => {
       currentPetInfoRef.current = currentPetInfo;
   }, [currentPetInfo]);

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