import React from 'react';
import { Form, Select, InputNumber, Button, Row, Col } from 'antd'; // 移除了 message

// 定义表单数据的接口
interface FormData {
    breed: string;
    gender: string;
    age: number;
    weight: number;
}

// 新的 props 类型，只接收 onSubmit 和 loading
interface PetInfoFormProps {
  onSubmit: (values: FormData) => void; // 表单验证成功后调用
  loading: boolean; // 用于禁用表单
}

// 示例犬种数据
const dogBreeds = ['金毛', '拉布拉多', '泰迪', '柯基', '边牧', '柴犬', '其他']; // 可以考虑从外部传入或配置

const PetInfoForm: React.FC<PetInfoFormProps> = ({ onSubmit, loading }) => {
  const [form] = Form.useForm();

  // antd Form 的 onFinish 会在验证成功后调用
  const onFinish = (values: FormData) => {
    console.log('PetInfoForm onFinish - Form Values:', values);
    onSubmit(values); // 直接调用父组件传来的 onSubmit
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
           <Form.Item name="breed" label="犬种" rules={[{ required: true, message: '请选择或输入犬种' }]}>
             <Select showSearch placeholder="选择或输入犬种" optionFilterProp="children" filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} options={dogBreeds.map(breed => ({ value: breed, label: breed }))} disabled={loading}/>
           </Form.Item>
         </Col>
         {/* 性别 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="gender" label="性别" rules={[{ required: true, message: '请选择性别' }]}>
             <Select placeholder="请选择性别" disabled={loading}> <Select.Option value="male">男生</Select.Option> <Select.Option value="female">女生</Select.Option> </Select>
           </Form.Item>
         </Col>
         {/* 年龄 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="age" label="年龄 (岁)" rules={[{ required: true, message: '请输入年龄' }]}>
             <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="请输入年龄" disabled={loading}/>
           </Form.Item>
         </Col>
         {/* 体重 */}
         <Col xs={24} sm={12} md={8}>
           <Form.Item name="weight" label="体重 (kg)" rules={[{ required: true, message: '请输入体重' }]}>
             <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} placeholder="例如：28.5" disabled={loading}/>
           </Form.Item>
         </Col>
      </Row>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} disabled={loading}>
          生成建议
        </Button>
      </Form.Item>
    </Form>
  );
};

export default PetInfoForm;