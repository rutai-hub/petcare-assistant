
import React, { useState } from 'react';
import { Layout, Typography } from 'antd';
import PetInfoForm from './components/PetInfoForm';
import AdviceDisplay from './components/AdviceDisplay';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: '20px' }}>🐾 宠物健康助手</Header>
      <Content style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
        <Title level={2}>填写宠物信息</Title>
        <PetInfoForm onAdviceGenerated={setAdvice} setLoading={setLoading} />
        <AdviceDisplay advice={advice} loading={loading} />
      </Content>
      <Footer style={{ textAlign: 'center' }}>©2025 PetCare Assistant</Footer>
    </Layout>
  );
}

export default App;
