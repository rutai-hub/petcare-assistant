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

  // PetInfoForm.tsx 内部
  const onFinish = async (values: any) => {
    console.log('Form Values:', values);
    setLoading(true); // 开始加载（这个 Loading 可能需要父组件管理，因为后台处理时间较长）

    try {
      // 调用后台函数
      const response = await axios.post('/.netlify/functions/getAdvice-background', values);

      if (response.status === 202) {
        console.log('后台任务已成功触发 (202 Accepted)');
        message.success('建议请求已提交，正在后台生成，请稍后...'); // 提示用户需要等待

        // TODO: 这里需要通知父组件任务开始了，可能需要一个不同的回调函数或状态
        // 暂时先不调用 onAdviceGenerated，因为它期望的是最终结果
        // onAdviceGenerated(values, response.data); // <-- 移除或注释掉这行

        // 父组件需要自己实现后续获取结果的逻辑

      } else {
        console.warn('调用后台函数收到非预期状态码:', response.status, response.data);
        message.error('提交请求失败 (状态码非 202)，请稍后再试。');
        // TODO: 通知父组件任务失败
      }

    } catch (error) {
      console.error("调用后台函数失败:", error);
      message.error('提交请求失败，请稍后再试。');
      // TODO: 通知父组件任务失败
    } finally {
      // 注意：这里的 setLoading(false) 会在后台任务触发后【立即】执行
      // 用户体验上可能需要一个持续的“处理中”状态，直到结果获取到
      // 这个 loading 状态的管理可能需要移到父组件，或者引入更复杂的状态表示
      setLoading(false); // 暂时保留，表示“触发”这个动作完成了
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