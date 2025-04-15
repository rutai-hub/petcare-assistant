import React from 'react';
import { Form, Select, Slider, InputNumber, Checkbox, Button, Row, Col, message } from 'antd';
import axios from 'axios';

// 定义父组件传入的 props 类型
interface PetInfoFormProps {
  onAdviceGenerated: (data: any) => void;
  setLoading: (loading: boolean) => void;
}

// 示例犬种数据（可从后端拉取，这里写死）
const dogBreeds = ['金毛', '拉布拉多', '泰迪', '柯基', '边牧', '柴犬', '其他'];

const PetInfoForm: React.FC<PetInfoFormProps> = ({ onAdviceGenerated, setLoading }) => {
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    console.log('Form Values:', values);
    setLoading(true);
    try {
      const response = await axios.post('/api/generate-advice', values); // 如部署时请替换为完整地址
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
      initialValues={{ age: 1, diet: ['干粮'] }}
    >
      <Row gutter={16}>
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

        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="age"
            label="年龄 (岁)"
            rules={[{ required: true, message: '请选择年龄' }]}
          >
            <Slider min={0} max={20} marks={{ 0: '0', 5: '5', 10: '10', 15: '15', 20: '20+' }} />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12} md={8}>
          <Form.Item
            name="weight"
            label="体重 (kg)"
            rules={[{ required: true, message: '请输入体重' }]}
          >
            <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} placeholder="例如：28.5" />
          </Form.Item>
        </Col>

        <Col xs={24}>
          <Form.Item
            name="diet"
            label="主要饮食习惯"
            rules={[{ required: true, message: '请选择饮食习惯' }]}
          >
            <Checkbox.Group>
              <Checkbox value="干粮">干粮</Checkbox>
              <Checkbox value="湿粮">湿粮</Checkbox>
              <Checkbox value="生食">生食</Checkbox>
              <Checkbox value="营养品">营养品</Checkbox>
            </Checkbox.Group>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Button type="primary" htmlType="submit">
          生成建议
        </Button>
      </Form.Item>
    </Form>
  );
};

export default PetInfoForm;
