import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

async function start() {
  const session = await fetch('/api/session', {
    method: 'POST',
    headers: { 'X-Scholarium-Client': 'local-ui' },
  });
  if (!session.ok) throw new Error('请从本机 localhost 打开 Scholarium，不能通过远程代理访问。');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  document.getElementById('root')!.textContent =
    error instanceof Error ? error.message : '无法建立本地会话，请刷新重试。';
});
