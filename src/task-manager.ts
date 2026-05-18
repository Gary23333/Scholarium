// Task Manager — 跟踪所有 LLM 生成任务的状态
import { randomUUID } from 'crypto';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';
export type TaskType = 'plan' | 'write' | 'audit' | 'translate' | 'generate-template' | 'from-url' | 'diverge' | 'rewrite' | 'optimize-related' | 'other';

export interface TaskPhase {
  name: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
}

export interface Task {
  id: string;
  type: TaskType;
  name: string;
  status: TaskStatus;
  progress?: number; // 0-100
  message?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number; // ms
  metadata?: Record<string, any>;
  phases?: TaskPhase[];
}

export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private maxHistory: number = 100; // 最多保留 100 条历史记录

  /** 创建新任务 */
  create(type: TaskType, name: string, metadata?: Record<string, any>): Task {
    const task: Task = {
      id: randomUUID(),
      type,
      name,
      status: 'pending',
      createdAt: new Date(),
      metadata,
    };
    this.tasks.set(task.id, task);
    this.cleanup();
    return task;
  }

  /** 开始任务 */
  start(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'running';
      task.startedAt = new Date();
    }
  }

  /** 初始化子阶段列表 */
  setPhases(taskId: string, phases: TaskPhase[]): void {
    const task = this.tasks.get(taskId);
    if (task) task.phases = phases;
  }

  /** 更新某个子阶段状态 */
  updatePhase(taskId: string, name: string, updates: Partial<TaskPhase>): void {
    const task = this.tasks.get(taskId);
    if (!task?.phases) return;
    const idx = task.phases.findIndex(p => p.name === name);
    if (idx !== -1) Object.assign(task.phases[idx], updates);
  }

  /** 更新进度 */
  updateProgress(taskId: string, progress: number, message?: string, currentPhase?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
      if (message) task.message = message;
      if (currentPhase && task.phases) {
        for (const p of task.phases) {
          p.status = p.name === currentPhase ? 'running' : p.status === 'pending' ? 'pending' : p.status;
          if (p.name === currentPhase) p.status = 'running';
        }
        const idx = task.phases.findIndex(p => p.name === currentPhase);
        if (idx > 0) {
          for (let i = 0; i < idx; i++) {
            if (task.phases[i].status === 'running' || task.phases[i].status === 'pending')
              task.phases[i].status = 'completed';
          }
        }
      }
    }
  }

  /** 完成任务 */
  complete(taskId: string, message?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date();
      task.duration = task.startedAt 
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : task.completedAt.getTime() - task.createdAt.getTime();
      if (message) task.message = message;
      if (task.phases) {
        for (const p of task.phases) {
          if (p.status === 'running' || p.status === 'pending') p.status = 'completed';
        }
      }
    }
  }

  /** 任务失败 */
  fail(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'failed';
      task.completedAt = new Date();
      task.duration = task.startedAt 
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : task.completedAt.getTime() - task.createdAt.getTime();
      task.error = error;
      if (task.phases) {
        for (const p of task.phases) {
          if (p.status === 'running') p.status = 'failed';
        }
      }
    }
  }

  /** 任务超时 */
  timeout(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'timeout';
      task.completedAt = new Date();
      task.duration = task.startedAt 
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : task.completedAt.getTime() - task.createdAt.getTime();
      task.error = 'Task timed out';
      if (task.phases) {
        for (const p of task.phases) {
          if (p.status === 'running') p.status = 'failed';
        }
      }
    }
  }

  /** 取消任务 */
  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status !== 'completed') {
      task.status = 'cancelled';
      task.completedAt = new Date();
      task.duration = task.startedAt 
        ? task.completedAt.getTime() - task.startedAt.getTime()
        : task.completedAt.getTime() - task.createdAt.getTime();
    }
  }

  /** 获取单个任务 */
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /** 获取所有任务 */
  getAll(options?: { 
    status?: TaskStatus; 
    type?: TaskType; 
    limit?: number;
    offset?: number;
  }): { tasks: Task[]; total: number } {
    let tasks = Array.from(this.tasks.values());
    
    // 按状态筛选
    if (options?.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }
    
    // 按类型筛选
    if (options?.type) {
      tasks = tasks.filter(t => t.type === options.type);
    }
    
    // 按创建时间倒序排序
    tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const total = tasks.length;
    
    // 分页
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    tasks = tasks.slice(offset, offset + limit);
    
    return { tasks, total };
  }

  /** 获取统计信息 */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    timeout: number;
    cancelled: number;
  } {
    const tasks = Array.from(this.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      timeout: tasks.filter(t => t.status === 'timeout').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
    };
  }

  /** 清理过期任务 */
  private cleanup(): void {
    if (this.tasks.size > this.maxHistory) {
      const tasks = Array.from(this.tasks.values());
      tasks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const toRemove = tasks.slice(0, tasks.length - this.maxHistory);
      for (const task of toRemove) {
        this.tasks.delete(task.id);
      }
    }
  }

  /** 清空所有任务 */
  clear(): void {
    this.tasks.clear();
  }
}

// 全局任务管理器实例
export const taskManager = new TaskManager();
