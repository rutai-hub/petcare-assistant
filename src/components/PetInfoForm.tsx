import React from 'react';
import { Form, Select, InputNumber, Button, Row, Col, message } from 'antd';
import axios from 'axios';

// 定义父组件传入的 props 类型
interface PetInfoFormProps {
  // 确认这个签名与父组件传递函数和你的最新修改一致
  onAdviceGenerated: (formData: any, responseData: any) => void;
  setLoading: (loading: boolean) => void;
}

// 示例犬种数据
const dogBreeds = ['金毛', '拉布拉多', '泰迪', '柯基', '边牧', '柴犬', '其他'];

const PetInfoForm: React.FC<PetInfoFormProps> = ({ onAdviceGenerated, setLoading }) => {
  const [form] = Form.useForm();

  // --- 这是唯一且正确的 onFinish 函数 ---
  const onFinish = async (values: any) => {
    console.log('Form Values:', values);
    setLoading(true); // 开始加载
    try {
      // 发起 API 请求
      const response = await axios.post('/.netlify/functions/getAdvice', values);
      // 打印将传递的数据
      console.log('即将传递给父组件的数据:', { formData: values, responseData: response.data });
      // 调用父组件的回调，传递表单值和响应数据
      onAdviceGenerated(values, response.data);
      // 显示成功消息
      message.success('成功生成护理建议！');
    } catch (error) { // <--- 完整的 catch 块
      // 如果请求失败，打印错误并显示错误消息
      console.error("Error fetching advice:", error);
      message.error('生成建议失败，请稍后再试。');
    } finally { // <--- 完整的 finally 块
      // 无论成功或失败，最后都结束加载状态
      setLoading(false);
    }
  };
  // --- onFinish 函数定义结束 ---

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ age: 1, gender: 'male' }}
    >
      <Row gutter={16}>
        {/* 品种 */}
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="breed"
            label="犬种"
            rules={[{ required: true, message: '请选择或输入犬种' }]}
          >
            <Select
              showSearch
              placeholder="选择或输入犬种"
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={dogBreeds.map(breed => ({ value: breed, label: breed }))}
            />
          </Form.Item>
        </Col>

        {/* 性别 */}
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="gender"
            label="性别"
            rules={[{ required: true, message: '请选择性别' }]}
          >
            <Select placeholder="请选择性别">
              <Select.Option value="male">男生</Select.Option>
              <Select.Option value="female">女生</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        {/* 年龄 */}
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="age"
            label="年龄 (岁)"
            rules={[{ required: true, message: '请输入年龄' }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="请输入年龄" />
          </Form.Item>
        </Col>

        {/* 体重 */}
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="weight"
            label="体重 (kg)"
            rules={[{ required: true, message: '请输入体重' }]}
          >
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