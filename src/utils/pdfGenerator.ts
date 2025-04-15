import jsPDF from 'jspdf';

// 接口类型（建议数据 + 宠物基本信息）
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

export const generatePdf = (advice: AdviceData) => {
  const doc = new jsPDF();

  // --- 标题 ---
  doc.setFontSize(18);
  doc.text('宠物健康护理建议报告', 105, 20, { align: 'center' });

  // --- 宠物基本信息 ---
  doc.setFontSize(12);
  doc.text('宠物信息:', 14, 40);
  doc.text(`品种: ${advice.petInfo.breed}`, 20, 50);
  doc.text(`年龄: ${advice.petInfo.age} 岁`, 20, 60);
  doc.text(`体重: ${advice.petInfo.weight} kg`, 20, 70);
  doc.text(`饮食习惯: ${advice.petInfo.diet.join(', ')}`, 20, 80);

  // --- 建议部分 ---
  const startY = 100;
  const margin = 14;
  const cardWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const lineHeight = 7;

  doc.setFontSize(14);
  doc.text('🦴 喂养建议:', margin, startY);
  doc.setFontSize(10);
  const feedingLines = doc.splitTextToSize(advice.feeding, cardWidth - 10);
  doc.text(feedingLines, margin + 5, startY + lineHeight);
  let currentY = startY + lineHeight * (feedingLines.length + 2);

  doc.setFontSize(14);
  doc.text('🏃‍♂️ 运动计划:', margin, currentY);
  doc.setFontSize(10);
  const exerciseLines = doc.splitTextToSize(advice.exercise, cardWidth - 10);
  doc.text(exerciseLines, margin + 5, currentY + lineHeight);
  currentY += lineHeight * (exerciseLines.length + 2);

  doc.setFontSize(14);
  doc.text('💉 疫苗提醒:', margin, currentY);
  doc.setFontSize(10);
  const vaccinationLines = doc.splitTextToSize(advice.vaccination, cardWidth - 10);
  doc.text(vaccinationLines, margin + 5, currentY + lineHeight);
  currentY += lineHeight * (vaccinationLines.length + 1);

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('*重要提示：疫苗计划请务必咨询专业兽医师。', margin + 5, currentY + lineHeight);

  // --- 页脚 ---
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(100);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.text(`报告生成时间: ${new Date().toLocaleString('zh-CN')}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.text(`页码 ${i}/${pageCount}`, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
  }

  // --- 导出 PDF ---
  doc.save(`宠物护理建议-${advice.petInfo.breed}-${new Date().toISOString().slice(0,10)}.pdf`);
  console.log("PDF generated");
};
