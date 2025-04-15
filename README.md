
# 🐾 PetCare Assistant - 宠物健康管理 Web App

这是一个基于 React + Ant Design + FastAPI 的宠物护理建议小程序 MVP，用于帮助用户根据宠物信息获取个性化的喂养、运动和疫苗建议，并支持 PDF 导出报告。

## 🧩 技术栈

- 前端：React + Vite + TypeScript
- UI：Ant Design
- 请求：Axios
- 导出：jsPDF
- 后端：FastAPI（建议使用 Render 或 Railway 部署）
- 部署推荐：Netlify（前端） + Render（后端）

## 🚀 快速开始

```bash
npm install
npm run dev
```

打开浏览器访问：http://localhost:5173

## 📦 项目结构

```
src/
├── components/
│   ├── PetInfoForm.tsx
│   └── AdviceDisplay.tsx
├── utils/
│   └── pdfGenerator.ts
├── App.tsx
├── main.tsx
└── index.css
```

## ✨ 功能亮点

- 支持犬种选择、年龄体重输入、饮食多选
- AI 模拟生成护理建议（可对接 GPT-4o）
- 建议卡片展示，支持导出 PDF
- 已适配移动端，界面简洁清爽

## 📄 作者提示

本项目为 MVP 原型，如用于正式产品请增加数据校验、用户登录、提示词优化等功能。

---
MIT License © 2025 PetCareAI
