import React from 'react';
import { Form, Select, InputNumber, Button, Row, Col, message } from 'antd';
import axios from 'axios';

// 定义父组件传入的 props 类型
interface PetInfoFormProps {
  // 这个签名需要父组件 App.tsx 里的 handleAdviceGenerated 函数匹配
  onAdviceGenerated: (formData: any, responseData: any) => void;
  setLoading: (loading: boolean) => void; // 这个 prop 可能不再需要被 PetInfoForm 控制
}

// 示例犬种数据
const dogBreeds = ['金毛', '拉布拉多', '泰迪', '柯基', '边牧', '柴犬', '其他'];

const PetInfoForm: React.FC<PetInfoFormProps> = ({ onAdviceGenerated, setLoading }) => {
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    console.log('Form Values:', values);
    // setLoading(true); // 注意：加载状态现在主要由 App.tsx 控制

    try {
      // 调用后台函数
      const response = await axios.post('/.netlify/functions/getAdvice-background', values);

      // 检查 Netlify 返回的状态码
      if (response.status === 202) {
        console.log('后台任务已成功触发 (202 Accepted)'); // <-- 已有日志

        // ---> 添加日志：调用父组件回调前后 <---
        console.log("LOG: PetInfoForm - 即将调用 onAdviceGenerated...");
        onAdviceGenerated(values, response.data); // 传递表单值和响应数据（响应数据可能为空或只有平台信息）
        console.log("LOG: PetInfoForm - onAdviceGenerated 已调用。");
        // ---> 日志添加结束 <---

        // 这个成功消息现在表示“任务已提交”，而不是“建议已生成”
        message.success('建议请求已提交，正在后台处理...');

      } else {
        // 如果返回的不是 202
        console.warn('调用后台函数收到非预期状态码:', response.status, response.data);
        message.error('提交请求失败 (状态码非 202)。');
        // 可以在这里也调用 onAdviceGenerated 并传递错误信息，如果父组件需要知道
        // onAdviceGenerated(values, { error: 'Failed to trigger background task properly' });
      }

    } catch (error) {
      console.error("调用后台函数失败:", error);
      message.error('提交请求失败，请稍后再试。');
      // 可以在这里也调用 onAdviceGenerated 并传递错误信息
      // onAdviceGenerated(values, { error: 'Error calling background function' });
    } finally {
      // setLoading(false); // 注意：加载状态现在主要由 App.tsx 控制
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ age: 1, gender: 'male' }}
    >
      <Row gutter={16}>
        {/* 表单项 JSX (保持不变) ... */}
         {/* 品种 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="breed" label="犬种" rules={[{ required: true, message: '请选择或输入犬种' }]}>
             <Select showSearch placeholder="选择或输入犬种" optionFilterProp="children" filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} options={dogBreeds.map(breed => ({ value: breed, label: breed }))}/>
           </Form.Item>
         </Col>
         {/* 性别 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}>
             <Select placeholder="请选择性别"> <Select.Option value="male">男生</Select.Option> <Select.Option value="female">女生</Select.Option> </Select>
           </Form.Item>
         </Col>
         {/* 年龄 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="age" label="年龄 (岁)" rules={[{ required: true, message: '请输入年龄' }]}>
             <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="请输入年龄" />
           </Form.Item>
         </Col>
         {/* 体重 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="weight" label="体重 (kg)" rules={[{ required: true, message: '请输入体重' }]}>
             <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} placeholder="例如：28.5" />
           </Form.Item>
         </Col>
      </Row>
      {/* 提交按钮 */}
      <Form.Item>
        <Button type="primary" htmlType="submit">
          生成建议
        </Button>
      </Form.Item>
    </Form>
  );
};

export default PetInfoForm;