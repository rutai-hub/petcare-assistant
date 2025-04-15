import React from 'react';
import { Card, Row, Col, Typography, Button, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { generatePdf } from '../utils/pdfGenerator'; // 引入 PDF 生成工具函数

const { Title, Paragraph } = Typography;

// 接口类型定义（建议数据 + 宠物基本信息）
interface AdviceData {
  feeding: string;
  exercise: string;
  vaccination: string;
  petInfo: {
    breed: string;
    age: number;
    weight: number;
    diet: string[];
  };
}

interface AdviceDisplayProps {
  advice: AdviceData | null;
  loading: boolean;
}

const AdviceDisplay: React.FC<AdviceDisplayProps> = ({ advice, loading }) => {
  if (loading) {
    return (
      <Spin
        tip="正在生成建议..."
        size="large"
        style={{ display: 'block', marginTop: '50px' }}
      />
    );
  }

  if (!advice) {
    return (
      <Paragraph style={{ textAlign: 'center', marginTop: '20px' }}>
        请先填写宠物信息并生成建议。
      </Paragraph>
    );
  }

  const handleExportPdf = () => {
    generatePdf(advice); // 调用 PDF 生成函数
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: '20px' }}>
        个性化护理建议
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="🦴 喂养建议">
            <Paragraph>{advice.feeding}</Paragraph>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card title="🏃‍♂️ 运动计划">
            <Paragraph>{advice.exercise}</Paragraph>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card title="💉 疫苗提醒">
            <Paragraph>{advice.vaccination}</Paragraph>
            <Paragraph type="secondary" style={{ fontSize: 'small', marginTop: '10px' }}>
              *重要提示：疫苗计划请务必咨询专业兽医师。
            </Paragraph>
          </Card>
        </Col>
      </Row>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExportPdf}
          disabled={!advice}
        >
          导出 PDF 报告
        </Button>
      </div>
    </div>
  );
};

export default AdviceDisplay;
