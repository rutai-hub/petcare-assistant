import React from 'react';
import { Form, Select, InputNumber, Button, Row, Col } from 'antd'; // 移除了 message

// 定义表单数据的接口
interface FormData {
    breed: string;
    gender: string;
    age: number;
    weight: number;
}

// 定义新的 props 类型，接收一个 onSubmit 函数
interface PetInfoFormProps {
  onSubmit: (values: FormData) => void; // 当表单验证通过时调用
  loading: boolean; // 接收 loading 状态用于禁用按钮
}

// 示例犬种数据 (保持不变)
const dogBreeds = ['金毛', '拉布拉多', '泰迪', '柯基', '边牧', '柴犬', '其他'];

const PetInfoForm: React.FC<PetInfoFormProps> = ({ onSubmit, loading }) => {
  const [form] = Form.useForm();

  // antd 的 Form 会自动处理验证，并在成功后调用这里的 onFinish
  // 我们在 onFinish 里直接调用 props 传进来的 onSubmit 函数
  const onFinish = (values: FormData) => {
    console.log('PetInfoForm onFinish - Form Values:', values);
    // 直接调用父组件传来的 onSubmit，把表单数据传出去
    onSubmit(values);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish} // antd Form 会在验证成功后调用 onFinish
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
         {/* 在 loading 时禁用按钮 */}
        <Button type="primary" htmlType="submit" loading={loading} disabled={loading}>
          生成建议
        </Button>
      </Form.Item>
    </Form>
  );
};

export default PetInfoForm;