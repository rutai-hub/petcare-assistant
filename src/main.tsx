import React from 'react';
import ReactDOM from 'react-dom/client'; 
import App from './App';                 
// 如果您有全局 CSS 文件 (比如 src/index.css), 在这里导入它
import './index.css'; // <--- 如果您确实有 index.css，请确保这行是取消注释的

// 找到 HTML 中的 <div id="root"></div> 元素
const rootElement = document.getElementById('root');

// 确保 rootElement 存在后再进行渲染
if (rootElement) {
  // 创建 React 根节点并渲染 App 组件
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode> 
      <App />
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element'); // 如果找不到 #root，在控制台报错
}