// Checkpoint Manager — Human-in-the-loop collaboration gates
import type { ScholariumDB } from '../db/database.ts';
import type { Checkpoint } from '../types/index.ts';
import { randomUUID } from 'node:crypto';

export interface CheckpointMetrics {
  wordCount?: { value: number; target: number; status: 'ok' | 'warning' | 'critical' };
  references?: { value: number; min: number; status: 'ok' | 'warning' | 'critical' };
  sections?: { drafted: number; total: number; status: 'ok' | 'warning' | 'critical' };
  quality?: { score: number; status: 'ok' | 'warning' | 'critical' };
  integrity?: { passed: boolean; status: 'ok' | 'warning' | 'critical' };
}

export class CheckpointManager {
  private db: ScholariumDB;

  constructor(db: ScholariumDB) {
    this.db = db;
  }

  createCheckpoint(
    paperId: string,
    stageId: string,
    type: 'full' | 'slim' | 'mandatory',
    deliverables: string[],
    metrics: CheckpointMetrics,
  ): Checkpoint {
    const metricsRecord: Record<string, { value: number | string; status: 'ok' | 'warning' | 'critical' }> = {};

    if (metrics.wordCount) {
      metricsRecord['字数'] = {
        value: `${metrics.wordCount.value}/${metrics.wordCount.target}`,
        status: metrics.wordCount.status,
      };
    }
    if (metrics.references) {
      metricsRecord['引用'] = {
        value: `${metrics.references.value} (min: ${metrics.references.min})`,
        status: metrics.references.status,
      };
    }
    if (metrics.sections) {
      metricsRecord['章节'] = {
        value: `${metrics.sections.drafted}/${metrics.sections.total}`,
        status: metrics.sections.status,
      };
    }
    if (metrics.quality) {
      metricsRecord['质量'] = { value: metrics.quality.score, status: metrics.quality.status };
    }
    if (metrics.integrity) {
      metricsRecord['完整性'] = {
        value: metrics.integrity.passed ? '通过' : '未通过',
        status: metrics.integrity.status,
      };
    }

    const checkpoint: Checkpoint = {
      id: randomUUID(),
      paperId,
      stageId,
      type,
      deliverables,
      metrics: metricsRecord,
      selfCheck: {
        citationIntegrity: true,
        sycophanticConcession: true,
        qualityTrajectory: true,
        scopeDiscipline: true,
        completeness: deliverables.length > 0,
      },
      requiresUserConfirmation: type === 'mandatory' || type === 'full',
      confirmed: false,
      createdAt: new Date().toISOString(),
    };

    this.db.createCheckpoint({
      id: checkpoint.id,
      paper_id: paperId,
      stage_id: stageId,
      type,
      deliverables,
      metrics: metricsRecord,
      self_check: checkpoint.selfCheck,
      requires_confirmation: checkpoint.requiresUserConfirmation,
      confirmed: false,
    });

    return checkpoint;
  }

  getActiveCheckpoint(paperId: string): Checkpoint | null {
    const dbCheckpoint = this.db.getActiveCheckpoint(paperId);
    if (!dbCheckpoint) return null;

    return {
      id: dbCheckpoint.id,
      paperId: dbCheckpoint.paper_id,
      stageId: dbCheckpoint.stage_id,
      type: dbCheckpoint.type,
      deliverables: dbCheckpoint.deliverables ?? [],
      metrics: dbCheckpoint.metrics ?? {},
      selfCheck: dbCheckpoint.self_check ?? {},
      requiresUserConfirmation: !!dbCheckpoint.requires_confirmation,
      confirmed: !!dbCheckpoint.confirmed,
      confirmedAt: dbCheckpoint.confirmed_at,
      createdAt: dbCheckpoint.created_at,
    };
  }

  confirmCheckpoint(checkpointId: string): void {
    this.db.confirmCheckpoint(checkpointId);
  }

  generateCheckpointMessage(checkpoint: Checkpoint): string {
    const lines: string[] = [];
    lines.push(`━━━ 阶段 ${checkpoint.stageId} 完成 ━━━`);
    lines.push('');

    // Metrics
    lines.push('指标:');
    for (const [key, metric] of Object.entries(checkpoint.metrics)) {
      const icon = metric.status === 'ok' ? '✅' : metric.status === 'warning' ? '⚠️' : '❌';
      lines.push(`  ${icon} ${key}: ${metric.value}`);
    }
    lines.push('');

    // Deliverables
    if (checkpoint.deliverables.length > 0) {
      lines.push('交付物:');
      for (const d of checkpoint.deliverables) {
        lines.push(`  • ${d}`);
      }
      lines.push('');
    }

    // Self-check
    const checks = checkpoint.selfCheck;
    const issues: string[] = [];
    if (!checks.citationIntegrity) issues.push('引用完整性');
    if (!checks.sycophanticConcession) issues.push('谐媚妥协');
    if (!checks.qualityTrajectory) issues.push('质量轨迹下降');
    if (!checks.scopeDiscipline) issues.push('范围纪律');
    if (!checks.completeness) issues.push('完整性');

    if (issues.length > 0) {
      lines.push(`⚠️ 自检问题: ${issues.join(', ')}`);
      lines.push('');
    }

    lines.push('准备进入下一阶段？');
    if (checkpoint.type === 'mandatory') {
      lines.push('[此检查点不可跳过，需要明确确认]');
    }

    return lines.join('\n');
  }
}
