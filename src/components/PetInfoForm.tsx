import React from 'react';
// 移除了 Checkbox, Slider，保留了需要的组件
import { Form, Select, InputNumber, Button, Row, Col, message } from 'antd'; 
import axios from 'axios';

// 定义父组件传入的 props 类型 (保持不变)
interface PetInfoFormProps {
  onAdviceGenerated: (data: any) => void;
  setLoading: (loading: boolean) => void;
}

// 示例犬种数据 (保持不变)
const dogBreeds = ['金毛', '拉布拉多', '泰迪', '柯基', '边牧', '柴犬', '其他'];

const PetInfoForm: React.FC<PetInfoFormProps> = ({ onAdviceGenerated, setLoading }) => {
  const [form] = Form.useForm();

  // onFinish 函数基本保持不变，提交的数据结构会略有不同 (有 gender, 没有 diet)
  const onFinish = async (values: any) => {
    // 注意：现在 values 中将包含 gender, age(number), weight, breed
    console.log('Form Values:', values);
    setLoading(true);
    try {
      // 只保留这一行完整的 axios.post 调用
      const response = await axios.post('/.netlify/functions/getAdvice', values);
      onAdviceGenerated(response.data);
      message.success('成功生成护理建议！');
    } catch (error) {
      console.error("Error fetching advice:", error);
      message.error('生成建议失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      // 更新 initialValues，移除 diet，可以给 gender 或 age 设置默认值 (可选)
      initialValues={{ age: 1, gender: 'male' }} // 例如，默认年龄1岁，性别男生
    >
      <Row gutter={16}>
        {/* --- 品种 (保持 Select) --- */}
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

        {/* --- 性别 (新增) --- */}
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="gender" // 对应 HTML 的 name="gender"
            label="性别"
            rules={[{ required: true, message: '请选择性别' }]}
          >
            <Select placeholder="请选择性别">
              <Select.Option value="male">男生</Select.Option>
              <Select.Option value="female">女生</Select.Option>
              {/* 可以根据需要添加 'unknown' 或其他选项 */}
            </Select>
          </Form.Item>
        </Col>

        {/* --- 年龄 (修改为 InputNumber) --- */}
        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="age"
            label="年龄 (岁)"
            rules={[{ required: true, message: '请输入年龄' }]}
          >
            {/* 将 Slider 替换为 InputNumber */}
            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="请输入年龄" />
          </Form.Item>
        </Col>

        {/* --- 体重 (保持 InputNumber) --- */}
        <Col xs={24} sm={12} md={8}> {/* 调整 Col 宽度以适应布局 */}
          <Form.Item
            name="weight"
            label="体重 (kg)"
            rules={[{ required: true, message: '请输入体重' }]}
          >
            <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} placeholder="例如：28.5" />
          </Form.Item>
        </Col>

        {/* --- 饮食习惯 (已移除) --- */}
        {/* <Col xs={24}> ... Form.Item for diet ... </Col> */}

      </Row>

      {/* --- 提交按钮 (保持不变) --- */}
      <Form.Item>
        <Button type="primary" htmlType="submit">
          生成建议
        </Button>
      </Form.Item>
    </Form>
  );
};

export default PetInfoForm;
