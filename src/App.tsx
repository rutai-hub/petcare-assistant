import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layout, Typography, message } from 'antd';
import axios from 'axios'; // 确保导入 axios
import PetInfoForm from './components/PetInfoForm';
import AdviceDisplay from './components/AdviceDisplay';

// --- 接口定义 ---
// AdviceData: 最终传递给 AdviceDisplay 的完整数据结构
interface AdviceData {
  feeding: string;
  exercise: string;
  vaccination: string;
  risks: string;
  observations: string;
  petInfo: { // 包含原始宠物信息
    breed: string;
    age: number;
    weight: number;
  };
}

// BackendResponseData: getAdvice-background 函数触发后的响应（通常为空或只含 taskId）
// 我们现在主要关心它的触发成功与否（通过 HTTP status 202 判断），所以可以简化或忽略
// interface BackendResponseData { message?: string; taskId?: string; } // 示例

// FormData: PetInfoForm 提交的数据结构
interface FormData {
    breed: string;
    gender: string; // 父组件可能不需要 gender，但 PetInfo 包含它
    age: number;
    weight: number;
}

// GetResultResponse: getResult 函数返回的数据结构
interface GetResultResponse {
    status: 'processing' | 'completed' | 'failed' | 'nodata';
    // advice 字段只在 completed 时有意义，且是 AI 返回的结构化建议 (不含 petInfo)
    // 或者在 failed 时包含 error 信息的对象
    advice?: {
        feeding?: string;
        exercise?: string;
        vaccination?: string;
        risks?: string;
        observations?: string;
        error?: string;
        rawResponse?: string; // 用于调试
    } | null;
    error?: string; // 直接的错误消息
}

// --- 常量定义 ---
const POLLING_INTERVAL = 5000; // 轮询间隔：5 秒
const MAX_POLLING_DURATION = 90000; // 最长等待时间：90 秒

// --- App 组件 ---
const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  const [advice, setAdvice] = useState<AdviceData | null>(null);
  const [loading, setLoading] = useState<boolean>(false); // loading 表示是否正在获取建议（触发+轮询）
  const [currentPetInfo, setCurrentPetInfo] = useState<FormData | null>(null); // 存储触发时的表单数据

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- 清理定时器的辅助函数 ---
  const clearPollingTimers = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log("轮询 interval 定时器已清除。");
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
      console.log("轮询 timeout 定时器已清除。");
    }
  }, []);

  // --- 轮询函数 ---
  const pollForResult = useCallback(async () => {
    // 确保 currentPetInfo 存在，否则无法组合最终结果
    if (!currentPetInfo) {
        console.error("无法轮询，因为 currentPetInfo 不存在。");
        clearPollingTimers();
        setLoading(false);
        return;
    }

    console.log("正在轮询获取结果...");
    try {
      // 调用 getResult 函数 (GET 请求)
      // 注意：真实应用需要传递 ID 来获取特定结果
      const response = await axios.get<GetResultResponse>('/.netlify/functions/getResult');
      const result = response.data;
      console.log("轮询结果:", result);

      if (result.status === 'completed') {
        console.log("获取到 'completed' 状态，停止轮询。");
        clearPollingTimers();

        // 检查建议数据是否有效且无错误
        if (result.advice && !result.advice.error) {
          // 确保 AI 返回了必须的字段
           if (result.advice.feeding && result.advice.exercise && result.advice.vaccination && result.advice.risks && result.advice.observations) {
                // 组合 petInfo 和 AI 建议
                const finalAdviceData: AdviceData = {
                    feeding: result.advice.feeding,
                    exercise: result.advice.exercise,
                    vaccination: result.advice.vaccination,
                    risks: result.advice.risks,
                    observations: result.advice.observations,
                    petInfo: {
                        breed: currentPetInfo.breed,
                        age: currentPetInfo.age,
                        weight: currentPetInfo.weight,
                    }
                };
                setAdvice(finalAdviceData); // 更新状态以显示建议
                setLoading(false); // 结束加载
                message.success("建议已成功获取！"); // 最终成功提示
           } else {
                console.error("状态为 completed 但建议数据缺少必要字段:", result.advice);
                setAdvice(null);
                setLoading(false);
                message.error("获取到的建议数据格式不完整。");
           }
        } else {
            // 如果 completed 但 advice 字段包含错误或无效
            console.error("状态为 completed 但建议数据无效:", result.advice);
            setAdvice(null);
            setLoading(false);
            message.error(result.advice?.error || "获取到的建议数据无效。");
        }

      } else if (result.status === 'failed') {
        console.error("获取到 'failed' 状态，停止轮询。");
        clearPollingTimers();
        setLoading(false);
        setAdvice(null);
        message.error(result.error || '建议生成失败，请查看后端日志。');

      } else if (result.status === 'processing' || result.status === 'nodata') {
        // 仍在处理中或暂时没数据，继续轮询
        console.log("状态为 processing 或 nodata，继续下一次轮询...");
        // setLoading 保持 true
      } else {
        // 未知状态
        console.warn("收到未知的轮询状态:", result.status);
        // 可以选择继续轮询或停止
      }
    } catch (error) {
      console.error("轮询请求失败:", error);
      clearPollingTimers();
      setLoading(false);
      setAdvice(null);
      message.error('获取建议结果时网络出错。');
    }
  }, [currentPetInfo, clearPollingTimers]); // 依赖项包含 currentPetInfo

  // --- 触发后台任务并启动轮询 ---
  // 这个函数传递给 PetInfoForm 的 onAdviceGenerated prop
  const handleAdviceGenerated = useCallback((formData: FormData, responseData: any) => {
    // responseData 来自 axios.post('/.netlify/functions/getAdvice-background') 的直接响应
    // 我们主要关心 formData
    console.log("App 组件的 handleAdviceGenerated 被调用，表单数据:", formData);

    // 1. 清理工作
    clearPollingTimers(); // 清除上一次的定时器（如果存在）
    setAdvice(null);      // 清空旧的建议
    setCurrentPetInfo(formData); // 保存这次提交的宠物信息，供轮询成功后组合数据

    // 2. 设置状态为加载中
    setLoading(true);

    // 3. 设置轮询超时
    console.log(`设置轮询超时定时器 (${MAX_POLLING_DURATION / 1000} 秒)...`);
    pollingTimeoutRef.current = setTimeout(() => {
      console.error("轮询超时！");
      clearPollingTimers();
      setLoading(false);
      setAdvice(null); // 清空建议
      message.error(`获取建议超时（超过 ${MAX_POLLING_DURATION / 1000} 秒），请稍后再试。`);
    }, MAX_POLLING_DURATION);

    // 4. 启动轮询 (立即执行一次，然后设置间隔)
    console.log("立即开始第一次轮询...");
    pollForResult(); // 立即调用一次
    console.log(`设置轮询间隔定时器 (每 ${POLLING_INTERVAL / 1000} 秒)...`);
    pollingIntervalRef.current = setInterval(pollForResult, POLLING_INTERVAL);

  }, [clearPollingTimers, pollForResult]); // 依赖项

  // --- 组件卸载时清理定时器 ---
  useEffect(() => {
    // 返回一个清理函数
    return () => {
      clearPollingTimers();
    };
  }, [clearPollingTimers]); // 依赖项

  // --- JSX 渲染 ---
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: '20px' }}>🐾 宠物健康助手</Header>
      <Content style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        <Title level={2}>填写宠物信息</Title>
        <PetInfoForm
          onAdviceGenerated={handleAdviceGenerated} // 传递更新后的处理函数
          setLoading={setLoading} // setLoading 仍然传递，但 App 是主要控制者
        />
        {/* loading 状态现在反映整个后台处理+轮询过程 */}
        <AdviceDisplay advice={advice} loading={loading} />
      </Content>
      <Footer style={{ textAlign: 'center' }}>©2025 PetCare Assistant</Footer>
    </Layout>
  );
}

export default App;