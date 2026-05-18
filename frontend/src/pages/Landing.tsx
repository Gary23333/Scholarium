import { useRef, useCallback } from 'react';
import { GraduationCap, Sparkles, ArrowRight } from 'lucide-react';

interface LandingProps {
  /** 用户点击"进入"后的回调 */
  onEnter: (topic: string) => void;
}

/**
 * Landing 首页 — Scholarium 星庐的入口
 *
 * 视觉构成：
 * - 深空动态星空背景 (CSS keyframes)
 * - 漂浮的液态玻璃光球 (3D 纵深)
 * - 居中玻璃卡片 + 3D 倾斜
 *
 * 用户交互：点击"进入星庐"进入主应用
 */
export function Landing({ onEnter }: LandingProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  /**
   * 鼠标跟随 3D 倾斜 — 根据鼠标在卡片上的相对位置，
   * 实时计算 rotateX / rotateY，营造"卡片随目光转动"的深度感。
   */
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(0px)`;
  }, []);

  /** 鼠标离开时复位 */
  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform =
      'perspective(1200px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#06060e] flex items-center justify-center">
      {/* ============================================================
          背景层：动态星空 + 漂浮光球
          ============================================================ */}
      {/* 星空粒子 — 用多个 div 模拟闪烁的星星 */}
      {Array.from({ length: 60 }).map((_, i) => (
        <div
          key={`star-${i}`}
          className="star absolute rounded-full bg-white"
          style={{
            width: Math.random() * 3 + 1 + 'px',
            height: Math.random() * 3 + 1 + 'px',
            left: Math.random() * 100 + '%',
            top: Math.random() * 100 + '%',
            '--duration': Math.random() * 3 + 2 + 's',
            '--delay': Math.random() * 3 + 's',
          } as React.CSSProperties}
        />
      ))}

      {/* 漂浮光球 — 液态玻璃效果的装饰球体 */}
      <div
        className="float-orb absolute w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 70%)',
          left: '10%',
          top: '15%',
          '--duration': '8s',
        } as React.CSSProperties}
      />
      <div
        className="float-orb absolute w-80 h-80 rounded-full opacity-15 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)',
          right: '5%',
          bottom: '10%',
          '--duration': '10s',
        } as React.CSSProperties}
      />
      <div
        className="float-orb absolute w-48 h-48 rounded-full opacity-10 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)',
          left: '50%',
          top: '65%',
          '--duration': '12s',
        } as React.CSSProperties}
      />
      {/* 微光网格 — 增加纵深纹理 */}
      <div
        className="drift-slow absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 40% 30%, rgba(255,255,255,0.8) 0px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* ============================================================
          前景层：液态玻璃卡片 + 输入框
          ============================================================ */}
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative z-10 w-full max-w-xl mx-6 p-10 rounded-2xl transition-transform duration-200 ease-out"
        style={{
          background: 'rgba(15, 15, 30, 0.45)',
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow:
            '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        {/* Logo 区域 */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background:
                'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(139,92,246,0.2))',
              border: '1px solid rgba(16,185,129,0.3)',
              boxShadow: '0 0 30px rgba(16,185,129,0.15)',
              animation: 'pulse-glow 3s ease-in-out infinite',
            }}
          >
            <GraduationCap className="h-8 w-8 text-emerald-400" />
          </div>
          <h1
            className="text-3xl font-bold tracking-wider mb-2"
            style={{
              background:
                'linear-gradient(135deg, #10b981 0%, #34d399 40%, #8b5cf6 100%)',
              backgroundSize: '200% 200%',
              animation: 'gradient-shift 4s ease infinite',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Scholarium 星庐
          </h1>
          <p className="text-sm text-slate-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400/60" />
            多 Agent 协奏的学术星河
          </p>
        </div>

        {/* 操作按钮 */}
        <button
          onClick={() => onEnter('')}
          className="glass-btn-primary w-full h-12 flex items-center justify-center gap-2 text-base mt-6"
        >
          进入星庐
          <ArrowRight className="h-4 w-4" />
        </button>

        {/* 底部提示 */}
        <p className="text-center text-xs text-slate-600 mt-5">
          多 Agent 协奏，从选题到 LaTeX 编译的全流程 AI 学术助手
        </p>
      </div>
    </div>
  );
}
